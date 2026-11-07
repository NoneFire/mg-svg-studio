# 部署到 uniCloud（HBuilderX）

产物是纯静态站点，`base: './'`，放在站点根或任意子目录都能跑。

**当前线上地址**（空间 `bests-prod`，前缀 `mg-svg/`）：

```
https://static-mp-4a67fc4a-c0a2-42b8-bc57-dc718029e4d0.next.bspapp.com/mg-svg/
```

## 一键部署（推荐）

```bash
# 前置：HBuilderX 已打开并登录 DCloud 账号
pnpm deploy:unicloud
```

这条命令会：构建 → 同步到 `best_s/public/mg-svg` → 若 HBuilderX 没导入 best_s 就自动导入 →
用 HBuilderX CLI 上传到 `bests-prod` 空间的 `mg-svg/` 前缀。

可覆盖的环境变量：`HX_SPACE`、`HX_PREFIX`、`HX_PRJ`、`BESTORY_DIR`、`HX_CLI`。

## 方案 A：作为 best_s 的子页面（推荐）

```bash
# 1. 在本项目里构建并同步到 best_s/public/mg-svg
pnpm build:bestory

# 2. best_s 正常构建（public/ 会被原样拷进 dist/）
cd ~/Documents/github/best_s && pnpm build

# 3. HBuilderX 打开 best_s
#    右键 uniCloud-aliyun → 前端网页托管 → 上传网站
#    选择目录：best_s/dist
```

上传后访问：

- `https://<你的域名>/mg-svg/`
- 若托管有 SPA 重写，直接访问 `https://<你的域名>/mg-svg/index.html`

之后每次更新这个工具，只需要重新 `pnpm build:bestory`，再上传一次 `best_s/dist`。

> `pnpm build:bestory` 默认写入 `~/Documents/github/best_s/public/mg-svg`，
> 可用 `BESTORY_DIR=/path/to/best_s pnpm build:bestory` 指向别的仓库。

## 方案 B：直接替换站点根

```bash
pnpm build          # 产物在 dist/
```

在 HBuilderX 的前端网页托管里，把 `dist/` 里的**内容**（不是 dist 目录本身）作为站点根上传，
即整个域名变成这个工具，访问 `https://<你的域名>/`。

## 注意

- 上传走 HBuilderX CLI，需要 HBuilderX 正在运行且已登录 DCloud 账号；否则会提示「未检测到已打开的 HBuilderX」。
- 如果之后用 HBuilderX 图形界面**重新整体发布 best_s**，记得先跑一次 `pnpm build:bestory`
  （让 `dist/mg-svg/` 存在），发布后再跑一次 `pnpm deploy:unicloud` 也可以，代价很小。
- 云端目录只覆盖 `mg-svg/` 前缀，不会动站点根现有的 best_s 文件。

## 体积

当前产物约 680 KB（gzip 后约 210 KB），远低于 uniCloud 单文件/总量限制。
示例素材（`samples/*.svg`）会一起带上去，单张 6–13 KB。
