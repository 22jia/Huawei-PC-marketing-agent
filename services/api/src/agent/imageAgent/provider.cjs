class ImageProviderError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'ImageProviderError';
    this.code = code;
  }
}

function assertActive(signal) {
  if (signal?.aborted) throw new ImageProviderError('IMAGE_GENERATION_CANCELLED', '图片生成已取消');
}

function timeoutSignal(parent, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const abort = () => controller.abort();
  if (parent?.aborted) abort();
  else parent?.addEventListener('abort', abort, { once: true });
  return { signal: controller.signal, cleanup() { clearTimeout(timer); parent?.removeEventListener('abort', abort); } };
}

function transportFailure(error) {
  const code = error?.cause?.code || error?.cause?.cause?.code || error?.code;
  const known = {
    ENOTFOUND: ['IMAGE_PROVIDER_DNS_FAILED', '图片服务域名无法解析（ENOTFOUND）'],
    EAI_AGAIN: ['IMAGE_PROVIDER_DNS_FAILED', '图片服务域名暂时无法解析（EAI_AGAIN）'],
    ECONNRESET: ['IMAGE_PROVIDER_CONNECTION_CLOSED', '图片服务连接被对端重置（ECONNRESET）'],
    UND_ERR_SOCKET: ['IMAGE_PROVIDER_CONNECTION_CLOSED', '图片服务连接中断（UND_ERR_SOCKET）'],
    ETIMEDOUT: ['IMAGE_PROVIDER_TIMEOUT', '连接图片服务超时（ETIMEDOUT）'],
    UND_ERR_CONNECT_TIMEOUT: ['IMAGE_PROVIDER_TIMEOUT', '连接图片服务超时（UND_ERR_CONNECT_TIMEOUT）'],
    ECONNREFUSED: ['IMAGE_PROVIDER_CONNECTION_REFUSED', '图片服务拒绝连接（ECONNREFUSED）'],
  };
  const safeCode = typeof code === 'string' && /^[A-Z0-9_]{2,48}$/.test(code) ? code : null;
  const [failureCode, message] = known[code] || (safeCode
    ? ['IMAGE_PROVIDER_TRANSPORT_FAILED', `图片服务网络请求失败（${safeCode}）`]
    : ['IMAGE_PROVIDER_REQUEST_FAILED', '图片服务请求失败；未取得可识别的网络错误码']);
  return new ImageProviderError(failureCode, message);
}

function httpFailure(status) {
  const details = {
    401: '图片服务返回 HTTP 401：请核对图片 Key。',
    403: '图片服务返回 HTTP 403：当前 Key 可能没有此图片模型权限。',
    402: '图片服务返回 HTTP 402：请检查图片额度。',
    429: '图片服务返回 HTTP 429：请求过多，请稍后再试。',
  };
  return new ImageProviderError('IMAGE_PROVIDER_HTTP_ERROR', details[status] || `图片服务返回 HTTP ${status}`);
}

async function readLimited(response, maxBytes) {
  if (Number(response.headers.get('content-length')) > maxBytes) throw new ImageProviderError('IMAGE_TOO_LARGE', '图片服务响应超过大小限制');
  const reader = response.body?.getReader();
  if (!reader) throw new ImageProviderError('IMAGE_PROVIDER_SCHEMA_ERROR', '图片服务响应为空');
  const chunks = [];
  let length = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > maxBytes) throw new ImageProviderError('IMAGE_TOO_LARGE', '图片服务响应超过大小限制');
      chunks.push(Buffer.from(value));
    }
  } finally { await reader.cancel().catch(() => {}); }
  return Buffer.concat(chunks);
}

function createHttpProvider(config = {}) {
  // Credentials belong to the server environment, never task input or options.
  const baseUrl = config.baseUrl || process.env.IMAGE_BASE_URL || 'https://api.openai-next.com/v1/images/generations';
  const apiKey = process.env.CREDIT_MEDIA_API_KEY || process.env.IMAGE_API_KEY;
  const model = config.model || process.env.IMAGE_MODEL || 'gpt-image-2';
  const size = config.size || process.env.IMAGE_SIZE || '1024x1024';
  const timeoutMs = Number(config.timeoutMs ?? process.env.IMAGE_TIMEOUT_MS ?? 45000);
  if (!apiKey) throw new ImageProviderError('IMAGE_PROVIDER_NOT_CONFIGURED', '图片服务缺少 CREDIT_MEDIA_API_KEY 或 IMAGE_API_KEY');
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0 || timeoutMs > 300000 || !/^\d{3,4}x\d{3,4}$/.test(size)) throw new ImageProviderError('IMAGE_INVALID_CONFIG', '图片服务超时或尺寸配置无效');
  let endpoint;
  try { endpoint = new URL(baseUrl); } catch { throw new ImageProviderError('IMAGE_INVALID_CONFIG', '图片服务地址无效'); }
  if (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password) throw new ImageProviderError('IMAGE_INVALID_CONFIG', '图片服务必须使用 HTTPS 地址');
  const downloadHosts = new Set((process.env.IMAGE_DOWNLOAD_HOSTS || 'api.openai-next.com').split(',').map((host) => host.trim()).filter(Boolean));
  const request = config.fetch || fetch;
  let editEndpoint;
  try { editEndpoint = new URL(config.editUrl || process.env.IMAGE_EDIT_URL || endpoint.href.replace(/\/generations\/?$/, '/edits')); }
  catch { throw new ImageProviderError('IMAGE_INVALID_CONFIG', '图片编辑服务地址无效'); }
  if (editEndpoint.protocol !== 'https:' || editEndpoint.username || editEndpoint.password) throw new ImageProviderError('IMAGE_INVALID_CONFIG', '图片编辑服务必须使用 HTTPS 地址');
  async function requestImage(input, options = {}, editing = false) {
      assertActive(options.signal);
      let body;
      const headers = { authorization: `Bearer ${apiKey}` };
      if (editing) {
        const reference = input.reference;
        if (!Buffer.isBuffer(reference?.buffer) || !reference.buffer.length || reference.buffer.length > 12 * 1024 * 1024 || !['image/jpeg', 'image/png', 'image/webp'].includes(reference.mime)) throw new ImageProviderError('IMAGE_INVALID_SOURCE', '图片编辑缺少有效的产品参考图');
        body = new FormData();
        body.append('model', model);
        body.append('prompt', input.prompt);
        body.append('size', size);
        // Upload bytes only; do not send local paths, evidence or credentials as fields.
        body.append('image', new Blob([reference.buffer], { type: reference.mime }), reference.mime === 'image/jpeg' ? 'product.jpg' : reference.mime === 'image/webp' ? 'product.webp' : 'product.png');
      } else {
        headers['content-type'] = 'application/json';
        body = JSON.stringify({ model, prompt: input.prompt, size });
      }
      const bounded = timeoutSignal(options.signal, timeoutMs);
      try {
        const response = await request(editing ? editEndpoint.href : endpoint.href, {
          method: 'POST', redirect: 'error',
          headers, body,
          signal: bounded.signal,
        });
        if (!response.ok) throw httpFailure(response.status);
        let payload;
        try { payload = JSON.parse((await readLimited(response, 18 * 1024 * 1024)).toString('utf8')); }
        catch (error) { if (error instanceof ImageProviderError) throw error; throw new ImageProviderError('IMAGE_PROVIDER_SCHEMA_ERROR', '图片服务返回的 JSON 无效'); }
        const item = payload?.data?.[0];
        if (!item) throw new ImageProviderError('IMAGE_PROVIDER_SCHEMA_ERROR', '图片服务没有返回图片');
        let buffer;
        if (typeof item.b64_json === 'string') {
          if (!/^[A-Za-z0-9+/]+={0,2}$/.test(item.b64_json) || item.b64_json.length % 4 !== 0) throw new ImageProviderError('IMAGE_PROVIDER_SCHEMA_ERROR', '图片服务返回的 base64 无效');
          buffer = Buffer.from(item.b64_json, 'base64');
        } else if (typeof item.url === 'string') {
          let imageUrl;
          try { imageUrl = new URL(item.url); } catch { throw new ImageProviderError('IMAGE_PROVIDER_SCHEMA_ERROR', '图片服务返回的图片地址无效'); }
          if (imageUrl.protocol !== 'https:' || imageUrl.port || imageUrl.username || imageUrl.password || !downloadHosts.has(imageUrl.hostname)) throw new ImageProviderError('IMAGE_DOWNLOAD_HOST_NOT_ALLOWED', '图片下载域名未获服务端允许，请配置 IMAGE_DOWNLOAD_HOSTS');
          // No Authorization header on CDN requests; redirects cannot escape the allowlist.
          const imageResponse = await request(imageUrl.href, { signal: bounded.signal, redirect: 'error' });
          if (!imageResponse.ok) throw new ImageProviderError('IMAGE_PROVIDER_DOWNLOAD_FAILED', '生成图片下载失败');
          buffer = await readLimited(imageResponse, 12 * 1024 * 1024);
        } else throw new ImageProviderError('IMAGE_PROVIDER_SCHEMA_ERROR', '图片服务响应缺少 b64_json 或 url');
        if (!buffer.length || buffer.length > 12 * 1024 * 1024) throw new ImageProviderError('IMAGE_INVALID_OUTPUT', '图片服务返回的图片为空或过大');
        assertActive(options.signal);
        if (bounded.signal.aborted) throw new ImageProviderError('IMAGE_PROVIDER_TIMEOUT', '图片服务请求超时');
        return [{ buffer }];
      } catch (error) {
        assertActive(options.signal);
        if (bounded.signal.aborted) throw new ImageProviderError('IMAGE_PROVIDER_TIMEOUT', '图片服务请求超时');
        if (error instanceof ImageProviderError) throw error;
        throw transportFailure(error);
      } finally { bounded.cleanup(); }
  }
  return { id: 'openai-next', generate: (input, options) => requestImage(input, options), edit: (input, options) => requestImage(input, options, true) };
}

function createProvider(options = {}) {
  if (options.provider) return options.provider;
  const id = options.providerId || process.env.IMAGE_PROVIDER || ((process.env.CREDIT_MEDIA_API_KEY || process.env.IMAGE_API_KEY) ? 'openai-next' : 'none');
  if (id === 'none') throw new ImageProviderError('IMAGE_PROVIDER_NOT_CONFIGURED', '未配置图片生成服务');
  if (id !== 'openai-next') throw new ImageProviderError('IMAGE_INVALID_CONFIG', '不支持的图片服务');
  return createHttpProvider(options);
}

function mockProvider(images = []) {
  return { id: 'mock', async generate() { return images.map((image) => ({ ...image })); } };
}
module.exports = { ImageProviderError, assertActive, createProvider, createHttpProvider, mockProvider, timeoutSignal, transportFailure, httpFailure };
