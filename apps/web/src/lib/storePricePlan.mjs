// Local planning only: no quote is verified by this module or sent to the API.
export function localDate(now = new Date()) {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function cents(value) {
  const text = String(value ?? '').trim();
  if (!/^\d+(?:\.\d{1,2})?$/.test(text)) return null;
  const result = Math.round(Number(text) * 100);
  return Number.isSafeInteger(result) ? result : null;
}

function currentDate(value, today) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value || '') &&
    !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) &&
    new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value && value >= today;
}

function applyRules(quote, combination, today) {
  if (!Array.isArray(combination.steps) || !combination.steps.length || combination.steps.length > 6 ||
      (combination.steps.length > 1 && (combination.stackingConfirmed !== true || !combination.stackingSource?.trim()))) return null;
  let remaining = quote;
  const groups = new Set();
  const sources = new Set();
  for (const step of combination.steps) {
    const id = `${step.source}|${step.excerpt || step.name}`;
    if (sources.has(id) || (step.exclusiveGroup && groups.has(step.exclusiveGroup))) return null;
    sources.add(id);
    if (step.exclusiveGroup) groups.add(step.exclusiveGroup);
    if (!step.name?.trim() || !step.source?.trim() || step.confirmed !== true ||
        step.verification?.store !== true || step.verification?.sku !== true ||
        step.verification?.eligibility !== true || step.verification?.notInQuote !== true ||
        step.verification?.sourceReviewed !== true ||
        !currentDate(step.validUntil, today) || !currentDate(step.validFrom, step.validFrom) || step.validFrom > today ||
        !['original', 'remaining'].includes(step.basis)) return null;
    const basis = step.basis === 'original' ? quote : remaining;
    const minimum = step.minSpend === '' || step.minSpend == null ? 0 : cents(step.minSpend);
    if (minimum === null || basis < minimum) return null;
    let discount;
    if (step.kind === 'fixed') discount = cents(step.amount);
    else if (step.kind === 'percent') {
      const rate = cents(step.amount);
      if (rate === null || rate <= 0 || rate > 10000) return null;
      discount = Math.round(basis * rate / 10000);
    } else return null;
    if (discount === null) return null;
    if (step.cap !== '' && step.cap != null) {
      const cap = cents(step.cap);
      if (cap === null || cap <= 0) return null;
      discount = Math.min(discount, cap);
    }
    if (discount === null || discount <= 0 || discount > remaining) return null;
    remaining -= discount;
  }
  return quote - remaining;
}

export function canConfirmOffer(rule, quote, today = localDate()) {
  const price = cents(quote);
  return price > 0 && applyRules(price, { steps: [{ ...rule, confirmed: true }] }, today) !== null;
}

export function compareStorePlans(input, today = localDate()) {
  const quote = cents(input.quote);
  const validQuote = input.model?.trim() && input.configuration?.trim() && input.store?.trim() &&
    input.source?.trim() && input.confirmed === true && currentDate(input.validUntil, today) && quote > 0;
  if (!validQuote) return { status: 'pending', plans: [], best: null, excluded: (input.combinations || []).length };

  const plans = [{ name: '本店报价（不另扣优惠）', price: quote / 100 }];
  let excluded = 0;
  for (const combination of input.combinations || []) {
    const discount = combination.steps ? applyRules(quote, combination, today) : null;
    if (!combination.name?.trim() || !combination.source?.trim() || combination.confirmed !== true ||
      !currentDate(combination.validUntil, today) || discount === null || discount <= 0 || discount > quote) {
      excluded += 1;
      continue;
    }
    // Each row is one alternative, never stack rows with each other.
    plans.push({ name: combination.name.trim(), price: (quote - discount) / 100 });
  }
  plans.sort((a, b) => a.price - b.price);
  const best = plans[0];
  const budget = cents(input.budget);
  const online = cents(input.onlinePrice);
  const onlineComparable = input.onlineConfirmed === true && Boolean(input.onlineSource?.trim()) && online > 0;
  return {
    status: 'ready', plans, best, excluded,
    budgetGap: budget > 0 ? Math.max(0, Math.round(best.price * 100) - budget) / 100 : null,
    onlineDifference: onlineComparable ? (online - Math.round(best.price * 100)) / 100 : null,
  };
}
