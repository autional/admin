# Autional 管理控制台

> 🚨 **2026-11-10 托管变更**：`*.autional.cn` **已迁出 Vercel** —— 改为 mf01 构建（node:24-alpine + 钉版 pnpm）→ 香港自建托管。
> `.cn` 的构建 env 由 workspace `shared/infra-ops/sites/sites.manifest.json` 注入；push 后由 mf01 cron（约 10 分钟）构建发布，不经 Vercel。
> `*.autional.com` 仍在 Vercel —— 本文中涉及 Vercel 的构建/部署描述对 `.com` 仍然成立。
> 现行口径：workspace `docs/AUTIONAL-CN-SITES-SELF-HOST.md`。

**域名**：[admin.autional.cn](https://admin.autional.cn)（cn）· [admin.autional.com](https://admin.autional.com)（com）
**技术栈**：Vite + React 19 + TypeScript + Tailwind CSS + Ant Design
**仓库**：[github.com/autional/admin](https://github.com/autional/admin)

租户、用户、应用与策略的集中管理后台。

## 开发

```bash
pnpm install
pnpm dev      # http://localhost:13102（构建前自动生成 env.js/robots.txt）
pnpm build    # 构建产物：apps/admin-console/dist/
pnpm test     # Vitest 单元测试
```

## 部署（单源双区）

`main` → `admin`（com）自动部署（Vercel）；`main` → `cn-admin`（cn）由 mf01 cron 构建发布（约 10 分钟，不经 Vercel）。两区**同一份源**，
区域差异全部由**构建期环境变量**注入（`.com` 来自 Vercel 项目 env；`.cn` 来自 `shared/infra-ops/sites/sites.manifest.json`）（见 `docs/positioning/24`）：

| 变量 | com | cn |
| --- | --- | --- |
| `REGION` | `com` | `cn` |
| `SITE_URL` | `https://admin.autional.com` | `https://admin.autional.cn` |
| `DEFAULT_LANG` / `FALLBACK_LANG` | `en` | `zh` |
| `API_ORIGIN` | `https://api.autional.com` | `https://api.autional.cn` |
| `CDN_HOST` | `https://cdn.autional.com` | `https://cdn.autional.cn` |

- 路由/重写：`vercel.ts`（fail-closed：`API_ORIGIN` 缺失即构建失败）。
- 生成物（勿手改、勿入库）：`apps/admin-console/public/{env.js,robots.txt}` ← `scripts/gen-env.mjs`；区域文案在 `scripts/region-copy.mjs`。
- 本地无 env 时兜底 cn 值（与迁移前基线一致）。

## 产物体积预算（CI 门）

`apps/admin-console/.size-limit.json` 是本仓**唯一**的体积预算真源（`size-limit` + `@size-limit/file`），CI 的
`Build (size budget)` + `Size budget` 两步超限即红并打印超限条目名（含包名）。

| 条目 | 匹配 | 阈值（= 2026-11-12 实测 ×110%） |
|---|---|---|
| entry | `dist/assets/index-*.js` | 1,366 kB（实测 1,241.03） |
| vendor-ui | `dist/assets/vendor-ui-*.js`（antd + lucide） | 1,529 kB（实测 1,389.34） |
| vendor-charts | `dist/assets/vendor-charts-*.js`（recharts） | 388 kB（实测 351.89） |
| shared-api | `dist/assets/shared-api-*.js` | 334 kB（实测 303.09） |
| css | `dist/assets/*.css` | 52.1 kB（实测 47.33） |
| all-js | `dist/assets/*.js` 合计 | 3,766 kB（实测 3,423.34） |

- 口径：`brotli:false` → **dist 原始字节**（不用压缩体积：会随 node 内建 zlib 漂移）。
- 本地复跑：`pnpm build && pnpm --filter @autional/admin-console run size`（本地无部署 env 时用 `FRONTEND_API_MODE=proxy`，与 CI 同口径）。
- **超限怎么办**：① 先拆 chunk / 路由级 `React.lazy`，把增长挪进按需块；② 确属合理增长才改阈值，且**同一个 PR** 改 `.size-limit.json` 并在描述里写「哪条、涨多少 kB、为何不可拆、谁还」；③ **禁止**删条目（空匹配会 fail）或调阈值不写理由。
- 新增独立 chunk 不会被单条预算拦下（只被 `all-js` 兜住）→ 新增 chunk 时必须补一条对应条目。
