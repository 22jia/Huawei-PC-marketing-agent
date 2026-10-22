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

test('automatic selection uses real catalog angles, preserves manual selection and stops before paid calls on missing matches', async (t) => {
  let calls = 0;
  const prompts = [];
  const { request } = harness(t, () => ({ async generate({ prompt }) { calls++; prompts.push(prompt); return [{ buffer: demoPng() }]; } }));
  const model = 'HUAWEI MateBook 14（鸿蒙版）';
  for (const [prompt, expected] of [['INS风毛绒平铺', 'img_b8c11bbb9b6a'], ['大学生图书馆自习', 'img_578dcffad7c3']]) {
    const response = await request('/generate', { ...data, mode: 'product', productModel: model, platform: 'xiaohongshu', prompt });
    assert.equal(response.status, 200, response.buffer.toString());
    assert.equal(JSON.parse(response.buffer).source_product_image, expected);
    assert.match(prompts.at(-1), /Camera requirement: true overhead top-down/);
  }
  for (const extra of [{ productModel: 'HUAWEI MateBook 14' }, { productModel: model, color: '樱粉金' }]) {
    const response = await request('/generate', { ...data, mode: 'product', prompt: '毛绒平铺', ...extra });
    assert.equal(response.status, 400);
    assert.match(JSON.parse(response.buffer).code, /IMAGE_(MATCH_REQUIRED|NO_MATCHED_ASSET)/);
  }
  assert.equal(calls, 2, 'unmatched source must not trigger generation');
  const manual = await request('/generate', { ...data, mode: 'product', assetId: 'img_08f8cb6ac09e', prompt: '图书馆自习' });
  assert.equal(manual.status, 200, manual.buffer.toString());
  assert.equal(JSON.parse(manual.buffer).source_product_image, 'img_08f8cb6ac09e');
});

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

test('product generation accepts selected modeled catalog assets without a color token', async (t) => {
  const source = fs.readFileSync(require.resolve('../services/api/package.json'));
  assert.ok(source.length > 0);
  const script = fs.readFileSync(require.resolve('../scripts/image-playground.cjs'), 'utf8');
  assert.match(script, /if \(!item\.asset\.model\)/);
  assert.doesNotMatch(script, /matchedColor|colorTerms/);
  assert.match(script, /productsWithTransparency/);
  const page = fs.readFileSync(require.resolve('../tools/image-playground/index.html'), 'utf8');
  const app = fs.readFileSync(require.resolve('../tools/image-playground/app.js'), 'utf8');
  assert.match(page, /id="product-model"/);
  assert.match(page, /id="visual-kind"/);
  assert.match(app, /hasTransparency &&/);
  assert.match(app, /function automaticPrompt/);
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
