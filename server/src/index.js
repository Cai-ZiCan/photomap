import express from 'express';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import fs from 'node:fs';
import path from 'node:path';
import { config, WEB_DIST, UPLOAD_DIR, DATA_DIR } from './config.js';
import { seedIfEmpty } from './seed/seed.js';
import publicRoutes from './routes/public.js';
import submissionsRoutes from './routes/submissions.js';
import adminRoutes from './routes/admin.js';

await seedIfEmpty();

const app = express();
app.disable('x-powered-by');
app.use(compression());
app.use(express.json({ limit: '2mb' }));
app.use(cookieParser());

// 照片静态服务（内容不变，长缓存）
app.use('/uploads', express.static(UPLOAD_DIR, { maxAge: '30d', immutable: true }));

app.use('/api', publicRoutes);
app.use('/api/submissions', submissionsRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api', (_req, res) => res.status(404).json({ error: '接口不存在' }));

// 统一错误处理
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err?.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: `单张图片不能超过 ${config.upload.maxMb}MB` });
  }
  if (String(err?.code || '').startsWith('LIMIT_FILE')) {
    return res.status(400).json({ error: '图片数量超出限制' });
  }
  if (err?.type === 'entity.parse.failed') {
    return res.status(400).json({ error: '请求体格式错误' });
  }
  const status = err?.status || 500;
  if (status >= 500) console.error('[error]', req.method, req.path, err);
  if (res.headersSent) return;
  res.status(status).json({ error: err?.message || '服务器内部错误' });
});

// 前端静态托管 + SPA 回退（生产模式）
if (fs.existsSync(WEB_DIST)) {
  app.use(express.static(WEB_DIST, { maxAge: '1h', index: false }));
  app.use((req, res, next) => {
    if (req.method === 'GET' && !req.path.startsWith('/api') && !req.path.startsWith('/uploads')) {
      return res.sendFile(path.join(WEB_DIST, 'index.html'));
    }
    next();
  });
} else {
  console.log('[hint] 未找到 web/dist，开发模式请用 `npm run dev`（前端在 5173 端口）');
}

app.listen(config.port, () => {
  console.log(`摄影地图已启动: http://localhost:${config.port}`);
  console.log(`数据目录: ${DATA_DIR}`);
  if (!config.ai.apiKey) {
    console.log('[hint] 未配置 AI_API_KEY，链接导入/AI 提取功能暂不可用（其余功能正常）。');
  }
});
