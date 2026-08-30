import { Router } from 'express';
import multer from 'multer';
import rateLimit from 'express-rate-limit';
import { run, q1 } from '../db.js';
import { config } from '../config.js';
import { saveImage } from '../services/images.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.upload.maxMb * 1024 * 1024, files: config.upload.maxFiles },
});

const limiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: '投稿过于频繁，请一小时后再试' },
});

const r = Router();

const badReq = (m) => Object.assign(new Error(m), { status: 400 });
const str = (v, max = 4000) => String(v ?? '').trim().slice(0, max);
const toNum = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
};

r.post('/', limiter, upload.array('photos', config.upload.maxFiles), async (req, res) => {
  const b = req.body || {};

  // 蜜罐字段：正常用户不可见也不会填写
  if (str(b.website, 200)) {
    return res.json({ ok: true, message: '已提交，感谢你的分享' });
  }

  const name = str(b.name, 80);
  if (!name) throw badReq('请填写点位名称');
  const lat = toNum(b.lat);
  const lng = toNum(b.lng);
  if (!(lat >= -90 && lat <= 90) || !(lng >= -180 && lng <= 180)) {
    throw badReq('请在地图上点选位置或填写有效的经纬度');
  }

  const months = String(b.months ?? '')
    .split(',')
    .map((s) => parseInt(s, 10))
    .filter((m) => m >= 1 && m <= 12);

  // 专题：slug 列表，忽略不存在的
  const themeSlugs = String(b.themes ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  const themeIds = [];
  for (const slug of themeSlugs) {
    const t = q1('SELECT id FROM themes WHERE slug = ?', slug);
    if (t && !themeIds.includes(t.id)) themeIds.push(t.id);
  }

  // 联系方式：选填，仅支持邮箱
  const submitterContact = str(b.submitter_contact, 120);
  if (submitterContact && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(submitterContact)) {
    throw badReq('联系方式仅支持邮箱，请填写有效的邮箱地址');
  }

  const info = run(
    `INSERT INTO spots (name, description, lat, lng, address, region, tips, months, status, source,
                        submitter_name, submitter_contact)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', 'user', ?, ?)`,
    name,
    str(b.description, 4000),
    lat,
    lng,
    str(b.address, 200),
    str(b.region, 60),
    str(b.tips, 1000),
    JSON.stringify(months),
    str(b.submitter_name, 40),
    submitterContact
  );
  const spotId = Number(info.lastInsertRowid);

  for (const tid of themeIds) {
    run('INSERT OR IGNORE INTO spot_themes(spot_id, theme_id) VALUES(?, ?)', spotId, tid);
  }

  let featured = null;
  const files = req.files || [];
  for (let i = 0; i < files.length; i++) {
    const saved = await saveImage(files[i].buffer, files[i].mimetype);
    const pi = run(
      'INSERT INTO photos(spot_id, path, caption, sort) VALUES(?, ?, ?, ?)',
      spotId, saved.path, str(b[`caption_${i}`], 200), i
    );
    if (i === 0) featured = Number(pi.lastInsertRowid);
  }
  if (featured) run('UPDATE spots SET featured_photo_id = ? WHERE id = ?', featured, spotId);

  res.json({ ok: true, message: '已提交，审核通过后将展示在地图上' });
});

export default r;
