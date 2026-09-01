import { Router } from 'express';
import multer from 'multer';
import path from 'node:path';
import {
  q, q1, run, getSetting, setSetting,
} from '../db.js';
import { config, UPLOAD_DIR } from '../config.js';
import {
  adminInitialized, setupAdmin, login, changePassword,
  setSessionCookie, clearSessionCookie, requireAdmin, verifyToken,
} from '../auth.js';
import { saveImage, removeImageFiles, thumbOf } from '../services/images.js';
import { fetchPage, downloadImage } from '../services/fetcher.js';
import { aiEnabled, aiConfigInfo, extractSpot } from '../services/ai.js';
import { exportZip } from '../services/export.js';

const r = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.upload.maxMb * 1024 * 1024, files: config.upload.maxFiles },
});

const badReq = (m) => Object.assign(new Error(m), { status: 400 });
const str = (v, max = 4000) => String(v ?? '').trim().slice(0, max);
const toNum = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
};
const STATUSES = new Set(['pending', 'published', 'rejected', 'archived']);

/* ---------- 会话 ---------- */

r.get('/state', (req, res) => {
  res.json({
    initialized: adminInitialized(),
    authenticated: verifyToken(req.cookies?.pm_token),
  });
});

r.post('/setup', (req, res) => {
  const password = str(req.body?.password, 100);
  if (password.length < 8) throw badReq('密码至少 8 位');
  setupAdmin(password);
  setSessionCookie(res, login(password));
  res.json({ ok: true });
});

r.post('/login', (req, res) => {
  const token = login(str(req.body?.password, 100));
  if (!token) throw badReq('密码不正确');
  setSessionCookie(res, token);
  res.json({ ok: true });
});

r.post('/logout', (req, res) => {
  clearSessionCookie(res);
  res.json({ ok: true });
});

r.post('/password', requireAdmin, (req, res) => {
  const oldPw = str(req.body?.oldPassword, 100);
  const newPw = str(req.body?.newPassword, 100);
  if (newPw.length < 8) throw badReq('新密码至少 8 位');
  changePassword(oldPw, newPw);
  res.json({ ok: true });
});

r.get('/config', requireAdmin, (_req, res) => {
  res.json({
    site: { name: config.siteName, description: config.siteDesc },
    ai: aiConfigInfo(),
    upload: config.upload,
  });
});

/* ---------- 概览 ---------- */

r.get('/overview', requireAdmin, (_req, res) => {
  const count = (s) => q1('SELECT COUNT(*) AS c FROM spots WHERE status = ?', s).c;
  res.json({
    published: count('published'),
    pending: count('pending'),
    rejected: count('rejected'),
    archived: count('archived'),
    themes: q1('SELECT COUNT(*) AS c FROM themes').c,
    seedSpots: q1('SELECT COUNT(*) AS c FROM spots WHERE seed = 1').c,
  });
});

/* ---------- 点位 ---------- */

function spotWithRelations(spot) {
  const themes = q(
    `SELECT t.slug, t.name, t.color, t.icon FROM spot_themes st
     JOIN themes t ON t.id = st.theme_id WHERE st.spot_id = ? ORDER BY t.sort, t.id`,
    spot.id
  );
  const photos = q('SELECT * FROM photos WHERE spot_id = ? ORDER BY sort, id', spot.id).map((p) => ({
    id: p.id,
    path: `/uploads/${p.path}`,
    thumb: `/uploads/${thumbOf(p.path)}`,
    caption: p.caption,
    credit: p.credit,
  }));
  const cover = photos.find((p) => p.id === spot.featured_photo_id) || photos[0] || null;
  return {
    ...spot,
    months: JSON.parse(spot.months || '[]'),
    themes,
    photos,
    cover: cover?.path || null,
    coverThumb: cover?.thumb || null,
  };
}

function applyThemes(spotId, themeKeys) {
  run('DELETE FROM spot_themes WHERE spot_id = ?', spotId);
  for (const key of themeKeys) {
    // 兼容传入 slug 或中文主题名（AI 提取返回的是中文名）
    const t = q1('SELECT id FROM themes WHERE slug = ? OR name = ?', key, key);
    if (t) run('INSERT OR IGNORE INTO spot_themes(spot_id, theme_id) VALUES(?, ?)', spotId, t.id);
  }
}

/** 从请求体提取点位字段（新建/更新共用），返回 {fields, themeSlugs} */
function extractSpotBody(b) {
  const name = str(b.name, 80);
  if (!name) throw badReq('请填写点位名称');
  const lat = toNum(b.lat);
  const lng = toNum(b.lng);
  if (!(lat >= -90 && lat <= 90) || !(lng >= -180 && lng <= 180)) throw badReq('纬度/经度无效');
  const months = Array.isArray(b.months)
    ? b.months.map(Number).filter((m) => Number.isInteger(m) && m >= 1 && m <= 12)
    : [];
  const themeSlugs = Array.isArray(b.themes) ? b.themes.map((s) => String(s).trim()).filter(Boolean) : [];
  return {
    fields: {
      name,
      description: str(b.description, 4000),
      lat,
      lng,
      address: str(b.address, 200),
      region: str(b.region, 60),
      tips: str(b.tips, 1000),
      months: JSON.stringify([...new Set(months)].sort((a, b2) => a - b2)),
      source_url: str(b.source_url, 500),
      source_note: str(b.source_note, 200),
      submitter_name: str(b.submitter_name, 40),
      submitter_contact: str(b.submitter_contact, 120),
    },
    themeSlugs,
  };
}

r.get('/spots', requireAdmin, (req, res) => {
  const { status, kw } = req.query;
  let spots = q('SELECT * FROM spots ORDER BY id DESC');
  if (status && STATUSES.has(String(status))) spots = spots.filter((s) => s.status === status);
  if (kw) {
    const k = String(kw).trim().toLowerCase();
    if (k) spots = spots.filter((s) => [s.name, s.address, s.region].join(' ').toLowerCase().includes(k));
  }
  res.json(spots.map(spotWithRelations));
});

r.post('/spots', requireAdmin, (req, res) => {
  const { fields, themeSlugs } = extractSpotBody(req.body || {});
  const info = run(
    `INSERT INTO spots (name, description, lat, lng, address, region, tips, months, status, source,
                        source_url, source_note, submitter_name, submitter_contact)
     VALUES (@name, @description, @lat, @lng, @address, @region, @tips, @months,
             @status, @source, @source_url, @source_note, @submitter_name, @submitter_contact)`,
    {
      ...fields,
      status: STATUSES.has(req.body?.status) ? req.body.status : 'published',
      source: ['creator', 'user', 'crawler'].includes(req.body?.source) ? req.body.source : 'creator',
    }
  );
  const id = Number(info.lastInsertRowid);
  applyThemes(id, themeSlugs);
  res.json(spotWithRelations(q1('SELECT * FROM spots WHERE id = ?', id)));
});

r.put('/spots/:id', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  if (!q1('SELECT id FROM spots WHERE id = ?', id)) throw badReq('点位不存在');
  const { fields, themeSlugs } = extractSpotBody(req.body || {});
  run(
    `UPDATE spots SET name=@name, description=@description, lat=@lat, lng=@lng, address=@address,
                      region=@region, tips=@tips, months=@months, source_url=@source_url,
                      source_note=@source_note, submitter_name=@submitter_name,
                      submitter_contact=@submitter_contact, updated_at=datetime('now','localtime')
     WHERE id=@id`,
    { ...fields, id }
  );
  applyThemes(id, themeSlugs);
  res.json(spotWithRelations(q1('SELECT * FROM spots WHERE id = ?', id)));
});

function deleteSpotFiles(spotId) {
  for (const p of q('SELECT path FROM photos WHERE spot_id = ?', spotId)) {
    removeImageFiles(p.path);
  }
}

r.delete('/spots/:id', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  deleteSpotFiles(id);
  run('DELETE FROM spots WHERE id = ?', id);
  res.json({ ok: true });
});

r.post('/spots/:id/status', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const status = String(req.body?.status || '');
  if (!STATUSES.has(status)) throw badReq('状态无效');
  const spot = q1('SELECT * FROM spots WHERE id = ?', id);
  if (!spot) throw badReq('点位不存在');
  const note = str(req.body?.review_note, 500);
  run(
    `UPDATE spots SET status = ?, review_note = CASE WHEN ? != '' THEN ? ELSE review_note END,
              reviewed_at = CASE WHEN ? = 'pending' THEN NULL ELSE datetime('now','localtime') END,
              updated_at = datetime('now','localtime')
     WHERE id = ?`,
    status, note, note, status, id
  );
  // 网友投稿/链接导入发布时，投稿人/原文作者即图片作者，自动补署名（不覆盖已填写的 credit）
  if (status === 'published' && (spot.source === 'user' || spot.source === 'crawler') && spot.submitter_name) {
    const author = String(spot.submitter_name).replace(/^@/, '').trim();
    if (author) {
      run("UPDATE photos SET credit = ? WHERE spot_id = ? AND (credit IS NULL OR credit = '')", `@${author}`, id);
    }
  }
  res.json(spotWithRelations(q1('SELECT * FROM spots WHERE id = ?', id)));
});

/* ---------- 照片 ---------- */

r.post('/spots/:id/photos', requireAdmin, upload.array('photos', config.upload.maxFiles), async (req, res) => {
  const id = Number(req.params.id);
  if (!q1('SELECT id FROM spots WHERE id = ?', id)) throw badReq('点位不存在');
  const maxSort = q1('SELECT COALESCE(MAX(sort), -1) AS m FROM photos WHERE spot_id = ?', id).m;
  const files = req.files || [];
  let featured = null;
  for (let i = 0; i < files.length; i++) {
    const saved = await saveImage(files[i].buffer, files[i].mimetype);
    const pi = run(
      'INSERT INTO photos(spot_id, path, caption, sort) VALUES(?, ?, ?, ?)',
      id, saved.path, str(req.body?.[`caption_${i}`], 200), maxSort + 1 + i
    );
    if (i === 0) featured = Number(pi.lastInsertRowid);
  }
  if (featured && !q1('SELECT featured_photo_id FROM spots WHERE id = ?', id).featured_photo_id) {
    run('UPDATE spots SET featured_photo_id = ? WHERE id = ?', featured, id);
  }
  res.json(spotWithRelations(q1('SELECT * FROM spots WHERE id = ?', id)));
});

r.put('/photos/:id', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const photo = q1('SELECT * FROM photos WHERE id = ?', id);
  if (!photo) throw badReq('照片不存在');
  run(
    'UPDATE photos SET caption = ?, credit = ?, sort = ? WHERE id = ?',
    str(req.body?.caption, 200), str(req.body?.credit, 100),
    Number.isInteger(req.body?.sort) ? req.body.sort : photo.sort, id
  );
  res.json(spotWithRelations(q1('SELECT * FROM spots WHERE id = ?', photo.spot_id)));
});

r.delete('/photos/:id', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const photo = q1('SELECT * FROM photos WHERE id = ?', id);
  if (!photo) throw badReq('照片不存在');
  removeImageFiles(photo.path);
  run('DELETE FROM photos WHERE id = ?', id);
  const spot = q1('SELECT featured_photo_id FROM spots WHERE id = ?', photo.spot_id);
  if (spot?.featured_photo_id === id) {
    const next = q1('SELECT id FROM photos WHERE spot_id = ? ORDER BY sort, id', photo.spot_id);
    run('UPDATE spots SET featured_photo_id = ? WHERE id = ?', next?.id ?? null, photo.spot_id);
  }
  res.json(spotWithRelations(q1('SELECT * FROM spots WHERE id = ?', photo.spot_id)));
});

r.post('/spots/:id/featured', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const photoId = req.body?.photoId;
  if (photoId !== null && photoId !== undefined) {
    const p = q1('SELECT id FROM photos WHERE id = ? AND spot_id = ?', Number(photoId), id);
    if (!p) throw badReq('照片不属于该点位');
  }
  run('UPDATE spots SET featured_photo_id = ? WHERE id = ?', photoId ?? null, id);
  res.json(spotWithRelations(q1('SELECT * FROM spots WHERE id = ?', id)));
});

/* ---------- 专题 ---------- */

r.get('/themes', requireAdmin, (_req, res) => {
  res.json(q('SELECT * FROM themes ORDER BY sort, id'));
});

function validColor(c) {
  return /^#[0-9a-fA-F]{6}$/.test(c) ? c : null;
}

r.post('/themes', requireAdmin, (req, res) => {
  const b = req.body || {};
  const name = str(b.name, 20);
  if (!name) throw badReq('请填写专题名称');
  let slug = str(b.slug, 24).toLowerCase();
  if (!slug) slug = `t${Date.now().toString(36)}`;
  if (!/^[a-z0-9-]{1,24}$/.test(slug)) throw badReq('slug 仅允许小写字母、数字与连字符');
  if (q1('SELECT id FROM themes WHERE slug = ?', slug)) throw badReq('slug 已存在');
  run(
    'INSERT INTO themes(slug, name, color, icon, description, sort) VALUES(?, ?, ?, ?, ?, ?)',
    slug, name, validColor(b.color) || '#e67e22', str(b.icon, 8), str(b.description, 200),
    Number.isInteger(b.sort) ? b.sort : 99
  );
  res.json(q('SELECT * FROM themes ORDER BY sort, id'));
});

r.put('/themes/:id', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  if (!q1('SELECT id FROM themes WHERE id = ?', id)) throw badReq('专题不存在');
  const b = req.body || {};
  const name = str(b.name, 20);
  if (!name) throw badReq('请填写专题名称');
  run(
    'UPDATE themes SET name = ?, color = ?, icon = ?, description = ?, sort = ? WHERE id = ?',
    name, validColor(b.color) || '#e67e22', str(b.icon, 8), str(b.description, 200),
    Number.isInteger(b.sort) ? b.sort : 99, id
  );
  res.json(q('SELECT * FROM themes ORDER BY sort, id'));
});

r.delete('/themes/:id', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  if (!q1('SELECT id FROM themes WHERE id = ?', id)) throw badReq('专题不存在');
  run('DELETE FROM themes WHERE id = ?', id); // spot_themes 级联删除
  res.json(q('SELECT * FROM themes ORDER BY sort, id'));
});

/* ---------- AI 提取与导入 ---------- */

/** 原文超过该长度时建议用 AI 重写，而非整段保留 */
const ORIGINAL_TEXT_MAX = 800;

r.post('/ai-extract', requireAdmin, async (req, res) => {
  const b = req.body || {};
  const url = str(b.url, 500);
  const text = str(b.text, 20000);
  if (!url && !text) throw badReq('请填写网页链接或粘贴文本');

  const themeCandidates = q('SELECT slug, name FROM themes ORDER BY sort, id');
  let source = { url: '', title: '', text, author: '', images: [] };
  if (url) {
    const page = await fetchPage(url);
    if (page.type === 'image') {
      source = { url, title: '', text: text || '', author: '', images: [page.url] };
    } else {
      source = {
        url: page.url,
        title: page.title,
        text: [text, page.text].filter(Boolean).join('\n'),
        author: page.author || '',
        images: page.images,
      };
    }
  }
  const draft = await extractSpot({ text: source.text, images: source.images, themeCandidates });
  draft.author = source.author || draft.author || '';
  const originalText = source.text || '';
  res.json({
    draft: { ...draft, source_url: source.url },
    title: source.title,
    images: source.images,
    originalText,
    useOriginal: originalText.length > 0 && originalText.length <= ORIGINAL_TEXT_MAX,
  });
});

r.post('/import', requireAdmin, async (req, res) => {
  const b = req.body || {};
  const { fields, themeSlugs } = extractSpotBody(b);
  // 原文作者/博主昵称：作者即文案作者（submitter_name），也默认作为图片署名
  const author = str(b.author, 40);
  if (author && !fields.submitter_name) fields.submitter_name = author;
  const credit = str(b.credit, 100) || author;
  const images = Array.isArray(b.images) ? b.images.map((u) => String(u)).filter((u) => /^https?:\/\//.test(u)).slice(0, config.upload.maxFiles) : [];
  const fromUrl = str(b.source_url, 500);
  let downloadReferer = '';
  if (fromUrl) {
    try { downloadReferer = new URL(fromUrl).origin; } catch { /* 非法链接则不带 Referer */ }
  }

  const info = run(
    `INSERT INTO spots (name, description, lat, lng, address, region, tips, months, status, source,
                        source_url, source_note, review_note, submitter_name, submitter_contact)
     VALUES (@name, @description, @lat, @lng, @address, @region, @tips, @months,
             'pending', @source, @source_url, @source_note, @review_note, @submitter_name, @submitter_contact)`,
    {
      ...fields,
      source: fromUrl ? 'crawler' : 'creator',
      source_url: fromUrl,
      source_note: str(b.source_note, 200) || '由链接导入，AI 辅助提取',
      review_note: '导入草稿：请核对信息、补充位置',
    }
  );
  const id = Number(info.lastInsertRowid);
  applyThemes(id, themeSlugs);

  const errors = [];
  let featured = null;
  for (let i = 0; i < images.length; i++) {
    try {
      const img = await downloadImage(images[i], downloadReferer);
      const saved = await saveImage(img.buffer, img.contentType);
      const pi = run('INSERT INTO photos(spot_id, path, caption, credit, sort) VALUES(?, ?, ?, ?, ?)', id, saved.path, '', credit, i);
      if (i === 0) featured = Number(pi.lastInsertRowid);
    } catch (e) {
      errors.push(e.message);
    }
  }
  if (featured) run('UPDATE spots SET featured_photo_id = ? WHERE id = ?', featured, id);
  if (images.length > 0 && !featured) {
    run("UPDATE spots SET review_note = '导入草稿：图片全部下载失败，请手动上传' WHERE id = ?", id);
  }

  res.json({
    ok: true,
    id,
    imageErrors: errors,
    spot: spotWithRelations(q1('SELECT * FROM spots WHERE id = ?', id)),
  });
});

/* ---------- 同点位归组 ---------- */

/** 空间相近提示阈值（米）：仅作管理端提示，是否并入由制作者确认 */
const NEARBY_METERS = 200;

function haversineMeters(lat1, lng1, lat2, lng2) {
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLng = (lng2 - lng1) * rad;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLng / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

r.get('/spots/:id/nearby', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const spot = q1('SELECT * FROM spots WHERE id = ?', id);
  if (!spot) throw badReq('点位不存在');
  const nearby = q('SELECT id, name, lat, lng, status, source, group_key FROM spots WHERE id != ?', id)
    .map((o) => ({ ...o, distance: Math.round(haversineMeters(spot.lat, spot.lng, o.lat, o.lng)) }))
    .filter((o) => o.distance <= NEARBY_METERS)
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 10);
  res.json(nearby);
});

r.post('/spots/:id/merge', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const targetId = Number(req.body?.into);
  if (!targetId || targetId === id) throw badReq('目标点位无效');
  const source = q1('SELECT * FROM spots WHERE id = ?', id);
  if (!source) throw badReq('点位不存在');
  const target = q1('SELECT * FROM spots WHERE id = ?', targetId);
  if (!target) throw badReq('目标点位不存在');
  // 已发布并入未发布 = 公开地图上完全不生效（未发布的点位不参与归组），
  // 表现就是「归并完了，被归并的点位在地图上照旧单独显示」。直接拦掉并给出指引。
  if (source.status === 'published' && target.status !== 'published') {
    throw badReq(`目标点位「${target.name}」尚未发布，并入后不会在地图上生效；请先发布它，或改并入一个已发布的点位`);
  }
  // 目标若已被并入别处，则并入它所在的组，避免 A→B、B→A 形成互指
  const key = target.group_key || `g:${targetId}`;
  if (target.group_key && target.group_key === `g:${id}`) {
    throw badReq('目标点位已并入当前点位，无需重复并入');
  }
  run("UPDATE spots SET group_key = ?, updated_at = datetime('now','localtime') WHERE id = ?", key, id);
  if (!target.group_key) run("UPDATE spots SET group_key = ?, updated_at = datetime('now','localtime') WHERE id = ?", key, target.id);
  res.json(spotWithRelations(q1('SELECT * FROM spots WHERE id = ?', id)));
});

r.post('/spots/:id/unmerge', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const spot = q1('SELECT * FROM spots WHERE id = ?', id);
  if (!spot) throw badReq('点位不存在');
  const key = spot.group_key;
  if (key) {
    run("UPDATE spots SET group_key = NULL, updated_at = datetime('now','localtime') WHERE id = ?", id);
    // 组里只剩一条时把残留的 group_key 一并清掉：
    // 否则那条会一直带着 group_key，从而永远退出「同名自动归组」。
    const rest = q('SELECT id FROM spots WHERE group_key = ?', key);
    if (rest.length <= 1) {
      run("UPDATE spots SET group_key = NULL, updated_at = datetime('now','localtime') WHERE group_key = ?", key);
    }
  }
  res.json(spotWithRelations(q1('SELECT * FROM spots WHERE id = ?', id)));
});

/* ---------- 数据管理 ---------- */

r.get('/export', requireAdmin, (req, res) => {
  exportZip(res);
});

r.post('/clear-seed', requireAdmin, (_req, res) => {
  const seeds = q('SELECT id FROM spots WHERE seed = 1');
  for (const s of seeds) deleteSpotFiles(s.id);
  run('DELETE FROM spots WHERE seed = 1');
  setSetting('seeded', 'cleared'); // 防止重启后重新生成
  res.json({ ok: true, removed: seeds.length });
});

r.post('/reseed', requireAdmin, async (_req, res) => {
  const { seed } = await import('../seed/seed.js');
  await seed(true);
  res.json({ ok: true });
});

export default r;
