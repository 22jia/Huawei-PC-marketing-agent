// Render scenario evidence as benefits, rather than exposing retrieval labels.
// Shared by the API and UI so saved recommendations receive the same treatment.
export function recommendationPoints(product) {
  if (Array.isArray(product.recommendation_points) && product.recommendation_points.length) return product.recommendation_points;
  const tasks = (product.matched_tasks || product.suitable_tasks || []).join(' ');
  const facts = product.source_path;
  const notes = product.recommendation_source_path || facts?.replace(/产品事实\.md$/, '卖点与限制.md');
  const points = [];
  const add = (text, source_path = notes) => points.push({ text, source_path });
  const weight = product.weight_grams || Number(String(product.reason || '').match(/机身约\s*(\d+)\s*g/i)?.[1]);
  if (weight) add(`机身约 ${weight} g，经常带电脑出门，可以优先看看这款。`, facts);
  if (/HDMI/i.test(tasks) && /USB-A/i.test(tasks)) add('连接会议室显示器、鼠标或 U 盘时，可以直接用 HDMI 和 USB-A 接口，少带一些转接设备。');
  else if (/USB-C|雷电/i.test(tasks)) add('如果平时主要用 USB-C 外设，这款值得考虑；连接其他接口的设备时，需要配合转接器或扩展坞。');
  if (/长文档|纵向空间|3:2|长屏/.test(tasks)) add('经常看长文档、改论文或整理表格，可以重点看看它的屏幕，阅读和编辑都是选它的理由。');
  else if (/大表格|并排文档|大屏/.test(tasks)) add('需要一边看资料、一边处理表格时，大屏能给并排窗口留出更多空间。');
  if (/数字键盘/.test(tasks)) add('经常录入数字、整理账目，独立数字键盘会更顺手。');
  if (/协同|互传|跨设备/.test(tasks)) add('已经在用华为手机或平板的话，可以把跨设备传文件、接续工作作为另一个选择理由，搭配兼容设备使用。');
  if (!points.length && /文档|办公|网页|学习/.test(tasks)) add('如果日常主要是写文档、看网页和处理表格，可以把这款放进候选清单。');
  if (!points.length) add('可以先看看这款是否符合你的使用习惯，再比较具体配置和价格。', null);
  return points.slice(0, 3);
}

export function recommendationMarkdown(product) {
  const paths = [];
  const cite = path => {
    if (!path || path.startsWith('/') || path.includes('\\') || path.split('/').some(p => p === '..' || p === '.') || !/\.md$/i.test(path)) return '';
    if (!paths.includes(path)) paths.push(path);
    return `[${paths.indexOf(path) + 1}](#knowledge?path=${encodeURIComponent(path)})`;
  };
  const paragraphs = recommendationPoints(product).map(point => `${point.text}${cite(point.source_path)}`);
  const offer = product.recommended_configuration?.offer_summary;
  if (offer && offer !== '未记录可确认的直降或赠品') {
    const text = offer.replace(/官网页面列有赠品/g, '赠品').replace(/[；;]+/g, '、').replace(/[。.]$/, '');
    paragraphs.push(`商城当时还有${text}活动。${cite(product.price_solution?.source_path)}`);
  }
  return paragraphs.join('\n\n');
}
