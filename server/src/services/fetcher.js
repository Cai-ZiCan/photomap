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

/**
 * 抓取网页：返回 { type:'html', url, title, desc, text, images[] }
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
  const $ = cheerio.load(html);

  const title =
    $('meta[property="og:title"]').attr('content')?.trim() ||
    $('#activity-name').text().trim() || // 微信公众号文章标题
    $('title').text().trim() || '';
  const desc =
    $('meta[property="og:description"]').attr('content')?.trim() ||
    $('meta[name="description"]').attr('content')?.trim() ||
    '';

  $('script, style, noscript, iframe, nav, footer, svg').remove();
  const bodyText = ($('#js_content').text() || $('article').text() || $('body').text() || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 6000);

  const images = [];
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

  const text = [title, desc, bodyText].filter(Boolean).join('\n').slice(0, 8000);
  return { type: 'html', url: finalUrl, title, desc, text, images };
}

/** 下载一张图片到内存（供 AI 提取后落库使用） */
export async function downloadImage(url) {
  const res = await fetch(url, {
    headers: { 'user-agent': UA, accept: 'image/*,*/*;q=0.8' },
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
