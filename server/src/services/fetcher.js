import * as cheerio from 'cheerio';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const MAX_HTML = 3_000_000;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

function absolutize(base, src) {
  if (!src) return null;
  const s = src.trim();
  if (!s || s.startsWith('data:')) return null;
  try {
    return new URL(s, base).href;
  } catch {
    return null;
  }
}

/** 保留换行的正文清洗：压平行内空白，连续空行合并为一个空行（保留分段） */
function tidyText(raw, max) {
  return String(raw || '')
    .replace(/\r/g, '')
    .split('\n')
    .map((line) => line.replace(/[ \t\f\v]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, max);
}

function isXhsHost(host) {
  return /(^|\.)xiaohongshu\.com$/.test(host) || host === 'xhslink.com';
}

/** 解析小红书页面内嵌的 window.__INITIAL_STATE__（含 undefined 字面量，非法 JSON，需清洗） */
export function parseXhsState(html) {
  const m = html.match(/window\.__INITIAL_STATE__\s*=\s*(\{[\s\S]*?\});?<\/script>/);
  if (!m) return null;
  try {
    return JSON.parse(m[1].replace(/\bundefined\b/g, 'null'));
  } catch {
    return null;
  }
}

export function extractXhsNote(state) {
  try {
    const noteState = state?.note || {};
    const map = noteState.noteDetailMap || {};
    const firstId = noteState.firstNoteId || Object.keys(map)[0];
    const note = map?.[firstId]?.note;
    if (!note) return null;
    const images = (note.imageList || [])
      .map((im) => im?.urlDefault || im?.urlPre || im?.url || '')
      .filter(Boolean)
      .map((u) => (u.startsWith('//') ? `https:${u}` : u))
      .filter((u) => /^https?:\/\//.test(u));
    return {
      title: String(note.title || ''),
      desc: String(note.desc || ''),
      nickname: String(note.user?.nickname || ''),
      images,
    };
  } catch {
    return null;
  }
}

/**
 * 抓取网页：返回 { type:'html', url, title, desc, author, text, images[] }
 * 若 URL 直接是图片则返回 { type:'image', url, contentType }
 */
export async function fetchPage(url) {
  const res = await fetch(url, {
    headers: { 'user-agent': UA, accept: 'text/html,application/xhtml+xml,image/*;q=0.8,*/*;q=0.5' },
    redirect: 'follow',
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw Object.assign(new Error(`抓取失败：HTTP ${res.status}`), { status: 502 });

  const contentType = res.headers.get('content-type') || '';
  if (contentType.startsWith('image/')) {
    return { type: 'image', url: res.url || url, contentType };
  }
  if (!contentType.includes('html') && !contentType.includes('text')) {
    throw Object.assign(new Error(`不支持的内容类型：${contentType || '未知'}`), { status: 502 });
  }

  const html = (await res.text()).slice(0, MAX_HTML);
  const finalUrl = res.url || url;
  const host = new URL(finalUrl).hostname;
  const $ = cheerio.load(html);

  const title0 =
    $('meta[property="og:title"]').attr('content')?.trim() ||
    $('#activity-name').text().trim() || // 微信公众号文章标题
    $('title').text().trim() || '';
  const desc =
    $('meta[property="og:description"]').attr('content')?.trim() ||
    $('meta[name="description"]').attr('content')?.trim() ||
    '';
  const author =
    $('meta[property="og:article:author"]').attr('content')?.trim() ||
    $('meta[name="author"]').attr('content')?.trim() ||
    '';

  $('script, style, noscript, iframe, nav, footer, svg').remove();
  let title = title0;
  let bodyText = tidyText($('#js_content').text() || $('article').text() || $('body').text() || '', 6000);
  let noteAuthor = author;
  let images = [];
  const push = (u) => {
    if (u && /^https?:\/\//.test(u) && !/\.(svg)([?#]|$)/i.test(u) && !images.includes(u) && images.length < 12) {
      images.push(u);
    }
  };
  const og = $('meta[property="og:image"]').attr('content');
  if (og) push(absolutize(finalUrl, og));
  $('img').each((_, el) => {
    const $el = $(el);
    // 微信公众号图片在 data-src；常见懒加载属性一并兼容
    push(absolutize(finalUrl, $el.attr('data-src') || $el.attr('data-original') || $el.attr('src')));
  });

  // 小红书：登录墙下 DOM 正文不可用，优先取内嵌状态里的笔记数据
  if (isXhsHost(host)) {
    const note = extractXhsNote(parseXhsState(html));
    if (note) {
      if (note.title) title = note.title;
      bodyText = tidyText(note.desc, 6000);
      noteAuthor = note.nickname || noteAuthor;
      if (note.images.length > 0) images = note.images.slice(0, 12);
    }
  }

  const text = [...new Set([title, desc, bodyText].filter(Boolean))].join('\n').slice(0, 8000);
  return { type: 'html', url: finalUrl, title, desc, author: noteAuthor, text, images };
}

/** 按图片域名推断防盗链 Referer（小红书 CDN 需要带来源） */
function refererFor(url) {
  try {
    const host = new URL(url).hostname;
    if (/(^|\.)xhscdn\.com$/.test(host)) return 'https://www.xiaohongshu.com/';
  } catch { /* 忽略 */ }
  return '';
}

/** 下载一张图片到内存（供 AI 提取后落库使用），可显式指定 Referer */
export async function downloadImage(url, referer) {
  const ref = referer || refererFor(url);
  const res = await fetch(url, {
    headers: { 'user-agent': UA, accept: 'image/*,*/*;q=0.8', ...(ref ? { referer: ref } : {}) },
    redirect: 'follow',
    signal: AbortSignal.timeout(25_000),
  });
  if (!res.ok) throw new Error(`图片下载失败 HTTP ${res.status}：${url}`);
  const contentType = (res.headers.get('content-type') || '').split(';')[0].trim();
  if (!contentType.startsWith('image/')) throw new Error(`链接不是图片：${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > MAX_IMAGE_BYTES) throw new Error(`图片过大（>10MB）：${url}`);
  if (buf.length < 1024) throw new Error(`图片过小，疑似无效：${url}`);
  return { buffer: buf, contentType };
}
