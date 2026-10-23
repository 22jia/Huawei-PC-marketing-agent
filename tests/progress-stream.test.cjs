const test = require('node:test');
const assert = require('node:assert/strict');
const { streamGeneration } = require('../services/api/src/services/progressStream.cjs');
const { generate } = require('../services/api/src/agent/taskAgent.cjs');

test('stream sends progress before result, preserves request id and closes', async () => {
  const chunks = []; const listeners = {};
  const res = { writeHead() {}, flushHeaders() {}, write: s => chunks.push(s), end() { this.ended = true; }, on: (key, cb) => listeners[key] = cb, off() {} };
  await streamGeneration(res, 'req_test', async ({ onProgress }) => {
    onProgress({ stage: 'planTask', status: 'started' });
    assert.match(chunks.join(''), /planTask/);
    return { status: 'needs_confirmation', reply: '需要确认' };
  });
  assert.match(chunks.join(''), /event: result/);
  assert.match(chunks.join(''), /req_test/);
  assert.equal(res.ended, true);
});

test('disconnect leaves server generation alive and preserves its result', async () => {
  let close; let signal; const chunks = [];
  const res = { writeHead() {}, flushHeaders() {}, write: s => chunks.push(s), end() {}, on: (_key, cb) => close = cb, off() {} };
  const result = await streamGeneration(res, 'req_error', async options => {
    signal = options.signal; close();
    return { status: 'success', reply: '后台完成' };
  });
  assert.equal(signal.aborted, false);
  assert.equal(result.status, 'success');
});

test('agent publishes actual stage start/end before clarification result', async () => {
  const events = [];
  const result = await generate({ history: [{ role: 'user', content: '写文章' }] }, {
    onProgress: e => events.push(e),
    planTask: async () => ({ value: { task_updates: {} }, meta: {} }),
  });
  assert.equal(result.status, 'needs_clarification');
  assert.deepEqual(events.map(e => [e.stage,e.status]), [['planTask','started'], ['planTask','success']]);
});

test('connected failures end with a diagnostic result and hide internal progress fields', async () => {
  const chunks = [];
  const res = { writeHead() {}, write: s => chunks.push(s), end() {}, on() {}, off() {} };
  await streamGeneration(res, 'req_failure', async ({ onProgress }) => {
    onProgress({ stage: 'generateCopy', status: 'started', system: 'private prompt', draft: 'unverified' });
    throw Object.assign(new Error('模型超时'), { code: 'LLM_CONNECTION_FAILED' });
  });
  const frames = chunks.join('');
  assert.match(frames, /event: result/);
  assert.match(frames, /LLM_CONNECTION_FAILED/);
  assert.match(frames, /\/api\/v1\/runs\/req_failure/);
  assert.doesNotMatch(frames, /private prompt|unverified/);
});

test('real HTTP flushes progress while the final result is still pending', async () => {
  const http = require('node:http');
  const { readGenerationEvents } = await import('../apps/web/src/lib/generationStream.mjs');
  let finish;
  const pending = new Promise(resolve => { finish = resolve; });
  const server = http.createServer((_req, res) => {
    void streamGeneration(res, 'req_http', async ({ onProgress }) => {
      onProgress({ stage: 'planTask', status: 'started' });
      await pending;
      return { status: 'success', reply: '完成' };
    });
  });
  server.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}`, { signal: AbortSignal.timeout(3000) });
    const events = readGenerationEvents(response);
    assert.equal((await events.next()).value.data.stage, 'accepted');
    assert.equal((await events.next()).value.data.stage, 'planTask');
    finish();
    const result = (await events.next()).value;
    assert.equal(result.type, 'result');
    assert.equal(result.data.request_id, 'req_http');
    assert.equal((await events.next()).done, true);
  } finally {
    finish();
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
});

test('cancelling a run aborts the provider request without retrying', async () => {
  const { requestJson } = require('../services/api/src/clients/llmClient.cjs');
  const controller = new AbortController();
  let calls = 0;
  const pending = requestJson('test', {}, { signal: controller.signal, fetch: async (_url, init) => {
    calls++;
    return new Promise((_resolve, reject) => {
      init.signal.addEventListener('abort', () => reject(init.signal.reason), { once: true });
      controller.abort();
    });
  } });
  await assert.rejects(pending, { code: 'RUN_CANCELLED' });
  assert.equal(calls, 1);
});
