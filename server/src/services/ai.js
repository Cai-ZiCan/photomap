import { config } from '../config.js';

export function aiEnabled() {
  return !!config.ai.apiKey;
}

export function aiConfigInfo() {
  return {
    enabled: aiEnabled(),
    baseUrl: config.ai.baseUrl,
    textModel: config.ai.textModel,
    visionModel: config.ai.visionModel,
  };
}

async function chat(messages, model, timeoutMs = 90_000) {
  const res = await fetch(`${config.ai.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${config.ai.apiKey}`,
    },
    body: JSON.stringify({ model, messages, temperature: 0.2 }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`AI 接口返回 ${res.status}：${t.slice(0, 300)}`);
  }
  const data = await res.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error('AI 返回内容为空');
  return content;
}

function parseJsonLoose(raw) {
  const s = String(raw).trim().replace(/^```(?:json)?/i, '').replace(/```$/, '');
  try {
    return JSON.parse(s);
  } catch { /* 继续尝试截取花括号 */ }
  const m = s.match(/\{[\s\S]*\}/);
  if (m) {
    try { return JSON.parse(m[0]); } catch { /* 放弃 */ }
  }
  throw new Error('AI 返回的内容无法解析为 JSON');
}

/** 主题候选动态取自数据库，避免 prompt 里写死候选与库内 slug 脱节 */
function buildSystemPrompt(themeCandidates) {
  const themeList = themeCandidates.length
    ? themeCandidates.map((t) => `${t.name}(${t.slug})`).join('、')
    : '赏花(flower)、秋叶(autumn)、雪景(snow)、星空(star)、山水(landscape)';
  return `你是地理信息抽取助手。用户会给你一段来自网页或笔记的文字（可能附图片），请从中抽取"摄影观赏点位"信息，严格输出如下 JSON（不要输出任何其他文字）：
{
  "name": "点位名称（尽量简短，如「居庸关长城·开往春天的列车观景点」）",
  "description": "介绍文字：若原文是完整笔记正文，请原样摘录正文（保留原有的分段、语气与 emoji，不要改写扩写）；若原文缺失或只是摘要，则撰写 80~200 字介绍，说明看点、拍摄内容",
  "address": "详细地址或位置描述，原文没有则为空字符串",
  "region": "省/市/区一级行政区，如「北京市昌平区」，无法判断则为空字符串",
  "themes": ["从这些候选中选最贴切的1~2个（输出候选名称）：${themeList}"],
  "months": [1..12 的整数数组，最佳观赏月份，无法判断则为空数组],
  "tips": "拍摄/出行贴士，原文没有则为空字符串",
  "author": "原文作者/博主昵称，无法判断则为空字符串",
  "is_photography_spot": true或false（内容是否确实是摄影观赏点）
}
若内容与摄影观赏点无关，仅输出 {"is_photography_spot": false}。`;
}

function normalizeDraft(d) {
  if (!d || d.is_photography_spot === false) return null;
  const str = (v) => (typeof v === 'string' ? v.trim().slice(0, 2000) : '');
  const months = Array.isArray(d.months)
    ? d.months.map(Number).filter((n) => Number.isInteger(n) && n >= 1 && n <= 12)
    : [];
  const themes = Array.isArray(d.themes) ? d.themes.map((t) => String(t).trim()).filter(Boolean).slice(0, 3) : [];
  return {
    name: str(d.name) || '未命名点位',
    description: str(d.description),
    address: str(d.address),
    region: str(d.region),
    themes,
    months: [...new Set(months)].sort((a, b) => a - b),
    tips: str(d.tips),
    author: str(d.author).slice(0, 80),
  };
}

/**
 * 从文本（及可选图片）中提取摄影点位信息。
 * 有图时优先用视觉模型（附前 2 张图），失败自动回退纯文本模型。
 */
export async function extractSpot({ text, images = [], themeCandidates = [] }) {
  if (!aiEnabled()) {
    throw Object.assign(new Error('未配置 AI_API_KEY，无法使用 AI 提取'), { status: 400 });
  }
  const systemPrompt = buildSystemPrompt(themeCandidates);
  const userText = `请从以下内容中提取摄影观赏点位信息：\n\n${String(text || '').slice(0, 8000)}`;

  let lastErr;
  if (images.length > 0 && config.ai.visionModel) {
    try {
      const content = [{ type: 'text', text: userText }];
      for (const url of images.slice(0, 2)) {
        content.push({ type: 'image_url', image_url: { url } });
      }
      const raw = await chat(
        [
          { role: 'system', content: systemPrompt },
          { role: 'user', content },
        ],
        config.ai.visionModel
      );
      const draft = normalizeDraft(parseJsonLoose(raw));
      if (draft) return draft;
      throw new Error('AI 判断内容不是摄影观赏点');
    } catch (e) {
      lastErr = e; // 回退纯文本
    }
  }

  const raw = await chat(
    [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userText },
    ],
    config.ai.textModel
  );
  const draft = normalizeDraft(parseJsonLoose(raw));
  if (!draft) throw Object.assign(new Error('AI 判断该内容不是摄影观赏点，未生成草稿'), { status: 422 });
  return draft;
}
