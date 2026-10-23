const test = require('node:test');
const assert = require('node:assert/strict');
const { bindProductIdentity } = require('../services/api/src/agent/productIdentity.cjs');
const source = 'P1-产品参数库/02-MateBook-Windows/MateBook D 14';
const evidence = [{ title: 'HUAWEI MateBook D 14 2024 - 产品事实', source_path: `${source}/产品事实.md` }];
const task = { model: 'HUAWEI MateBook D 14 2024标准版' };

test('main agent hands its resolved product identity to same-document image assets', () => {
  const asset = { model: 'HUAWEI MateBook D 14 2024', source_path: `${source}/images/hero.png` };
  const result = bindProductIdentity(task, evidence, [asset]);
  assert.equal(result.assets[0].model, task.model);
  assert.equal(result.assets[0].product_id, result.task.product_identity.product_id);
  assert.equal(result.assets[0].catalog_model, asset.model);
  assert.equal(asset.model, 'HUAWEI MateBook D 14 2024');
});

test('other versions and traversing paths never inherit selected identity', () => {
  const assets = ['P1-产品参数库/01-鸿蒙电脑/HUAWEI MateBook 14/images/a.png', `${source}/../MateBook D 16/images/a.png`].map(source_path => ({ model: 'other', source_path }));
  assert.deepEqual(bindProductIdentity(task, evidence, assets).assets, assets);
});

test('multiple fact documents cannot silently resolve a product identity', () => {
  const result = bindProductIdentity(task, [...evidence, { source_path: 'P1-产品参数库/另一版本/产品事实.md' }], []);
  assert.equal(result.task.product_identity, undefined);
});
