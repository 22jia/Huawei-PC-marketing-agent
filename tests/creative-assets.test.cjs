const test = require('node:test');
const assert = require('node:assert/strict');
const { creativeAssets, resolveImagePlan, parseCsv } = require('../services/api/src/services/creativeAssets.cjs');
const profiles = require('../services/api/src/agent/platformStrategies.cjs');
test('assets are anchored to exact product version and unknown images are rejected', () => {
  const assets = creativeAssets([{ title: '鸿蒙版', source_path: 'P1-产品参数库/01-鸿蒙电脑/HUAWEI MateBook 14/产品事实.md' }]);
  assert.ok(assets.length > 0);
  assert.ok(assets.every((a) => !/02-MateBook-Windows/.test(decodeURIComponent(a.url))));
  assert.equal(creativeAssets([{ source_path: 'P6-营销素材库/文案.md' }]).length, 0);
  assert.throws(() => resolveImagePlan([{ asset_id: 'foreign', placement: 'cover', caption: '图片', purpose: '封面' }], assets, 3), { code: 'LLM_INVALID_IMAGE_PLAN' });
  const item = { asset_id: assets[0].id, placement: 'cover', after_paragraph: 0, caption: '官方产品图', purpose: '封面' };
  assert.throws(() => resolveImagePlan([item, item], assets, 3), { code: 'LLM_INVALID_IMAGE_PLAN' });
  assert.equal(resolveImagePlan([item], assets, 3)[0].url, assets[0].url);
});
test('image indexes support quoted commas and multiline fields', () => {
  assert.deepEqual(parseCsv('文件名,说明\na.png,"外观,细节\n图"\n'), [{ 文件名: 'a.png', 说明: '外观,细节\n图' }]);
});
test('platforms use distinct illustrated editorial formats', () => {
  assert.equal(new Set(Object.values(profiles).map((p) => p.structure)).size, 6);
  assert.match(profiles.douyin.format, /图文轮播/);
  assert.match(profiles.bilibili.format, /专栏图文/);
});
