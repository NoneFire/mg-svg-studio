---
name: mgsvg-cli
description: 使用 MG SVG Studio CLI 检查、编辑、校验或评审 `.mgsvg` 项目，也可连接正在运行的 Studio 获取当前选区并实时修改。
---

# MG SVG Studio CLI

处理 MG SVG Studio 项目文件或正在运行的 Studio 会话时，使用仓库提供的 CLI。在本仓库中运行 `node bin/mgsvg.mjs`；如果环境已安装全局 `mgsvg` 命令，也可以直接使用。命令语法不清楚时先运行 `node bin/mgsvg.mjs --help`；若帮助与实际行为需要核对，查看 `src/cli/` 中的实现。

## 检查和编辑项目文件

- 编辑前先运行 `outline <项目文件>` 查看项目。需要定位元素 id 或标签时加 `--elements`；后续需要程序化处理时可加 `--json`。
- 普通修改优先使用专用命令：`style`、`anim`、`layer`、`layout`、`add` 或 `replace`。一批相关操作可用 `apply --ops <文件>`；`examples/ops.example.json` 展示操作格式，`--ops -` 可从标准输入读取 JSON。`add <项目文件> --svg <文件>` 导入新素材；`replace <项目文件> --asset <id> --svg <文件>` 替换已有素材，保留素材 ID 和动画元数据，同时刷新尺寸、元素索引和解析警告；写入校验会检查动画、样式覆盖和布局引用。
- 用户要求修改项目文件时，条件合适就先用 `--dry-run` 预览，再去掉该选项执行写入。CLI 写入前会校验整个项目，并原子替换文件。除非用户明确要求覆盖已有项目，不要对现存文件使用 `init --force`。
- 修改后运行 `validate <项目文件>`。使用 `--json` 时检查 `ok`、`status`，以及 `result` 或错误字段。

示例：

```bash
node bin/mgsvg.mjs outline project.mgsvg --elements --json
node bin/mgsvg.mjs style project.mgsvg --asset a_xxx --element '0.79.82.83' --set fill=#e11d48 --dry-run
node bin/mgsvg.mjs apply project.mgsvg --ops ops.json --dry-run
node bin/mgsvg.mjs add project.mgsvg --svg header.svg --name 顶部目录 --x 0 --y 1600 --dry-run
node bin/mgsvg.mjs validate project.mgsvg
```

## 连接正在运行的 Studio

当用户希望读取或修改 Studio 界面当前打开的内容时，使用实时模式：

1. 启动 `node bin/mgsvg.mjs bridge --port 7350`。Studio 默认连接本机 `7350` 端口，无需在地址后加参数。若端口已被桥占用，可复用同版本的桥；更新 CLI 后应重启旧桥，让新增命令生效。
2. 运行 `node bin/mgsvg.mjs context --json` 读取当前会话。多个 Studio 页面连接同一桥时，先聚焦目标页面，再用返回的 `sessionId` 运行 `live`；不要凭项目文件名猜测页面或磁盘路径。修改元素样式时还需传入 `asset.id` 和 `element.id`。
3. 要把 SVG 放进当前页面的素材库，用 `live --session SESSION --add <svg文件> [--name 名称]`。它使用 Studio 的素材导入及自动排布，保留页面里尚未保存的改动；结果会返回新素材 ID。不要为此导出项目、修改磁盘文件再强制重新载入。
4. 如当前页面已链接可写的 `.mgsvg`，运行 `live --session SESSION --save` 保存。直接用 `add` / `apply` 修改磁盘文件后，用 `live --session SESSION --reload` 让 Studio 读取新版本。重新载入会拒绝覆盖尚未保存的界面改动；先保存或导出副本。未链接文件时先在 Studio 中保存项目。`live --review` 可评审当前尚未保存的状态。

示例：

```bash
node bin/mgsvg.mjs live --session SESSION --asset ASSET_ID --element ELEMENT_ID --set fill=#e11d48
node bin/mgsvg.mjs live --session SESSION --add header.svg --name 顶部目录
node bin/mgsvg.mjs live --session SESSION --save
node bin/mgsvg.mjs live --session SESSION --reload
```

如果 Studio 页面重载、切换项目或会话过期，重新读取 context。请求的目标不可用时，不要擅自改动另一个当前选中的元素。

## 运行视觉评审

- `review <项目文件>` 读取已保存的快照，并报告结果是否仍然有效。
- `review <项目文件> --run` 通过无头浏览器调用正在运行的 Studio 重新计算；Studio 默认应在 `http://localhost:5188` 提供服务，也可通过 `--app <地址>` 指定。
- 只有用户希望将新快照保存进项目时才加 `--write`。项目文件无法通过默认路径映射被 Studio 访问时，可用 `--project-url` 指定路径。

快照标记为过期时，不要把它当成当前评审结论。
