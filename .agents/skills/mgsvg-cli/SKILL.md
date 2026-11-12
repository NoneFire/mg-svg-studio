# MG SVG Studio CLI

处理 `.mgsvg` 项目文件，或连上正在运行的 Studio 直接改。仓库内用 `node bin/mgsvg.mjs`。

## 先选路子

| 情况 | 用哪种 |
|---|---|
| 用户给的是磁盘上的 `.mgsvg` | 项目文件命令（`outline` / `style` / `apply` …） |
| 用户在 Studio 里开着界面，改完要立刻看到 | 实时模式（`bridge` + `live`） |
| 要评审画面质量 | `review`（见文末） |

两条路不冲突：实时模式改的是内存，用户自己按保存才落盘。

## 三种素材格式

`outline --json` 里看 `format` 与 `editable`。**只有 `svg` 是可编辑的**，另外两种是原生运行、只读。

| format | 怎么来的 | 能做 | 不能做 |
|---|---|---|---|
| `svg` | 普通 SVG 文件 | 抽成轨道、逐元素改样式、规则评审 | — |
| `lottie` | Bodymovin `.json` | 播放、摆放、改尺寸 | 逐元素编辑、轨道调参、规则评审 |
| `gsap` | 含 `<script>` + `gsap` 的 SVG | 同上 | 同上 |

原生素材的 `svg` 是空字符串，正文在 `payload` 里，`groups` 恒为空数组。它们的动画由浏览器里的运行时驱动，所以**没有元素索引**。

**最大的坑：`add` 会自动识别格式。** 加一个内嵌 GSAP 的 SVG，拿到的是**只读的原生素材**，不是可编辑的 SVG 素材。想保留可编辑性，先把 `<script>` 去掉再导入。

`style` / `anim` / `layer` / `layout` 打在原生素材上会直接报错，这是有意为之，不要试图绕过。`review` 不会报错，但只会返回「未评审」。

**`replace` 会按新正文的格式重建素材**：换成另一份 Lottie / GSAP，仍然是原生素材；换成不含 `<script>` 的普通 SVG，会转成 `format: 'svg'` 的可编辑素材（元素索引重建，`payload` 清空）。这条是换格式的正路。

## 实时模式

```bash
node bin/mgsvg.mjs bridge --port 7350        # 桥，常驻；改过 CLI 要重启
node bin/mgsvg.mjs context --json            # 读选区，拿 sessionId
```

`context` 返回 `sessionId`、`selection`（assetId / elementId）、`asset`（尺寸、类型）。**多个页面连同一个桥时，用 `--session` 锁定目标，不要凭项目名猜。**

### 常用操作

```bash
# 改元素样式
live --session S --asset A --element E --set fill=#e11d48 --set opacity=0.8

# 加素材（排在现有内容右侧）
live --session S --add new.svg --name 名称

# 原地替换素材内容（同一张图的修正，不新增素材）
live --session S --asset A --replace fixed.svg

# 删除素材
live --session S --asset A --remove

# 批量（对每个素材执行同一操作）
live --session S --assets a_1,a_2,a_3 --replace template.svg

# 结构化输出，给脚本消费
live --session S --asset A --versions --json
```

### 加素材 vs 原地替换

改的是**同一张图**（调间距、修坐标、换字体）→ 用 `--replace`，素材 id 不变、位置不动、自动记一版历史。

确实是**另一张图**要并列保留 → 用 `--add`。

### 版本

版本**存在项目文件里**：`assets[].versions` 是数组，每项 `{ index, createdAt, label?, svg, width, height }`，一份完整 SVG 快照；`assets[].revision` 指向当前用的是哪一版（恢复 = 切指针，不复制新版本）。换浏览器、换机器打开同一个文件，版本都还在。

只有内容变化（SVG、原生素材的 `payload`、格式、尺寸、样式覆盖、布局参数）才记，1.5 秒内的连续修改合并成一版；拖动位置、改名、自动排列都不记。没有版本时文件里不写 `versions` 字段。

**直接改磁盘文件不会产生新版本。** 版本由界面上的编辑动作触发；外部写入会合并进界面，但不会顺手记一版。要留痕就在界面里改，或走 `live`。

写文件时注意：`versions` 是数组、按 `index` 升序、`index` 唯一；改某个素材的 `svg` 不会自动动 `versions`，需要的话自己追加一条。手工删版本时记得同步 `revision`，指向不存在的版本会被读成空指针。

```bash
mgsvg version list    --asset A --session S
mgsvg version restore --asset A --session S --id "A:7"
mgsvg version delete  --asset A --session S --ids "A:4,A:5"
```

恢复是**切换指针**，不会复制一份新版本。历史里已有那一版才叫恢复。

### 保存

```bash
live --session S --save           # 磁盘文件与打开时的快照不一致会拒绝
live --session S --save --force   # 确认要覆盖时用
```

## 项目文件命令

编辑前先 `outline <project> --elements` 看清楚；需要程序化处理加 `--json`。

```bash
outline project.mgsvg --asset a_x --elements --json
style   project.mgsvg --asset a_x --element '0.79.82' --set fill=#e11d48 --dry-run
apply   project.mgsvg --ops ops.json --dry-run
add     project.mgsvg --svg new.svg --name 名称 --x 0 --y 1600 --dry-run
replace project.mgsvg --asset a_x --svg fixed.svg --dry-run
validate project.mgsvg
```

写入前会校验整个项目并原子替换。不要对现存文件用 `init --force`。

## 评审

```bash
review project.mgsvg                     # 读已存快照，标出是否过期
review project.mgsvg --run --app http://localhost:5188   # 现算一次
review project.mgsvg --asset a_x --agent-prompt          # 生成 Agent 提示词
```

规则库是 `src/lib/review/rules-core.json`（23 条：9 条语义 + 14 条自动测量）。没进 `IMPLEMENTED` 的记「未实现」，不算通过。

## 排版与文字

- 字号下限按**画布比例**判；声明投放宽时走 px 口径
- 行长按每行字符数 ÷ 上限（CJK 40 / 其他 80）
- 字体栈写在 SVG 的 `<style>` 里，改之前先看清楚是 class 还是内联属性

### 改样式：CSS 里必须用冒号

`<text font-family="仓耳渔阳体">` 是**属性**写法，等号对。
但把同一个东西写进 `<style>`，就成了 `font-family="…"` —— 这是**无效的 CSS 声明**，整条会被浏览器丢掉，文字静默回退到系统字体。

现象是「像字体没装」：字号、字重、颜色都正常，只有字体不对。同一个常量既用于属性又用于 CSS 时最容易踩，而且不报错。

```css
/* 错：整条失效 */
.t { font-family="仓耳渔阳体 W04, 仓耳渔阳体, sans-serif" }
/* 对 */
.t { font-family: "仓耳渔阳体 W04", "仓耳渔阳体", sans-serif; }
```

字体族名是 `仓耳渔阳体`，`W01`–`W05` 是**全名**；两个都写进字体栈做兜底。

自检别靠眼睛——渲染后用 CDP 查节点真实字体：

```js
await S('CSS.getPlatformFontsForNode', { nodeId })   // → [{ familyName: 'TsangerYuYangT W04', glyphCount }]
```

### 改 SVG 结构的两条禁令

**别用 `<g transform>` 包住整块内容做平移。** 评审按元素坐标和容器关系判溢出，套一层 group 会让容器框和文字偏移对不上，整片文字被误判成溢出。直接改各元素的 `x/y/cy/y1/y2`。

**动画里的 `x/y` 是局部坐标，不是屏幕坐标。** 元素被父级 `<g>` 平移过之后，把属性设成「落点屏幕位置」会被再叠加一次位移，直接飞到画外。要算的是相对父级的偏移。

**批量改坐标后，把成对属性核对一遍。** 竖线的 `x1` 和 `x2`、矩形的 `x` 和 `width`，漏一个就会歪。

### 网格对齐

背景网格的间距要能整除画布宽。`1920 ÷ 54 = 35.56` 除不尽，线会从 0 排到 1890，左边贴边、右边空 30px。改法是重排成 `1920 ÷ 36 = 53.33`，左右各留一格。

## 已装的免费商用字体

| 字体族名 | 特点 | 适合 |
|---|---|---|
| `仓耳渔阳体 W01`–`W05` | 5 个真实字重，标准字面 | **正文到标题全覆盖** |
| `zcool-gdh`（站酷高端黑） | 10:7 宽扁，单字重 400 | 标题，小字号不好读 |
| `站酷型丽体` | 字宽比 0.815，最窄 | 需要瘦高的正文 |
| `Noto Sans SC` | 中性，7 字重 | 通用兜底 |
| `OPPO Sans 4.0` | 可变字重 100–700，偏圆 | 科技感 |
| `Alibaba PuHuiTi 3.0` | 瘦长挺拔，9 字重 | 信息密集画面 |

> `仓耳渔阳体` 是**族名**，`W01`–`W05` 是**全名**，别把全名当族名写进 `font-family` 的唯一取值。稳妥写法是族名加 `font-weight` 选档，全名作兜底。

给某段文字换字体时，先量一下原字重，再映射到目标字体的真实档位——**不要用 `font-weight` 让浏览器合成加粗**，中文会糊。

## 常见失败

| 报错 | 原因 | 处理 |
|---|---|---|
| `no extension connected` | 浏览器扩展没连上 | 让用户启用 Kimi WebBridge 扩展 |
| `不支持的实时命令` | CLI 白名单里没有 | 重启 bridge，或检查 `src/cli/bridge.ts` 的 SUPPORTED |
| `磁盘上的项目文件已更改` | 快照与磁盘不一致 | 导出副本，或 `--save --force` |
| `未收到 Studio 的结果` | 页面切走了 / 会话过期 | 重新 `context` 拿新 sessionId |
| `两边没有共同的已判定规则` | 复评时筛选条件不一致 | 用相同参数重跑 |
| `xx 是原生素材…不支持逐元素编辑` | 对 lottie / gsap 用了 style / anim | 改源文件后重新导入；要可编辑就先去 `<script>` |
| `这个 JSON 不是 Lottie` | 拖进来的不是 Bodymovin 导出 | 检查是不是项目文件（`.mgsvg` 该走「打开项目文件」） |

## 自检

改完画面类素材，**渲染出来看**，不要只读代码：

```bash
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new \
  --no-sandbox --hide-scrollbars --force-device-scale-factor=1 \
  --user-data-dir=/tmp/mgsvg-shot --virtual-time-budget=12000 \
  --screenshot=/tmp/check.png --window-size=1920,1080 "file:///path/asset.svg"
```

动画素材要加 `--virtual-time-budget`，否则截到的是 `opacity:0` 的首帧。

`--user-data-dir` 不能省：并行或已有 Chrome 在跑时会报 `Failed to create a unique user data directory for headless`，加上它才是确定的。渲染后用像素测量验证对齐（比如文字墨迹中心 vs 胶囊中心），别用眼睛估。
