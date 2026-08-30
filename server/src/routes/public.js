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

  res.json({
    type: 'FeatureCollection',
    features: spots.map((s) => {
      const item = toListItem(s, tMap, pMap);
      return { type: 'Feature', geometry: { type: 'Point', coordinates: [item.lng, item.lat] }, properties: item };
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

  res.json({
    ...spot,
    months: JSON.parse(spot.months || '[]'),
    themes,
    photos,
    cover: cover?.path || null,
    coverThumb: cover?.thumb || null,
  });
});

export default r;
