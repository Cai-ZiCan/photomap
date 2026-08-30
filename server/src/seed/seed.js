import { q1, run, getSetting, setSetting } from '../db.js';
import { saveImage } from '../services/images.js';

const THEMES = [
  { slug: 'flower', name: '赏花', color: '#ef5f8e', icon: '🌸', description: '樱花、桃花、油菜花、梅花等花卉观赏', sort: 1 },
  { slug: 'autumn', name: '秋叶', color: '#e07b28', icon: '🍁', description: '银杏、红枫、胡杨等秋色叶景观', sort: 2 },
  { slug: 'snow', name: '雪景', color: '#4d9fd6', icon: '❄️', description: '雪原、雾凇、冰瀑等冬季景观', sort: 3 },
  { slug: 'star', name: '星空', color: '#6f5bd0', icon: '✨', description: '银河、星空镜面倒影等夜空摄影地', sort: 4 },
  { slug: 'landscape', name: '山水', color: '#3f9e5f', icon: '🏞️', description: '山川、江河、湖泊等自然风光', sort: 5 },
];

const PALETTES = {
  flower: ['#f7a6bd', '#ef5f8e'],
  autumn: ['#f2b263', '#d96c1e'],
  snow: ['#a8d4f0', '#4d9fd6'],
  star: ['#8f86e0', '#4a3f9e'],
  landscape: ['#8fce9f', '#2e7d4f'],
};

const SPOTS = [
  {
    name: '奥林匹克森林公园 · 北园花田', lat: 40.0172, lng: 116.3981, region: '北京市朝阳区',
    address: '北京市朝阳区科荟路33号奥林匹克森林公园北园', months: [3, 4, 5, 9, 10], themes: ['flower', 'autumn'],
    description: '北京城区最大的免费赏花地之一，春季山桃花、二月兰、樱花次第开放，秋季北园芦苇与黄栌相映成趣。园内步道平缓，适合拍摄大场景与人文小品。',
    tips: '清晨人流较少、光线柔和；地铁8号线森林公园南门站下车即达。',
  },
  {
    name: '居庸关长城 · 「开往春天的列车」观景点', lat: 40.2872, lng: 116.0674, region: '北京市昌平区',
    address: '北京市昌平区S216居庸关长城', months: [3, 4], themes: ['flower'],
    description: '居庸关两侧山桃与山杏盛放时，市郊铁路S2线列车穿行于粉色花海与长城之间，是北京春季最经典的机位之一。',
    tips: '花期约3月底至4月中旬、仅两周左右；拍摄列车需提前查S2线时刻表，在观景台用长焦等候。',
  },
  {
    name: '武汉东湖磨山樱园', lat: 30.5489, lng: 114.4162, region: '湖北省武汉市武昌区',
    address: '湖北省武汉市武昌区沿湖大道东湖磨山景区', months: [3, 4], themes: ['flower'],
    description: '与日本弘前樱花园、美国华盛顿樱花园并称世界三大樱花之都，园内樱花逾万株，夜樱亮灯后氛围极佳。',
    tips: '3月中下旬为盛花期；夜樱时段单独售票，拍摄建议避开周末高峰。',
  },
  {
    name: '成都龙泉山 · 桃花故里', lat: 30.6283, lng: 104.3125, region: '四川省成都市龙泉驿区',
    address: '四川省成都市龙泉驿区山泉镇桃源村', months: [3, 4], themes: ['flower'],
    description: '龙泉山脉种植桃树数万亩，阳春三月桃花漫山，配合山间云雾与客家村落，出片率极高。',
    tips: '山路弯多，自驾注意安全；高点机位在桃源村附近观景台。',
  },
  {
    name: '无量山樱花谷', lat: 24.4215, lng: 100.6308, region: '云南省普洱市景东彝族自治县',
    address: '云南省普洱市景东彝族自治县无量山镇樱花谷', months: [11, 12], themes: ['flower'],
    description: '全国罕见的冬樱花观赏地，每年11月底至12月，樱花在碧绿茶田间盛放，晨雾缭绕如仙境。',
    tips: '日出前后半小时光线最佳；当地昼夜温差大，注意保暖。',
  },
  {
    name: '明孝陵石象路', lat: 32.0551, lng: 118.8421, region: '江苏省南京市玄武区',
    address: '江苏省南京市玄武区石象路明孝陵景区', months: [11, 12], themes: ['autumn'],
    description: '被誉为「南京最美600米」，银杏、乌桕、榉树、枫香在深秋交织成暖色隧道，石兽雕像点缀其间。',
    tips: '11月中下旬色彩最浓；早上7点前入园可避开人流。',
  },
  {
    name: '钓鱼台银杏大道', lat: 39.9218, lng: 116.3185, region: '北京市海淀区',
    address: '北京市海淀区三里河路钓鱼台国宾馆东墙外', months: [11], themes: ['autumn'],
    description: '北京城区最著名的银杏观赏地，千米大道两侧银杏金黄，适合逆光人像与街景。',
    tips: '工作日早晨人少；周末人流极大，建议错峰。',
  },
  {
    name: '额济纳胡杨林景区', lat: 41.9683, lng: 101.0725, region: '内蒙古阿拉善盟额济纳旗',
    address: '内蒙古自治区阿拉善盟额济纳旗达来呼布镇', months: [10], themes: ['autumn'],
    description: '世界仅存三大胡杨林之一，每年10月金叶如焰；二道桥拍倒影、四道桥拍树形、八道桥拍沙漠驼队。',
    tips: '最佳窗口仅10月上中旬约20天；早晚温差极大，注意防风沙。',
  },
  {
    name: '乌兰布统 · 蛤蟆坝', lat: 42.4702, lng: 117.3604, region: '内蒙古赤峰市克什克腾旗',
    address: '内蒙古自治区赤峰市克什克腾旗乌兰布统蛤蟆坝', months: [9, 10, 12, 1], themes: ['autumn', 'snow'],
    description: '坝上草原经典摄影地，白桦、丘陵与羊群层次丰富；秋季色彩斑斓，冬季雪原银装素裹。',
    tips: '景区内为土路，建议越野车或包车；日出前半小时到达机位。',
  },
  {
    name: '长白山天池（北坡）', lat: 42.0362, lng: 128.0570, region: '吉林省延边朝鲜族自治州',
    address: '吉林省延边朝鲜族自治州安图县长白山北景区', months: [1, 2, 10, 11], themes: ['snow'],
    description: '冬季天池冰封雪裹，在长白十六峰环抱中宛如一块白玉；运气好还可遇「雾凇长廊」。',
    tips: '山顶风大气温低，务必防风保暖；天池能否一睹全貌看运气，建议预留两次上山机会。',
  },
  {
    name: '茶卡盐湖 · 夜空之镜', lat: 36.7218, lng: 99.0930, region: '青海省海西蒙古族藏族自治州乌兰县',
    address: '青海省海西蒙古族藏族自治州乌兰县茶卡镇盐湖路9号', months: [5, 6, 7, 8], themes: ['star'],
    description: '海拔约3100米的盐湖，无月夜可拍摄银河与盐面倒影，「星空之镜」是国内星空摄影的标志性机位。',
    tips: '选择农历廿五至初十之间的无月夜前往；注意高原反应，结伴拍摄、注意脚下盐洞。',
  },
  {
    name: '兴坪 · 黄布倒影', lat: 24.9037, lng: 110.4831, region: '广西桂林市阳朔县',
    address: '广西壮族自治区桂林市阳朔县兴坪镇漓江边', months: [5, 6, 10, 11], themes: ['landscape'],
    description: '20元人民币背面图案取景地，漓江在此拐出经典的「山水湾」，清晨薄雾与渔火是漓江摄影的标志性画面。',
    tips: '登老寨山俯拍全景，江边拍竹筏渔火；5-6月与10-11月水位与天气最稳定。',
  },
];

function placeholderSvg(c1, c2) {
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${c1}"/>
      <stop offset="1" stop-color="${c2}"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="800" fill="url(#g)"/>
  <circle cx="950" cy="170" r="85" fill="rgba(255,255,255,0.55)"/>
  <path d="M0 560 L260 380 L420 520 L620 300 L820 540 L1000 420 L1200 560 L1200 800 L0 800 Z" fill="rgba(255,255,255,0.35)"/>
  <path d="M0 650 L200 530 L400 630 L640 480 L900 660 L1200 530 L1200 800 L0 800 Z" fill="rgba(255,255,255,0.5)"/>
</svg>`);
}

async function placeholderImage(spot, swap) {
  const [c1, c2] = PALETTES[spot.themes[0]] || PALETTES.landscape;
  const svg = placeholderSvg(swap ? c2 : c1, swap ? c1 : c2);
  return saveImage(svg, 'image/png');
}

/**
 * 写入主题与示例点位（含程序生成的占位图）。
 * force=true 时清空旧示例后重灌；默认仅在从未种子过时执行。
 */
export async function seed(force = false) {
  const state = getSetting('seeded');
  if (state && !force) return false;

  if (force) {
    const olds = q1('SELECT COUNT(*) AS c FROM spots WHERE seed = 1').c;
    if (olds > 0) {
      const { removeImageFiles } = await import('../services/images.js');
      const { q } = await import('../db.js');
      for (const s of q('SELECT id FROM spots WHERE seed = 1')) {
        for (const p of q('SELECT path FROM photos WHERE spot_id = ?', s.id)) removeImageFiles(p.path);
      }
      run('DELETE FROM spots WHERE seed = 1');
    }
  }

  for (const t of THEMES) {
    run(
      `INSERT INTO themes(slug, name, color, icon, description, sort) VALUES(?, ?, ?, ?, ?, ?)
       ON CONFLICT(slug) DO UPDATE SET name=excluded.name, color=excluded.color,
         icon=excluded.icon, description=excluded.description, sort=excluded.sort`,
      t.slug, t.name, t.color, t.icon, t.description, t.sort
    );
  }

  for (const s of SPOTS) {
    const exists = q1('SELECT id FROM spots WHERE name = ? AND seed = 1', s.name);
    if (exists) continue;
    const info = run(
      `INSERT INTO spots (name, description, lat, lng, address, region, tips, months,
                          status, source, source_note, seed)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'published', 'creator', '示例数据（非实拍），可在管理端修改或删除', 1)`,
      s.name, s.description, s.lat, s.lng, s.address, s.region, s.tips, JSON.stringify(s.months)
    );
    const id = Number(info.lastInsertRowid);
    for (const slug of s.themes) {
      const t = q1('SELECT id FROM themes WHERE slug = ?', slug);
      if (t) run('INSERT OR IGNORE INTO spot_themes(spot_id, theme_id) VALUES(?, ?)', id, t.id);
    }
    const p1 = await placeholderImage(s, false);
    const p2 = await placeholderImage(s, true);
    const a = run('INSERT INTO photos(spot_id, path, credit, sort) VALUES(?, ?, ?, 0)', id, p1.path, '示例占位图');
    run('INSERT INTO photos(spot_id, path, credit, sort) VALUES(?, ?, ?, 1)', id, p2.path, '示例占位图');
    run('UPDATE spots SET featured_photo_id = ? WHERE id = ?', Number(a.lastInsertRowid), id);
  }

  setSetting('seeded', '1');
  return true;
}

export async function seedIfEmpty() {
  try {
    if (await seed(false)) console.log('[seed] 已生成示例数据（主题 5 个，点位 %d 个）', SPOTS.length);
  } catch (e) {
    console.error('[seed] 示例数据生成失败（不影响其他功能）:', e.message);
  }
}
