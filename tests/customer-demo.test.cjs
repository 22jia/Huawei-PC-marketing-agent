const test = require('node:test');
const assert = require('node:assert/strict');
const { assistCustomer, inferCustomer, buildFollowUpPlan } = require('../services/api/src/agent/customerAgent.cjs');
const { classifyCustomerSegment } = require('../services/api/src/services/scenarioProductSearch.cjs');
const { retrieveEvidence } = require('../services/api/src/services/evidenceService.cjs');
const { assertGrounded } = require('../services/api/src/agent/agentRuntime.cjs');
const meta = { model: 'demo-test', duration_ms: 1 };
const model = 'HUAWEI MateBook 14（鸿蒙版）';

test('初筛按学生和职场场景分类，信息不足时待确认', () => {
  assert.equal(classifyCustomerSegment('大学生在图书馆写论文').key, 'student');
  assert.equal(classifyCustomerSegment('职场通勤，常开会和处理表格').key, 'professional');
  assert.equal(classifyCustomerSegment('学生，主要玩 Steam 游戏').key, 'student');
  assert.equal(classifyCustomerSegment('想买一台电脑').key, 'unknown');
});

// Use the real local product/price libraries. Only model generation and live
// network retrieval are replaced, so cases are repeatable without credentials.
function run(input, overrides = {}) {
  return assistCustomer(input, {
    planTask: async (task) => {
      const insight = inferCustomer(task.customer_description);
      return { value: { ...insight, summary: '需求待门店确认', retrieval_queries: insight.evidence_queries }, meta };
    },
    retrieveEvidence: (query, options) => retrieveEvidence(query, { ...options, localOnly: true }),
    generateCustomer: async ({ task, analysis }) => ({ value: {
      rationale: '按用途与预算选择', questions: [],
      sales_script: { opening: '按您的用途来选。', recommendation: '先比较合适的配置，再核实本店优惠。', close: '您可以先拿起来感受一下。' },
      objection_responses: [], follow_up_plan: buildFollowUpPlan(task.follow_up_days, analysis, task),
    }, meta }),
    ...overrides,
  });
}

const scenarios = [
  { name: 'selected model under budget', input: { model, budget: '7000' }, price: 'within_budget' },
  { name: 'exact budget boundary', input: { model, budget: '5899' }, price: 'within_budget' },
  { name: 'selected model above budget without affordable alternative', input: { model, budget: '3000' }, price: 'over_budget', empty: true },
  { name: 'expensive intent with affordable alternatives', input: { model: 'HUAWEI MateBook Fold 非凡大师', budget: '7000' }, price: 'over_budget', candidates: true },
  { name: 'no intended model with affordable candidates', input: { budget: '7000' }, candidates: true },
  { name: 'no intended model and no affordable prices', input: { budget: '3000' }, empty: true },
  { name: 'model selected without budget', input: { model }, price: 'budget_missing' },
  { name: 'no intended model or budget', input: {}, candidates: true },
  { name: 'ambiguous system version', input: { model: 'HUAWEI MateBook 14', budget: '7000' }, ambiguous: true },
  { name: 'unknown model does not borrow another model price', input: { model: '不存在的演示型号', budget: '7000' }, noPrice: true },
];
for (const scenario of scenarios) {
  test(`demo: ${scenario.name}`, async () => {
    const result = await run({ customer_description: '大学生在图书馆写论文，想要轻便和华为手机互传', ...scenario.input });
    assert.ok(['success', 'partial'].includes(result.status));
    if (scenario.price) assert.equal(result.solution.price_solution.budget_status, scenario.price);
    if (scenario.empty) assert.equal(result.solution.candidate_products.length, 0);
    if (scenario.candidates) assert.ok(result.solution.candidate_products.length > 0);
    if (scenario.noPrice) assert.equal(result.solution.price_solution, null);
    if (scenario.ambiguous) {
      assert.equal(result.solution.status, 'needs_model_clarification');
      assert.ok(result.solution.candidate_models.length > 1);
      assert.equal(result.solution.candidate_products.length, 0);
    }
    for (const product of result.solution.candidate_products) {
      if (scenario.input.budget) {
        assert.ok(product.recommended_configuration.price <= Number(scenario.input.budget));
        assert.equal(product.price_solution.budget_status, 'within_budget');
      }
      assert.ok(product.source_path);
    }
    assert.deepEqual(result.follow_up_plan.map((entry) => entry.day), [1, 3, 7]);
  });
}

// Reproduce the exact failure: even a budget acknowledgement is seen as a price
test('chat budget in natural language constrains scenario recommendations', async () => {
  for (const budget of ['7000元', '7千', '0.7万']) {
    const result = await run({ customer_description: `大学生写论文，预算${budget}，使用华为手机` });
    assert.ok(result.solution.candidate_products.length > 0);
    for (const product of result.solution.candidate_products) {
      assert.equal(product.price_solution.budget, 7000);
      assert.ok(product.recommended_configuration.price <= 7000);
      assert.ok(product.reason);
    }
  }
});

test('scenario retrieval version ambiguity does not block a customer with no intended model', async () => {
  const result = await run({ customer_description: '大学生在图书馆写论文，想轻便和手机互传', budget: '7000' }, {
    retrieveEvidence: async () => ({ evidence: [], ambiguous_model: true, model_candidates: ['鸿蒙版', 'Windows版'] }),
    generateCustomer: async ({ task, ambiguous_model }) => {
      assert.equal(ambiguous_model, false);
      return { value: { rationale: '按用途选择', questions: [], sales_script: {}, objection_responses: [], follow_up_plan: buildFollowUpPlan(task.follow_up_days, inferCustomer(task.customer_description), task) }, meta };
    },
  });
  assert.ok(result.solution.candidate_products.length > 0);
  assert.equal(result.solution.candidate_models.length, 0);
  assert.notEqual(result.solution.status, 'needs_model_clarification');
  assert.equal(result.clarification.required_before_specific_recommendation, false);
});

// Reproduce the exact failure: even a budget acknowledgement is seen as a price
// by the shared publication guard. Do not weaken that shared guard for articles.
test('budget acknowledgement triggers strict guard but cannot crash customer delivery', async () => {
  assert.throws(() => assertGrounded('您的预算是7000元', []), { code: 'UNVERIFIED_PRICE' });
  const result = await run({ customer_description: '客户预算7000元，想买电脑', model, budget: '7000' }, {
    generateCustomer: async () => ({ value: { rationale: '您的预算是7000元' }, meta }),
  });
  assert.equal(result.status, 'partial');
  assert.equal(result.solution.price_solution.budget_status, 'within_budget');
  assert.doesNotMatch(JSON.stringify(result.sales_script), /7000元/);
  assertGrounded({ sales_script: result.sales_script, follow_up_plan: result.follow_up_plan }, []);
});

for (const field of ['rationale', 'questions', 'sales_script', 'objection_responses', 'follow_up_plan']) {
  test(`unverified price in ${field} is rejected without losing selected-model price card`, async () => {
    const result = await run({ customer_description: '大学生写论文，使用Word，担心电脑太重', model, budget: '7000' }, {
      generateCustomer: async () => ({ value: { [field]: '本店到手价￥1234.56，已经核实' }, meta }),
    });
    assert.equal(result.status, 'partial');
    assert.equal(result.solution.price_solution.minimum_price, 5899);
    assert.equal(result.solution.candidate_products.length, 0);
    const copy = { rationale: result.solution.rationale, sales_script: result.sales_script, objections: result.objection_responses, follow_up_plan: result.follow_up_plan };
    assert.doesNotMatch(JSON.stringify(copy), /1234\.56|已经核实/);
    assertGrounded(copy, []);
    assert.doesNotMatch(result.follow_up_plan[0].message_draft, /哪个软件/);
    assert.match(result.follow_up_plan[0].action, /已提供的软件不重复询问/);
  });
}

for (const scenario of [
  { name: 'no follow-up selected', input: { follow_up_days: [] }, expected: [] },
  { name: 'follow-up disabled despite default dates', input: { needs_follow_up: false, follow_up_days: [1, 3, 7] }, expected: [] },
  { name: 'selected dates normalized', input: { follow_up_days: ['7', 1, 1, 2, 'invalid'] }, expected: [1, 7] },
]) {
  test(`demo: ${scenario.name}`, async () => {
    const result = await run({ customer_description: '学生写论文', model, ...scenario.input });
    assert.deepEqual(result.follow_up_plan.map((entry) => entry.day), scenario.expected);
  });
}

test('budget conflict fallback offers alternatives without urging a budget increase', async () => {
  const result = await run({ customer_description: '大学生写论文', model, budget: '3000' }, {
    generateCustomer: async () => ({ value: { rationale: '最低价9999元' }, meta }),
  });
  assert.match(result.follow_up_plan[1].message_draft, /预算守住|预算内替代/);
  assert.doesNotMatch(result.follow_up_plan[1].message_draft, /提高预算|分期|已经核实/);
  assert.match(result.follow_up_plan[2].action, /已成交|仍在比较|拒绝|未回复/);
});

test('network retrieval warning preserves local price and safe follow-up', async () => {
  const result = await run({ customer_description: '学生写论文', model, budget: '7000' }, {
    retrieveEvidence: async () => { throw new Error('演示联网检索不可用'); },
    generateCustomer: async () => ({ value: { rationale: '现价1234元' }, meta }),
  });
  assert.equal(result.status, 'partial');
  assert.equal(result.solution.price_solution.minimum_price, 5899);
  assert.equal(result.follow_up_plan.length, 3);
  assert.match(result.guardrails.retrieval_warning, /联网检索不可用/);
  assert.doesNotMatch(JSON.stringify(result.sales_script), /1234/);
});
