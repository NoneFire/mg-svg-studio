# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Vite + React + TypeScript；画布渲染 LeaferJS，动画运行时 GSAP；样式为自研 CSS 变量 + Tailwind（仅 theme/utilities 层）+ `@tita-agent/ui`（shadcn/radix + lucide）。数据存 IndexedDB，项目可落成 `.mgsvg` JSON 文件。已部署为 best_s 的子页面（uniCloud 前端网页托管，内部地址）。

## Users

**首要用户：作者本人**——做 MG（motion graphics）视频的独立创作者，素材常年散落在工程目录里。使用场景是自己一个人、在桌面浏览器前整理与微调素材，边看动画边改参数，然后把素材拿去剪辑/合成。
工具本身是单用户形态，没有账号、协作或权限需求；素材与项目文件在本地磁盘与浏览器里流转。

## Product Purpose

把已经做好的 MG 动画 SVG 素材，变成可浏览、可调参、可复用的资产。
成功的样子：打开一个项目就能看到全部素材在动；想改某个动画的时长、缓动、错位时不用回编辑器改 CSS；想改静态图的配色时不用另开设计软件；Agent 能直接改项目文件，人刷新页面就能看到结果。

## Positioning

不是"从零做动画"的时间轴工具，而是**已交付 SVG 素材的参数化工作台**：
把 SVG 里的 CSS `@keyframes` / SMIL 抽成可编辑的轨道与关键帧，把逐字动画合并成带交错延迟的「层」，
把元素布局从渲染中拆出来交给独立布局内核（声明式 spec → 绝对坐标），并让同一个项目文件同时被人和 Agent 编辑。

## Operating Context

- 素材来源：Figma / After Effects / 代码生成的 SVG，动画多为 CSS keyframes 或 SMIL；JS 驱动的动画（GSAP/anime.js）参数不在文件里。
- 工作流：导入素材 → 画布上浏览（自动播放）→ 选中动画轨道改参数 → 选中元素改样式 → 必要时用布局内核重排 → 导出/复制参数或把项目文件交给 Agent。
- 交付：最终以静态站点形式挂在内部域名子路径下（`/mg-svg/`），刷新即用，不对外宣传。

## Capabilities and Constraints

已确认的能力：
- 无限画布（平移/缩放/网格/画板自动排布）、SVG 与位图导入（文件、拖拽、⌘V 粘贴）、IndexedDB 持久化；
- CSS keyframes / SMIL 解析为轨道 + 关键帧，分层（`targetIds` + `stagger`）与逐属性编辑；
- 元素级样式覆盖（填充/描边/透明度/字号/字距/圆角/旋转/缩放）；
- 布局内核（row / column / grid / free，间距/内边距/对齐/换行），画布排布与元素重排共用；
- 项目文件（`.mgsvg` JSON）+ `mgsvg` CLI + MCP server，Agent 可读写；原子写与校验；
- 深/浅主题；60fps 播放（每帧同步渲染）；画板按 viewport 裁剪。

明确边界：
- 位图只作为整张图片渲染，不编辑内部像素；
- `pattern`、`feTurbulence` 类滤镜、复杂 `mask` 会降级并列出提示；
- 元素 id 依赖 SVG 文档结构，重新导入会换 id；
- 保存到本地文件依赖 Chrome 的文件系统 API（其余浏览器回退下载）。

## Evidence on Hand

- 三份真实素材：`public/samples/cyber-pikachu.svg`（逐字开场动效，10 条动画 / 92 个元素）、`grid-bg.svg`（静态背景）、`two-paths.svg`（静态信息图）。
- 可用的示例项目：`examples/demo.mgsvg`，以及批量操作示例 `examples/ops.example.json`。
- 仓库内已有 MCP 配置 `.mcp.json`，CLI 产物 `bin/mgsvg.mjs`。
- 无品牌视觉规范、无客户案例、无使用数据；不得编造。

## Product Principles

1. **素材是主角，界面退后**：画布占绝对主位，面板可收起，任何装饰都不能压过素材本身。
2. **参数而不是代码**：用户改的是时长、缓动、关键帧、颜色这些可理解的量，不是手写 CSS。
3. **同一份真相**：人、CLI、MCP 读写同一个项目文件，任何一侧的改动都能被另一侧看见。
4. **渲染与布局分离**：布局算坐标、渲染只负责画，动画只写变换，三者互不污染。
5. **单人效率优先**：密度、快捷键、少一步操作，比引导流程和对外兼容性更重要。

## Accessibility & Inclusion

内部单人使用，未建立特定的无障碍标准；保持键盘可用（⌘S/⌘O、删除、Esc）与足够的文字对比度即可，不承诺对外合规。
