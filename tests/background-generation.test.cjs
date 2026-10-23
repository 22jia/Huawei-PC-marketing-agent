const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { once } = require('node:events');

test('background HTTP jobs survive disconnect, run across sessions and restore ordered history', async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'background-http-'));
  process.env.PORT = '0';
  process.env.GENERATION_JOBS_DIR = directory;
  const sessions = new Map();
  const started = [], pending = new Map(), histories = new Map();
  function stub(modulePath, exports) { require.cache[require.resolve(modulePath)] = { id: require.resolve(modulePath), filename: require.resolve(modulePath), loaded: true, exports }; }
  stub('../services/api/src/services/runTrace.cjs', { store: {}, withRun: (_id, _meta, action) => action(), event() {} });
  stub('../services/api/src/services/sessionStore.cjs', {
    list: () => [...sessions.values()], get: id => sessions.get(id),
    create() { const session = { id: `session_${sessions.size}`, messages: [] }; sessions.set(session.id, session); return session; },
    append(id, messages, patch) { const session = sessions.get(id); session.messages.push(...messages); Object.assign(session, patch); },
  });
  stub('../services/api/src/agent/taskAgent.cjs', { generate: async (body, { signal, onProgress }) => {
    const text = body.history.at(-1).content;
    started.push(text); histories.set(text, body.history);
    onProgress({ stage: 'generateCopy', status: 'started' });
    await new Promise((resolve, reject) => { pending.set(text, resolve); signal.addEventListener('abort', () => reject(signal.reason), { once: true }); });
    return { status: 'success', reply: `${text}完成` };
  } });
  const server = require('../services/api/src/server.cjs');
  await once(server, 'listening');
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); fs.rmSync(directory, { recursive: true, force: true }); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = async (url, body) => (await fetch(base + url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })).json();
  const get = async url => (await fetch(base + url)).json();
  const a = await post('/api/v1/sessions', {}), b = await post('/api/v1/sessions', {});
  const submit = (session, text) => post('/api/v1/generate', { background: true, session_id: session.id, history: [{ role: 'user', content: text }] });
  const a1 = await submit(a, 'A1'), a2 = await submit(a, 'A2'), b1 = await submit(b, 'B1');
  assert.deepEqual(started, ['A1', 'B1']);
  assert.equal(a2.status, 'queued');
  assert.equal((await get(`/api/v1/generation-jobs/${a1.request_id}`)).progress.label, '撰写文案');
  assert.equal((await get(`/api/v1/sessions/${a.id}`)).generation_job.request_id, a1.request_id);
  pending.get('A1')();
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(started, ['A1', 'B1', 'A2']);
  assert.deepEqual(histories.get('A2').map(m => m.content), ['A1', 'A1完成', 'A2']);
  pending.get('A2')(); pending.get('B1')();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal((await get(`/api/v1/generation-jobs/${b1.request_id}`)).status, 'completed');
  const restored = await get(`/api/v1/sessions/${a.id}`);
  assert.equal(restored.messages.at(-1).content[0].text, 'A2完成');
  assert.equal(restored.generation_job.status, 'completed');
  const stop = await submit(a, 'STOP');
  await post(`/api/v1/generation-jobs/${stop.request_id}/cancel`, {});
  await new Promise(resolve => setImmediate(resolve));
  assert.equal((await get(`/api/v1/generation-jobs/${stop.request_id}`)).status, 'cancelled');
});
