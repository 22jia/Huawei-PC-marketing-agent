const { test } = require('node:test');
const assert = require('node:assert/strict');
const planner = import('../apps/web/src/lib/storePricePlan.mjs');
const today = '2026-10-22';
const base = { model: '型号 A', configuration: '16GB/512GB', store: '门店 A', quote: 6000, source: '本店报价单', validUntil: today, confirmed: true, budget: 5500 };
const verification = { store: true, sku: true, eligibility: true, notInQuote: true, sourceReviewed: true };
const step = { id: 'a', name: '店惠', kind: 'fixed', amount: 300, source: '门店规则', validFrom: '2026-10-01', validUntil: today, basis: 'original', confirmed: true, verification };
function combo(steps, extra = {}) { return { name: '已核实组合', source: '本店活动', validUntil: today, confirmed: true, steps, stackingConfirmed: true, stackingSource: '活动原文及门店确认', ...extra }; }
const offer = combo([{ ...step, name: '店惠 + 教育优惠', amount: 600 }]);

test('store plans compare alternative confirmed combinations without stacking rows', async () => {
  const { compareStorePlans } = await planner;
  const result = compareStorePlans({ ...base, combinations: [offer, combo([{ ...step, name: '国补', amount: 900 }], { name: '国补' })] }, today);
  assert.equal(result.best.price, 5100);
  assert.equal(result.best.name, '国补');
  assert.equal(result.plans.length, 3);
  assert.equal(result.budgetGap, 0);
});

test('pending, expired, source-less and invalid discounts never affect the result', async () => {
  const { compareStorePlans } = await planner;
  const result = compareStorePlans({ ...base, combinations: [
    combo([{ ...step, confirmed: false }]), combo([{ ...step, validUntil: '2026-10-21' }]),
    combo([{ ...step, source: '' }]), combo([{ ...step, amount: 6001 }]),
    combo([{ ...step, amount: -1 }]), combo([{ ...step, amount: '1e3' }]),
    combo([{ ...step, amount: '' }]), combo([{ ...step, validUntil: '2026-02-30' }]),
  ] }, today);
  assert.equal(result.best.price, 6000);
  assert.equal(result.excluded, 8);
  assert.equal(result.budgetGap, 500);
});

test('quote requires exact configuration, store, confirmation, source and unexpired validity', async () => {
  const { compareStorePlans } = await planner;
  for (const field of ['model', 'configuration', 'store', 'source', 'validUntil', 'quote']) {
    assert.equal(compareStorePlans({ ...base, [field]: '' }, today).status, 'pending', field);
  }
  assert.equal(compareStorePlans({ ...base, confirmed: false }, today).status, 'pending');
  assert.equal(compareStorePlans({ ...base, validUntil: '2026-10-21' }, today).status, 'pending');
});

test('historical online reference cannot establish current channel price advantage', async () => {
  const { compareStorePlans } = await planner;
  const input = { ...base, onlinePrice: 6200, onlineSource: 'https://example.com/product' };
  assert.equal(compareStorePlans(input, today).onlineDifference, null);
  assert.equal(compareStorePlans({ ...input, onlineConfirmed: true }, today).onlineDifference, 200);
  assert.equal(compareStorePlans({ ...input, onlineConfirmed: true, onlineSource: '' }, today).onlineDifference, null);
});

test('money uses cents and does not deduct trade-in proceeds from product price', async () => {
  const { compareStorePlans } = await planner;
  const result = compareStorePlans({ ...base, quote: '6000.10', budget: '5500.05', combinations: [combo([{ ...step, amount: '500.05' }])], tradeIn: 1000 }, today);
  assert.equal(result.best.price, 5500.05);
  assert.equal(result.budgetGap, 0);
});

test('percentage offer uses the quote as base and respects cap', async () => {
  const { compareStorePlans } = await planner;
  const result = compareStorePlans({ ...base, quote: 8000, combinations: [combo([{ ...step, name: '教育优惠', kind: 'percent', amount: 15, cap: 1000 }])] }, today);
  assert.equal(result.best.price, 7000);
});
test('ordered fixed and percentage rules distinguish original and remaining base', async () => {
  const { compareStorePlans } = await planner;
  const percent = { ...step, id: 'b', name: '国补', source: '官方规则', kind: 'percent', amount: 15, basis: 'remaining' };
  assert.equal(compareStorePlans({ ...base, combinations: [combo([step, percent])] }, today).best.price, 4845);
  assert.equal(compareStorePlans({ ...base, combinations: [combo([step, { ...percent, basis: 'original' }])] }, today).best.price, 4800);
  assert.equal(compareStorePlans({ ...base, combinations: [combo([percent, step])] }, today).best.price, 4800);
});

test('every counted offer requires separate store, SKU, customer, quote and source checks', async () => {
  const { compareStorePlans } = await planner;
  for (const field of Object.keys(verification)) {
    const incomplete = { ...verification, [field]: false };
    const result = compareStorePlans({ ...base, combinations: [combo([{ ...step, verification: incomplete }])] }, today);
    assert.equal(result.best.price, 6000, field);
    assert.equal(result.excluded, 1, field);
  }
});

test('confirmation gate shares calculation validation for dates, amounts and verification', async () => {
  const { canConfirmOffer } = await planner;
  assert.equal(canConfirmOffer({ ...step, confirmed: false }, 6000, today), true);
  for (const invalid of [
    { validUntil: '2026-02-30' }, { validUntil: '2026-10-21' },
    { validFrom: '2026-10-23' }, { amount: '' }, { amount: 6001 },
    { kind: 'percent', amount: 101 }, { minSpend: 6001 }, { cap: 0 },
    { verification: {} }, { basis: '' },
  ]) assert.equal(canConfirmOffer({ ...step, ...invalid }, 6000, today), false, JSON.stringify(invalid));
  assert.equal(canConfirmOffer(step, '', today), false);
});
test('rule caps, thresholds and cents rounding are enforced', async () => {
  const { compareStorePlans } = await planner;
  const percent = { ...step, kind: 'percent', amount: 15, cap: 800, minSpend: 5000 };
  assert.equal(compareStorePlans({ ...base, combinations: [combo([percent])] }, today).best.price, 5200);
  assert.equal(compareStorePlans({ ...base, combinations: [combo([{ ...percent, minSpend: 6001 }])] }, today).best.price, 6000);
  assert.equal(compareStorePlans({ ...base, quote: '6000.10', combinations: [combo([{ ...percent, cap: '' }])] }, today).best.price, 5100.08);
  assert.equal(compareStorePlans({ ...base, combinations: [combo([{ ...step, amount: '', cap: 100 }])] }, today).best.price, 6000);
});
test('unconfirmed, expired, future, duplicate and exclusive steps cannot reduce price', async () => {
  const { compareStorePlans } = await planner;
  const other = { ...step, id: 'b', name: '教育', source: '教育规则' };
  const invalid = [
    combo([{ ...step, confirmed: false }]), combo([{ ...step, validUntil: '2026-10-21' }]),
    combo([{ ...step, validFrom: '2026-10-23' }]), combo([{ ...step, validFrom: '2026-02-30' }]),
    combo([{ ...step, validFrom: '' }]), combo([{ ...step, basis: '' }]),
    combo([step, step]), combo([step, other], { stackingConfirmed: false }),
    combo([step, other], { stackingSource: '' }),
    combo([{ ...step, exclusiveGroup: 'education' }, { ...other, exclusiveGroup: 'education' }]),
  ];
  const result = compareStorePlans({ ...base, combinations: invalid }, today);
  assert.equal(result.best.price, 6000); assert.equal(result.excluded, invalid.length);
});
