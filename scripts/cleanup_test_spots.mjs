/**
 * 清理测试用机位数据
 * 删除：31,32,33（茶卡盐湖 甲/乙/丙投稿模板）、35,36,37（景山万春亭重复项）、38,39,40（机位A/B/C 非景观测试点）
 * 保留：1-12 种子点位、20 坝上草原、30 茶卡壹号、34 景山万春亭（去重后单条）
 *
 * 用法：
 *   node scripts/cleanup_test_spots.mjs --dry-run   # 只预览
 *   node scripts/cleanup_test_spots.mjs --apply     # 实际执行
 */
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const DRY = !process.argv.includes('--apply');
const DB_PATH = 'D:/摄影地图/data/photo-map.db';
const UPLOAD_ROOT = 'D:/摄影地图/data/uploads';

const DELETE_IDS = [31, 32, 33, 35, 36, 37, 38, 39, 40];
const KEEP_GROUP_ONE = [34]; // 去重后需保留的点位（其 group_key 若成孤儿会被清理）

const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA foreign_keys = ON');

// ---------- 1. 备份 ----------
const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
const bakPath = `D:/摄影地图/data/photo-map.db.bak-${stamp}`;
if (!DRY) {
  db.exec(`VACUUM INTO '${bakPath.replace(/\\/g, '/')}'`);
  console.log(`[backup] ${bakPath}  (${(fs.statSync(bakPath).size / 1024).toFixed(1)} KB)`);
}

// ---------- 2. 预览待删除内容 ----------
const spots = db.prepare('SELECT id, name, lat, lng FROM spots WHERE id IN (31,32,33,35,36,37,38,39,40) ORDER BY id').all();
console.log('\n[待删除点位]');
for (const s of spots) {
  const ph = db.prepare('SELECT id, path FROM photos WHERE spot_id = ?').all(s.id);
  console.log(`  #${s.id} ${s.name}  (${s.lat}, ${s.lng})  关联图片 ${ph.length} 张`);
  for (const p of ph) console.log(`        photo#${p.id} ${p.path}`);
}

if (DRY) {
  console.log('\n[dry-run] 未做任何修改。确认后加 --apply 执行。');
  process.exit(0);
}

// ---------- 3. 收集并删除图片文件 ----------
const photoRows = db.prepare(
  `SELECT id, spot_id, path FROM photos WHERE spot_id IN (${DELETE_IDS.join(',')})`
).all();
let removedFiles = 0;
for (const p of photoRows) {
  const base = path.basename(p.path || '');
  if (!base) continue;
  const full = path.join(UPLOAD_ROOT, p.path.replace(/^\/?uploads\//, ''));
  const thumb = full.replace(/\.webp$/, '.t.webp');
  for (const f of [full, thumb]) {
    if (fs.existsSync(f)) { fs.unlinkSync(f); removedFiles++; console.log(`  [file] 删除 ${f}`); }
  }
}

// ---------- 4. 删除数据库记录（外键级联清掉 photos / spot_themes）----------
const delSpot = db.prepare('DELETE FROM spots WHERE id = ?');
let removedSpots = 0;
db.exec('BEGIN');
try {
  for (const id of DELETE_IDS) {
    const r = delSpot.run(id);
    if (r.changes > 0) { removedSpots++; console.log(`  [db] 删除点位 #${id}`); }
  }
  db.exec('COMMIT');
} catch (e) {
  db.exec('ROLLBACK');
  throw e;
}
console.log(`\n[db] 已删除点位 ${removedSpots} 条，图片记录 ${photoRows.length} 条，图片文件 ${removedFiles} 个`);

// ---------- 5. 清理孤儿 group_key（组内仅剩 1 条）----------
const orphans = db.prepare(
  `SELECT id, name, group_key FROM spots
   WHERE group_key IS NOT NULL
     AND group_key IN (SELECT group_key FROM spots WHERE group_key IS NOT NULL GROUP BY group_key HAVING COUNT(*) < 2)`
).all();
if (orphans.length) {
  const upd = db.prepare('UPDATE spots SET group_key = NULL, updated_at = datetime(\'now\',\'localtime\') WHERE id = ?');
  db.exec('BEGIN');
  for (const o of orphans) { upd.run(o.id); console.log(`  [group] 清理孤儿分组 ${o.group_key} → #${o.id} ${o.name}`); }
  db.exec('COMMIT');
} else {
  console.log('[group] 无孤儿分组');
}

// ---------- 6. 残留检查 ----------
const strayPhotos = db.prepare('SELECT COUNT(*) c FROM photos WHERE spot_id NOT IN (SELECT id FROM spots)').get().c;
const strayThemes = db.prepare('SELECT COUNT(*) c FROM spot_themes WHERE spot_id NOT IN (SELECT id FROM spots)').get().c;
console.log(`\n[check] 孤儿 photos: ${strayPhotos}，孤儿 spot_themes: ${strayThemes}`);

const left = db.prepare('SELECT s.id, s.name, s.status, s.group_key, (SELECT COUNT(*) FROM photos p WHERE p.spot_id=s.id) c FROM spots s ORDER BY s.id').all();
console.log(`\n[剩余点位 ${left.length} 条]`);
for (const s of left) console.log(`  #${s.id} ${s.name}  [${s.status}] 图${s.c} ${s.group_key ? '组' + s.group_key : ''}`);
