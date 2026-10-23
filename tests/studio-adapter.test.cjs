const test = require('node:test');
const assert = require('node:assert/strict');

test('Studio chat shows stages before generation finishes and replaces them with the final reply', async () => {
  const { createStudioAdapter } = await import('../apps/web/src/lib/studioAdapter.mjs');
  let send;
  const stream = new ReadableStream({ start(controller) { send = (type, data) => controller.enqueue(new TextEncoder().encode(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`)); } });
  let result;
  const adapter = createStudioAdapter({
    getTask: () => ({ model: 'test' }), getArtifact: () => null,
    fetchImpl: async () => new Response(stream, { headers: { 'Content-Type': 'text/event-stream' } }),
    onResult: data => { result = data; }, formatReport: () => '最终核验成稿', formatError: error => error.message,
  });
  const run = adapter.run({ messages: [], abortSignal: new AbortController().signal });
  assert.equal(typeof run[Symbol.asyncIterator], 'function', 'adapter must publish updates, not await the whole response');
  assert.match((await run.next()).value.content[0].text, /连接/);
  send('progress', { stage: 'planTask', label: '理解需求', status: 'started', request_id: 'req_live' });
  assert.match((await run.next()).value.content[0].text, /理解需求/);
  assert.equal(result, undefined, 'progress must be visible while the result is pending');
  send('progress', { stage: 'generateCopy', label: '撰写文案', status: 'started', request_id: 'req_live' });
  assert.match((await run.next()).value.content[0].text, /撰写文案/);
  send('heartbeat', { elapsed_ms: 20000, request_id: 'req_live' });
  assert.match((await run.next()).value.content[0].text, /20 秒/);
  send('result', { status: 'success', content: {}, request_id: 'req_live' });
  const final = (await run.next()).value;
  assert.equal(final.content[0].text, '最终核验成稿');
  assert.equal(final.metadata.custom.studio_progress, false);
  assert.equal((await run.next()).done, true);
  assert.equal(result.request_id, 'req_live');
});

test('Studio chat replaces progress with an error on truncated streams and keeps the log id', async () => {
  const { createStudioAdapter } = await import('../apps/web/src/lib/studioAdapter.mjs');
  const adapter = createStudioAdapter({
    getTask: () => ({}), getArtifact: () => null,
    fetchImpl: async () => new Response('event: progress\ndata: {"label":"审核文案","status":"started","request_id":"req_broken"}\n\n', { headers: { 'Content-Type': 'text/event-stream' } }),
    formatError: error => `${error.message} ${error.request_id}`,
  });
  const updates = [];
  for await (const update of adapter.run({ messages: [] })) updates.push(update);
  assert.match(updates.at(-1).content[0].text, /中断.*req_broken/);
  assert.equal(updates.at(-1).metadata.custom.studio_progress, false);
});

test('temporary polling failure reconnects and delivers the existing task result', async () => {
  const { createStudioAdapter } = await import('../apps/web/src/lib/studioAdapter.mjs');
  const calls = [];
  let polls = 0;
  const adapter = createStudioAdapter({ getTask: () => ({}), getArtifact: () => null, sessionId: 's',
    fetchImpl: async (url, init) => {
      calls.push([url, init]);
      if (url === '/api/v1/generate') return Response.json({ request_id: 'req_retry', status: 'running' }, { status: 202 });
      if (++polls === 1) return new Response('', { status: 503 });
      return Response.json({ request_id: 'req_retry', status: 'completed', result: { status: 'success', reply: '恢复成功' } });
    }, formatError: e => e.message });
  const updates = [];
  for await (const update of adapter.run({ messages: [] })) updates.push(update.content[0].text);
  assert.ok(updates.some(text => text.includes('正在重新连接')));
  assert.equal(updates.at(-1), '恢复成功');
  assert.equal(calls.filter(([url]) => url === '/api/v1/generate').length, 1);
});

test('leaving the view aborts polling without cancelling the server job', async () => {
  const { createStudioAdapter } = await import('../apps/web/src/lib/studioAdapter.mjs');
  const calls = [];
  const adapter = createStudioAdapter({ getTask: () => ({}), getArtifact: () => null,
    fetchImpl: async (url, init) => { calls.push([url, init]); return Response.json({ request_id: 'req_leave', status: 'running' }, { status: 202 }); }, formatError: e => e.message });
  const controller = new AbortController();
  const run = adapter.run({ messages: [], abortSignal: controller.signal });
  await run.next(); await run.next();
  controller.abort();
  await assert.rejects(run.next(), { name: 'AbortError' });
  assert.equal(calls.length, 1);
  assert.equal(calls[0][1].signal, undefined);
});

test('explicit Stop during submission cancels the job once its id arrives', async () => {
  const { createStudioAdapter } = await import('../apps/web/src/lib/studioAdapter.mjs');
  let accept;
  const calls = [];
  const adapter = createStudioAdapter({ getTask: () => ({}), getArtifact: () => null,
    fetchImpl: async url => { calls.push(url); if (url === '/api/v1/generate') return new Promise(resolve => { accept = resolve; }); return Response.json({}); }, formatError: e => e.message });
  const controller = new AbortController();
  const run = adapter.run({ messages: [], abortSignal: controller.signal });
  await run.next();
  const pending = run.next();
  await adapter.cancelCurrent(); controller.abort();
  accept(Response.json({ request_id: 'req_race', status: 'running' }, { status: 202 }));
  await assert.rejects(pending, { name: 'AbortError' });
  assert.ok(calls.includes('/api/v1/generation-jobs/req_race/cancel'));
});
