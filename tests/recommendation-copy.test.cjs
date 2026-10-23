const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { recommendationMarkdown } = require('../shared/recommendationCopy.mjs');
const { recommendProductsForScenario } = require('../services/api/src/services/scenarioProductSearch.cjs');
const { ROOT } = require('../services/api/src/services/localKnowledgeBrowser.cjs');

test('saved raw recommendation is readable and links facts, matching notes and price to their own entries', () => {
  const facts = 'P1-产品参数库/电脑/测试/产品事实.md';
  const price = 'P2-价格库/测试-价格卡.md';
  const text = recommendationMarkdown({
    source_path: facts,
    reason: '产品资料列出的匹配任务：“需要直接连接 HDMI 显示器和 USB-A 外设的移动办公。”；产品资料标注机身约 1320 g',
    suitable_tasks: ['需要直接连接 HDMI 显示器和 USB-A 外设的移动办公。', '已有兼容华为设备并愿意按账号与版本条件建立协同。'],
    recommended_configuration: { offer_summary: '直降100元；官网页面列有赠品' },
    price_solution: { source_path: price },
  });
  assert.doesNotMatch(text, /产品资料|匹配任务|适合：|官网页面列有/);
  assert.match(text, /机身约 1320 g/);
  assert.match(text, /少带一些转接设备/);
  assert.match(text, /兼容设备/);
  const citations = [...text.matchAll(/\[(\d+)\]\(#knowledge\?path=([^)]*)\)/g)];
  assert.deepEqual(citations.map(m => m[1]), ['1', '2', '2', '3']);
  assert.deepEqual([...new Set(citations.map(m => decodeURIComponent(m[2])))], [facts, facts.replace('产品事实', '卖点与限制'), price]);
});

test('real scenario recommendations carry readable benefits and existing knowledge sources', () => {
  const products = recommendProductsForScenario('大学生写论文，想轻便，出差办公，使用华为手机互传');
  assert.ok(products.length > 0);
  for (const product of products) {
    assert.doesNotMatch(product.reason, /产品资料|匹配任务/);
    assert.ok(product.recommendation_points.length);
    for (const point of product.recommendation_points) {
      assert.ok(point.text);
      if (point.source_path) assert.ok(fs.existsSync(path.join(ROOT, point.source_path)), point.source_path);
    }
  }
});

test('sparse evidence does not invent ports, weight, battery life or discount', () => {
  const text = recommendationMarkdown({ suitable_tasks: ['文档、网页和普通办公'], source_path: '产品事实.md' });
  assert.match(text, /写文档、看网页和处理表格/);
  assert.doesNotMatch(text, /HDMI|USB|\d+\s*g|续航|直降|跨设备/);
  assert.doesNotMatch(recommendationMarkdown({ recommendation_points: [{ text: '看看这款', source_path: '../secret.md' }] }), /#knowledge/);
});
