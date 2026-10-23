const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createJobManager } = require('../services/api/src/services/generationJobs.cjs');
const tick = () => new Promise(resolve => setImmediate(resolve));

test('different sessions run concurrently; same session waits for the previous result', async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'generation-jobs-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const started = [];
  const finish = {};
  const manager = createJobManager({ directory, execute: async (body, id, options) => {
    started.push(id);
    options.onProgress({ stage: 'generateCopy', status: 'started' });
    await new Promise(resolve => { finish[id] = resolve; });
    return { status: 'success', reply: id };
  } });
  manager.submit('req_a1', { session_id: 'a' });
  manager.submit('req_a2', { session_id: 'a' });
  manager.submit('req_b1', { session_id: 'b' });
  await tick();
  assert.deepEqual(started, ['req_a1', 'req_b1']);
  assert.equal(manager.get('req_a2').status, 'queued');
  assert.equal(manager.latest('a').request_id, 'req_a1');
  assert.equal(manager.get('req_a1').progress.label, '撰写文案');
  finish.req_a1();
  await tick();
  assert.deepEqual(started, ['req_a1', 'req_b1', 'req_a2']);
  assert.equal(manager.get('req_a1').result.reply, 'req_a1');
  finish.req_a2(); finish.req_b1();
  await tick();
  assert.equal(manager.latest('a').status, 'completed');
  const restored = createJobManager({ directory, execute: async () => {} });
  assert.equal(restored.get('req_a1').result.reply, 'req_a1');
});

test('explicit cancellation aborts active work and removes queued work without starting it', async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'generation-jobs-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const started = [];
  const manager = createJobManager({ directory, execute: async (_body, id, { signal }) => {
    started.push(id);
    await new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true }));
  } });
  manager.submit('req_cancel1', { session_id: 'a' });
  manager.submit('req_cancel2', { session_id: 'a' });
  await tick();
  manager.cancel('req_cancel2');
  manager.cancel('req_cancel1');
  await tick();
  assert.deepEqual(started, ['req_cancel1']);
  assert.equal(manager.get('req_cancel1').status, 'cancelled');
  assert.equal(manager.get('req_cancel2').status, 'cancelled');
});

test('restart exposes interrupted jobs as retryable failures', t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'generation-jobs-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  fs.writeFileSync(path.join(directory, 'req_restart.json'), JSON.stringify({ request_id: 'req_restart', session_id: 'a', status: 'running', created_at: Date.now() }));
  const manager = createJobManager({ directory, execute: async () => {} });
  assert.equal(manager.latest('a').status, 'failed');
  assert.equal(manager.latest('a').result.code, 'RUN_INTERRUPTED');
});
