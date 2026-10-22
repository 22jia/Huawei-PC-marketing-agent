const test = require('node:test');
const assert = require('node:assert/strict');
const { buildPriceSolution } = require('../services/api/src/services/priceSolutionService.cjs');

test('price solution returns available configurations instead of requiring four tiers', () => {
  const result = buildPriceSolution('HUAWEI MateBook 14（鸿蒙版）', '6000');
  assert.equal(result.status, 'available');
  assert.equal(result.budget_status, 'within_budget');
  assert.equal(result.minimum_price, 5899);
  assert.equal(result.tiers.length, 1);
  assert.equal(result.tiers[0].price, 5899);
  assert.match(result.tiers[0].offer_summary, /直降100元/);
});

test('price solution reports minimum price and gap when intent model exceeds budget', () => {
  const result = buildPriceSolution('HUAWEI MateBook 14（鸿蒙版）', '5500');
  assert.equal(result.budget_status, 'over_budget');
  assert.equal(result.minimum_price, 5899);
  assert.equal(result.budget_gap, 399);
  assert.equal(result.tiers[0].price, 5899);
});
