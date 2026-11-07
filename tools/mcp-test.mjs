import fs from 'node:fs'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'

const project = JSON.parse(fs.readFileSync('examples/demo.mgsvg', 'utf8'))
const first = project.assets[0].id
const staticAsset = project.assets.find((a) => a.groups.length === 0)?.id || first

const transport = new StdioClientTransport({
  command: 'node',
  args: ['bin/mgsvg.mjs', 'mcp', '--project', 'examples/demo.mgsvg'],
  cwd: process.cwd(),
})
const client = new Client({ name: 'mgsvg-test', version: '0.0.1' })
await client.connect(transport)

const tools = await client.listTools()
console.log('tools:', tools.tools.map((t) => t.name).join(', '))

const outline = await client.callTool({ name: 'project_outline', arguments: { asset: first } })
console.log('--- outline ---')
console.log(outline.content[0].text.split('\n').slice(0, 6).join('\n'))

const applied = await client.callTool({
  name: 'project_apply_ops',
  arguments: {
    dryRun: true,
    ops: [
      { op: 'style.set', asset: staticAsset, element: '0.2', patch: { fill: '#0ea5e9' } },
      { op: 'anim.update', asset: first, group: 'charIn', patch: { stagger: 0.07 } },
    ],
  },
})
const parsed = JSON.parse(applied.content[0].text)
console.log('--- dry run applied ---')
console.log(parsed.applied.map((a) => `${a.op}: ${a.detail}`).join('\n'))
console.log('written:', parsed.written)

const validation = await client.callTool({ name: 'project_validate', arguments: {} })
console.log('--- validate ---', validation.content[0].text.replace(/\s+/g, ' ').slice(0, 100))

await client.close()
