const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createTraceStore, withRun, event, span } = require('../services/api/src/services/runTrace.cjs');
const { assertGrounded } = require('../services/api/src/agent/agentRuntime.cjs');

test('failed runs persist drafts and diagnostics across store reloads without secrets', async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-trace-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const store = createTraceStore(directory);
  await assert.rejects(withRun('req_test1', { api_key: 'private-key' }, async () => {
    event('draft', { body: '100小时', authorization: 'Bearer private-key' });
    await span('grounding', {}, async () => assertGrounded('100小时', []));
  }, store), { code: 'UNSUPPORTED_CLAIM' });
  const trace = createTraceStore(directory).read('req_test1');
  assert.equal(trace.status, 'failed');
  assert.ok(trace.events.some(e => e.stage === 'draft' && e.data.body === '100小时'));
  assert.ok(trace.events.some(e => e.data?.error?.details?.matches?.includes('100小时')));
  assert.doesNotMatch(JSON.stringify(trace), /private-key/);
  assert.equal(store.list()[0].request_id, 'req_test1');
  assert.equal(store.read('../escape'), null);
});

test('concurrent runs keep independent stage records and unfinished runs remain inspectable', async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-trace-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const store = createTraceStore(directory);
  await Promise.all(['req_one', 'req_two'].map(id => withRun(id, {}, async () => {
    await Promise.resolve();
    event('checkpoint', { owner: id });
    assert.equal(store.read(id).status, 'running');
    return { status: 'needs_clarification' };
  }, store)));
  for (const id of ['req_one', 'req_two']) {
    assert.equal(store.read(id).status, 'needs_clarification');
    assert.deepEqual(store.read(id).events.filter(e => e.stage === 'checkpoint').map(e => e.data.owner), [id]);
  }
});

test('three rejected drafts and their evidence survive the exhausted repair budget', async (t) => {
  const { generate } = require('../services/api/src/agent/taskAgent.cjs');
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-trace-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const store = createTraceStore(directory);
  const meta = { model: 'test', duration_ms: 1 };
  const input = { audience: '学生', scenario: '学习', goal: '到店', platform: 'wechat', model: '测试型号' };
  let drafts = 0;
  const options = {
    planTask: async () => ({ value: { retrieval_queries: ['测试型号'], task_updates: {} }, meta }),
    retrieveEvidence: async () => ({ evidence: [{ title: '事实', content: '屏幕采用OLED', source_path: 'P1-test', source_status: 'local_snapshot' }] }),
    creativeAssets: () => [{ id: 'image', url: '/test.png' }],
    planContent: async () => ({ value: { conflicts: [], image_plan: [{ asset_id: 'image', placement: 'cover', after_paragraph: 0, caption: '产品图', purpose: '封面' }] }, meta }),
    generateCopy: async () => ({ content: { title: '选购', lead: '看看', body: `续航100小时，草稿第${++drafts}版`, cta: '到店', hashtags: [] }, meta }),
  };
  await assert.rejects(withRun('req_repair', input, () => generate(input, options), store), { code: 'UNSUPPORTED_CLAIM' });
  const trace = store.read('req_repair');
  assert.equal(trace.events.filter(e => e.stage === 'generateCopy' && e.status === 'success').length, 3);
  assert.equal(trace.events.filter(e => e.stage === 'repair').length, 3);
  assert.equal(trace.events.find(e => e.stage === 'retrieval' && e.status === 'success').data.result.evidence[0].content, '屏幕采用OLED');
  assert.deepEqual(trace.error.details.matches, ['100小时']);
});

test('malformed provider responses retain raw content and upstream request ID', async (t) => {
  const { requestJson } = require('../services/api/src/clients/llmClient.cjs');
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-trace-'));
  const saved = Object.fromEntries(['LLM_API_KEY', 'LLM_BASE_URL', 'LLM_MODEL'].map(key => [key, process.env[key]]));
  Object.assign(process.env, { LLM_API_KEY: 'test-private-key', LLM_BASE_URL: 'https://example.invalid', LLM_MODEL: 'test-model' });
  t.after(() => {
    for (const [key, value] of Object.entries(saved)) if (value === undefined) delete process.env[key]; else process.env[key] = value;
    fs.rmSync(directory, { recursive: true, force: true });
  });
  const store = createTraceStore(directory);
  await assert.rejects(withRun('req_provider', {}, () => requestJson('system', {}, { fetch: async () => ({ ok: true, status: 200, headers: new Headers({ 'x-request-id': 'upstream-123' }), text: async () => 'invalid-json test-private-key' }) }), store), { code: 'LLM_INVALID_JSON' });
  const trace = store.read('req_provider');
  assert.equal(trace.events.find(e => e.stage === 'provider_response').data.provider_request_id, 'upstream-123');
  assert.match(trace.events.find(e => e.stage === 'provider_body').data.raw, /invalid-json/);
  assert.doesNotMatch(JSON.stringify(trace), /test-private-key/);
});
