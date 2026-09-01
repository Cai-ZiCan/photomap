import { Router } from 'express';
import { q, q1 } from '../db.js';
import { config } from '../config.js';
import { thumbOf } from '../services/images.js';

const r = Router();

function themesBySpot() {
  const map = new Map();
  for (const row of q(
    `SELECT st.spot_id AS sid, t.slug, t.name, t.color, t.icon
     FROM spot_themes st JOIN themes t ON t.id = st.theme_id
     ORDER BY t.sort, t.id`
  )) {
    if (!map.has(row.sid)) map.set(row.sid, []);
    map.get(row.sid).push({ slug: row.slug, name: row.name, color: row.color, icon: row.icon });
  }
  return map;
}

function photosBySpot() {
  const map = new Map();
  for (const p of q('SELECT * FROM photos ORDER BY sort, id')) {
    if (!map.has(p.spot_id)) map.set(p.spot_id, []);
    map.get(p.spot_id).push(p);
  }
  return map;
}

function toListItem(spot, tMap, pMap) {
  const photos = pMap.get(spot.id) || [];
  const cover = photos.find((p) => p.id === spot.featured_photo_id) || photos[0] || null;
  return {
    id: spot.id,
    name: spot.name,
    lng: spot.lng,
    lat: spot.lat,
    region: spot.region,
    address: spot.address,
    months: JSON.parse(spot.months || '[]'),
    themes: tMap.get(spot.id) || [],
    cover: cover ? `/uploads/${cover.path}` : null,
    coverThumb: cover ? `/uploads/${thumbOf(cover.path)}` : null,
  };
}

/** 同名记录的归一化键（去首尾/压缩空白、忽略大小写） */
function normalizeName(name) {
  return String(name || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * 同点位归组（并查集）。两条规则**互不传染**：
 *   1. 手动并入：带 group_key 的记录只按 group_key 归组；
 *   2. 同名自动：没有 group_key 的记录才按归一化同名归组。
 *
 * 旧实现把两条规则塞进同一个并查集，而并查集是传递的 ——
 * 「同名组 {A,B,C}」与「手动并入组 {A,X}」会经 A 连成 {A,B,C,X}，
 * 表现为：管理端只点了其中一个点位「并入」，同名的其它记录却被一起带进组。
 * 返回 find(id) 函数，root 相同即同组。
 */
function groupSpots(spots) {
  const parent = new Map(spots.map((s) => [s.id, s.id]));
  const find = (x) => {
    while (parent.get(x) !== x) {
      parent.set(x, parent.get(parent.get(x)));
      x = parent.get(x);
    }
    return x;
  };
  const union = (a, b) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(Math.max(ra, rb), Math.min(ra, rb));
  };
  const byName = new Map();
  const byGroupKey = new Map();
  for (const s of spots) {
    if (s.group_key) {
      // 已手动并入的：只认 group_key，不再参与同名归组
      if (byGroupKey.has(s.group_key)) union(byGroupKey.get(s.group_key), s.id);
      else byGroupKey.set(s.group_key, s.id);
      continue;
    }
    const nameKey = normalizeName(s.name);
    if (!nameKey) continue;
    if (byName.has(nameKey)) union(byName.get(nameKey), s.id);
    else byName.set(nameKey, s.id);
  }
  return find;
}

/**
 * 归组主体：手动并入时指定的目标点位（group_key 形如 `g:<id>`）。
 * 取得到就用它当代表，取不到（纯同名自动归组 / 目标已被删除）返回 null。
 */
function groupMainId(members) {
  for (const s of members) {
    const m = /^g:(\d+)$/.exec(String(s.group_key || ''));
    if (!m) continue;
    const id = Number(m[1]);
    if (members.some((x) => x.id === id)) return id;
  }
  return null;
}

r.get('/site', (_req, res) => {
  res.json({ name: config.siteName, description: config.siteDesc });
});

r.get('/health', (_req, res) => {
  res.json({ ok: true });
});

r.get('/themes', (_req, res) => {
  res.json(q('SELECT id, slug, name, color, icon, description, sort FROM themes ORDER BY sort, id'));
});

r.get('/spots', (req, res) => {
  const { theme, months, q: kw, bbox } = req.query;

  const tMap = themesBySpot();
  const pMap = photosBySpot();
  let spots = q(`SELECT * FROM spots WHERE status = 'published' ORDER BY id DESC`);

  if (theme) {
    const wanted = String(theme).split(',').filter(Boolean);
    spots = spots.filter((s) => (tMap.get(s.id) || []).some((t) => wanted.includes(t.slug)));
  }
  if (months) {
    const wanted = String(months).split(',').map(Number).filter(Number.isInteger);
    spots = spots.filter((s) => {
      const ms = JSON.parse(s.months || '[]');
      return wanted.some((m) => ms.includes(m));
    });
  }
  if (kw) {
    const k = String(kw).trim().toLowerCase();
    if (k) {
      spots = spots.filter((s) => {
        const themes = (tMap.get(s.id) || []).map((t) => t.name).join(' ');
        return [s.name, s.address, s.region, s.description, themes]
          .join(' ')
          .toLowerCase()
          .includes(k);
      });
    }
  }
  if (bbox) {
    const [minx, miny, maxx, maxy] = String(bbox).split(',').map(Number);
    if ([minx, miny, maxx, maxy].every(Number.isFinite)) {
      spots = spots.filter((s) => s.lng >= minx && s.lng <= maxx && s.lat >= miny && s.lat <= maxy);
    }
  }

  // 记录级过滤后按同点位归组：一组一个 Feature，代表取有封面优先、其次 id 最小
  const find = groupSpots(spots);
  const groups = new Map();
  for (const s of spots) {
    const root = find(s.id);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push(s);
  }

  res.json({
    type: 'FeatureCollection',
    features: [...groups.values()].map((members) => {
      const ordered = members.slice().sort((a, b) => a.id - b.id);
      // 代表优先取「被并入的目标点位」，这样被并入的记录不会再顶替主体的图标与名称
      const mainId = groupMainId(members);
      const rep =
        (mainId ? members.find((s) => s.id === mainId) : null) ||
        ordered.find((s) => (pMap.get(s.id) || []).length > 0) ||
        ordered[0];
      const siblings = ordered.map((s) => {
        const photos = pMap.get(s.id) || [];
        const cover = photos.find((p) => p.id === s.featured_photo_id) || photos[0] || null;
        return { id: s.id, name: s.name, coverThumb: cover ? `/uploads/${thumbOf(cover.path)}` : null };
      });
      const item = { ...toListItem(rep, tMap, pMap), groupSize: siblings.length, siblings };
      return {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [item.lng, item.lat] },
        properties: item,
      };
    }),
  });
});

r.get('/spots/:id', (req, res) => {
  const spot = q1(`SELECT * FROM spots WHERE id = ? AND status = 'published'`, Number(req.params.id));
  if (!spot) return res.status(404).json({ error: '点位不存在或未发布' });

  const photos = q('SELECT * FROM photos WHERE spot_id = ? ORDER BY sort, id', spot.id).map((p) => ({
    id: p.id,
    path: `/uploads/${p.path}`,
    thumb: `/uploads/${thumbOf(p.path)}`,
    caption: p.caption,
    credit: p.credit,
  }));
  const themes = q(
    `SELECT t.slug, t.name, t.color, t.icon FROM spot_themes st
     JOIN themes t ON t.id = st.theme_id WHERE st.spot_id = ? ORDER BY t.sort, t.id`,
    spot.id
  );
  const cover = photos.find((p) => p.id === spot.featured_photo_id) || photos[0] || null;

  const published = q(`SELECT id, name, group_key FROM spots WHERE status = 'published' ORDER BY id`);
  const find = groupSpots(published);
  const root = find(spot.id);
  const siblings = published.filter((s) => find(s.id) === root).map((s) => ({ id: s.id, name: s.name }));

  res.json({
    ...spot,
    months: JSON.parse(spot.months || '[]'),
    themes,
    photos,
    cover: cover?.path || null,
    coverThumb: cover?.thumb || null,
    siblings,
  });
});

export default r;
