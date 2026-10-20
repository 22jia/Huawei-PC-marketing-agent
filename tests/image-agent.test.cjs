const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { Writable } = require('stream');
const { once } = require('events');
const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'image-agent-kb-'));
process.env.LOCAL_KNOWLEDGE_BASE_PATH = fixtureRoot;
const { generateCreativeImages, assertInput, buildPrompt } = require('../services/api/src/agent/imageAgent/index.cjs');
const { createHttpProvider, createProvider, mockProvider } = require('../services/api/src/agent/imageAgent/provider.cjs');
const { saveGeneratedImage, resolveGeneratedImage, cleanupGeneratedImages } = require('../services/api/src/agent/imageAgent/storage.cjs');
const { prepareSubject, composeSubject } = require('../services/api/src/agent/imageAgent/composition.cjs');
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64');
const outputRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'image-agent-output-'));
fs.writeFileSync(path.join(fixtureRoot, 'product.png'), PNG);
let sharp;
try { sharp = require('../services/api/node_modules/sharp'); } catch {}
function input() {
  return { task: { model: 'HUAWEI MateBook 14', audience: '大学生', scenario: '图书馆学习', goal: '种草', platform: 'xiaohongshu', image_count: 1 }, evidence: [], assets: [{ id: 'asset-1', model: 'HUAWEI MateBook 14', description: '官方产品图', source_url: 'https://consumer.huawei.com/cn/', source_path: 'product.png' }], platform: { label: '小红书' }, strategy: { image_plan: [{ asset_id: 'asset-1', placement: 'cover', after_paragraph: 0, caption: '官方图场景拼贴', purpose: '封面' }] } };
}
function json(value, options) { return new Response(JSON.stringify(value), { headers: { 'content-type': 'application/json' }, ...options }); }
function setKey(t) {
  const oldKey = process.env.CREDIT_MEDIA_API_KEY;
  process.env.CREDIT_MEDIA_API_KEY = 'mock-key-for-tests';
  t.after(() => { if (oldKey === undefined) delete process.env.CREDIT_MEDIA_API_KEY; else process.env.CREDIT_MEDIA_API_KEY = oldKey; });
}
test.after(() => { fs.rmSync(fixtureRoot, { recursive: true, force: true }); fs.rmSync(outputRoot, { recursive: true, force: true }); });

test('input validation rejects missing context, no assets and invalid count', () => {
  assert.throws(() => assertInput(null), { code: 'IMAGE_INVALID_INPUT' });
  assert.throws(() => assertInput({ ...input(), assets: [] }), { code: 'IMAGE_NO_MATCHED_ASSET' });
  assert.throws(() => assertInput({ ...input(), task: { model: 'test', image_count: 0 } }), { code: 'IMAGE_INVALID_INPUT' });
});

test('background prompt excludes product generation and unverified product facts', () => {
  const value = input();
  value.evidence.push({ content: 'UNVERIFIED-PARAMETER' });
  const prompt = buildPrompt(value, value.assets[0], value.strategy.image_plan[0]);
  assert.match(prompt, /background only/);
  assert.match(prompt, /No product/);
  assert.doesNotMatch(prompt, /UNVERIFIED-PARAMETER/);
});

test('uses documented endpoint, model, size and server credential only', async (t) => {
  setKey(t);
  let calls = 0;
  const provider = createHttpProvider({ fetch: async (url, request) => {
    calls++;
    assert.equal(url, 'https://api.openai-next.com/v1/images/generations');
    assert.equal(request.headers.authorization, 'Bearer mock-key-for-tests');
    assert.deepEqual(JSON.parse(request.body), { model: 'gpt-image-2', prompt: 'background only', size: '1024x1024' });
    return json({ data: [{ b64_json: PNG.toString('base64') }] });
  } });
  const result = await provider.generate({ prompt: 'background only', reference_image: { source_path: 'private' } });
  assert.deepEqual(result[0].buffer, PNG);
  assert.equal(calls, 1);
});

test('API keys cannot be provided through options; disabled provider fails safely', () => {
  const oldCredit = process.env.CREDIT_MEDIA_API_KEY, oldImage = process.env.IMAGE_API_KEY;
  delete process.env.CREDIT_MEDIA_API_KEY; delete process.env.IMAGE_API_KEY;
  try {
    assert.throws(() => createHttpProvider({ apiKey: 'request-key' }), { code: 'IMAGE_PROVIDER_NOT_CONFIGURED' });
    assert.throws(() => createProvider({ providerId: 'none' }), { code: 'IMAGE_PROVIDER_NOT_CONFIGURED' });
  } finally {
    if (oldCredit !== undefined) process.env.CREDIT_MEDIA_API_KEY = oldCredit;
    if (oldImage !== undefined) process.env.IMAGE_API_KEY = oldImage;
  }
});

test('URL response is downloaded without leaking API credentials', async (t) => {
  setKey(t);
  let calls = 0;
  const result = await createHttpProvider({ fetch: async (url, request) => {
    calls++;
    if (calls === 1) return json({ data: [{ url: 'https://api.openai-next.com/result.png' }] });
    assert.equal(url, 'https://api.openai-next.com/result.png');
    assert.equal(request.headers, undefined);
    assert.equal(request.redirect, 'error');
    return new Response(PNG, { headers: { 'content-type': 'image/png' } });
  } }).generate({ prompt: 'background' });
  assert.deepEqual(result[0].buffer, PNG);
  assert.equal(result[0].url, undefined);
});

test('unapproved URLs and redirects never become arbitrary downloads', async (t) => {
  setKey(t);
  for (const url of ['http://127.0.0.1/a', 'https://localhost/a', 'file:///etc/passwd', 'https://api.openai-next.com.evil.test/a', 'https://user:pass@api.openai-next.com/a']) {
    let calls = 0;
    const provider = createHttpProvider({ fetch: async () => { calls++; return json({ data: [{ url }] }); } });
    await assert.rejects(provider.generate({ prompt: 'background' }), { code: 'IMAGE_DOWNLOAD_HOST_NOT_ALLOWED' });
    assert.equal(calls, 1);
  }
});

test('HTTP errors and malformed responses use stable codes without raw body', async (t) => {
  setKey(t);
  for (const [response, code] of [[new Response('private-provider-detail', { status: 401 }), 'IMAGE_PROVIDER_HTTP_ERROR'], [new Response('invalid-json'), 'IMAGE_PROVIDER_SCHEMA_ERROR'], [json({ data: [] }), 'IMAGE_PROVIDER_SCHEMA_ERROR'], [json({ data: [{ b64_json: '!!!' }] }), 'IMAGE_PROVIDER_SCHEMA_ERROR'], [new Response('x', { headers: { 'content-length': '999999999' } }), 'IMAGE_TOO_LARGE']]) {
    await assert.rejects(createHttpProvider({ fetch: async () => response }).generate({ prompt: 'background' }), (error) => error.code === code && !error.message.includes('private-provider-detail'));
  }
});

test('request cancellation and bounded timeout have distinct codes', async (t) => {
  setKey(t);
  const pending = async (_url, { signal }) => new Promise((resolve, reject) => {
    signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
  });
  const controller = new AbortController();
  const work = createHttpProvider({ fetch: pending }).generate({ prompt: 'background' }, { signal: controller.signal });
  controller.abort();
  await assert.rejects(work, { code: 'IMAGE_GENERATION_CANCELLED' });
  await assert.rejects(createHttpProvider({ fetch: pending, timeoutMs: 10 }).generate({ prompt: 'background' }), { code: 'IMAGE_PROVIDER_TIMEOUT' });
  await assert.rejects(generateCreativeImages(input(), { signal: controller.signal, provider: mockProvider([]) }), { code: 'IMAGE_GENERATION_CANCELLED' });
});

test('plan and source failures happen before any paid generation', async () => {
  let calls = 0;
  const provider = { id: 'mock', async generate() { calls++; return []; } };
  const foreign = input(); foreign.strategy.image_plan[0].asset_id = 'foreign';
  await assert.rejects(generateCreativeImages(foreign, { provider }), { code: 'IMAGE_INVALID_PLAN' });
  const source = input(); source.assets[0].source_url = 'https://evil.test/image.png';
  await assert.rejects(generateCreativeImages(source, { provider }), { code: 'IMAGE_INVALID_SOURCE' });
  const traversal = input(); traversal.assets[0].source_path = '../private.png';
  await assert.rejects(generateCreativeImages(traversal, { provider }), { code: 'IMAGE_INVALID_SOURCE' });
  assert.equal(calls, 0);
});

test('safe storage refuses traversal and symlinks and cleans only expired generated files', () => {
  const stored = saveGeneratedImage(PNG, 'png', { root: outputRoot });
  assert.equal(resolveGeneratedImage(stored.filename, { root: outputRoot }), stored.path);
  assert.equal(resolveGeneratedImage('../product.png', { root: outputRoot }), null);
  const link = `img_${'a'.repeat(32)}.png`;
  fs.symlinkSync(path.join(fixtureRoot, 'product.png'), path.join(outputRoot, link));
  assert.equal(resolveGeneratedImage(link, { root: outputRoot }), null);
  fs.utimesSync(stored.path, new Date(0), new Date(0));
  assert.equal(cleanupGeneratedImages({ root: outputRoot, maxAgeMs: 1000 }), 1);
  assert.ok(fs.existsSync(path.join(fixtureRoot, 'product.png')));
});

test('without a processor the module fails before a paid call', { skip: Boolean(sharp) }, async () => {
  let calls = 0;
  await assert.rejects(generateCreativeImages(input(), { provider: { id: 'mock', async generate() { calls++; } } }), { code: 'IMAGE_PROCESSOR_NOT_INSTALLED' });
  assert.equal(calls, 0);
});

test('compositing preserves a supplied official subject and rejects invalid backgrounds', { skip: !sharp }, async () => {
  const red = await sharp({ create: { width: 50, height: 40, channels: 4, background: '#ff0000' } }).png().toBuffer();
  const blue = await sharp({ create: { width: 1024, height: 1024, channels: 4, background: '#0000ff' } }).png().toBuffer();
  fs.writeFileSync(path.join(fixtureRoot, 'red.png'), red);
  const value = input(); value.assets[0].source_path = 'red.png';
  const result = await generateCreativeImages(value, { root: outputRoot, provider: mockProvider([{ buffer: blue }]) });
  assert.equal(result.images[0].model, value.task.model);
  assert.equal(result.images[0].source_product_image, 'asset-1');
  assert.match(result.images[0].url, /^\/api\/v1\/generated-assets\/img_[a-f0-9]{32}\.png$/);
  const filename = result.images[0].url.split('/').pop();
  const pixel = await sharp(resolveGeneratedImage(filename, { root: outputRoot })).extract({ left: 500, top: 1000, width: 1, height: 1 }).removeAlpha().raw().toBuffer();
  assert.deepEqual([...pixel], [255, 0, 0]);
  const subject = await prepareSubject(value.assets[0]);
  await assert.rejects(composeSubject(Buffer.from('<svg>unsafe</svg>'), subject), { code: 'IMAGE_INVALID_OUTPUT' });
  await assert.rejects(generateCreativeImages(value, { provider: mockProvider([{ url: 'https://example.com/a.png' }]) }), { code: 'IMAGE_INVALID_OUTPUT' });
});

test('generated-assets HTTP handler streams local bytes and rejects unknown names', async (t) => {
  const stored = saveGeneratedImage(PNG, 'png', { root: outputRoot });
  const oldRoot = process.env.GENERATED_ASSET_DIR;
  process.env.GENERATED_ASSET_DIR = outputRoot;
  t.after(() => { if (oldRoot === undefined) delete process.env.GENERATED_ASSET_DIR; else process.env.GENERATED_ASSET_DIR = oldRoot; });
  let route;
  // Exercise the real route and streams without binding a network port in sandboxed CI.
  t.mock.method(http, 'createServer', (handler) => { route = handler; return { listen() {} }; });
  require('../services/api/src/server.cjs');
  async function request(url) {
    const chunks = [];
    const response = new Writable({ write(chunk, _encoding, callback) { chunks.push(Buffer.from(chunk)); callback(); } });
    response.writeHead = (status, headers) => { response.status = status; response.headers = headers; };
    const finished = once(response, 'finish');
    await route({ url, method: 'GET', headers: { host: 'localhost' } }, response);
    await finished;
    return { ...response, bytes: Buffer.concat(chunks) };
  }
  const response = await request(stored.url);
  assert.equal(response.status, 200);
  assert.equal(response.headers['Content-Type'], 'image/png');
  assert.deepEqual(response.bytes, PNG);
  assert.equal((await request('/api/v1/generated-assets/unknown.png')).status, 404);
  assert.equal((await request(`/api/v1/generated-assets/img_${'a'.repeat(32)}.png`)).status, 404);
});

test('failure midway rolls back this request without deleting earlier assets', { skip: !sharp }, async () => {
  const subject = await sharp({ create: { width: 30, height: 30, channels: 3, background: '#ffffff' } }).png().toBuffer();
  fs.writeFileSync(path.join(fixtureRoot, 'opaque.png'), subject);
  const value = input();
  value.assets[0].source_path = 'opaque.png';
  value.task.image_count = 2;
  value.assets.push({ ...value.assets[0], id: 'asset-2' });
  value.strategy.image_plan.push({ ...value.strategy.image_plan[0], asset_id: 'asset-2', placement: 'closing', after_paragraph: 1 });
  const before = fs.readdirSync(outputRoot).sort();
  let calls = 0;
  await assert.rejects(generateCreativeImages(value, { root: outputRoot, provider: { id: 'mock', async generate() { if (++calls === 2) throw Object.assign(new Error('mock failure'), { code: 'MOCK_FAILED' }); return [{ buffer: subject }]; } } }), { code: 'MOCK_FAILED' });
  assert.deepEqual(fs.readdirSync(outputRoot).sort(), before);
});

test('opaque official image stays intact with an explicit non-cutout warning', { skip: !sharp }, async () => {
  const subject = await sharp({ create: { width: 30, height: 30, channels: 3, background: '#cccccc' } }).png().toBuffer();
  fs.writeFileSync(path.join(fixtureRoot, 'opaque.png'), subject);
  const value = input(); value.assets[0].source_path = 'opaque.png';
  const result = await generateCreativeImages(value, { root: outputRoot, provider: mockProvider([{ buffer: subject }]) });
  assert.ok(result.warnings.some((warning) => warning.includes('未自动抠图')));
  const controller = new AbortController();
  const before = fs.readdirSync(outputRoot).sort();
  await assert.rejects(generateCreativeImages(value, { root: outputRoot, signal: controller.signal, provider: { id: 'mock', async generate() { controller.abort(); return [{ buffer: subject }]; } } }), { code: 'IMAGE_GENERATION_CANCELLED' });
  assert.deepEqual(fs.readdirSync(outputRoot).sort(), before);
});
