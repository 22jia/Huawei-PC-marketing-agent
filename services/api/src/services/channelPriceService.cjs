const { buildPriceSolution } = require('./priceSolutionService.cjs');
const { fetchText, fetchOfferRules } = require('./storeOfferRules.cjs');
const subsidyRule = require('../../../../shared/pcSubsidy2026.json');
const { queryVmallPublicPrice } = require('./vmallPublicPrice.cjs');

// Page amounts are candidates, never a verified price for the selected SKU.
function pagePriceCandidates(html) {
  const text = String(html || '').replace(/<script\b[\s\S]*?<\/script>/gi, ' ').replace(/<style\b[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&yen;|&#165;/gi, '¥');
  return [...new Set([...text.matchAll(/[¥￥]\s*([\d,]+(?:\.\d{1,2})?)/g)].map((m) => Number(m[1].replace(/,/g, ''))).filter((n) => Number.isFinite(n) && n > 0))].slice(0, 20);
}

async function queryChannelPrices(input = {}, options = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { status: 'unavailable', message: '请提供型号和配置。' };
  const solution = (options.buildPriceSolution || buildPriceSolution)(String(input.model || 'HUAWEI MateBook 14（鸿蒙版）'), input.budget);
  if (solution?.status === 'needs_model_clarification') {
    return { status: 'needs_model_clarification', solution, models: solution.models || [],
      message: solution.message || '请先选择具体系统或配置版本。' };
  }
  if (solution?.status !== 'available') return { status: 'unavailable', solution, message: '没有匹配的知识库价格，请核对具体型号。' };
  const tier = input.configuration ? solution.configurations.find((row) => row.configuration === input.configuration) : solution.budget_fit || solution.tiers[0];
  if (!tier) return { status: 'unavailable', solution, message: '当前配置没有匹配的知识库价格，请重新选择。' };
  const report = { status: 'success', solution, tier, store_basis: '知识库金额作为Demo门店报价基准；原始记录为华为商城历史快照，并非实际门店报价', subsidy_rule: subsidyRule };
  if (!input.live) return report;
  const checked_at = new Date().toISOString();
  const isVmall = (value) => { try { const u = new URL(value); return u.protocol === 'https:' && !u.username && !u.password && (!u.port || u.port === '443') && /(^|\.)vmall\.com$/.test(u.hostname); } catch { return false; } };
  if (!isVmall(tier.source_url)) return { ...report, online: { status: 'unavailable', checked_at, candidates: [], message: '当前价格卡缺少华为商城链接。' } };
  const source = new URL(tier.source_url);
  if (!options.fetchText || options.queryVmallPublicPrice) {
    try {
      const publicReport = await (options.queryVmallPublicPrice || queryVmallPublicPrice)({ source_url: source.href, model: solution.model, configuration: tier.configuration });
      require('./runTrace.cjs').event('channel_prices.public_lookup', publicReport, publicReport.online?.status === 'verified' ? 'success' : 'failed');
      return { ...report, ...publicReport };
    } catch (error) {
      const message = error.message.split('\n')[0];
      require('./runTrace.cjs').event('channel_prices.public_lookup', { source_url: source.href, configuration: tier.configuration, message }, 'failed');
      console.warn('[channel-prices] public lookup failed', { model: solution.model, configuration: tier.configuration, source_url: source.href, message });
      return { ...report, online: { status: 'unavailable', source_url: source.href, checked_at, candidates: [], message: '商城查询失败：' + message },
        education: { status: 'unavailable', rules: [], sources: [], message: '此次公开查询未完成，请重试。' } };
    }
  }
  const results = await Promise.allSettled([
    (options.fetchText || fetchText)(source.href, 8000),
    (options.fetchOfferRules || fetchOfferRules)({ model: input.model || solution.model, configuration: tier.configuration, region: '全国', channel: 'education' }),
  ]);
  const page = results[0];
  const candidates = page.status === 'fulfilled' ? pagePriceCandidates(page.value) : [];
  report.online = { status: candidates.length ? 'needs_sku_confirmation' : 'unavailable', source_url: source.href, checked_at, candidates,
    message: candidates.length ? '页面金额未匹配到具体配置，不参与自动比较。' : '商城查询失败：' + (page.reason?.message || '未读取到公开价格') };
  report.education = results[1].status === 'fulfilled' ? { ...results[1].value, rules: (results[1].value.rules || []).filter((r) => r.name === '教育优惠' && isVmall(r.source)), sources: (results[1].value.sources || []).filter((s) => isVmall(s.source_url)) } : { status: 'unavailable', rules: [], sources: [] };
  return report;
}
module.exports = { queryChannelPrices, pagePriceCandidates };
