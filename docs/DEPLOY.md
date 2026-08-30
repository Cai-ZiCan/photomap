# 部署指南

本项目是「一个 Node 进程 + 一个数据目录」的形态，部署非常简单。`data/` 目录（数据库 + 全部照片）就是全部运行时状态，**备份 = 复制该目录**。

## 方案一：本地运行 + 内网穿透（最快让朋友看到）

适合先给小范围用户试用，无需服务器。

```bash
npm run build && npm start   # 本机 8787 端口跑起来
```

任选一种穿透工具：

- **Cloudflare Tunnel（免费、较稳）**
  ```bash
  cloudflared tunnel --url http://localhost:8787
  # 输出形如 https://xxx.trycloudflare.com 的公网地址
  ```
- **ngrok**：`ngrok http 8787`
- 国内工具：花生壳、贝锐等（注册后按其文档映射 8787）。

> 注意：免费穿透地址会变化；正式使用请看方案二。

## 方案二：VPS + Docker（正式推荐）

任意有公网 IP 的主机（阿里云/腾讯云轻量等，国内访问优先选国内节点，绑定域名需备案）。

```bash
# 在项目根目录
docker build -t photomap .
docker run -d --name photomap \
  -p 8787:8787 \
  -v /srv/photomap-data:/app/data \
  -e SITE_NAME="摄影地图" \
  -e AI_API_KEY="你的key" \
  --restart unless-stopped \
  photomap
```

- 数据卷 `/srv/photomap-data` 对应容器 `/app/data`，升级镜像不丢数据。
- HTTPS：前置 Caddy（自动证书）或 Nginx + certproxy，反代到 `127.0.0.1:8787` 即可，例如 Caddyfile：
  ```
  map.example.com {
      reverse_proxy 127.0.0.1:8787
  }
  ```
- 升级：`git pull && docker build -t photomap . && docker rm -f photomap && docker run ...`（同上挂载 data 卷）。

### 无 Docker 的裸机部署

```bash
npm install
npm run build
# 用 pm2 或 systemd 守护：
pm2 start npm --name photomap -- start
```

## 管理端与安全清单

- [ ] 首次访问 `/admin` 设置了强密码（≥12 位）；
- [ ] 公网部署建议启用 HTTPS（投稿可能含邮箱联系方式）；
- [ ] 定期备份 `data/`（或 `sqlite3 data/photo-map.db ".backup ..."` + uploads）；
- [ ] 不要把 `server/.env` 提交进 git（已 gitignore）。

## 国内访问注意

- 底图默认高德免 key 瓦片，国内加载快；海外用户可切 OSM。
- 若使用国内云服务器 + 自定义域名，需完成 ICP 备案；用 Cloudflare Tunnel / 海外 VPS 则无需备案但速度可能略慢。
- AI 默认指向智谱开放平台（国内直连）；换其他 OpenAI 兼容服务商改 `AI_BASE_URL` 即可。
