import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const SERVER_ROOT = path.resolve(__dirname, '..');
export const PROJECT_ROOT = path.resolve(SERVER_ROOT, '..');
export const DATA_DIR = process.env.DATA_DIR || path.join(PROJECT_ROOT, 'data');
export const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
export const DB_PATH = path.join(DATA_DIR, 'photo-map.db');
export const WEB_DIST = path.join(PROJECT_ROOT, 'web', 'dist');

export const config = {
  port: Number(process.env.PORT || 8787),
  siteName: process.env.SITE_NAME || '摄影地图',
  siteDesc: process.env.SITE_DESC || '发现身边的摄影观赏点位',
  sessionSecret: process.env.SESSION_SECRET || '',
  ai: {
    baseUrl: (process.env.AI_BASE_URL || 'https://open.bigmodel.cn/api/paas/v4').replace(/\/+$/, ''),
    apiKey: process.env.AI_API_KEY || '',
    textModel: process.env.AI_TEXT_MODEL || 'glm-4-flash',
    visionModel: process.env.AI_VISION_MODEL || 'glm-4v-plus',
  },
  upload: { maxMb: 10, maxFiles: 9 },
};
