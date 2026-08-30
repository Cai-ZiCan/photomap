# 架构文档

## 总体架构

单仓库（npm workspaces）+ 单进程部署：

```
┌─────────────────────────────── 浏览器 ───────────────────────────────┐
│  web/ (Vite 构建)  Vue3 + TS + OpenLayers                            │
│  地图页 /  投稿页 /submit  管理端 /admin                              │
└──────────────┬───────────────────────────────────────────────────────┘
               │ HTTP（同源，开发期由 Vite 代理）
┌──────────────▼───────────────────────────────────────────────────────┐
│  server/ Node 24 + Express                                           │
│  ├─ /api        公开：themes / spots(GeoJSON) / spot 详情            │
│  ├─ /api/submissions   投稿（限流 + 蜜罐）                           │
│  ├─ /api/admin  认证、CRUD、审核、AI 提取、导出                       │
│  ├─ /uploads    照片静态服务（长缓存）                                │
│  └─ SPA 回退    托管 web/dist                                        │
├───────────────────────────────────────────────────────────────────────┤
│  data/photo-map.db (node:sqlite)  +  data/uploads/**/*.webp          │
│  外部依赖（均可缺席）：AI(OpenAI 兼容) / 目标网页 / 瓦片源            │
└───────────────────────────────────────────────────────────────────────┘
```

## 数据模型（SQLite）

```
settings   key TEXT PK, value TEXT            -- 管理员密码哈希、会话密钥、标记位
themes     id PK, slug UNIQUE, name, color, icon, description, sort, created_at
spots      id PK, name, description, lat, lng, address, region, tips,
           months TEXT(JSON [1..12]), status(pending|published|rejected|archived),
           source(creator|user|crawler), source_url, source_note,
           submitter_name, submitter_contact, review_note, featured_photo_id,
           seed INTEGER(1=示例数据), created_at, updated_at, reviewed_at
spot_themes spot_id FK→spots CASCADE, theme_id FK→themes CASCADE, PK(spot_id,theme_id)
photos     id PK, spot_id FK→spots CASCADE, path(相对 uploads/), caption, credit, sort, created_at
```

要点：

- `photos.path` 形如 `20260829/<uuid>.webp`，缩略图为同名 `.t.webp`；对外 URL 由服务端拼为 `/uploads/<path>`。
- `source` 决定详情页来源标注；`crawler` 内容必须带 `source_url`。
- 删除点位/照片时数据库行级联删除，磁盘文件做尽力删除（失败仅告警，不影响主流程）。

## 坐标与底图（GCJ-02 策略）

- 数据库统一存 **WGS-84**。
- 高德瓦片（免 key 的 `webrd`/`webst` 服务）处于 GCJ-02 偏移空间：前端渲染时把每个点 `wgs84 → gcj02` 再投影到 EPSG:3857；地图选点时把点击坐标 `gcj02 → wgs84` 反算入库。切换底图（OSM/天地图为 WGS-84 空间）时重建要素坐标并换算视图中心。
- 导航链接：高德 URI 用 GCJ-02 坐标；百度 URI 用 BD-09（gcj02→bd09 再拼接）。
- 瓦片加载失败自动重试 2 次（`tileLoadFunction` 兜底）；底图全部可配置。

## API 概要

### 公开

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/site` | 站点名称/描述 |
| GET | `/api/themes` | 专题列表 |
| GET | `/api/spots` | 已发布点位 GeoJSON；参数 `theme`(slug csv)、`months`、`q`、`bbox`（服务端过滤；前端通常全量拉取后本地过滤） |
| GET | `/api/spots/:id` | 点位详情（仅 published） |
| POST | `/api/submissions` | 投稿（multipart：字段 + `photos[]`，≤9 张，单张 ≤10MB；限流 10 次/小时/IP；蜜罐字段 `website`） |

### 管理（Cookie 会话）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/admin/state` | `{initialized, authenticated}` |
| POST | `/api/admin/setup` / `login` / `logout` | 首次设置密码 / 登录 / 登出 |
| GET | `/api/admin/overview` | 各状态计数 |
| GET/POST | `/api/admin/spots` | 列表（任意状态）/ 新建 |
| PUT/DELETE | `/api/admin/spots/:id` | 更新 / 删除 |
| POST | `/api/admin/spots/:id/photos` | 追加照片（multipart） |
| PUT/DELETE | `/api/admin/photos/:id` | 改说明 / 删除 |
| POST | `/api/admin/spots/:id/featured` | 设代表图 |
| POST | `/api/admin/spots/:id/status` | 发布/拒绝/下架（附 review_note） |
| CRUD | `/api/admin/themes` | 专题管理 |
| POST | `/api/admin/ai-extract` | `{url}` 或 `{text}` → 抓取 + AI → 草稿 |
| POST | `/api/admin/import` | 草稿 + 选中图片 URL → 下载图片 → pending 点位 |
| GET | `/api/admin/export` | 导出 ZIP（photomap.json + photos/） |
| POST | `/api/admin/clear-seed` | 清空示例数据 |
| POST | `/api/admin/password` | 修改密码 |

### 认证实现

- 密码：`scrypt(salt)` 存 `settings.admin_password`；首次通过 `/setup` 设置。
- 会话：`payloadB64.exp.HMAC-SHA256` 签名 Cookie（httpOnly, SameSite=Lax，7 天），密钥取 `SESSION_SECRET` 或自动生成持久化。

## AI / 抓取管线（可缺席）

```
粘贴 URL ──fetcher──► {title, text, images[]}──┐
粘贴文本 ────────────────────────────────────► ├─ ai.extract ─► 草稿 JSON ─► 管理员核对/补位置/选图
                                               │                │
                                               └ images 勾选 ──► import: 下载图片→WebP→pending 点位
```

- `fetcher`：UA 伪装 + 20s 超时 + 5MB 上限；HTML 用 cheerio 抽取标题/正文/图片（兼容微信公众号 `data-src`、og:image）。
- `ai`：OpenAI 兼容 `/chat/completions`；带图走视觉模型（失败自动回退纯文本模型）；输出严格 JSON，宽松解析。
- 未配置 `AI_API_KEY`：相关按钮给出配置指引，其余功能不受影响。

## 扩展点（预留）

- **微信小程序**：复用 `/api` 公开接口即可（GeoJSON + 详情 + 投稿）。
- **定向平台抓取**（小红书/微博等）：在 `server/src/services/fetcher.js` 增加 `adapters/` 平台适配器，输出统一的 `{title,text,images}` 即可接入现有 AI 管线。
- **多管理员**：`settings` 换成 accounts 表 + 会话绑定用户，前端不变。
