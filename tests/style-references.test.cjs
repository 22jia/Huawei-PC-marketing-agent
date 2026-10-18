const test = require('node:test');
const assert = require('node:assert/strict');
const { styleReferences } = require('../services/api/src/services/styleReferences.cjs');

test('platform references select relevant cases and retain provenance limits', () => {
  const xhs = styleReferences('xiaohongshu');
  assert.deepEqual(xhs.examples.map((x) => x.id), ['SUP-XHS-001', 'SUP-XHS-002']);
  assert.ok(xhs.examples.every((x) => x.verification === 'user_supplied_unverified'));
  assert.match(xhs.usage, /不是产品事实/);
  const bili = styleReferences('bilibili');
  assert.equal(bili.examples.length, 4);
  assert.ok(bili.examples.every((x) => x.source_url.includes('bilibili.com')));
  assert.match(bili.examples[1].editorial_observation, /矛盾设问/);
  assert.equal(styleReferences('wechat').examples.length, 3);
  assert.equal(styleReferences('douyin').examples.length, 3);
});

test('missing platforms and files do not fabricate reference coverage', () => {
  assert.equal(styleReferences('wechat_moments').status, 'no_direct_samples');
  assert.equal(styleReferences('weibo').examples.length, 0);
  assert.equal(styleReferences('wechat', 'nonexistent-inventory.md').status, 'missing');
});
