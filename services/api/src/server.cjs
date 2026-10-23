const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { analyzeTask, generate } = require('./agent/taskAgent.cjs');
const { assistCustomer } = require('./agent/customerAgent.cjs');
const { retrieveEvidence } = require('./services/evidenceService.cjs');
const localKnowledgeBrowser = require('./services/localKnowledgeBrowser.cjs');
const ticketStore = require('./services/ticketStore.cjs');
const productSpotlight = require('./services/productSpotlight.cjs');
const platformStrategies = require('./agent/platformStrategies.cjs');
const { resolveGeneratedImage, MIME_TYPES } = require('./agent/imageAgent/storage.cjs');

const PORT = Number(process.env.PORT || 3000);

function requestId() {
  return `req_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
}

function sendJson(response, statusCode, body) {
  response.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(body));
}

function readJson(request) {
  return new Promise((resolve, reject) => {
    let raw = '';
    request.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 1024 * 1024) reject(new Error('请求体超过 1MB')); 
    });
    request.on('end', () => {
      if (!raw.trim()) return resolve({});
      try { resolve(JSON.parse(raw)); } catch { reject(new Error('请求体不是合法 JSON')); }
    });
    request.on('error', reject);
  });
}

async function route(request, response) {
  const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`);
  const method = request.method || 'GET';
  const id = requestId();
  try {
    if (method === 'GET' && url.pathname === '/health') {
      return sendJson(response, 200, { status: 'ok', service: 'huawei-pc-marketing-agent' });
    }
    if (method === 'GET' && url.pathname === '/api/v1/platforms') {
      return sendJson(response, 200, { platforms: Object.entries(platformStrategies).map(([id, strategy]) => ({ id, ...strategy })) });
    }
    if (method === 'GET' && url.pathname === '/api/v1/products/spotlight') {
      const products = productSpotlight.getSpotlightProducts();
      return sendJson(response, 200, {
        request_id: id,
        knowledge_base: '华为PC全板块深度知识库_v7',
        items: products,
        updated_at: new Date().toISOString(),
        note: '产品介绍和适用任务来自本地产品资料；当前主推状态请运营人员确认。',
      });
    }
    if (method === 'GET' && url.pathname === '/api/v1/products/image') {
      const imagePath = productSpotlight.resolveProductImage(url.searchParams.get('path'));
      if (!imagePath) return sendJson(response, 404, { status: 'error', message: '产品图片不存在', request_id: id });
      const type = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' }[path.extname(imagePath).toLowerCase()];
      response.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'public, max-age=3600' });
      return fs.createReadStream(imagePath).pipe(response);
    }
    const generatedAssetMatch = url.pathname.match(/^\/api\/v1\/generated-assets\/([^/]+)$/);
    if (method === 'GET' && generatedAssetMatch) {
      const generatedPath = resolveGeneratedImage(generatedAssetMatch[1]);
      if (!generatedPath) return sendJson(response, 404, { status: 'error', code: 'GENERATED_ASSET_NOT_FOUND', message: '生成图片不存在', request_id: id });
      const type = MIME_TYPES[path.extname(generatedPath).slice(1).toLowerCase()] || 'application/octet-stream';
      response.writeHead(200, { 'Content-Type': type, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'public, max-age=86400, immutable' });
      const stream = fs.createReadStream(generatedPath);
      stream.on('error', () => response.destroy());
      return stream.pipe(response);
    }
    const ticketMatch = url.pathname.match(/^\/api\/v1\/tickets\/([^/]+)(?:\/follow-ups)?$/);
    const isTicketFollowUp = /^\/api\/v1\/tickets\/[^/]+\/follow-ups$/.test(url.pathname);
    if (url.pathname === '/api/v1/dashboard' && method === 'GET') return sendJson(response, 200, { request_id: id, ...ticketStore.dashboard() });
    if (url.pathname === '/api/v1/tickets' && method === 'GET') return sendJson(response, 200, { request_id: id, items: ticketStore.list(Object.fromEntries(url.searchParams.entries())) });
    if (url.pathname === '/api/v1/tickets' && method === 'POST') {
      const body = await readJson(request);
      if (!body.customer_description) return sendJson(response, 400, { status: 'error', message: '缺少客户描述', request_id: id });
      const ticket = ticketStore.create(body); return sendJson(response, 201, { request_id: id, ticket });
    }
    if (ticketMatch && method === 'GET') {
      const ticket = ticketStore.get(ticketMatch[1]); return ticket ? sendJson(response, 200, { request_id: id, ticket }) : sendJson(response, 404, { status: 'error', message: '工单不存在', request_id: id });
    }
    if (ticketMatch && method === 'PATCH') {
      const body = await readJson(request); const ticket = ticketStore.update(ticketMatch[1], body); return ticket ? sendJson(response, 200, { request_id: id, ticket }) : sendJson(response, 404, { status: 'error', message: '工单不存在', request_id: id });
    }
    if (isTicketFollowUp && method === 'POST') {
      const ticketId = url.pathname.split('/')[4]; const body = await readJson(request); const ticket = ticketStore.addFollowUp(ticketId, body); return ticket ? sendJson(response, 201, { request_id: id, ticket }) : sendJson(response, 404, { status: 'error', message: '工单不存在', request_id: id });
    }
    if (method !== 'POST') return sendJson(response, 405, { status: 'error', code: 'METHOD_NOT_ALLOWED', request_id: id });
    const body = await readJson(request);
    if (url.pathname === '/api/v1/analyze') {
      return sendJson(response, 200, { request_id: id, ...analyzeTask(body) });
    }
    if (url.pathname === '/api/v1/customer/assist') {
      const result = await assistCustomer(body);
      return sendJson(response, result.status === 'needs_clarification' ? 400 : 200, { request_id: id, ...result });
    }
    if (url.pathname === '/api/v1/knowledge/search') {
      if (!body.query || !String(body.query).trim()) {
        return sendJson(response, 400, { status: 'error', code: 'MISSING_REQUIRED_FIELD', message: '缺少 query 字段', request_id: id });
      }
      const result = await retrieveEvidence(String(body.query), { limit: Math.min(Number(body.limit) || 5, 10) });
      return sendJson(response, 200, { request_id: id, ...result });
    }
    if (url.pathname === '/api/v1/knowledge/list') {
      return sendJson(response, 200, { request_id: id, ...localKnowledgeBrowser.list(body.folder_id || localKnowledgeBrowser.ROOT_ID) });
      /* Legacy remote listing retained below for migration reference only. */
      const knowledgeBase = await require('./clients/imaClient.cjs').findKnowledgeBase(body.knowledge_base_name || '任德耀新建华为PC知识库');
      const imaClient = require('./clients/imaClient.cjs');
      let result = await imaClient.listKnowledge(knowledgeBase.id, body.folder_id, body.cursor || '', Math.min(Number(body.limit) || 50, 50));
      // IMA represents the root as a same-named folder. Expand it so the
      // browser opens directly at the user's meaningful category level.
      if (!body.folder_id && result.knowledge_list?.length === 1 && result.knowledge_list[0].media_type === 99) {
        result = await imaClient.listKnowledge(knowledgeBase.id, result.knowledge_list[0].media_id, '', Math.min(Number(body.limit) || 50, 50));
      }
      return sendJson(response, 200, {
        request_id: id,
        knowledge_base: knowledgeBase.name,
        folder: body.folder_id || null,
        items: (result.knowledge_list || []).map(({ media_id, title, media_type, parent_folder_id, tags }) => ({
          id: media_id,
          title,
          media_type,
          kind: media_type === 99 ? 'folder' : 'file',
          parent_folder_id,
          tags: tags || [],
        })),
        current_path: result.current_path || [],
        next_cursor: result.next_cursor || '',
        is_end: Boolean(result.is_end),
      });
    }
    if (url.pathname === '/api/v1/knowledge/item') {
      if (!body.media_id) return sendJson(response, 400, { status: 'error', code: 'MISSING_REQUIRED_FIELD', message: '缺少 media_id 字段', request_id: id });
      if (String(body.media_id).startsWith('local:')) {
        return sendJson(response, 200, { request_id: id, item: localKnowledgeBrowser.readItem(body.media_id, body.title) });
      }
      const ima = require('./clients/imaClient.cjs');
      const info = await ima.getMediaInfo(body.media_id);
      let content = '';
      let content_warning = '';
      try { content = await ima.fetchSourceText(info); } catch (error) { content_warning = error.message; }
      return sendJson(response, 200, {
        request_id: id,
        item: {
          title: body.title || info.title || '知识条目',
          media_type: body.media_type,
          content: content.slice(0, 30000),
          source_url: info.url_info?.url || '',
          content_warning,
        },
      });
    }
    if (url.pathname === '/api/v1/generate') {
      const controller = new AbortController();
      const disconnect = () => { if (!response.writableEnded) controller.abort(); };
      response.on('close', disconnect);
      try {
        const result = await generate(body, { signal: controller.signal });
        if (!controller.signal.aborted) return sendJson(response, 200, { request_id: id, ...result });
        return;
      } finally { response.removeListener('close', disconnect); }
    }
    if (url.pathname === '/api/v1/export') {
      if (!body.content || !body.format) return sendJson(response, 400, { status: 'error', code: 'MISSING_REQUIRED_FIELD', message: '缺少 content 或 format 字段', request_id: id });
      if (!['markdown', 'txt', 'json'].includes(body.format)) return sendJson(response, 400, { status: 'error', code: 'INVALID_INPUT', message: 'format 只支持 markdown、txt、json', request_id: id });
      const output = body.format === 'json' ? JSON.stringify(body.content, null, 2) : `${body.content.title || ''}\n\n${body.content.body || body.content}`;
      return sendJson(response, 200, { request_id: id, format: body.format, content: output });
    }
    return sendJson(response, 404, { status: 'error', code: 'NOT_FOUND', request_id: id });
  } catch (error) {
    return sendJson(response, error.code ? 502 : 500, { status: 'error', code: error.code || 'INTERNAL_ERROR', message: error.message, generation_mode: 'failed', llm: { status: 'failed', error_code: error.code || 'INTERNAL_ERROR' }, request_id: id });
  }
}

const server = http.createServer(route);
server.listen(PORT, () => console.log(`API server listening on http://localhost:${PORT}`));
