const { getSpotlightProducts } = require('./productSpotlight.cjs');
const { recommendationPoints } = require('../../../../shared/recommendationCopy.mjs');

function classifyCustomerSegment(description) {
  const text = String(description || '').toLowerCase();
  const identities = [];
  if (/学生|大学|论文|图书馆|宿舍|上课|学习/.test(text)) identities.push('学生');
  if (/职场|商务|办公|通勤|出差|会议|合同|表格/.test(text)) identities.push('职场');
  if (identities.includes('学生')) return { key: 'student', label: '学生学习', identities, hint: '先看常用学习软件，再比较携带负担和预算。' };
  if (identities.includes('职场')) return { key: 'professional', label: '职场办公', identities, hint: '先看办公软件、外设和移动使用需求，再比较配置。' };
  return { key: 'unknown', label: '用途待确认', identities, hint: '先按已提供的任务和预算比较，不预设使用人群。' };
}

const SIGNALS = [
  { input: /学生|大学|论文|图书馆|学习/, task: /学生|学习|论文|校园|文档|办公/ },
  { input: /华为手机|互传|协同|多设备/, task: /协同|互传|多设备|手机/ },
  { input: /出差|出行|通勤|移动办公|旅途/, task: /移动办公|外出|出行|通勤|携带|便携|轻薄|差旅/ },
  { input: /轻便|轻薄|携带|减负|重量|便携/, task: /轻薄|便携|重量|携带|移动办公|通勤|差旅/ },
  { input: /办公|文档|表格|网页|多任务/, task: /办公|文档|表格|网页|多任务/ },
  { input: /会议|演示|投屏|客户拜访/, task: /会议|演示|投屏|接口|外设/ },
  { input: /续航|电池|长时间/, task: /续航|电池|移动办公|出行/ },
];

function relevance(scenario, product) {
  const description = `${product.positioning || ''} ${(product.suitable_tasks || []).join(' ')} ${product.detail || ''}`.toLowerCase();
  const text = String(scenario || '').toLowerCase();
  const prioritizeWeight = /轻便|轻薄|携带|减负|重量|便携/.test(text);
  const scenarioSignals = SIGNALS;
  const matched_tasks = (product.suitable_tasks || [])
    .filter(task => scenarioSignals.some(signal => signal.input.test(text) && signal.task.test(task)))
    .slice(0, 3);
  let score = matched_tasks.length;
  const reasons = [];
  const dimensions = String(product.detail || '').match(/##\s*尺寸与重量([\s\S]*?)(?:\n##\s|$)/i)?.[1] || '';
  const weightBlocks = [...dimensions.matchAll(/(?:^|\n)重量\s*\n([\s\S]*?)(?=\n\*|\n##|$)/g)];
  const weightText = weightBlocks.at(-1)?.[1] || '';
  const weights = [...weightText.matchAll(/(\d+(?:[.,]\d+)?)\s*(kg|g)\b/gi)].map((match) => {
    const value = Number(match[1].replace(',', '.'));
    return match[2].toLowerCase() === 'kg' ? value * 1000 : value;
  }).filter(value => Number.isFinite(value) && value >= 500 && value <= 5000);
  const weightGrams = weights.length ? Math.min(...weights) : null;
  const intents = [
    { input: /出差|出行|通勤|移动办公|旅途/, evidence: /移动办公|出行|通勤|便携|携带|轻薄/, reason: '适合移动办公与外出携带' },
    { input: /轻便|轻薄|携带|减负|重量|便携/, evidence: /便携|轻薄|重量|\b(?:9\d{2}|1[.,]?\d)\s?(?:g|kg)|携带/, reason: '产品资料强调机身便携或重量' },
    { input: /续航|电池|长时间/, evidence: /续航|电池/, reason: '产品资料包含电池或续航信息' },
    { input: /会议|演示|投屏|客户拜访/, evidence: /会议|演示|投屏|hdmi|usb-a/, reason: '产品资料涉及会议或外接设备场景' },
  ];
  for (const intent of intents) {
    if (intent.input.test(text) && intent.evidence.test(description)) {
      if (intent.reason.includes('移动')) score += 4;
      else if (weightGrams !== null && prioritizeWeight) {
        score += Math.max(1, 20 - Math.floor(weightGrams / 100));
        reasons.push(`产品资料标注机身约 ${Math.round(weightGrams)} g`);
      } else score += 2;
      reasons.push(intent.reason);
    }
  }
  const scenarioTerms = text.match(/[\u3400-\u9fff]{2,}/g) || [];
  for (const term of scenarioTerms) {
    if (description.includes(term) && !reasons.some(reason => reason.includes(term))) score += 1;
  }
  const recommendation_points = recommendationPoints({ ...product, matched_tasks, weight_grams: prioritizeWeight ? weightGrams : null });
  return { score, reason: recommendation_points.map(point => point.text).join('\n\n'), recommendation_points, matched_tasks };
}

function recommendProductsForScenario(scenario, options = {}) {
  // No gaming preset is exposed; free-text requests still require explicit evidence.
  const needsGamingEvidence = /游戏|电竞|steam|帧率|3a/i.test(String(scenario || ''));
  return (options.getProducts || getSpotlightProducts)()
    .filter((product) => !needsGamingEvidence || (product.suitable_tasks || []).some((task) => /游戏|电竞|steam|帧率|3a/i.test(task) && !/不适合|不支持|不推荐/.test(task)))
    .map((product) => ({ ...product, ...relevance(scenario, product) }))
    .filter((product) => product.score > 0 && product.positioning && product.source_path)
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name, 'zh-CN'))
    .slice(0, Math.max(1, Math.min(Number(options.limit) || 3, 50)))
    .map(({ id, name, positioning, suitable_tasks, source_path, recommendation_source_path, source_url, checked_at, score, reason, recommendation_points, matched_tasks, image }) => ({
      id, name, positioning, suitable_tasks, source_path, recommendation_source_path, source_url, checked_at, score, reason, recommendation_points, matched_tasks, image,
    }));
}

module.exports = { recommendProductsForScenario, classifyCustomerSegment };
