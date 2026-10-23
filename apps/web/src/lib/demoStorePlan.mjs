import subsidyRule from '../../../../shared/pcSubsidy2026.json' with { type: 'json' };
import { localDate } from './storePricePlan.mjs';

// Verified national rule; local applicability must be confirmed per sales channel.
export function createDemoProfile(context = {}) {
  return {
    model: (context.solution?.model || context.model || 'HUAWEI MateBook 14（鸿蒙版）').replace(/-价格卡$/, ''),
    configuration: context.tier?.configuration || '',
    budget: String(context.solution?.budget ?? context.budget ?? '').replace(/[¥￥元,，\s]/g, ''),
    quote: '', onlinePrice: '', onlineSource: '', onlineConfirmed: false,
    educationPrice: '', educationSource: '', educationConfirmed: false, studentEligible: false,
    subsidyExample: true, subsidyEligible: false, energyEfficiencyConfirmed: false,
    storeSubsidyConfirmed: false, onlineSubsidyConfirmed: false, educationStacking: false,
  };
}

// Public evidence is applied by the system; personal qualification remains separate.
export function applyPublicReport(profile, report) {
  const verified = report.online?.status === 'verified' && Number(report.online.price) > 0 && vmall(report.online.source_url);
  return { ...profile, configuration: report.tier.configuration, quote: report.tier.price,
    onlinePrice: verified ? report.online.price : '', onlineSource: report.online?.source_url || report.tier.source_url || '', onlineConfirmed: verified,
    educationPrice: '', educationSource: report.education?.sources?.[0]?.source_url || '', educationConfirmed: false,
    educationStacking: false, onlineSubsidyConfirmed: false, storeSubsidyConfirmed: false, energyEfficiencyConfirmed: false };
}

function amount(value) {
  return /^\d+(?:\.\d{1,2})?$/.test(String(value)) && Number(value) > 0 ? Math.round(Number(value) * 100) : null;
}
function vmall(value) {
  try { const u = new URL(value); return u.protocol === 'https:' && !u.username && !u.password && (!u.port || u.port === '443') && /(^|\.)vmall\.com$/.test(u.hostname); } catch { return false; }
}
export function buildDemoPlan(profile, today = localDate()) {
  const quote = amount(profile.quote);
  if (!quote) return { result: { status: 'pending', plans: [], best: null } };
  const plans = [{ name: '门店报价（知识库基准）', price: quote / 100, example: false }];
  const subsidyAllowed = profile.subsidyExample && profile.subsidyEligible && profile.energyEfficiencyConfirmed && today >= subsidyRule.effective_from && today <= subsidyRule.review_until;
  const addSubsidy = (name, base) => {
    const subsidy = Math.min(Math.round(base * subsidyRule.rate), subsidyRule.cap * 100);
    plans.push({ name, price: (base - subsidy) / 100, example: true, subsidy: subsidy / 100 });
  };
  if (subsidyAllowed && profile.storeSubsidyConfirmed) addSubsidy('门店基准 + 国补 15%（最高 ¥1,500）', quote);
  const online = amount(profile.onlinePrice);
  if (online && profile.onlineConfirmed && vmall(profile.onlineSource)) {
    plans.push({ name: '华为商城价格', price: online / 100, example: false });
    if (subsidyAllowed && profile.onlineSubsidyConfirmed) addSubsidy('华为商城价格 + 国补 15%（最高 ¥1,500）', online);
  }
  const education = amount(profile.educationPrice);
  if (education && profile.educationConfirmed && vmall(profile.educationSource)) {
    plans.push({ name: '华为商城教育价', price: education / 100, example: false });
    if (subsidyAllowed && profile.onlineSubsidyConfirmed && profile.educationStacking) addSubsidy('华为商城教育价 + 国补 15%（最高 ¥1,500）', education);
  }
  // Personal eligibility enables an immediate estimate, not an unverified deal.
  const subsidyPreviews = [];
  if (profile.subsidyExample && profile.subsidyEligible && today >= subsidyRule.effective_from && today <= subsidyRule.review_until) {
    if (online && profile.onlineConfirmed && vmall(profile.onlineSource) && !(subsidyAllowed && profile.onlineSubsidyConfirmed)) {
      const subsidy = Math.min(Math.round(online * subsidyRule.rate), subsidyRule.cap * 100);
      subsidyPreviews.push({ name: '华为商城国补条件试算', base: online / 100, subsidy: subsidy / 100, price: (online - subsidy) / 100,
        conditions: '需当地活动覆盖、所选商品符合一级能效且参与补贴；未计入已核实最低价。' });
    }
  }
  plans.sort((a, b) => a.price - b.price);
  const best = plans[0];
  const budget = amount(profile.budget);
  return { result: { status: 'ready', plans, best, subsidyPreviews, budgetGap: budget ? Math.max(0, Math.round(best.price * 100) - budget) / 100 : null } };
}
