const test = require('node:test');
const assert = require('node:assert/strict');
const { getSpotlightProducts, resolveProductImage } = require('../services/api/src/services/productSpotlight.cjs');
const { recommendProductsForScenario } = require('../services/api/src/services/scenarioProductSearch.cjs');

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

test('travel-work scenario returns evidence-backed lightweight candidates without asking the user to name a model', () => {
  const result = recommendProductsForScenario('出差办公，轻便易携带，减少出行负担', { limit: 3 });
  assert.equal(result.length, 3);
  assert.equal(result[0].name, 'HUAWEI MateBook Pro S');
  assert.ok(result[0].score > result[1].score);
  assert.ok(result.every(item => item.name && item.positioning && item.source_path));
  assert.ok(result.some(item => /970|980|轻|便携|移动办公/.test(`${item.positioning} ${item.reason}`)));
  assert.ok(result.every(item => item.reason && item.matched_tasks?.length));
});

test('generic office recommendations explain their match with product-specific supported tasks', () => {
  const result = recommendProductsForScenario('办公', { limit: 3 });
  assert.equal(result.length, 3);
  assert.ok(result.every(item => item.reason && item.matched_tasks?.length));
  assert.ok(result.every(item => item.matched_tasks.some(task => /办公/.test(task))));
});
