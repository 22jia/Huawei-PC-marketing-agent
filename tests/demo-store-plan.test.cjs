const test = require('node:test');
const assert = require('node:assert/strict');

test('only confirmed VMall channels and explicitly confirmed subsidy stacking enter comparison', async () => {
  const { createDemoProfile, buildDemoPlan } = await import('../apps/web/src/lib/demoStorePlan.mjs');
  const base = createDemoProfile({ model: 'MateBook', budget: '7000' });
  const pending = buildDemoPlan({ ...base, quote: 6599 });
  assert.equal(pending.result.best.price, 6599);
  assert.equal(pending.result.plans.some((plan) => plan.name.includes('华为商城')), false);
  const confirmed = buildDemoPlan({ ...base, quote: 6599, onlinePrice: 6499, onlineSource: 'https://www.vmall.com/item', onlineConfirmed: true });
  assert.equal(confirmed.result.plans.some((plan) => plan.name === '华为商城价格'), true);
  const educationProfile = { ...base, quote: 6599, educationPrice: 6199, educationSource: 'https://www.vmall.com/edu', educationConfirmed: true, subsidyExample: false };
  const education = buildDemoPlan(educationProfile);
  assert.equal(education.result.best.price, 6199);
  const stacked = buildDemoPlan({ ...educationProfile, subsidyExample: true, subsidyEligible: true, energyEfficiencyConfirmed: true, onlineSubsidyConfirmed: true, educationStacking: true });
  assert.equal(stacked.result.best.price, 5269.15);
});

test('subsidy follows official rate and cap only after eligibility and energy checks', async () => {
  const { createDemoProfile, buildDemoPlan } = await import('../apps/web/src/lib/demoStorePlan.mjs');
  const base = { ...createDemoProfile({ budget: '7000' }), quote: 6599 };
  assert.equal(buildDemoPlan(base).result.best.price, 6599);
  const eligible = buildDemoPlan({ ...base, subsidyEligible: true, energyEfficiencyConfirmed: true, storeSubsidyConfirmed: true });
  assert.equal(eligible.result.best.price, 5609.15);
  const capped = buildDemoPlan({ ...base, quote: 12000, subsidyEligible: true, energyEfficiencyConfirmed: true, storeSubsidyConfirmed: true });
  assert.equal(capped.result.best.price, 10500);
});

test('subsidy dates, missing checks, channel applicability and double deduction are guarded', async () => {
  const { createDemoProfile, buildDemoPlan } = await import('../apps/web/src/lib/demoStorePlan.mjs');
  const base = { ...createDemoProfile(), quote: 10000, subsidyEligible: true, energyEfficiencyConfirmed: true, storeSubsidyConfirmed: true };
  for (const key of ['subsidyEligible', 'energyEfficiencyConfirmed', 'storeSubsidyConfirmed', 'subsidyExample']) {
    assert.equal(buildDemoPlan({ ...base, [key]: false }, '2026-10-22').result.best.price, 10000);
  }
  assert.equal(buildDemoPlan(base, '2026-01-01').result.best.price, 8500);
  assert.equal(buildDemoPlan(base, '2026-12-31').result.best.price, 8500);
  assert.equal(buildDemoPlan(base, '2025-12-31').result.best.price, 10000);
  assert.equal(buildDemoPlan(base, '2027-01-01').result.best.price, 10000);
  const online = { ...base, storeSubsidyConfirmed: false, onlineConfirmed: true, onlineSource: 'https://www.vmall.com/item', onlinePrice: 6000 };
  assert.equal(buildDemoPlan(online, '2026-10-22').result.best.price, 6000);
  assert.equal(buildDemoPlan({ ...online, onlineSubsidyConfirmed: true }, '2026-10-22').result.best.price, 5100);
  const education = { ...online, educationPrice: 5000, educationSource: 'https://www.vmall.com/edu', educationConfirmed: true, onlineSubsidyConfirmed: true };
  assert.equal(buildDemoPlan(education, '2026-10-22').result.best.price, 5000);
  assert.equal(buildDemoPlan({ ...education, educationStacking: true }, '2026-10-22').result.best.price, 4250);
});

test('non VMall education source cannot enter comparison', async () => {
  const { createDemoProfile, buildDemoPlan } = await import('../apps/web/src/lib/demoStorePlan.mjs');
  const profile = createDemoProfile({ budget: '7000' });
  const result = buildDemoPlan({ ...profile, quote: 6599, educationPrice: 5000, educationSource: 'https://consumer.huawei.com/edu', educationConfirmed: true, subsidyExample: false });
  assert.equal(result.result.plans.some((plan) => plan.name.includes('教育')), false);
});
