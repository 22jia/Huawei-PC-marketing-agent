const test = require('node:test');
const assert = require('node:assert/strict');
const { getSpotlightProducts, resolveProductImage } = require('../services/api/src/services/productSpotlight.cjs');
const { recommendProductsForScenario } = require('../services/api/src/services/scenarioProductSearch.cjs');
const { generate } = require('../services/api/src/agent/taskAgent.cjs');

test('product spotlight data exposes student-oriented suitability text for scenario search', () => {
  const product = getSpotlightProducts().find((item) => item.suitable_tasks.some((task) => /学生/.test(task)));
  assert.ok(product, 'expected at least one product with student suitability text');
  assert.match(product.suitable_tasks.join(' '), /学生/);
});

test('product spotlight is built from local product facts, positioning, tasks and imagery', () => {
  const products = getSpotlightProducts();
  assert.ok(products.length >= 8);
  const matebookPro = products.find((item) => item.name === 'HUAWEI MateBook Pro');
  assert.ok(matebookPro);
  assert.match(matebookPro.positioning, /鸿蒙协同/);
  assert.ok(matebookPro.suitable_tasks.length > 0);
  assert.match(matebookPro.checked_at, /^\d{4}-\d{2}-\d{2}$/);
  assert.match(matebookPro.image, /^\/api\/v1\/products\/image\?/);
});

test('product image resolver only serves image files inside the knowledge base', () => {
  const product = getSpotlightProducts().find((item) => item.image);
  const imagePath = new URL(`http://localhost${product.image}`).searchParams.get('path');
  assert.ok(resolveProductImage(imagePath));
  assert.equal(resolveProductImage('../.env'), null);
  assert.equal(resolveProductImage('P1-产品参数库/README.md'), null);
});

test('travel-work recommendations expose product-specific knowledge-base reasons', () => {
  const result = recommendProductsForScenario('出差办公，轻便易携带，减少出行负担', { limit: 3 });
  assert.equal(result.length, 3);
  assert.ok(result.every((product) => product.name && product.positioning && product.source_path));
  assert.ok(result.every((product) => product.reason && product.matched_tasks.length));
  assert.ok(result.every((product) => product.matched_tasks.some((task) => /差旅|移动办公|外出|携带|轻薄/.test(task))));
});

test('generic office recommendations explain the matching supported tasks', () => {
  const result = recommendProductsForScenario('办公', { limit: 3 });
  assert.equal(result.length, 3);
  assert.ok(result.every((product) => product.reason && product.matched_tasks.some((task) => /办公/.test(task))));
});

test('agent returns scenario-matched products and their reasons before asking for a model', async () => {
  const result = await generate({
    history: [{ role: 'user', content: '我是门店员工，想给出差办公的人写小红书软文' }],
  }, {
    planTask: async () => ({
      value: { intent: 'generate', task_updates: { scenario: '出差办公，轻便易携带' }, retrieval_queries: [] },
      meta: { model: 'test-model' },
    }),
  });
  assert.equal(result.result_type, 'product_selection');
  assert.match(result.reply, /推荐理由/);
  assert.ok(result.task.scenario_candidates.length > 0);
  assert.ok(result.task.scenario_candidates.every((product) => product.reason));
});
