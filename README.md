# 摄影地图 📷

一个公开的 WebGIS **摄影观赏点位地图**：在经典地图上以点位标注赏花、秋叶、雪景、星空等摄影机位，悬停查看代表图，点击弹出详情侧栏 —— 交互对标 Google Earth / 百度地图。

## 功能

- **地图浏览**：高德底图（免 key，国内加载快）+ 卫星图 + OSM 可切换；点位按专题配色、自动聚合；悬停显示「代表图 + 名称」；点击右侧滑出详情栏（图集、介绍、最佳月份、导航、来源标注）。
- **专题过滤**：赏花 / 秋叶 / 雪景 / 星空 / 山水……专题由管理员自定义；支持最佳月份过滤与关键词搜索，筛选状态可分享（URL 同步）。
- **三类信息来源**：
  1. 制作者上传（核心）：管理端完整 CRUD、地图选点、照片管理；
  2. 访客投稿：公开投稿页（传图、地图选点），**审核通过后**才展示；
  3. 粘贴链接 / 文本 → 程序抓取 + AI 提取 → 生成草稿进审核队列（可选功能，需配置 AI Key）。
- **数据可携**：一键导出 JSON + 图片包；照片上传即压缩为 WebP。

## 快速开始

要求：Node.js ≥ 20（推荐 22/24，Windows/Linux/macOS 均可）。

```bash
npm install          # 根目录执行（npm workspaces，一次装齐 server + web）

npm run dev          # 开发模式：API :8787 + 前端 :5173（热更新）
# 浏览器打开 http://localhost:5173

# 生产模式
npm run build        # 构建前端到 web/dist
npm start            # 单进程服务：http://localhost:8787（同时托管 API 与前端）
```

- 首次启动自动生成示例数据（含占位图），并自动建库（SQLite，位于 `data/photo-map.db`）。
- 管理端：打开 `/admin`，**首次访问会要求你设置管理员密码**（存于服务器，之后登录使用）。
- 示例数据可在管理端「设置」页一键清空。

## 配置（可选）

复制 `server/.env.example` 为 `server/.env` 按需修改：

| 变量 | 说明 |
|---|---|
| `PORT` | 服务端口，默认 8787 |
| `SITE_NAME` / `SITE_DESC` | 站点名称与描述 |
| `SESSION_SECRET` | 会话签名密钥，留空则自动生成并持久化 |
| `AI_BASE_URL` | OpenAI 兼容接口地址，默认智谱开放平台 `https://open.bigmodel.cn/api/paas/v4` |
| `AI_API_KEY` | AI 密钥；**不配置则仅「链接导入/AI 提取」不可用**，其余功能不受影响 |
| `AI_TEXT_MODEL` / `AI_VISION_MODEL` | 文本/视觉模型名，按所选服务商修改 |

前端可选 `web/.env`：

| 变量 | 说明 |
|---|---|
| `VITE_TIANDITU_KEY` | 天地图浏览器端 key（免费申请）；配置后底图多一个「天地图」选项 |

## 文档

- [docs/PRINCIPLES.md](docs/PRINCIPLES.md) —— 工作原则与设计原则
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) —— 架构、数据模型、API
- [docs/DEPLOY.md](docs/DEPLOY.md) —— 部署：内网穿透 / VPS + Docker / 备份

## 目录结构

```
├─ docs/          # 原则 / 架构 / 部署文档
├─ server/        # Node + Express + node:sqlite（纯 ESM）
│  └─ src/{routes,services,seed}
├─ web/           # Vite + Vue3 + TypeScript + OpenLayers
└─ data/          # 运行时数据：photo-map.db + uploads/（已 gitignore）
```

## 致谢与说明

- 底图瓦片：高德地图（社区公开瓦片服务）、OpenStreetMap、天地图（需 key）；坐标自动处理 GCJ-02 偏移。
- 地图引擎：[OpenLayers](https://openlayers.org/)；界面：Vue 3。
- 采集内容均强制标注来源；投稿必审后发布。请遵守目标平台条款，仅采集允许公开获取的内容。
