const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Readable, Writable } = require('node:stream');
const { once } = require('node:events');
const { createPlayground, demoPng, extension } = require('../scripts/image-playground.cjs');

function harness(t, providerFactory) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'image-playground-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  let handler;
  t.mock.method(http, 'createServer', (fn) => { handler = fn; return {}; });
  createPlayground({ providerFactory, storageRoot: root });
  async function request(url, data, extra = {}) {
    const chunks = [];
    const response = new Writable({ write(chunk, _encoding, callback) { chunks.push(Buffer.from(chunk)); callback(); } });
    response.writeHead = (status, headers) => { response.status = status; response.headers = headers; };
    const completed = once(response, 'finish');
    const req = Readable.from(data === undefined ? [] : [Buffer.from(JSON.stringify(data))]);
    Object.assign(req, { method: data === undefined ? 'GET' : 'POST', url, headers: { host: '127.0.0.1:4318', 'content-type': 'application/json', ...extra } });
    await handler(req, response);
    await completed;
    return { status: response.status, headers: response.headers, buffer: Buffer.concat(chunks) };
  }
  return { request, root };
}
const data = { mode: 'demo', model: 'gpt-image-2', prompt: '图书馆书桌' };

test('demo and local preview work without a key, processor or provider call', async (t) => {
  const { request } = harness(t, () => { throw new Error('must not call API'); });
  const response = await request('/generate', data);
  assert.equal(response.status, 200);
  const result = JSON.parse(response.buffer);
  assert.match(result.message, /固定示意图/);
  const image = await request(result.url);
  assert.equal(image.headers['Content-Type'], 'image/png');
  assert.deepEqual(image.buffer, demoPng());
  assert.equal((await request('/api/v1/generated-assets/unknown.png')).status, 404);
});

test('direct image preview uses the provider but never needs the compositor', async (t) => {
  let calls = 0;
  const { request } = harness(t, (options) => ({ async generate(input) { calls++; assert.equal(options.model, 'gpt-image-2'); assert.equal(input.prompt, data.prompt); return [{ buffer: demoPng() }]; } }));
  const response = await request('/generate', { ...data, mode: 'direct' });
  assert.equal(response.status, 200);
  assert.equal(calls, 1);
  assert.match(JSON.parse(response.buffer).message, /未经过产品主体保真合成/);
});

test('rejects cross-site requests, bad input and non-image provider output', async (t) => {
  let calls = 0;
  const { request } = harness(t, () => ({ async generate() { calls++; return [{ buffer: Buffer.from('<html>not an image</html>') }]; } }));
  assert.equal((await request('/generate', data, { origin: 'https://evil.test' })).status, 403);
  assert.equal((await request('/generate', data, { host: 'evil.test:4318' })).status, 403);
  assert.equal((await request('/generate', { ...data, model: 'unknown' })).status, 400);
  assert.equal(calls, 0);
  const response = await request('/generate', { ...data, mode: 'direct' });
  assert.equal(JSON.parse(response.buffer).code, 'IMAGE_INVALID_OUTPUT');
  assert.equal(calls, 1);
});

test('configuration status never returns credentials and page uses local scripts', async (t) => {
  const { request } = harness(t);
  const key = process.env.CREDIT_MEDIA_API_KEY;
  process.env.CREDIT_MEDIA_API_KEY = 'mock-private-playground-key';
  t.after(() => { if (key === undefined) delete process.env.CREDIT_MEDIA_API_KEY; else process.env.CREDIT_MEDIA_API_KEY = key; });
  const response = await request('/status');
  assert.equal(JSON.parse(response.buffer).configured, true);
  assert.ok(!response.buffer.toString().includes('mock-private-playground-key'));
  const page = await request('/');
  assert.equal(page.status, 200);
  assert.match(page.buffer.toString(), /生图试验台/);
  assert.match(page.buffer.toString(), /src="\/app.js"/);
});

test('unsupported MIME signatures fail rather than exposing returned files', () => {
  assert.equal(extension(demoPng()), 'png');
  assert.throws(() => extension(Buffer.from('not an image')), { code: 'IMAGE_INVALID_OUTPUT' });
});
