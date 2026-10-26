const { store: traceStore, withRun } = require('./services/runTrace.cjs');
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
const sessionStore = require('./services/sessionStore.cjs');
const { resolveGeneratedImage, MIME_TYPES } = require('./agent/imageAgent/storage.cjs');
const { titleFor } = require('./services/conversationState.cjs');
const { fetchOfferRules } = require('./services/storeOfferRules.cjs');
const { queryChannelPrices } = require('./services/channelPriceService.cjs');
const trends = require('./services/platformTrends.cjs').createTrendService({ log: require('./services/runTrace.cjs').event });

const PORT = Number(process.env.PORT || 3000);

function requestId() {
  return `req_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
}

function sendJson(response, statusCode, body) {
  response.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(body));
  return body;
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

async function runGeneration(body, id, options = {}, background = false) {
      if (body.session_id && !sessionStore.get(body.session_id)) throw Object.assign(new Error('会话不存在'), { code: 'SESSION_NOT_FOUND' });
      const session = body.session_id ? sessionStore.get(body.session_id) : null;
      if (background && session) {
        const latest = (body.history || []).filter(m => m.role === 'user').at(-1);
        body.history = [...session.messages.map(m => ({ role: m.role, content: m.content.map(p => p.text).join('\n') })), ...(latest ? [latest] : [])];
        for (const key of ['model', 'audience', 'scenario', 'goal', 'platform', 'requirements', 'include_price', 'image_count', 'content_flow', 'scenario_candidates', 'trend_selection']) {
          if (session.task?.[key] !== undefined) body[key] = session.task[key];
        }
        body.last_artifact = session.artifact;
        body.conversation_mode = session.conversation_mode;
      }
      if (session?.task) {
        for (const key of ['model', 'audience', 'scenario', 'goal', 'platform', 'requirements', 'include_price', 'image_count', 'content_flow', 'scenario_candidates', 'trend_selection']) {
          if (body[key] === undefined && session.task[key] !== undefined) body[key] = session.task[key];
        }
      }
      if (session && body.last_artifact === undefined) body.last_artifact = session.artifact;
      if (session?.conversation_mode && body.conversation_mode === undefined) body.conversation_mode = session.conversation_mode;
      if (session && (!Array.isArray(body.history) || body.history.length === 0)) body.history = session.messages.map(m => ({ role: m.role, content: m.content.map(p => p.text).join('\n') }));
      const persist = (result) => {
        if (!session) return;
        const history = Array.isArray(body.history) ? body.history : [];
        const latestUser = history.filter(m => m.role === 'user').at(-1);
        const assistantText = result?.reply || (result?.content ? `${result.content.title || ''}\n\n${result.content.body || ''}` : result?.task?.questions?.map(q => q.question).join('\n') || result?.message || '');
        const messages = latestUser ? [{ role: 'user', content: [{ type: 'text', text: latestUser.content }] }] : [];
        if (assistantText) {
          const customer = require('./services/customerPresentation.cjs').customerPresentation(result);
          messages.push({ role: 'assistant', content: [{ type: 'text', text: assistantText }], ...(customer ? { metadata: { custom: { studio_customer: customer } } } : {}) });
        }
        const conversationState = require('./services/conversationState.cjs');
        sessionStore.append(body.session_id, messages, {
          task: result?.task || session.task,
          artifact: result?.content || session.artifact,
          result,
          last_request_id: id,
          conversation_mode: result?.conversation_mode || session.conversation_mode,
          customer_task: result?.customer_task || session.customer_task,
          awaiting_ticket_consent: Object.hasOwn(result || {}, 'awaiting_ticket_consent') ? result.awaiting_ticket_consent : session.awaiting_ticket_consent,
          awaiting_ticket_name: Object.hasOwn(result || {}, 'awaiting_ticket_name') ? result.awaiting_ticket_name : session.awaiting_ticket_name,
          title: conversationState.titleFor(session, result || {}, latestUser?.content),
        });
      };
      const latestUserText = Array.isArray(body.history) ? body.history.filter(m => m?.role === 'user').at(-1)?.content || '' : '';
      const ticketDecision = session && require('./services/conversationState.cjs').ticketDecision(session, latestUserText, ticketStore.create);
      if (ticketDecision) {
        const result = { ...ticketDecision, task: session.task, conversation_mode: session.conversation_mode };
        persist(result);
        return { ...result, request_id: id };
      }
      try {
        options.signal?.throwIfAborted();
        const result = await generate(body, options);
        options.signal?.throwIfAborted();
        persist(result);
        return { ...result, request_id: id };
      } catch (error) {
        const result = { status: 'error', code: options.signal?.aborted ? 'RUN_CANCELLED' : error.code || 'INTERNAL_ERROR', message: options.signal?.aborted ? '本次任务已停止。' : error.message, request_id: id, log_url: `/api/v1/runs/${id}` };
        persist(result);
        return result;
      }
}
const jobs = require('./services/generationJobs.cjs').createJobManager({ execute: (body, id, options) => withRun(id, { route: '/api/v1/generate', session_id: body.session_id }, () => runGeneration(body, id, options, true)) });
function sessionWithJob(session) {
  if (!session) return session;
  const job = jobs.latest(session.id);
  if (job?.result && job.result.status !== 'error') delete job.result;
  return { ...session, generation_job: job };
}

async function route(request, response) {
  const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`);
  const method = request.method || 'GET';
  const id = requestId();
  const tracked = method !== 'GET' || url.pathname === '/api/v1/trends';
  const execute = async () => {
  try {
    if (method === 'POST' && url.pathname === '/api/v1/inspirations') {
      const body = await readJson(request);
      if (!['weibo', 'xiaohongshu', 'wechat', 'wechat_moments', 'douyin', 'bilibili'].includes(body.platform)) return sendJson(response, 400, { message: '请选择支持的创作平台', request_id: id });
      const session = body.session_id ? sessionStore.get(body.session_id) : null;
      if (body.session_id && !session) return sendJson(response, 404, { message: '会话不存在', request_id: id });
      const task = { ...(session?.task || body.task || {}), platform: body.platform };
      const result = await require('./services/creativeInspiration.cjs').discover(task, { query: body.query });
      return sendJson(response, 200, { ...result, request_id: id, log_url: `/api/v1/runs/${id}` });
    }
    if (method === 'POST' && url.pathname === '/api/v1/inspirations/select') {
      const body = await readJson(request);
      const session = body.session_id ? sessionStore.get(body.session_id) : null;
      if (!session) return sendJson(response, 404, { message: '会话不存在', request_id: id });
      const selection = require('./services/creativeInspiration.cjs').choose(body.discovery_id, body.item_id, session.task || {});
      if (!selection) return sendJson(response, 409, { message: '灵感已过期或创作需求已变化，请重新搜索', request_id: id });
      sessionStore.update(session.id, { task: { ...(session.task || {}), platform: selection.platform, trend_selection: selection } });
      return sendJson(response, 200, { selection, request_id: id });
    }
    if (method === 'POST' && url.pathname === '/api/v1/trends/recommendations') {
      const body = await readJson(request);
      const platform = body.platform;
      if (!['weibo', 'xiaohongshu'].includes(platform)) return sendJson(response, 400, { message: '不支持的平台', request_id: id });
      const result = await require('./services/trendRecommendation.cjs').recommendTrends(body.task || {}, await trends.get(platform));
      return sendJson(response, 200, { ...result, platform, request_id: id, log_url: `/api/v1/runs/${id}` });
    }
    if (method === 'GET' && url.pathname === '/api/v1/trends') {
      const platform = url.searchParams.get('platform');
      if (!['weibo', 'xiaohongshu'].includes(platform)) return sendJson(response, 400, { code: 'INVALID_PLATFORM', message: 'platform 仅支持 weibo 或 xiaohongshu', request_id: id });
      const result = await trends.get(platform);
      return sendJson(response, result.status === 'unavailable' ? 503 : 200, { ...result, platform, request_id: id, log_url: `/api/v1/runs/${id}` });
    }
    if (method === 'GET' && url.pathname === '/api/v1/runs') return sendJson(response, 200, { items: traceStore.list(Object.fromEntries(url.searchParams)) });
    if (method === 'GET' && url.pathname === '/api/v1/sessions') return sendJson(response, 200, { items: sessionStore.list().map(sessionWithJob).map(session => session.conversation_mode === 'customer' || !session.task ? session : { ...session, title: titleFor(session, {}) }) });
    const jobMatch = url.pathname.match(/^\/api\/v1\/generation-jobs\/(req_[a-zA-Z0-9_]+)(\/cancel)?$/);
    if (jobMatch) {
      const job = method === 'POST' && jobMatch[2] ? jobs.cancel(jobMatch[1]) : method === 'GET' && !jobMatch[2] ? jobs.get(jobMatch[1]) : null;
      return sendJson(response, job ? 200 : 404, job || { message: '任务不存在' });
    }
    const sessionMatch = url.pathname.match(/^\/api\/v1\/sessions\/([a-zA-Z0-9_-]+)$/);
    if (sessionMatch && method === 'GET') {
      const session = sessionStore.get(sessionMatch[1]);
      return sendJson(response, session ? 200 : 404, sessionWithJob(session) || { status: 'error', message: '会话不存在' });
    }
    if (sessionMatch && method === 'PATCH') {
      const session = sessionStore.update(sessionMatch[1], await readJson(request));
      return sendJson(response, session ? 200 : 404, session || { status: 'error', message: '会话不存在' });
    }
    if (sessionMatch && method === 'DELETE') return sendJson(response, sessionStore.remove(sessionMatch[1]) ? 200 : 404, { status: 'success' });
    if (method === 'POST' && url.pathname === '/api/v1/sessions') return sendJson(response, 201, sessionStore.create(await readJson(request)));
    const runMatch = url.pathname.match(/^\/api\/v1\/runs\/(req_[a-zA-Z0-9_]+)$/);
    if (method === 'GET' && runMatch) {
      const run = traceStore.read(runMatch[1]);
      return sendJson(response, run ? 200 : 404, run || { message: '运行记录不存在' });
    }
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
    const generatedAssetMatch = url.pathname.match(/^\/api\/v1\/generated-assets\/([^/]+)$/);
    if (method === 'GET' && generatedAssetMatch) {
      const generatedPath = resolveGeneratedImage(generatedAssetMatch[1]);
      if (!generatedPath) return sendJson(response, 404, { status: 'error', code: 'GENERATED_ASSET_NOT_FOUND', message: '生成图片不存在', request_id: id });
      const type = MIME_TYPES[path.extname(generatedPath).slice(1).toLowerCase()];
      response.writeHead(200, { 'Content-Type': type, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'public, max-age=86400, immutable' });
      const stream = fs.createReadStream(generatedPath);
      stream.on('error', () => response.destroy());
      return stream.pipe(response);
    }
    if (method === 'GET' && url.pathname === '/api/v1/products/image') {
      const imagePath = productSpotlight.resolveProductImage(url.searchParams.get('path'));
      if (!imagePath) return sendJson(response, 404, { status: 'error', message: '产品图片不存在', request_id: id });
      const type = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' }[path.extname(imagePath).toLowerCase()];
      response.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'public, max-age=3600' });
      return fs.createReadStream(imagePath).pipe(response);
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
    require('./services/runTrace.cjs').event('request', { body });
    if (url.pathname === '/api/v1/store/channel-prices') {
      return sendJson(response, 200, { request_id: id, ...await queryChannelPrices(body) });
    }
    if (url.pathname === '/api/v1/store/offer-rules') {
      const result = await fetchOfferRules(body);
      return sendJson(response, result.status === 'error' ? 400 : 200, { request_id: id, ...result });
    }
    if (url.pathname === '/api/v1/analyze') {
      return sendJson(response, 200, { request_id: id, ...analyzeTask(body) });
    }
    if (url.pathname === '/api/v1/customer/assist') {
      const result = await assistCustomer(body);
      return sendJson(response, result.status === 'needs_clarification' ? 400 : 200, { ...result, request_id: id });
    }
    if (url.pathname === '/api/v1/knowledge/search') {
      if (!body.query || !String(body.query).trim()) {
        return sendJson(response, 400, { status: 'error', code: 'MISSING_REQUIRED_FIELD', message: '缺少 query 字段', request_id: id });
      }
      const result = await retrieveEvidence(String(body.query), { limit: Math.min(Number(body.limit) || 5, 10) });
      return sendJson(response, 200, { ...result, request_id: id });
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
      if (body.background === true) {
        if (!sessionStore.get(body.session_id)) return sendJson(response, 404, { message: '会话不存在' });
        return sendJson(response, 202, jobs.submit(requestId(), body));
      }
      if (request.headers.accept?.includes('text/event-stream')) {
        return require('./services/progressStream.cjs').streamGeneration(response, id, options => runGeneration(body, id, options));
      }
      return sendJson(response, 200, await runGeneration(body, id));
    }
    if (url.pathname === '/api/v1/export') {
      if (!body.content || !body.format) return sendJson(response, 400, { status: 'error', code: 'MISSING_REQUIRED_FIELD', message: '缺少 content 或 format 字段', request_id: id });
      if (!['markdown', 'txt', 'json'].includes(body.format)) return sendJson(response, 400, { status: 'error', code: 'INVALID_INPUT', message: 'format 只支持 markdown、txt、json', request_id: id });
      const output = body.format === 'json' ? JSON.stringify(body.content, null, 2) : `${body.content.title || ''}\n\n${body.content.body || body.content}`;
      return sendJson(response, 200, { request_id: id, format: body.format, content: output });
    }
    return sendJson(response, 404, { status: 'error', code: 'NOT_FOUND', request_id: id });
  } catch (error) {
    require('./services/runTrace.cjs').event('request_error', { error: require('./services/runTrace.cjs').errorInfo(error) }, 'failed');
    const statusCode = /^(UNSUPPORTED_|UNVERIFIED_|CONTENT_REVIEW_|PRICE_EVIDENCE_)/.test(error.code || '') ? 422 : error.code?.startsWith('LLM_') ? 502 : 500;
    return sendJson(response, statusCode, { status: 'error', code: error.code || 'INTERNAL_ERROR', message: error.message, generation_mode: 'failed', llm: { status: 'failed', error_code: error.code || 'INTERNAL_ERROR' }, request_id: id, log_url: `/api/v1/runs/${id}` });
  }
  };
  return tracked ? withRun(id, { route: url.pathname, method }, execute) : execute();
}

const server = http.createServer(route);
server.listen(PORT, '127.0.0.1', () => console.log(`API server listening on http://127.0.0.1:${PORT}`));
module.exports = server;
