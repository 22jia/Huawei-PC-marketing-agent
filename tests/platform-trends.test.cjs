const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createTrendService } = require('../services/api/src/services/platformTrends.cjs');

function setup(t, fetchImpl) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'platform-trends-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  let time = Date.now();
  return { service: createTrendService({ directory, fetchImpl, now: () => time, ttl: 1000, maxAge: 100000 }), advance: ms => { time += ms; }, directory };
}
const response = body => ({ ok: true, json: async () => body });

test('deduplicates concurrent collection, caches and persists without inventing source time', async t => {
  let calls = 0;
  const { service, directory } = setup(t, async () => { calls++; return response({ code: 200, data: [{ title: '通勤', score: '123w', link: 'https://www.xiaohongshu.com/search_result?keyword=test' }, { title: '通勤' }] }); });
  const [a, b] = await Promise.all([service.get('xiaohongshu'), service.get('xiaohongshu')]);
  assert.equal(calls, 1); assert.equal(a.snapshot_id, b.snapshot_id);
  assert.equal(a.items.length, 1); assert.equal(a.source_updated_at, null);
  assert.equal(a.items[0].heat_value, '123w');
  assert.equal((await service.get('xiaohongshu')).cached, true);
  const restored = createTrendService({ directory, fetchImpl: () => { throw Error('should use disk'); } });
  assert.equal((await restored.get('xiaohongshu')).snapshot_id, a.snapshot_id);
});

test('falls back from blocked official Weibo to aggregator with honest provider label', async t => {
  const { service } = setup(t, async url => url.includes('weibo.com') ? { ok: false, status: 403 } : response({ code: 200, data: [{ title: '办公', hot_value: 42 }] }));
  const result = await service.get('weibo');
  assert.equal(result.provider, '60s_weibo'); assert.equal(result.errors.length, 1);
  assert.equal(result.items[0].heat_value, 42);
});

test('login HTML and empty data cannot overwrite a successful snapshot; expired data is unavailable', async t => {
  let failed = false;
  const { service, advance } = setup(t, async () => failed ? response({ code: 200, data: [] }) : response({ code: 200, data: [{ title: '桌搭' }] }));
  await service.get('xiaohongshu'); failed = true; advance(2000);
  const stale = await service.get('xiaohongshu');
  assert.equal(stale.status, 'stale'); assert.equal(stale.items[0].topic, '桌搭');
  advance(200000);
  const expired = await service.get('xiaohongshu');
  assert.equal(expired.status, 'unavailable'); assert.deepEqual(expired.items, []);
  const html = setup(t, async () => ({ ok: true, json: async () => { throw Error('HTML login page'); } }));
  assert.equal((await html.service.get('weibo')).status, 'unavailable');
  await assert.rejects(service.get('../invalid'), /platform/);
});
