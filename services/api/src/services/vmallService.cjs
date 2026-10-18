const https = require('https');

const VMALL_ORIGIN = 'https://www.vmall.com';

function fetchText(url, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    const request = https.get(url, { headers: { 'User-Agent': 'HuaweiPCMarketingAgent/1.0' } }, (response) => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => { body += chunk; if (body.length > 2_000_000) response.destroy(new Error('VMall响应过大')); });
      response.on('end', () => response.statusCode >= 200 && response.statusCode < 400 ? resolve(body) : reject(new Error(`VMall返回 HTTP ${response.statusCode}`)));
    });
    request.setTimeout(timeoutMs, () => request.destroy(new Error('VMall请求超时')));
    request.on('error', reject);
  });
}

function strip(value) { return String(value || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim(); }

async function searchVmall(query, options = {}) {
  const encoded = encodeURIComponent(String(query || '').trim());
  if (!encoded) return { source_status: 'not_requested', evidence: [] };
  const url = `${VMALL_ORIGIN}/search?keyword=${encoded}`;
  try {
    const html = await fetchText(url, options.timeoutMs);
    const title = strip(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]) || '华为商城搜索结果';
    const prices = [...html.matchAll(/(?:¥|￥)\s*([\d,]+(?:\.\d{1,2})?)/g)].slice(0, 10).map((match) => match[1]);
    return { source_status: 'vmall_official', source_url: url, checked_at: new Date().toISOString(), evidence: [{ title, content: prices.length ? `官方商城页面检测到价格文本：${prices.join('、')}。具体 SKU、库存和促销以页面实时展示为准。` : '已打开官方商城搜索页，但页面未提供可稳定解析的价格文本；请人工核对具体 SKU。', source_path: 'VMall 官方商城', source_url: url, confidence: 'dynamic_pending_verification', source_status: 'vmall_official', retrievable: true, prices }] };
  } catch (error) {
    return { source_status: 'vmall_unavailable', source_url: url, checked_at: new Date().toISOString(), warning: error.message, evidence: [] };
  }
}

module.exports = { searchVmall, VMALL_ORIGIN };
