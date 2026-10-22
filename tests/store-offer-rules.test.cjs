const test = require('node:test');
const assert = require('node:assert/strict');
const { fetchOfferRules, parseRules, allowedHost } = require('../services/api/src/services/storeOfferRules.cjs');

test('official offer pages parse fixed, percentage and cap candidates as unconfirmed rules', async () => {
  const result = await fetchOfferRules({ sourceUrl: 'https://www.vmall.com/activity/offer', model: 'MateBook 14', configuration: '16GB/512GB' }, {
    fetchText: async () => '活动时间：2026年10月1日至2026年12月31日，学生教育优惠15%，最高优惠1000元；指定机型直降300元。',
  });
  assert.equal(result.status, 'success');
  assert.equal(result.rules.length, 2);
  assert.equal(result.rules[0].confirmed, false);
  assert.ok(result.rules.some((rule) => rule.kind === 'percent' && rule.cap === 1000));
  assert.ok(result.rules.some((rule) => rule.kind === 'fixed' && rule.amount === 300));
});

test('offer rule retrieval restricts sources to official HTTPS domains', async () => {
  assert.equal(allowedHost('zcom.zj.gov.cn'), true);
  assert.equal(allowedHost('evil-vmall.com'), false);
  assert.equal((await fetchOfferRules({ sourceUrl: 'http://www.vmall.com/a' })).code, 'UNTRUSTED_SOURCE');
  assert.equal((await fetchOfferRules({ sourceUrl: 'https://example.com/a' })).code, 'UNTRUSTED_SOURCE');
});

test('parser returns no price rule when official text has no numeric offer', () => {
  assert.deepEqual(parseRules('活动详情请以门店结算为准。', 'https://www.vmall.com/a'), []);
});

test('search parses standard RSS, CDATA and XML entities and reads official pages only', async () => {
  const calls = [];
  const result = await fetchOfferRules({ model: 'MateBook 14', region: '浙江杭州', configuration: '16GB/512GB' }, { fetchText: async (url, timeout, search) => {
    calls.push({ url, search });
    return search ? '<rss><channel><item><link>https://zcom.zj.gov.cn/a?x=1&amp;y=2</link></item><item><link><![CDATA[https://www.vmall.com/offer]]></link></item><item><link>https://evil-vmall.com/offer</link></item></channel></rss>' : '<title>官方活动</title>电脑补贴15%，每件不超过1500元。';
  } });
  assert.equal(result.status, 'success');
  assert.equal(result.sources.length, 2);
  assert.ok(calls.some((call) => call.url.endsWith('a?x=1&y=2')));
  assert.ok(calls.every((call) => !call.url.includes('evil-vmall')));
  assert.ok(result.rules.every((rule) => !rule.confirmed && !rule.validFrom && !rule.validUntil));
});
test('publication dates are not treated as validity dates and network failure degrades safely', async () => {
  const rules = parseRules('发布时间：2026年10月22日。电脑补贴15%，最高1500元。', 'https://zcom.zj.gov.cn/a');
  assert.equal(rules[0].validUntil, '');
  const result = await fetchOfferRules({ model: 'MateBook 14', region: '杭州' }, { fetchText: async () => { throw new Error('offline'); } });
  assert.equal(result.status, 'unavailable'); assert.deepEqual(result.rules, []);
});
test('redirects remain within the original trust boundary', async (t) => {
  const https = require('node:https');
  const { EventEmitter } = require('node:events');
  const { fetchText } = require('../services/api/src/services/storeOfferRules.cjs');
  const visited = [];
  t.mock.method(https, 'get', (url, options, callback) => {
    visited.push(url.href);
    const req = new EventEmitter(); req.setTimeout = () => {};
    process.nextTick(() => {
      const response = new EventEmitter(); response.statusCode = 302;
      response.headers = { location: 'https://example.com/private' }; response.resume = () => {};
      callback(response);
    });
    return req;
  });
  await assert.rejects(fetchText('https://www.vmall.com/a'), /官方 HTTPS/);
  await assert.rejects(fetchText('https://www.bing.com/search', 100, true), /官方 HTTPS/);
  assert.equal(visited.length, 2);
});

test('actual HTTP route requires POST and rejects invalid lookup input', async (t) => {
  const { spawn } = require('node:child_process');
  const path = require('node:path');
  const child = spawn(process.execPath, ['-e', `
    const http = require('node:http');
    const create = http.createServer;
    http.createServer = (...args) => { const s = create(...args); s.on('listening', () => console.log('__PORT=' + s.address().port)); return s; };
    require('./services/api/src/server.cjs');
  `], { cwd: path.resolve(__dirname, '..'), env: { ...process.env, PORT: '0' }, stdio: ['ignore', 'pipe', 'pipe'] });
  t.after(() => child.kill());
  const port = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('server startup timed out')), 10000);
    child.once('error', (error) => { clearTimeout(timer); reject(error); });
    let out = '';
    child.stdout.on('data', (data) => { out += data; const match = out.match(/__PORT=(\d+)/); if (match) { clearTimeout(timer); resolve(match[1]); } });
    child.once('exit', (code) => { clearTimeout(timer); reject(new Error('server exited: ' + code)); });
  });
  const url = 'http://127.0.0.1:' + port + '/api/v1/store/offer-rules';
  assert.equal((await fetch(url)).status, 405);
  for (const body of [{}, null, { sourceUrl: 'https://example.com/a' }]) {
    const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    assert.equal(response.status, 400);
    assert.equal((await response.json()).status, 'error');
  }
});
