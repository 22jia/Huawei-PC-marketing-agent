#!/usr/bin/env node
// Isolated developer tool: never imports or starts the production server/taskAgent.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { deflateSync } = require('node:zlib');
const { createHttpProvider } = require('../services/api/src/agent/imageAgent/provider.cjs');
const { generateCreativeImages } = require('../services/api/src/agent/imageAgent/index.cjs');
const { saveGeneratedImage, resolveGeneratedImage, MIME_TYPES } = require('../services/api/src/agent/imageAgent/storage.cjs');
const repo = path.resolve(__dirname, '..');
const root = path.join(repo, 'tmp', 'image-playground');
const models = ['gpt-image-1', 'gpt-image-2', 'gpt-image-2.5', 'gemini-2.5-flash-image', 'gemini-3-pro-image-preview', 'doubao-seedream-5-0-pro-260628'];
const envFile = path.join(repo, '.env.image-playground');
if (require.main === module && fs.existsSync(envFile)) process.loadEnvFile(envFile);

// A deterministic PNG sample tests the local preview without a Key or paid request.
function demoPng() {
  function crc(data) { let n = 0xffffffff; for (const b of data) { n ^= b; for (let k = 0; k < 8; k++) n = (n >>> 1) ^ ((n & 1) ? 0xedb88320 : 0); } return (n ^ 0xffffffff) >>> 0; }
  function chunk(type, bytes) { const tag = Buffer.from(type); const size = Buffer.alloc(4); size.writeUInt32BE(bytes.length); const sum = Buffer.alloc(4); sum.writeUInt32BE(crc(Buffer.concat([tag, bytes]))); return Buffer.concat([size, tag, bytes, sum]); }
  const width = 512, height = 512;
  const header = Buffer.alloc(13); header.writeUInt32BE(width); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 2;
  const pixels = Buffer.alloc(height * (1 + width * 3));
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) { const i = y * (1 + width * 3) + 1 + x * 3; const table = y > 350; pixels[i] = table ? 161 : 221 - Math.floor(y / 12); pixels[i + 1] = table ? 127 : 234 - Math.floor(x / 15); pixels[i + 2] = table ? 98 : 239; }
  return Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), chunk('IHDR', header), chunk('IDAT', deflateSync(pixels)), chunk('IEND', Buffer.alloc(0))]);
}
function extension(buffer) {
  if (buffer.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))) return 'png';
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'jpg';
  if (buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') return 'webp';
  throw Object.assign(new Error('API 返回的文件不是支持的 PNG/JPEG/WebP 图片'), { code: 'IMAGE_INVALID_OUTPUT' });
}
let catalog;
function products() {
  if (!catalog) {
    const { getSpotlightProducts } = require('../services/api/src/services/productSpotlight.cjs');
    const { creativeAssets } = require('../services/api/src/services/creativeAssets.cjs');
    catalog = getSpotlightProducts().flatMap((product) => creativeAssets([{ source_path: product.source_path, title: product.name }]).slice(0, 4).map((asset) => ({ asset, product: product.name })));
    catalog = [...new Map(catalog.map((item) => [item.asset.id, item])).values()];
  }
  return catalog;
}
function json(response, status, value) { response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); response.end(JSON.stringify(value)); }
async function readJson(request) {
  let length = 0; const chunks = [];
  for await (const chunk of request) { length += chunk.length; if (length > 16384) throw new Error('输入过长'); chunks.push(chunk); }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
function createPlayground({ providerFactory = createHttpProvider, storageRoot = root } = {}) {
  let busy = false;
  return http.createServer(async (request, response) => {
    const url = new URL(request.url, 'http://127.0.0.1');
    const host = request.headers.host;
    if (!/^(127\.0\.0\.1|localhost):\d+$/.test(host || '')) return json(response, 403, { message: '只允许本地访问' });
    if (request.headers.origin && ![`http://${host}`].includes(request.headers.origin)) return json(response, 403, { message: '拒绝跨站请求' });
    try {
      if (request.method === 'GET' && url.pathname === '/') {
        response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; frame-ancestors 'none'" });
        return response.end(fs.readFileSync(path.join(repo, 'tools/image-playground/index.html')));
      }
      const files = { '/app.js': ['app.js', 'application/javascript'], '/style.css': ['style.css', 'text/css'] };
      if (request.method === 'GET' && files[url.pathname]) {
        const [file, type] = files[url.pathname]; response.writeHead(200, { 'Content-Type': type }); return response.end(fs.readFileSync(path.join(repo, 'tools/image-playground', file)));
      }
      if (request.method === 'GET' && url.pathname === '/status') {
        let processor = false; try { require('../services/api/node_modules/sharp'); processor = true; } catch {}
        return json(response, 200, { configured: Boolean(process.env.CREDIT_MEDIA_API_KEY || process.env.IMAGE_API_KEY), processor, models });
      }
      if (request.method === 'GET' && url.pathname === '/products') return json(response, 200, products().map(({ asset, product }) => ({ id: asset.id, product, description: asset.description, url: `/official-image?id=${encodeURIComponent(asset.id)}` })));
      if (request.method === 'GET' && url.pathname === '/official-image') {
        const item = products().find(({ asset }) => asset.id === url.searchParams.get('id'));
        if (!item) return json(response, 404, { message: '素材不存在' });
        const { resolveProductImage } = require('../services/api/src/services/productSpotlight.cjs');
        const file = resolveProductImage(item.asset.source_path);
        if (!file) return json(response, 404, { message: '素材不存在' });
        response.writeHead(200, { 'Content-Type': MIME_TYPES[path.extname(file).slice(1).toLowerCase()], 'X-Content-Type-Options': 'nosniff' });
        return fs.createReadStream(file).on('error', () => response.destroy()).pipe(response);
      }
      const match = url.pathname.match(/^\/api\/v1\/generated-assets\/([^/]+)$/);
      if (request.method === 'GET' && match) {
        const file = resolveGeneratedImage(match[1], { root: storageRoot });
        if (!file) return json(response, 404, { message: '图片不存在' });
        response.writeHead(200, { 'Content-Type': MIME_TYPES[path.extname(file).slice(1)], 'X-Content-Type-Options': 'nosniff' });
        return fs.createReadStream(file).on('error', () => response.destroy()).pipe(response);
      }
      if (request.method !== 'POST' || url.pathname !== '/generate') return json(response, 404, { message: '地址不存在' });
      if (!(request.headers['content-type'] || '').startsWith('application/json')) return json(response, 415, { message: '需要 JSON 请求' });
      if (busy) return json(response, 409, { message: '已有任务正在生成，请稍后再试' });
      busy = true;
      const controller = new AbortController();
      const disconnect = () => { if (!response.writableEnded) controller.abort(); };
      response.on('close', disconnect);
      try {
        const data = await readJson(request);
        if (!['demo', 'direct', 'product'].includes(data.mode) || !models.includes(data.model) || typeof data.prompt !== 'string' || !data.prompt.trim() || data.prompt.length > 4000) return json(response, 400, { message: '请选择模式与模型，并输入 1～4000 字画面描述' });
        if (data.mode === 'demo') {
          const stored = saveGeneratedImage(demoPng(), 'png', { root: storageRoot, signal: controller.signal });
          return json(response, 200, { url: stored.url, message: '离线演示：这是固定示意图，不是 AI 生成，没有消耗额度，也未验证外部接口。', warnings: [] });
        }
        const provider = providerFactory({ model: data.model, size: '1024x1024', timeoutMs: Number(process.env.IMAGE_TIMEOUT_MS || 120000) });
        if (data.mode === 'product') {
          const item = products().find(({ asset }) => asset.id === data.assetId);
          if (!item) return json(response, 400, { message: '请选择官方产品素材' });
          const input = { task: { model: item.asset.model || item.product, audience: '产品潜在用户', scenario: data.prompt.trim(), goal: '本地图片效果测试', platform: 'xiaohongshu', image_count: 1 }, evidence: [], assets: [item.asset], platform: { label: '小红书' }, strategy: { image_plan: [{ asset_id: item.asset.id, placement: 'cover', after_paragraph: 0, caption: '官方产品图场景拼贴', purpose: '检查官方主体保真与背景效果' }] } };
          const result = await generateCreativeImages(input, { provider, signal: controller.signal, root: storageRoot });
          return json(response, 200, { url: result.images[0].url, message: '子 Agent 模块合成结果（仅本地测试）', warnings: result.warnings });
        }
        const outputs = await provider.generate({ prompt: data.prompt.trim() }, { signal: controller.signal });
        const buffer = outputs[0]?.buffer;
        if (!Buffer.isBuffer(buffer)) throw new Error('API 未返回图片文件');
        const stored = saveGeneratedImage(buffer, extension(buffer), { root: storageRoot, signal: controller.signal });
        return json(response, 200, { url: stored.url, message: '真实 API 生图结果，仅验证提供商出图；未经过产品主体保真合成。', warnings: [] });
      } finally { busy = false; response.removeListener('close', disconnect); }
    } catch (error) {
      if (!response.destroyed) json(response, 400, { code: error.code || 'PLAYGROUND_ERROR', message: error.code ? error.message : '测试请求失败，请检查输入或本地环境。' });
    }
  });
}
if (require.main === module) {
  const port = Number(process.env.IMAGE_PLAYGROUND_PORT || 4318);
  const server = createPlayground();
  server.on('error', (error) => { console.error(error.code === 'EADDRINUSE' ? `端口 ${port} 已占用，请设置 IMAGE_PLAYGROUND_PORT 换一个端口。` : `测试页启动失败：${error.code}`); process.exitCode = 1; });
  server.listen(port, '127.0.0.1', () => console.log(`生图独立测试页：http://127.0.0.1:${server.address().port}\n只加载 .env.image-playground；不会启动团队前端或主 Agent。`));
}
module.exports = { createPlayground, demoPng, extension };
