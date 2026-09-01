import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { DB_PATH, DATA_DIR, UPLOAD_DIR } from './config.js';

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

export const db = new DatabaseSync(DB_PATH);

db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT
  );

  CREATE TABLE IF NOT EXISTS themes (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    slug        TEXT UNIQUE NOT NULL,
    name        TEXT NOT NULL,
    color       TEXT NOT NULL DEFAULT '#e67e22',
    icon        TEXT NOT NULL DEFAULT '',
    description TEXT NOT NULL DEFAULT '',
    sort        INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
  );

  CREATE TABLE IF NOT EXISTS spots (
    id                 INTEGER PRIMARY KEY AUTOINCREMENT,
    name               TEXT NOT NULL,
    description        TEXT NOT NULL DEFAULT '',
    lat                REAL NOT NULL,
    lng                REAL NOT NULL,
    address            TEXT NOT NULL DEFAULT '',
    region             TEXT NOT NULL DEFAULT '',
    tips               TEXT NOT NULL DEFAULT '',
    months             TEXT NOT NULL DEFAULT '[]',
    status             TEXT NOT NULL DEFAULT 'pending'
                       CHECK (status IN ('pending','published','rejected','archived')),
    source             TEXT NOT NULL DEFAULT 'creator'
                       CHECK (source IN ('creator','user','crawler')),
    source_url         TEXT NOT NULL DEFAULT '',
    source_note        TEXT NOT NULL DEFAULT '',
    submitter_name     TEXT NOT NULL DEFAULT '',
    submitter_contact  TEXT NOT NULL DEFAULT '',
    review_note        TEXT NOT NULL DEFAULT '',
    featured_photo_id  INTEGER,
    seed               INTEGER NOT NULL DEFAULT 0,
    group_key          TEXT,
    created_at         TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    updated_at         TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    reviewed_at        TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_spots_status ON spots(status);
  CREATE INDEX IF NOT EXISTS idx_spots_seed ON spots(seed);

  CREATE TABLE IF NOT EXISTS spot_themes (
    spot_id  INTEGER NOT NULL REFERENCES spots(id) ON DELETE CASCADE,
    theme_id INTEGER NOT NULL REFERENCES themes(id) ON DELETE CASCADE,
    PRIMARY KEY (spot_id, theme_id)
  );
  CREATE INDEX IF NOT EXISTS idx_spot_themes_theme ON spot_themes(theme_id);

  CREATE TABLE IF NOT EXISTS photos (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    spot_id    INTEGER NOT NULL REFERENCES spots(id) ON DELETE CASCADE,
    path       TEXT NOT NULL,
    caption    TEXT NOT NULL DEFAULT '',
    credit     TEXT NOT NULL DEFAULT '',
    sort       INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
  );
  CREATE INDEX IF NOT EXISTS idx_photos_spot ON photos(spot_id);
`);

// 轻量迁移：为旧库补充 spots.group_key（手动并入同一点位组的标识）
{
  const cols = db.prepare('PRAGMA table_info(spots)').all();
  if (!cols.some((c) => c.name === 'group_key')) {
    db.exec('ALTER TABLE spots ADD COLUMN group_key TEXT');
  }
  db.exec('CREATE INDEX IF NOT EXISTS idx_spots_group_key ON spots(group_key)');
}

export function q(sql, ...params) {
  return db.prepare(sql).all(...params);
}

export function q1(sql, ...params) {
  return db.prepare(sql).get(...params);
}

export function run(sql, ...params) {
  return db.prepare(sql).run(...params);
}

export function getSetting(key) {
  const row = q1('SELECT value FROM settings WHERE key = ?', key);
  return row ? row.value : null;
}

export function setSetting(key, value) {
  run(
    'INSERT INTO settings(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    key, String(value)
  );
}
