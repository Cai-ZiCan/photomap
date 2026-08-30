import archiver from 'archiver';
import path from 'node:path';
import { q } from '../db.js';
import { UPLOAD_DIR, config } from '../config.js';

/** 打包导出：photomap.json（全部数据）+ photos/（全部图片文件），流式写入 res */
export function exportZip(res) {
  const themes = q('SELECT * FROM themes ORDER BY sort, id');
  const spots = q('SELECT * FROM spots ORDER BY id');
  const spotThemes = q('SELECT * FROM spot_themes');
  const photos = q('SELECT * FROM photos ORDER BY sort, id');

  const manifest = {
    format: 'photomap-export',
    version: 1,
    exported_at: new Date().toISOString(),
    site: { name: config.siteName, description: config.siteDesc },
    themes,
    spot_themes: spotThemes,
    spots: spots.map((s) => {
      const { id, ...rest } = s;
      return { ...rest, _id: id };
    }),
    photos: photos.map((p) => {
      const { id, ...rest } = p;
      return { ...rest, _id: id };
    }),
  };

  res.setHeader('content-type', 'application/zip');
  res.setHeader('content-disposition', `attachment; filename="photomap-export-${Date.now()}.zip"`);

  const archive = archiver('zip', { zlib: { level: 9 } });
  archive.on('warning', (e) => console.warn('export warn:', e.message));
  archive.on('error', (e) => {
    console.error('export error:', e);
    res.destroy(e);
  });
  archive.pipe(res);
  archive.append(JSON.stringify(manifest, null, 2), { name: 'photomap.json' });
  for (const p of photos) {
    archive.file(path.join(UPLOAD_DIR, p.path), { name: `photos/${p.path}` });
  }
  archive.finalize();
}
