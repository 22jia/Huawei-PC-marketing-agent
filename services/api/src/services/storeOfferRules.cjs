const https = require('https');

// Search discovers links; only opened official pages provide candidate evidence.
function allowedHost(hostname) {
  return ['vmall.com', 'consumer.huawei.com', 'gov.cn'].some((domain) =>
    hostname === domain || hostname.endsWith('.' + domain));
}
function officialUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol === 'https:' && !url.username && !url.password && (!url.port || url.port === '443') && allowedHost(url.hostname)) return url;
  } catch { /* invalid URL */ }
  return null;
}
function fetchText(value, timeoutMs = 8000, search = false, redirects = 0) {
  const url = new URL(value);
  if (!(search ? url.origin === 'https://www.bing.com' : officialUrl(value))) return Promise.reject(new Error('仅支持官方 HTTPS 页面'));
  return new Promise((resolve, reject) => {
    const request = https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; StoreOfferLookup/1.0)' } }, (response) => {
      if ([301, 302, 303, 307, 308].includes(response.statusCode)) {
        response.resume();
        if (redirects >= 3 || !response.headers.location) return reject(new Error('官方页面重定向过多'));
        return fetchText(new URL(response.headers.location, url).href, timeoutMs, search, redirects + 1).then(resolve, reject);
      }
      if (response.statusCode !== 200) { response.resume(); return reject(new Error('页面返回 HTTP ' + response.statusCode)); }
      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => { body += chunk; if (body.length > 2_000_000) response.destroy(new Error('页面过大')); });
      response.on('error', reject);
      response.on('end', () => resolve(body));
    });
    request.setTimeout(timeoutMs, () => request.destroy(new Error('页面请求超时')));
    request.on('error', reject);
  });
}
function decode(value) {
  return String(value || '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&#(?:x([a-f\d]+)|(\d+));/gi, (_, hex, dec) => { const n = parseInt(hex || dec, hex ? 16 : 10); return n <= 0x10ffff ? String.fromCodePoint(n) : ''; })
    .replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&');
}
function stripHtml(value) {
  return decode(String(value || '').replace(/<script\b[\s\S]*?<\/script>/gi, ' ').replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
    .replace(/<\/(?:p|div|li|tr|h\d)>/gi, '。').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
}
function date(value) {
  const parts = String(value || '').match(/(20\d{2})[年./-](\d{1,2})[月./-](\d{1,2})日?/);
  return parts ? parts[1] + '-' + parts[2].padStart(2, '0') + '-' + parts[3].padStart(2, '0') : '';
}
function parseRules(text, sourceUrl) {
  const rules = [];
  // Publication dates never become activity validity dates.
  const range = text.match(/(?:活动时间|有效期|实施时间)[：:\s]*(20\d{2}[年./-]\d{1,2}[月./-]\d{1,2}日?)\s*(?:至|到|—|~|～|-)\s*(20\d{2}[年./-]\d{1,2}[月./-]\d{1,2}日?)/);
  const until = text.match(/(?:有效至|截至|截止至|截止日期[：:]?)\s*(20\d{2}[年./-]\d{1,2}[月./-]\d{1,2}日?)/);
  for (const sentence of text.split(/[。；;！!?？]/).map((s) => s.trim()).filter(Boolean)) {
    if (!/电脑|笔记本|MateBook|补贴|教育|学生|换新|直降|立减|优惠/i.test(sentence)) continue;
    const fixed = sentence.match(/(?:直降|立减|减免)\s*(\d+(?:\.\d{1,2})?)\s*元(?!\s*%)/);
    const percent = sentence.match(/(?:补贴|优惠|立减|减免)[^。；]{0,35}?(\d+(?:\.\d{1,2})?)\s*[%％]/) || sentence.match(/(\d+(?:\.\d{1,2})?)\s*[%％][^。；]{0,15}(?:补贴|优惠)/);
    if (!fixed && !percent) continue;
    const kind = percent ? 'percent' : 'fixed';
    const amount = Number((percent || fixed)[1]);
    if (amount <= 0 || (kind === 'percent' && amount > 100)) continue;
    const cap = sentence.match(/(?:最高|上限|不超过|封顶)[^\d]{0,10}(\d+(?:\.\d{1,2})?)\s*元/);
    const minimum = sentence.match(/(?:满|不低于)\s*(\d+(?:\.\d{1,2})?)\s*元/);
    rules.push({ name: /教育|学生/.test(sentence) ? '教育优惠' : /换新/.test(sentence) ? '换新奖励' : /补贴|国补/.test(sentence) ? '补贴候选' : '官方直降',
      kind, amount, cap: cap ? Number(cap[1]) : '', minSpend: minimum ? Number(minimum[1]) : '',
      source: sourceUrl, excerpt: sentence.slice(0, 800), validFrom: range ? date(range[1]) : '', validUntil: range ? date(range[2]) : date(until?.[1]),
      basis: '', exclusiveGroup: '', confirmed: false, source_status: 'official_candidate' });
  }
  return rules.slice(0, 6);
}
function searchLinks(xml) {
  return [...xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)].map((match) => decode(match[1].match(/<link>([\s\S]*?)<\/link>/i)?.[1]).trim()).filter((url) => officialUrl(url));
}
async function fetchOfferRules(input = {}, options = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { status: 'error', code: 'INVALID_INPUT', message: '请提供型号、地区或官方活动链接。', rules: [] };
  const model = String(input.model || '').trim().slice(0, 120);
  const region = String(input.region || '').trim().slice(0, 60);
  const configuration = String(input.configuration || '').trim().slice(0, 120);
  const sourceUrl = String(input.sourceUrl || '').trim();
  if (sourceUrl && !officialUrl(sourceUrl)) return { status: 'error', code: 'UNTRUSTED_SOURCE', message: '仅支持华为消费者官网、VMall 或政府官方 HTTPS 页面。', rules: [] };
  if (!sourceUrl && (!model || !region)) return { status: 'error', code: 'MISSING_SCOPE', message: '请填写型号和购机地区后查询优惠。', rules: [] };
  const read = options.fetchText || fetchText;
  const year = new Date().getFullYear();
  const queries = input.channel === 'education' ? [model + ' ' + configuration + ' 教育优惠 site:vmall.com'] : [
    region + ' ' + year + ' 电脑 国补 补贴 site:gov.cn',
    model + ' ' + configuration + ' ' + year + ' 教育优惠 site:vmall.com',
    model + ' ' + configuration + ' ' + year + ' 以旧换新 site:consumer.huawei.com',
  ];
  const search_urls = queries.map((q) => 'https://www.bing.com/search?q=' + encodeURIComponent(q));
  const warnings = [];
  let urls = sourceUrl ? [sourceUrl] : [];
  if (!sourceUrl) {
    const searches = await Promise.allSettled(queries.map((q) => read('https://www.bing.com/search?format=rss&q=' + encodeURIComponent(q), 6000, true)));
    searches.forEach((result) => { if (result.status === 'fulfilled') urls.push(...searchLinks(result.value).slice(0, 2)); else warnings.push('部分官方来源搜索暂不可用，可粘贴官方页面继续。'); });
  }
  urls = [...new Set(urls)].filter((url) => input.channel !== 'education' || /(^|\.)vmall\.com$/.test(new URL(url).hostname)).slice(0, 6);
  const results = await Promise.allSettled(urls.map(async (url) => {
    const html = await read(url, 8000);
    return { source_url: url, title: stripHtml(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]) || '官方页面', rules: parseRules(stripHtml(html), url) };
  }));
  const sources = [], rules = [];
  results.forEach((result, index) => {
    if (result.status === 'fulfilled') { sources.push({ source_url: result.value.source_url, title: result.value.title }); rules.push(...result.value.rules); }
    else warnings.push('官方页面读取失败：' + urls[index]);
  });
  return { status: sources.length ? 'success' : 'unavailable', checked_at: new Date().toISOString(), scope: { model, configuration, region },
    rules: rules.slice(0, 12), sources, search_urls, warnings: [...new Set(warnings)],
    note: rules.length ? '已找到待确认优惠；请核实门店、SKU、有效期、资格和计价口径。' : '未提取到可计算规则，可打开官方来源核对或补充活动页面。' };
}
module.exports = { fetchOfferRules, parseRules, allowedHost, officialUrl, searchLinks, fetchText };
