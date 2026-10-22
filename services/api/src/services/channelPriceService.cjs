const { buildPriceSolution } = require('./priceSolutionService.cjs');
const { fetchText, fetchOfferRules } = require('./storeOfferRules.cjs');
const subsidyRule = require('../../../../shared/pcSubsidy2026.json');

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
  const results = await Promise.allSettled([
    (options.fetchText || fetchText)(source.href, 8000),
    (options.fetchOfferRules || fetchOfferRules)({ model: input.model || solution.model, configuration: tier.configuration, region: '全国', channel: 'education' }),
  ]);
  const page = results[0];
  const candidates = page.status === 'fulfilled' ? pagePriceCandidates(page.value) : [];
  report.online = { status: candidates.length ? 'needs_sku_confirmation' : 'unavailable', source_url: source.href, checked_at, candidates,
    message: candidates.length ? '页面金额需店员核对是否属于所选配置、是否已含优惠。' : '华为商城动态页未提供可稳定读取的价格，请打开同配置页面人工核价。' };
  report.education = results[1].status === 'fulfilled' ? { ...results[1].value, rules: (results[1].value.rules || []).filter((r) => r.name === '教育优惠' && isVmall(r.source)), sources: (results[1].value.sources || []).filter((s) => isVmall(s.source_url)) } : { status: 'unavailable', rules: [], sources: [] };
  return report;
}
module.exports = { queryChannelPrices, pagePriceCandidates };
