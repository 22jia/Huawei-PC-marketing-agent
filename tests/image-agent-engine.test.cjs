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
const { generateCreativeImages, assertInput, buildPrompt } = require('../services/api/src/agent/imageAgent/engine.cjs');
const { createHttpProvider, createProvider, mockProvider } = require('../services/api/src/agent/imageAgent/provider.cjs');
const { saveGeneratedImage, resolveGeneratedImage, cleanupGeneratedImages } = require('../services/api/src/agent/imageAgent/storage.cjs');
const { prepareSubject, composeSubject } = require('../services/api/src/agent/imageAgent/composition.cjs');
const { chooseStyle } = require('../services/api/src/agent/imageAgent/styles.cjs');
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

test('product composition forwards detailed user background direction while retaining product exclusion', () => {
  const value = input();
  value.task.visual_brief = '暖白到浅灰背景，电脑位于中下部，顶部留白25%，不要装饰球体';
  const prompt = buildPrompt(value, value.assets[0], value.strategy.image_plan[0]);
  assert.match(prompt, /暖白到浅灰背景/);
  assert.match(prompt, /不要装饰球体/);
  assert.match(prompt, /do not draw a substitute product/);
  assert.match(prompt, /Do not invent decorative elements that the brief excludes/);
});

test('style selection maps explicit templates and task fields deterministically', () => {
  const value = input();
  assert.equal(chooseStyle(value, { purpose: 'B-3 模块卖点海报', caption: '卖点' }).style.id, 'b3');
  assert.equal(chooseStyle(value, { purpose: '图书馆学习封面', caption: '大学生日常' }).style.id, 'a2');
  assert.equal(chooseStyle({ ...value, task: { ...value.task, scenario: '生活场景' } }, { purpose: '宣传海报', caption: '高端介绍' }).style.id, 'b1');
  assert.equal(chooseStyle(value, { purpose: '数据可视化图', caption: '参数对比' }).unsupported.id, 'data');
  assert.equal(chooseStyle(value, { purpose: '户外街拍手持', caption: '人物使用' }).unsupported.id, 'handheld');
});

test('daily lifestyle composition keeps the laptop as the dominant full-size subject', () => {
  const value = input();
  const plan = { purpose: '图书馆学习日常照', caption: '大学生日常' };
  const style = chooseStyle(value, plan).style;
  const { compositionLayout } = require('../services/api/src/agent/imageAgent/composition.cjs');
  const layout = compositionLayout(value, style);
  const prompt = buildPrompt(value, value.assets[0], plan);
  assert.equal(layout.width, 768);
  assert.equal(layout.height, 1024);
  assert.equal(layout.x, 0.5);
  assert.ok(layout.maxWidth / layout.width >= 0.7);
  assert.match(prompt, /EMPTY central area spanning 72% of frame width/);
  assert.match(prompt, /drinking glasses no wider than 9% of frame width/);
  assert.match(prompt, /No object, dark rectangle, display or keyboard may occupy the central empty area/);
  assert.doesNotMatch(prompt, /clear for one full-size laptop|single laptop will be placed|laptop should read as the main object/i);
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

test('reference editing uploads original bytes to edits using the server image key', async (t) => {
  setKey(t);
  const provider = createHttpProvider({ fetch: async (url, request) => {
    assert.equal(url, 'https://api.openai-next.com/v1/images/edits');
    assert.equal(request.headers.authorization, 'Bearer mock-key-for-tests');
    assert.equal(request.headers['content-type'], undefined);
    assert.ok(request.body instanceof FormData);
    assert.deepEqual([...request.body.keys()].sort(), ['image', 'model', 'prompt', 'size']);
    assert.equal(request.body.get('model'), 'gpt-image-2');
    assert.equal(request.body.get('prompt'), 'edit the reference');
    assert.deepEqual(Buffer.from(await request.body.get('image').arrayBuffer()), PNG);
    return json({ data: [{ b64_json: PNG.toString('base64') }] });
  } });
  const outputs = await provider.edit({ prompt: 'edit the reference', reference: { buffer: PNG, mime: 'image/png' } });
  assert.deepEqual(outputs[0].buffer, PNG);
});

test('opaque JPG uses a single reference-edit call without cutout or local composition', { skip: !sharp }, async () => {
  const original = await sharp({ create: { width: 30, height: 30, channels: 3, background: '#cccccc' } }).jpeg().toBuffer();
  fs.writeFileSync(path.join(fixtureRoot, 'reference.jpg'), original);
  const value = input(); value.assets[0].source_path = 'reference.jpg';
  const output = await sharp(original).png().toBuffer();
  let calls = 0;
  const result = await generateCreativeImages(value, { root: outputRoot,
    fetch: async () => { throw new Error('remove.bg must not be called'); },
    provider: {
      id: 'test-edit',
      generate: async () => { throw new Error('background generation must not be called'); },
      edit: async request => {
        calls++;
        assert.deepEqual(request.reference.buffer, original);
        assert.equal(request.reference.mime, 'image/jpeg');
        assert.match(request.prompt, /Remove or replace its original background yourself/);
        assert.match(request.prompt, /Preserve the referenced product identity/);
        assert.doesNotMatch(request.prompt, /No product\.|background only/i);
        return [{ buffer: output }];
      },
    },
  });
  assert.equal(calls, 1);
  assert.equal(result.images[0].generation_mode, 'ai_reference_edit');
  assert.equal(result.images[0].source_product_image, 'asset-1');
  assert.equal(result.images[0].generated, true);
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

test('transport failures expose only safe network codes, not raw error details', async (t) => {
  setKey(t);
  for (const [causeCode, expectedCode] of [['ENOTFOUND', 'IMAGE_PROVIDER_DNS_FAILED'], ['UND_ERR_SOCKET', 'IMAGE_PROVIDER_CONNECTION_CLOSED'], ['ECONNRESET', 'IMAGE_PROVIDER_CONNECTION_CLOSED'], ['ETIMEDOUT', 'IMAGE_PROVIDER_TIMEOUT']]) {
    const secret = 'private-credential-must-not-appear';
    await assert.rejects(createHttpProvider({ fetch: async () => { throw Object.assign(new Error(secret), { cause: { code: causeCode, message: secret } }); } }).generate({ prompt: 'background' }), (error) => error.code === expectedCode && !error.message.includes(secret));
  }
  await assert.rejects(createHttpProvider({ fetch: async () => { throw Object.assign(new Error('wrapper'), { cause: { cause: { code: 'ERR_TLS_HANDSHAKE_TIMEOUT' } } }); } }).generate({ prompt: 'background' }), (error) => error.code === 'IMAGE_PROVIDER_TRANSPORT_FAILED' && error.message.includes('ERR_TLS_HANDSHAKE_TIMEOUT'));
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

test('safe storage refuses traversal and symlinks and cleans only expired generated files', (t) => {
  const stored = saveGeneratedImage(PNG, 'png', { root: outputRoot });
  assert.equal(resolveGeneratedImage(stored.filename, { root: outputRoot }), stored.path);
  assert.equal(resolveGeneratedImage('../product.png', { root: outputRoot }), null);
  const link = `img_${'a'.repeat(32)}.png`;
  try {
    fs.symlinkSync(path.join(fixtureRoot, 'product.png'), path.join(outputRoot, link));
    assert.equal(resolveGeneratedImage(link, { root: outputRoot }), null);
  } catch (error) {
    if (process.platform !== 'win32' || error.code !== 'EPERM') throw error;
    t.diagnostic('Symlink assertion unavailable: Windows denies symlink creation; traversal and cleanup still checked.');
  }
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
  const red = await sharp({ create: { width: 50, height: 40, channels: 4, background: '#ff0000' } }).extend({top:1,bottom:1,left:1,right:1,background:{r:0,g:0,b:0,alpha:0}}).png().toBuffer();
  const blue = await sharp({ create: { width: 1024, height: 1024, channels: 4, background: '#0000ff' } }).png().toBuffer();
  fs.writeFileSync(path.join(fixtureRoot, 'red.png'), red);
  const value = input(); value.assets[0].source_path = 'red.png';
  const result = await generateCreativeImages(value, { root: outputRoot, provider: mockProvider([{ buffer: blue }]) });
  assert.equal(result.images[0].model, value.task.model);
  assert.equal(result.images[0].source_product_image, 'asset-1');
  assert.match(result.images[0].url, /^\/api\/v1\/generated-assets\/img_[a-f0-9]{32}\.png$/);
  const filename = result.images[0].url.split('/').pop();
  const pixels = await sharp(resolveGeneratedImage(filename, { root: outputRoot })).removeAlpha().raw().toBuffer();
  let redPixels = 0;
  for (let i = 0; i < pixels.length; i += 3) {
    if (pixels[i] === 255 && pixels[i + 1] === 0 && pixels[i + 2] === 0) redPixels++;
  }
  assert.ok(redPixels > 50 * 40, 'daily composition scales the source up rather than leaving a miniature subject');
  let minX = Infinity, maxX = -1, minY = Infinity, maxY = -1;
  const outputMetadata = await sharp(resolveGeneratedImage(filename, { root: outputRoot })).metadata();
  for (let i = 0; i < pixels.length; i += 3) {
    if (pixels[i] === 255 && pixels[i + 1] === 0 && pixels[i + 2] === 0) {
      const x = (i / 3) % outputMetadata.width, y = Math.floor(i / 3 / outputMetadata.width);
      minX = Math.min(minX, x); maxX = Math.max(maxX, x);
      minY = Math.min(minY, y); maxY = Math.max(maxY, y);
    }
  }
  assert.equal(redPixels, (maxX - minX + 1) * (maxY - minY + 1), 'scaled subject stays a solid original-color rectangle');
  assert.ok(Math.abs((maxX - minX + 1) / (maxY - minY + 1) - 50 / 40) < 0.02, 'subject aspect ratio is preserved');
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
  const subject = await sharp({ create: { width: 30, height: 30, channels: 3, background: '#ffffff' } }).extend({top:1,bottom:1,left:1,right:1,background:{r:0,g:0,b:0,alpha:0}}).png().toBuffer();
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

test('opaque official image fails before generation when no cutout service is configured', { skip: !sharp }, async () => {
  const subject = await sharp({ create: { width: 30, height: 30, channels: 3, background: '#cccccc' } }).png().toBuffer();
  fs.writeFileSync(path.join(fixtureRoot, 'opaque.png'), subject);
  const value = input(); value.assets[0].source_path = 'opaque.png';
  let calls = 0;
  await assert.rejects(generateCreativeImages(value, { root: outputRoot, provider: { async generate() { calls++; return [{ buffer: subject }]; } } }), { code: 'IMAGE_CUTOUT_NOT_CONFIGURED' });
  assert.equal(calls, 0);
});

test('opaque official image uses the configured background removal service and verifies alpha output', { skip: !sharp }, async (t) => {
  const source = await sharp({ create: { width: 30, height: 30, channels: 3, background: '#cccccc' } }).png().toBuffer();
  const cutout = await sharp({ create: { width: 30, height: 30, channels: 4, background: { r: 200, g: 200, b: 200, alpha: 0 } } }).composite([{ input: await sharp({ create: { width: 16, height: 20, channels: 4, background: '#00aa44' } }).png().toBuffer(), left: 7, top: 5 }]).png().toBuffer();
  fs.writeFileSync(path.join(fixtureRoot, 'opaque.png'), source);
  const oldKey = process.env.REMOVE_BG_API_KEY;
  process.env.REMOVE_BG_API_KEY = 'mock-remove-bg-key';
  t.after(() => { if (oldKey === undefined) delete process.env.REMOVE_BG_API_KEY; else process.env.REMOVE_BG_API_KEY = oldKey; });
  let endpoint;
  const value = input(); value.assets[0].source_path = 'opaque.png';
  const prepared = await prepareSubject(value.assets[0], { fetch: async (url, options) => { endpoint = url; assert.equal(options.headers['X-Api-Key'], 'mock-remove-bg-key'); return new Response(cutout, { headers: { 'content-type': 'image/png' } }); } });
  assert.equal(endpoint, 'https://api.remove.bg/v1.0/removebg');
  assert.equal(prepared.hasAlpha, true);
  assert.equal(prepared.cutout, true);
  assert.equal((await sharp(prepared.buffer).metadata()).width, 16);
});

test('cutout service rejects opaque output without alpha', { skip: !sharp }, async (t) => {
  const source = await sharp({ create: { width: 30, height: 30, channels: 3, background: '#cccccc' } }).png().toBuffer();
  fs.writeFileSync(path.join(fixtureRoot, 'opaque.png'), source);
  const oldKey = process.env.REMOVE_BG_API_KEY;
  process.env.REMOVE_BG_API_KEY = 'mock-remove-bg-key';
  t.after(() => { if (oldKey === undefined) delete process.env.REMOVE_BG_API_KEY; else process.env.REMOVE_BG_API_KEY = oldKey; });
  const value = input(); value.assets[0].source_path = 'opaque.png';
  await assert.rejects(prepareSubject(value.assets[0], { fetch: async () => new Response(source, { headers: { 'content-type': 'image/png' } }) }), { code: 'IMAGE_CUTOUT_INVALID_OUTPUT' });
  const opaqueAlpha = await sharp(source).ensureAlpha().png().toBuffer();
  await assert.rejects(prepareSubject(value.assets[0], { fetch: async () => new Response(opaqueAlpha) }), { code: 'IMAGE_CUTOUT_INVALID_OUTPUT' });
  await assert.rejects(prepareSubject(value.assets[0], { fetch: async () => new Response('private provider details', {status:402}) }), { code: 'IMAGE_CUTOUT_QUOTA_EXHAUSTED' });
});


test('portrait composition crops transparent margins and preserves the visible product', { skip: !sharp }, async () => {
  const product = await sharp({ create: { width: 20, height: 10, channels: 4, background: '#ff0000' } }).extend({top:1,bottom:1,left:1,right:1,background:{r:0,g:0,b:0,alpha:0}}).png().toBuffer();
  const padded = await sharp({ create: { width: 100, height: 100, channels: 4, background: '#00000000' } }).composite([{ input: product, left: 40, top: 45 }]).png().toBuffer();
  fs.writeFileSync(path.join(fixtureRoot, 'padded.png'), padded);
  const value = input(); value.assets[0].source_path = 'padded.png';
  value.task.visual_brief = '3:4 竖版，极简海报，不要装饰球体';
  const subject = await prepareSubject(value.assets[0]);
  assert.equal(subject.hasAlpha, true);
  assert.equal((await sharp(subject.buffer).metadata()).width, 20);
  let prompt;
  const result = await generateCreativeImages(value, { root: outputRoot, provider: { async generate(request) { prompt = request.prompt; return [{ buffer: padded }]; } } });
  assert.match(prompt, /Final canvas: 768x1024/);
  assert.doesNotMatch(prompt, /restrained flowing light accents/);
  const file = resolveGeneratedImage(result.images[0].url.split('/').pop(), { root: outputRoot });
  const metadata = await sharp(file).metadata();
  assert.equal(metadata.width, 768); assert.equal(metadata.height, 1024);
});


test('commercial poster renders type behind subject and CTA below without inventing specs', { skip: !sharp }, async () => {
  const { compositionLayout } = require('../services/api/src/agent/imageAgent/composition.cjs');
  const value = input(); value.task.visual_brief = '高级商业产品宣传海报，超大英文排版，CTA EXPLORE NOW';
  const style = chooseStyle(value, { purpose: value.task.visual_brief }).style;
  const layout = compositionLayout(value, style);
  assert.equal(layout.commercial, true);
  assert.equal(layout.width, 768);
  const background = await sharp({ create: { width: 768, height: 1024, channels: 4, background: '#36547b' } }).png().toBuffer();
  const subject = await sharp({ create: { width: 100, height: 100, channels: 4, background: '#ff0000' } }).extend({top:1,bottom:1,left:1,right:1,background:{r:0,g:0,b:0,alpha:0}}).png().toBuffer();
  const rendered = await composeSubject(background, { buffer: subject, hasAlpha: false }, { layout });
  assert.notDeepEqual(rendered.buffer, background);
  const prompt = buildPrompt(value, value.assets[0], { purpose: value.task.visual_brief });
  assert.match(prompt, /commercial technology advertising/);
  assert.doesNotMatch(prompt, /avoid hard-sell/);
  assert.match(prompt, /art-directed spatial depth/);
  assert.match(prompt, /a plain gradient is not mandatory/);
  assert.doesNotMatch(prompt, /Scene context:.*整体采用现代/s);
  assert.match(prompt, /do not add landscapes, mountains, water or other motifs unless requested/);
  assert.match(prompt, /Harmonize the palette with the selected official product color/);
  value.task.visual_brief += '，无文字';
  assert.equal(compositionLayout(value, style).commercial, false);
});

test('full poster instructions cannot leak product drawing through context fields', () => {
  const value = input();
  const brief = '生成 HUAWEI MateBook 14 产品。现代极简背景，电影感灯光。产品使用3D渲染。';
  value.task.visual_brief = brief;
  value.task.scenario = brief;
  const prompt = buildPrompt(value, value.assets[0], { purpose: brief });
  assert.doesNotMatch(prompt, /3D渲染|生成 HUAWEI/);
  assert.match(prompt, /电影感灯光/);
});

test('commercial background follows the user brief instead of injecting a mountain scene', () => {
  const value = input();
  value.task.visual_brief = '生成高级商业宣传海报。现代极简科技广告风格，暖白与银灰同色系，柔和棚拍光影，细腻金属反光。背景为干净影棚，不要山水。';
  const prompt = buildPrompt(value, value.assets[0], value.strategy.image_plan[0]);
  assert.match(prompt, /暖白与银灰/);
  assert.match(prompt, /干净影棚/);
  assert.match(prompt, /不要山水/);
  assert.doesNotMatch(prompt, /mountain-and-lake|山水背景|layered distant ridgelines/);
});

test('commercial poster calls provider and retains its background pixels', { skip: !sharp }, async () => {
  const value = input();
  value.task.visual_brief = '高级商业海报 Behance';
  const source = await sharp({create:{width:30,height:30,channels:4,background:'#ff0000'}}).extend({top:1,bottom:1,left:1,right:1,background:{r:0,g:0,b:0,alpha:0}}).png().toBuffer();
  fs.writeFileSync(path.join(fixtureRoot, 'poster-subject.png'), source);
  value.assets[0].source_path = 'poster-subject.png';
  let calls = 0;
  const background = await sharp({ create: { width: 768, height: 1024, channels: 4, background: '#123456' } }).png().toBuffer();
  const result = await generateCreativeImages(value, { root: outputRoot, provider: { id: 'mock-landscape', async generate({ prompt }) {
    calls++;
    assert.match(prompt, /Premium commercial technology campaign poster background/);
    assert.doesNotMatch(prompt, /mountain-and-lake/);
    assert.match(prompt, /exactly zero products/);
    return [{ buffer: background }];
  } } });
  assert.equal(calls, 1);
  assert.equal(result.images[0].generation_mode, 'ai_background_composition');
  assert.equal(result.provider, 'mock-landscape');
  const output = fs.readFileSync(resolveGeneratedImage(path.basename(result.images[0].url), { root: outputRoot }));
  const pixel = await sharp(output).extract({ left: 0, top: 0, width: 1, height: 1 }).raw().toBuffer();
  assert.deepEqual([...pixel.subarray(0, 3)], [18, 52, 86]);
  await assert.rejects(generateCreativeImages(value, { root: outputRoot, provider: { async generate() { throw new Error('mock provider failure'); } } }), /mock provider failure/);
});

test('poster facts omit unverified or mismatched facts and keep source text escaped', () => {
  const { posterFacts } = require('../services/api/src/agent/imageAgent/composition.cjs');
  const fact = { model: 'HUAWEI MateBook 14', content: '屏幕分辨率 2160×1440', source_url: 'https://consumer.huawei.com/cn/', retrievable: true };
  assert.equal(posterFacts([], 768, 1024, fact.model), null);
  assert.equal(posterFacts([{ ...fact, model: 'other' }], 768, 1024, fact.model), null);
  assert.equal(posterFacts([{ ...fact, confidence: 'unavailable' }], 768, 1024, fact.model), null);
  assert.equal(posterFacts([{ ...fact, source_url: 'https://consumer.huawei.com.evil.test/' }], 768, 1024, fact.model), null);
  assert.match(posterFacts([fact], 768, 1024, fact.model).toString(), /屏幕分辨率 2160×1440/);
});
