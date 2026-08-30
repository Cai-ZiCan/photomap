import sharp from 'sharp';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { UPLOAD_DIR } from '../config.js';

const ALLOWED_TYPES = new Set([
  'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif', 'image/avif', 'image/bmp', 'image/tiff',
]);

/** 保存一张图片：转 WebP 主图(≤1600px) + 缩略图(≤480px)，返回相对 uploads/ 的路径 */
export async function saveImage(buffer, mimetype) {
  if (!ALLOWED_TYPES.has(mimetype)) {
    throw Object.assign(new Error('不支持的图片格式'), { status: 400 });
  }
  const now = new Date();
  const sub = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
  const dir = path.join(UPLOAD_DIR, sub);
  fs.mkdirSync(dir, { recursive: true });
  const id = crypto.randomUUID();

  const base = sharp(buffer, { failOn: 'none' }).rotate();
  await base
    .clone()
    .resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 82 })
    .toFile(path.join(dir, `${id}.webp`));
  await base
    .clone()
    .resize({ width: 480, height: 480, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 75 })
    .toFile(path.join(dir, `${id}.t.webp`));

  return { path: `${sub}/${id}.webp` };
}

/** 相对路径 → 缩略图相对路径 */
export function thumbOf(relPath) {
  return relPath.replace(/\.webp$/, '.t.webp');
}

/** 尽力删除磁盘上的图片文件（主图+缩略图），失败不抛错 */
export function removeImageFiles(relPath) {
  for (const p of [relPath, thumbOf(relPath)]) {
    try {
      fs.unlinkSync(path.join(UPLOAD_DIR, p));
    } catch { /* 文件可能已不存在 */ }
  }
}
