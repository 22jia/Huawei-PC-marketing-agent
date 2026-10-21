const styles = [
  { id: 'a1', name: '女性桌面氛围', group: 'daily', terms: ['毛绒', '粉饼', '干花', '兰花', '女性桌面', '桌面氛围'], prompt: 'Soft indoor tabletop editorial photograph, pale grey plush-texture surface, carefully scattered black-frame glasses, a small compact, dried flower or orchid, and a leather journal. Keep a clean open area in the center-right for a separately placed product card. Warm natural side-window light, soft shadows, muted blush pink, lavender and ivory palette, 45-degree overhead view, subtle film grain, Japanese lifestyle magazine mood. Absolutely no electronics, text, logos, numbers, or watermark.' },
  { id: 'a2', name: '图书馆与宿舍学习', group: 'daily', terms: ['图书馆', '宿舍', '学习', '大学生', '校园'], prompt: 'Authentic university library or dorm study-table editorial photograph, wooden long desk with an open paper notebook, clear drinking glass, black-frame glasses, neutral pen and sticky notes. Leave the left 35 percent of the table visually clear for a separately placed product card. Neutral-warm window light, overhead view, shallow depth of field, candid phone-photography realism. No electronics, legible writing, logos or watermark.' },
  { id: 'a4', name: '办公桌工作日常', group: 'daily', terms: ['办公桌', '工作日常', '白色圆桌', '咖啡馆', '咖啡'], prompt: 'Natural editorial overhead photograph of a bright, minimal workday table: white round tabletop, black-frame glasses, a latte and a small white flower near the edge, pale grey tile surroundings. Keep the center-left clear for a separately placed product card. Soft side daylight, gentle shadows, realistic subtle grain, quiet lifestyle-magazine color. No electronics, text, logos or watermark.' },
  { id: 'b1', name: '高端产品介绍海报', group: 'poster', terms: ['高端', '产品介绍', '介绍海报', '品牌海报'], prompt: 'Premium vertical technology product-poster BACKGROUND only: warm ivory to pale beige gradient, refined paper texture, large pristine display area in the upper center for separate product placement, restrained flowing light accents at corners and tiny black-to-gold details, generous negative space, elegant high-end art direction. No product, text, letters, logos, numbers or watermark.' },
  { id: 'b2', name: '功能展示海报', group: 'poster', terms: ['功能', '功能展示', '界面'], prompt: 'Clean modern vertical feature-poster BACKGROUND only, soft beige gradient, a large empty central display zone for separate product placement, soft blue, amber and violet gradient light orbs near the bottom, friendly technology mood and generous negative space. No product, interface, text, letters, logos, numbers or watermark.' },
  { id: 'b3', name: '模块化卖点海报', group: 'poster', terms: ['模块', '卖点', '卖点海报', '多卖点'], prompt: 'Premium vertical modular product-poster BACKGROUND only, deep matte black with subtle tactile texture, three clear zones: quiet title space at top, large empty central product-display zone, and a bottom grid of empty benefit-card cells outlined by very fine grey dividers. Restrained fine gold accents, sophisticated technology art direction. No product, text, letters, logos, numbers or watermark.' },
  { id: 'b4', name: '电商促销海报', group: 'poster', terms: ['促销', '电商', '优惠'], prompt: 'Bright youthful vertical ecommerce-promotion BACKGROUND only, soft blue, blush pink and pale yellow gradients, large central empty product-display zone, simple blank label-frame shapes around the edges, clear empty call-to-action zone at the bottom. Playful but polished. No product, text, letters, logos, numbers or watermark.' },
  { id: 'unboxing', name: '开箱仪式感', group: 'daily', terms: ['开箱', '新品首发'], prompt: 'Candid lifestyle editorial photograph of a pale wood desk with a plain unbranded closed package and tissue paper being opened, gentle morning light, anticipation, natural imperfect details. Leave a clear central area for a separately placed product card. No electronics, text, logos or watermark.' },
  { id: 'commute', name: '通勤差旅', group: 'daily', terms: ['通勤', '差旅', '高铁'], prompt: 'Warm candid travel-work editorial photograph of a train window table, coffee cup and understated backpack, changing daylight and softly blurred landscape outside. Leave a clear table area for a separately placed product card. No electronics, legible text, logos or watermark.' },
  { id: 'gaming', name: '深夜电竞氛围', group: 'daily', terms: ['电竞', '深夜', '游戏本'], prompt: 'Moody but tasteful late-night gaming workspace editorial photograph, dark room with restrained blue-violet ambient light and a few peripheral accessories around a clear central area for separately placed product card. Real photographic texture, no screens or electronics visible, no text, logos or watermark.' },
  { id: 'detail', name: '产品细节特写', group: 'poster', terms: ['细节特写', '键盘', '接口', '微距'], prompt: 'Minimal macro product-detail BACKGROUND only, softly lit neutral studio surface, elegant shallow depth of field and clean empty central region for a separately composited official detail photograph, refined editorial lighting. No device, text, logo or watermark.' },
  { id: 'collage', name: '生活杂志拼贴', group: 'poster', terms: ['杂志拼贴'], prompt: 'Vertical lifestyle magazine-collage BACKGROUND only, warm paper texture, generous blank title area and several clean photo-frame regions with subtle torn-paper accents, contemporary social editorial layout. No product, text, letters, logos or watermark.' },
];
const unsupported = [
  { id: 'comparison', terms: ['对比', '测评', '评测', '左右对比'], message: '对比测评图需要两侧官方产品图和已核验对比证据；当前接口只支持单产品合成。' },
  { id: 'data', terms: ['数据可视化', '柱状图', '雷达图', '参数图', '数据图'], message: '数据可视化应由已核验证据通过图表代码绘制；当前工作台尚未接入图表渲染器。' },
  { id: 'handheld', terms: ['手持', '户外街拍', '人物使用'], message: '自然手持场景需要参考图编辑/产品主体融合接口；当前图像 API 只确认了文生图，避免交付伪造产品照片。' },
];
function chooseStyle(input, plan) {
  const fields = [plan.purpose, plan.caption, input.task.goal, input.task.scenario].filter((value) => typeof value === 'string');
  const text = fields.join(' ').toLowerCase();
  const blocked = [...unsupported].sort((a, b) => Number(b.id === 'data') - Number(a.id === 'data')).find((style) => style.terms.some((term) => text.includes(term)));
  if (blocked) return { unsupported: blocked };
  // An explicit template code wins; IDs are recognized only as whole tokens.
  const code = text.match(/(?:^|[^a-z0-9])([ab])[- ]?([1-4])(?=$|[^a-z0-9])/i);
  if (code) {
    const style = styles.find((item) => item.id === `${code[1].toLowerCase()}${code[2]}`);
    if (!style) return { unsupported: unsupported.find((item) => item.id === 'handheld') };
    return { style };
  }
  // Image purpose has priority over general scenario and audience.
  for (const field of fields) {
    const match = styles.find((style) => style.terms.some((term) => field.includes(term)));
    if (match) return { style: match };
    if (/海报|宣传/.test(field)) return { style: styles.find((style) => style.id === 'b1') };
  }
  const audience = input.task.audience || '';
  const fallback = /大学|学生/.test(audience) ? 'a2' :
    ['xiaohongshu', 'wechat_moments'].includes(input.task.platform) ? 'a1' : 'b1';
  return { style: styles.find((style) => style.id === fallback) };
}
module.exports = { styles, unsupported, chooseStyle };
