const test = require('node:test');
const assert = require('node:assert/strict');
test('SSE parser handles fragmented UTF-8, CRLF and multiple frames', async () => {
  const { readGenerationEvents } = await import('../apps/web/src/lib/generationStream.mjs');
  const bytes = new TextEncoder().encode('event: progress\r\ndata: {"label":"检索资料"}\r\n\r\nevent: result\ndata: {"status":"success"}\n\n');
  const stream = new ReadableStream({ start(c) { for (let i=0;i<bytes.length;i+=3) c.enqueue(bytes.slice(i,i+3)); c.close(); } });
  const frames = [];
  for await (const frame of readGenerationEvents({ body: stream })) frames.push(frame);
  assert.equal(frames[0].data.label, '检索资料');
  assert.equal(frames[1].type, 'result');
});
test('truncated stream fails instead of pretending completion', async () => {
  const { readGenerationEvents } = await import('../apps/web/src/lib/generationStream.mjs');
  const stream = new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode('event: progress\ndata: {}\n\n')); c.close(); } });
  await assert.rejects(async () => { for await (const frame of readGenerationEvents({body:stream})) {} }, /中断/);
});

test('silent stream times out and cancels the connection instead of waiting forever', async () => {
  const { readGenerationEvents } = await import('../apps/web/src/lib/generationStream.mjs');
  let cancelled = false;
  const stream = new ReadableStream({ cancel() { cancelled = true; } });
  await assert.rejects(async () => {
    for await (const frame of readGenerationEvents({ body: stream }, { idleTimeoutMs: 20 })) {}
  }, { code: 'GENERATION_STREAM_TIMEOUT' });
  assert.equal(cancelled, true);
});

test('incoming heartbeats reset the idle deadline', async () => {
  const { readGenerationEvents } = await import('../apps/web/src/lib/generationStream.mjs');
  let controller;
  const stream = new ReadableStream({ start(c) { controller = c; } });
  const run = readGenerationEvents({ body: stream }, { idleTimeoutMs: 100 });
  const send = (type) => controller.enqueue(new TextEncoder().encode(`event: ${type}\ndata: {}\n\n`));
  send('heartbeat');
  assert.equal((await run.next()).value.type, 'heartbeat');
  await new Promise(resolve => setTimeout(resolve, 120));
  send('result');
  assert.equal((await run.next()).value.type, 'result');
  assert.equal((await run.next()).done, true);
});
