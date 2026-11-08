import fs from 'node:fs'
import path from 'node:path'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import { readProject, readProjectFile, writeProject } from '../cli/io'
import type { BridgeCommand } from '../lib/bridge-protocol'
import {
  applyOps,
  buildAssetFromSvg,
  findAsset,
  outline,
  validateProject,
  type ProjectOp,
} from '../lib/project'

const FORMAT_DOC = `# MG SVG Studio 项目文件

一个项目是一个 JSON 文件（默认 project.mgsvg），结构：

{
  "format": "mg-svg-studio/project",
  "version": 1,
  "name": "素材库名字",
  "assets": [{
    "id": "a_xxx", "name": "素材名", "x": 0, "y": 0,
    "width": 1920, "height": 1080, "kind": "animated",
    "svg": "<svg …>",
    "elements": [{ "id": "0.79.82", "tag": "g", "label": "#name", "depth": 2, "kind": "group" }],
    "groups": [{ "id": "g1", "name": "charIn", "targetId": "0.1", "targetIds": ["0.1","0.2"],
                 "stagger": 0.085, "duration": 0.8, "delay": 0.95,
                 "ease": "cubic-bezier(.4,0,.2,1)", "iterations": 1,
                 "direction": "normal", "fillMode": "both", "origin": "css",
                 "originPoint": { "x": 0.5, "y": 1 },
                 "tracks": [{ "id": "t1", "property": "opacity",
                              "keyframes": [{ "offset": 0, "value": "0" }, { "offset": 1, "value": "1" }] }] }],
    "overrides": { "0.1.11": { "fill": "#e11d48" } },
    "layouts": { "0.1": { "mode": "row", "gap": 24 } }
  }]
}

要点：
- id 都是稳定的：元素 id 由 SVG 文档顺序生成（如 "0.1.11"），素材 id 在导入时生成。
- 动画轨道（groups）作用在元素上；targetIds + stagger 表示一条「分层」，同一组关键帧作用在多个元素上，逐个延迟。
- overrides 是元素样式覆盖（fill/stroke/strokeWidth/opacity/fontSize/...）。
- layouts 是容器布局 spec（mode: row|column|grid|free，gap/padding/cols/alignX/alignY/justify/wrap）。
- review 保存规则评审结果（PASS 正例、FAIL/WARN 反例、未测项）及 inputHash；agentReview 单独保存 Agent 语义结果，不混入规则闸门。
- 写文件前先读文件；apply_ops 会做校验并原子替换。也可以直接用文本编辑器改这个 JSON。`

export async function startMcpServer(projectPath?: string, bridgePort?: number) {
  const defaultPath = projectPath || process.env.MG_SVG_PROJECT || 'project.mgsvg'
  const server = new McpServer({ name: 'mg-svg-studio', version: '0.1.0' })

  const resolvePath = (p?: string) => path.resolve(p || defaultPath)
  const text = (body: string) => ({ content: [{ type: 'text' as const, text: body }] })
  const fail = (err: any) => ({
    content: [{ type: 'text' as const, text: '错误：' + (err?.message || String(err)) }],
    isError: true,
  })

  server.registerTool(
    'project_schema',
    {
      title: '项目文件格式说明',
      description: '返回 .mgsvg 项目文件的 JSON 结构与字段含义，先读这个再改文件。',
      inputSchema: {},
    },
    async () => text(FORMAT_DOC)
  )

  server.registerTool(
    'project_outline',
    {
      title: '项目概览',
      description: '列出素材、动画轨道、布局以及可用的元素 id（Agent 定位元素用）。',
      inputSchema: {
        path: z.string().optional().describe('项目文件路径，默认 MG_SVG_PROJECT 或 project.mgsvg'),
        asset: z.string().optional().describe('只看某个素材（id 或名称）'),
        elements: z.boolean().optional().describe('是否列出每个素材的元素 id'),
      },
    },
    async ({ path: p, asset, elements }) => {
      try {
        const project = readProject(resolvePath(p))
        return text(outline(project, { assetId: asset, elements: !!elements }))
      } catch (err) {
        return fail(err)
      }
    }
  )

  server.registerTool(
    'project_read_asset',
    {
      title: '读取素材',
      description: '返回一个素材的完整 JSON（动画、元素索引、样式覆盖、布局）。',
      inputSchema: {
        path: z.string().optional(),
        asset: z.string().describe('素材 id 或名称'),
        includeSvg: z.boolean().optional().describe('是否包含 SVG 源码（可能很大）'),
      },
    },
    async ({ path: p, asset, includeSvg }) => {
      try {
        const project = readProject(resolvePath(p))
        const found = findAsset(project, asset)
        const copy: any = { ...found }
        if (!includeSvg) {
          copy.svgBytes = Buffer.byteLength(found.svg, 'utf8')
          delete copy.svg
        }
        return text(JSON.stringify(copy, null, 2))
      } catch (err) {
        return fail(err)
      }
    }
  )

  /** 本地桥：Studio 默认把「人选中了什么」推送到本机 7350 端口 */
  const bridge = bridgePort ? await import('../cli/bridge').then((m) => m.startBridge(bridgePort)) : null
  if (bridge) console.error(`[mg-svg] 选择桥已开在 http://127.0.0.1:${bridge.port}（Studio 默认连接本机 7350 端口）`)

  server.registerTool(
    'studio_context',
    {
      title: '读取 Studio 当前的选中项',
      description:
        '返回人在 Studio 里此刻选中的素材/元素（id、标签、文字、位置、覆盖样式）以及这一版评审在该元素上的判定。需要本机 7350 桥已启动，Studio 默认连接该端口。',
      inputSchema: {
        waitSeconds: z.number().positive().max(120).optional().describe('等一次新的选择，最多等这么多秒'),
        sessionId: z.string().trim().min(1).optional().describe('只读或等待指定会话'),
        after: z.string().trim().min(1).optional().describe('等到与上次返回的 selectionId 不同'),
      },
    },
    async ({ waitSeconds, sessionId, after }) => {
      if (!bridge) return fail(new Error('MCP 没带 --bridge 启动，读不到 Studio 的选择'))
      if (after && !waitSeconds) return fail(new Error('after 需与 waitSeconds 一起使用'))
      const ctx = waitSeconds
        ? await bridge.waitForContext(waitSeconds * 1000, { sessionId, after })
        : bridge.getContext(sessionId)
      if (!ctx) return fail(new Error(waitSeconds ? '等待新选区超时' : '没有可用的 Studio 会话'))
      return text(JSON.stringify(ctx, null, 2))
    }
  )

  server.registerTool(
    'studio_apply',
    {
      title: '实时编辑 Studio 元素',
      description: '先用 studio_context 读取选区，再传入返回的 sessionId、asset.id 和 element.id。改动立即反映到画布，随界面改动一起保存。',
      inputSchema: {
        sessionId: z.string().trim().min(1).describe('studio_context 返回的会话 ID，用于锁定浏览器标签页和打开的项目'),
        asset: z.string().optional().describe('修改或清除样式时必填，使用 studio_context 返回的 asset.id'),
        element: z.string().optional().describe('修改或清除样式时必填，使用 studio_context 返回的 element.id'),
        style: z.record(z.string(), z.any()).optional().describe('样式补丁，如 {"fill":"#e11d48","fontSize":28}'),
        clear: z.boolean().optional().describe('清掉该元素的覆盖样式'),
        select: z.string().optional().describe('切换选中元素的 ID 或唯一标签'),
      },
    },
    async ({ sessionId, asset, element, style, clear, select }) => {
      try {
        if (!bridge) throw new Error('请用 --bridge 7350 启动 MCP；Studio 会自动连接本机桥')
        if (Number(!!style) + Number(!!clear) + Number(!!select) !== 1) {
          throw new Error('请提供 style、clear 或 select 中的一种操作')
        }
        const type: BridgeCommand['type'] = select ? 'select' : clear ? 'style.clear' : 'style.set'
        const result = await bridge.runCommand(type, { asset, element: select || element, patch: style }, sessionId)
        if (result.ok === false) throw new Error(result.error)
        return text(JSON.stringify(result.result, null, 2))
      } catch (error) {
        return fail(error)
      }
    }
  )

  server.registerTool(
    'studio_save',
    {
      title: '保存 Studio 当前项目',
      description: '调用 Studio 的项目保存，写回已链接的本地 .mgsvg。仅在用户要求保存时调用。文件已被外部修改时会报告冲突。',
      inputSchema: {
        sessionId: z.string().trim().min(1).describe('studio_context 返回的会话 ID'),
      },
    },
    async ({ sessionId }) => {
      try {
        if (!bridge) throw new Error('请用 --bridge 7350 启动 MCP；Studio 会自动连接本机桥')
        const result = await bridge.runCommand('save', {}, sessionId)
        if (result.ok === false) throw new Error(result.error)
        return text(JSON.stringify(result.result, null, 2))
      } catch (error) {
        return fail(error)
      }
    }
  )

  server.registerTool(
    'studio_review',
    {
      title: '评审 Studio 当前画面',
      description: '使用浏览器中的未保存素材运行视觉评审，报告随当前项目保存。',
      inputSchema: {
        sessionId: z.string().trim().min(1).describe('studio_context 返回的会话 ID'),
        asset: z.string().trim().min(1).optional().describe('素材 ID，省略时使用会话当前素材'),
        frame: z.number().min(0).max(1).optional().describe('动画进度，默认 1（末帧）'),
      },
    },
    async ({ sessionId, asset, frame }) => {
      try {
        if (!bridge) throw new Error('请用 --bridge 7350 启动 MCP；Studio 会自动连接本机桥')
        const result = await bridge.runCommand('review', { asset, frame }, sessionId)
        if (result.ok === false) throw new Error(result.error)
        return text(JSON.stringify(result.result, null, 2))
      } catch (error) {
        return fail(error)
      }
    }
  )

  server.registerTool(
    'review_read',
    {
      title: '读取视觉评审结果',
      description:
        '分别读取规则评审与 Agent 评审快照。包含 PASS/FAIL/WARN/未测规则明细、Agent 结论及各自的过期状态；过期结果不会作为当前结论返回。',
      inputSchema: {
        path: z.string().optional(),
        asset: z.string().optional().describe('只读一张：素材 id 或名称'),
      },
    },
    async ({ path: p, asset }) => {
      try {
        const project = readProject(resolvePath(p))
        const { reviewInputHash } = await import('../lib/review/review')
        const assets = asset ? [findAsset(project, asset)] : project.assets
        const rows = assets.map((a: any) => {
          const snap = a.review
          const status = !snap ? 'none' as const : snap.inputHash !== reviewInputHash(a, snap.options || {}) ? 'stale' as const : 'ok' as const
          const agentSnap = a.agentReview
          const agentReviewStatus = !agentSnap ? 'none' as const : agentSnap.inputHash !== reviewInputHash(a, agentSnap.options || {}) ? 'stale' as const : 'ok' as const
          return {
            id: a.id,
            name: a.name,
            status,
            review: status === 'ok' ? {
              inputHash: snap.inputHash,
              gate: snap.gate,
              counts: snap.counts,
              coverage: snap.coverage,
              generatedAt: snap.generatedAt,
              findings: snap.findings || [],
            } : null,
            lastReview: snap ? { generatedAt: snap.generatedAt, gate: snap.gate, findings: snap.findings?.length || 0 } : null,
            agentReviewStatus,
            agentReview: agentReviewStatus === 'ok' ? agentSnap : null,
            lastAgentReview: agentSnap ? { generatedAt: agentSnap.generatedAt, results: agentSnap.results?.length || 0 } : null,
          }
        })
        return text(JSON.stringify(rows, null, 2))
      } catch (err) {
        return fail(err)
      }
    }
  )

  server.registerTool(
    'review_run',
    {
      title: '在浏览器里重跑视觉评审',
      description:
        '起无头 Chrome 打开正在运行的 Studio（默认 http://localhost:5188），对项目现算一次评审并返回结果。项目文件必须能被 Studio 站点访问到。',
      inputSchema: {
        path: z.string().optional(),
        asset: z.string().optional().describe('只评一张；省略则评全部'),
        appUrl: z.string().optional().describe('Studio 地址，默认 http://localhost:5188'),
        projectUrl: z.string().optional().describe('Studio 可访问的项目 URL；写回前会核对素材版本'),
        write: z.boolean().optional().describe('把结果写回项目文件'),
      },
    },
    async ({ path: p, asset, appUrl, projectUrl, write }) => {
      try {
        const { reviewProjectFile } = await import('../cli/projectReview')
        const result = await reviewProjectFile({ file: resolvePath(p), appUrl, projectUrl, target: asset, write })
        return text(JSON.stringify(result, null, 2))
      } catch (err) {
        return fail(err)
      }
    }
  )

  server.registerTool(
    'agent_review_prompt',
    {
      title: '生成 Agent 语义评审提示词',
      description: '为指定素材生成绑定 assetId、输入指纹与评审口径的 Agent 评审提示词，包含浏览器渲染的动画末帧 SVG 和无法量化的规则。',
      inputSchema: {
        path: z.string().optional(),
        asset: z.string().describe('素材 id 或名称'),
        appUrl: z.string().optional().describe('Studio 地址，默认 http://localhost:5188'),
        projectUrl: z.string().optional().describe('Studio 可访问的项目 URL；写回前会核对素材版本'),
      },
    },
    async ({ path: p, asset, appUrl, projectUrl }) => {
      try {
        const { agentPromptForProject } = await import('../cli/projectReview')
        const result = await agentPromptForProject({ file: resolvePath(p), target: asset, appUrl, projectUrl })
        return text(JSON.stringify(result, null, 2))
      } catch (err) {
        return fail(err)
      }
    }
  )

  server.registerTool(
    'agent_review_submit',
    {
      title: '导入 Agent 语义评审结果',
      description: '验证 Agent JSON 中的素材 ID、inputHash、options 和完整规则结论；可先 dryRun 预览，设置 write 后写回 .mgsvg。',
      inputSchema: {
        path: z.string().optional(),
        asset: z.string().describe('素材 id 或名称'),
        result: z.any().describe('Agent 返回的 JSON 文本或对象，必须带 assetId、inputHash、options、reviews'),
        write: z.boolean().optional().describe('验证后写回项目文件'),
        dryRun: z.boolean().optional().describe('配合 write 只校验和预览，不落盘'),
      },
    },
    async ({ path: p, asset, result, write, dryRun }) => {
      try {
        const { saveAgentReviewResult } = await import('../cli/projectReview')
        const saved = saveAgentReviewResult({ file: resolvePath(p), target: asset, document: result, write, dryRun })
        return text(JSON.stringify(saved, null, 2))
      } catch (err) {
        return fail(err)
      }
    }
  )

  server.registerTool(
    'project_apply_ops',
    {
      title: '批量修改项目',
      description:
        '应用一批操作后原子写回文件。支持 asset.add/remove/update、board.move、anim.set/update/remove/layer/keyframes、style.set/clear、layout.set/clear。',
      inputSchema: {
        path: z.string().optional(),
        ops: z.array(z.any()).describe('操作数组，见项目格式说明'),
        dryRun: z.boolean().optional().describe('只校验不写文件'),
      },
    },
    async ({ path: p, ops, dryRun }) => {
      try {
        const file = resolvePath(p)
        const { project, snapshot } = readProjectFile(file)
        const { project: next, log } = applyOps(project, ops as ProjectOp[])
        const check = validateProject(next)
        if (!check.ok) return fail(new Error('校验失败：' + check.problems.join('；')))
        if (!dryRun) writeProject(file, next, snapshot)
        return text(
          JSON.stringify(
            {
              written: !dryRun,
              file,
              applied: log,
              outline: outline(next, { elements: false }),
            },
            null,
            2
          )
        )
      } catch (err) {
        return fail(err)
      }
    }
  )

  server.registerTool(
    'project_add_asset',
    {
      title: '添加素材',
      description: '把一份 SVG 加入项目（解析出元素索引与可编辑动画），返回新素材的 id。',
      inputSchema: {
        path: z.string().optional(),
        name: z.string().describe('素材名称'),
        svg: z.string().optional().describe('SVG 源码'),
        svgPath: z.string().optional().describe('或者给一个本地 SVG 文件路径'),
        x: z.number().optional().describe('画布位置 x'),
        y: z.number().optional().describe('画布位置 y'),
      },
    },
    async ({ path: p, name, svg, svgPath, x, y }) => {
      try {
        const file = resolvePath(p)
        const source = svg || (svgPath ? fs.readFileSync(path.resolve(svgPath), 'utf8') : '')
        if (!source) return fail(new Error('需要 svg 或 svgPath'))
        const { project, snapshot } = readProjectFile(file)
        const asset = buildAssetFromSvg(source, name, { x, y })
        project.assets.push(asset)
        const check = validateProject(project)
        if (!check.ok) return fail(new Error('校验失败：' + check.problems.join('；')))
        writeProject(file, project, snapshot)
        return text(
          JSON.stringify(
            {
              assetId: asset.id,
              name: asset.name,
              groups: asset.groups.map((g) => ({ id: g.id, name: g.name, targets: g.targetIds?.length || 1 })),
              elements: asset.elements?.length || 0,
              warnings: asset.warnings,
            },
            null,
            2
          )
        )
      } catch (err) {
        return fail(err)
      }
    }
  )

  server.registerTool(
    'project_validate',
    {
      title: '校验项目',
      description: '检查素材/元素/动画引用是否一致，返回问题列表。',
      inputSchema: { path: z.string().optional() },
    },
    async ({ path: p }) => {
      try {
        const project = readProject(resolvePath(p))
        const result = validateProject(project)
        return text(JSON.stringify({ ...result, assets: project.assets.length }, null, 2))
      } catch (err) {
        return fail(err)
      }
    }
  )

  const transport = new StdioServerTransport()
  await server.connect(transport)
  console.error(`[mg-svg-studio] MCP server ready · project=${defaultPath}`)
}
