import subsidyRule from '../../../../shared/pcSubsidy2026.json' with { type: 'json' };
import { localDate } from './storePricePlan.mjs';

// Verified national rule; local applicability must be confirmed per sales channel.
export function createDemoProfile(context = {}) {
  return {
    model: (context.solution?.model || context.model || 'HUAWEI MateBook 14（鸿蒙版）').replace(/-价格卡$/, ''),
    configuration: context.tier?.configuration || '',
    budget: String(context.solution?.budget ?? context.budget ?? '').replace(/[¥￥元,，\s]/g, ''),
    quote: '', onlinePrice: '', onlineSource: '', onlineConfirmed: false,
    educationPrice: '', educationSource: '', educationConfirmed: false,
    subsidyExample: true, subsidyEligible: false, energyEfficiencyConfirmed: false,
    storeSubsidyConfirmed: false, onlineSubsidyConfirmed: false, educationStacking: false,
  };
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
  plans.sort((a, b) => a.price - b.price);
  const best = plans[0];
  const budget = amount(profile.budget);
  return { result: { status: 'ready', plans, best, budgetGap: budget ? Math.max(0, Math.round(best.price * 100) - budget) / 100 : null } };
}
