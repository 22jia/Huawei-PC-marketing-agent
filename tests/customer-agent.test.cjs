const test = require('node:test');
const assert = require('node:assert/strict');
const { assistCustomer: runAssist, inferCustomer } = require('../services/api/src/agent/customerAgent.cjs');

// Deterministic model doubles: production never falls back to these templates.
test('customer generation publishes its stage and receives the cancellation signal', async () => {
  const controller = new AbortController();
  const progress = [];
  await assert.rejects(() => assistCustomer({ customer_description: '大学生写论文', model: 'HUAWEI MateBook 14' }, {
    signal: controller.signal,
    onProgress: event => progress.push(`${event.stage}:${event.status}`),
    retrieveEvidence: async () => ({ evidence: [] }),
    generateCustomer: async (_, options) => {
      assert.equal(options.signal, controller.signal);
      controller.abort();
      options.signal.throwIfAborted();
    },
  }), { name: 'AbortError' });
  assert.deepEqual(progress, ['retrieval:started', 'retrieval:success', 'generateReply:started', 'generateReply:failed']);
});

function assistCustomer(input, options = {}) {
  return runAssist(input, {
    planTask: async (task) => { const insight = inferCustomer(task.customer_description); return { value: { ...insight, summary: '学生关注便携', retrieval_queries: insight.evidence_queries }, meta: { model: 'test-model' } }; },
    generateCustomer: async ({ task }) => ({ value: {
      questions: [], rationale: '根据实际软件和预算确认配置。',
      sales_script: { opening: '您关注便携，对吗？', recommendation: '先试用再比较。', close: '欢迎到店体验。' },
      objection_responses: [{ objection: '担心电脑太重', response: '建议实际装包体验。' }],
      follow_up_plan: task.follow_up_days.map((day) => ({ day, objective: '确认需求', action: '核对软件', message_draft: '您常用哪些软件？' })),
    }, meta: { model: 'test-model' } }),
    ...options,
  });
}

test('customer assist returns insight, evidence references, scripts, objections and follow-up plan', async () => {
  const result = await assistCustomer({
    customer_description: '大学生在图书馆写论文，担心电脑太重，已有华为手机，希望传文件方便',
    model: 'HUAWEI MateBook 14',
  }, {
    retrieveEvidence: async () => ({ evidence: [{
      title: 'MateBook 14 产品资料',
      source_path: '产品资料/MateBook14.md',
      content: '具体配置以官方产品页为准。',
      confidence: 'high',
    }] }),
  });

  assert.equal(result.status, 'success');
  assert.equal(result.customer.audience, '学生');
  assert.ok(result.customer.needs.includes('关注便携与移动使用'));
  assert.equal(result.solution.status, 'needs_staff_confirmation');
  assert.equal(result.solution.evidence[0].source_path, '产品资料/MateBook14.md');
  assert.ok(result.sales_script.opening.includes('便携'));
  assert.ok(result.objection_responses.some((item) => item.objection === '担心电脑太重'));
  assert.deepEqual(result.follow_up_plan.map((item) => item.day), [1, 3, 7]);
  assert.equal(result.guardrails.automatic_message_sending, false);
});

test('customer assist avoids a specific recommendation when evidence is unavailable', async () => {
  const result = await assistCustomer({ customer_description: '想买电脑，担心价格太贵' }, {
    retrieveEvidence: async () => ({ evidence: [] }),
  });

  assert.equal(result.solution.status, 'insufficient_evidence');
  assert.equal(result.solution.model, null);
  assert.equal(result.guardrails.price_promises_allowed, false);
  assert.equal(result.clarification.required_before_specific_recommendation, true);
});

test('customer assist reports a partial result when ima source material is temporarily unavailable', async () => {
  const result = await assistCustomer({ customer_description: '学生担心电脑太重', model: 'HUAWEI MateBook 14' }, {
    retrieveEvidence: async () => ({ evidence: [{
      title: 'MateBook 14 产品资料',
      content: '',
      confidence: 'unavailable',
      warning: '原文获取次数已达上限，请明天再尝试',
    }] }),
  });

  assert.equal(result.status, 'partial');
  assert.equal(result.solution.status, 'insufficient_evidence');
  assert.match(result.guardrails.retrieval_warning, /次数已达上限/);
});

test('customer assist asks for a description when input is empty', async () => {
  const result = await assistCustomer({});
  assert.equal(result.status, 'needs_clarification');
  assert.equal(result.code, 'MISSING_CUSTOMER_DESCRIPTION');
});

test('interactive customer assist asks one missing question before retrieval or drafting', async () => {
  let retrieved = false;
  let drafted = false;
  const result = await runAssist({ customer_description: '大学生，常在图书馆写论文，担心电脑太重' }, {
    interactive: true,
    planTask: async () => ({ value: { ...inferCustomer('大学生，常在图书馆写论文，担心电脑太重'), summary: '学生在图书馆写论文', retrieval_queries: [] }, meta: { model: 'test-model' } }),
    retrieveEvidence: async () => { retrieved = true; return { evidence: [] }; },
    generateCustomer: async () => { drafted = true; throw new Error('draft should not run before clarification'); },
  });

  assert.equal(result.status, 'needs_clarification');
  assert.equal(result.clarification.questions.length, 1);
  assert.match(result.clarification.questions[0], /预算/);
  assert.equal(retrieved, false);
  assert.equal(drafted, false);
});

test('interactive customer assist stops for an ambiguous product version before drafting', async () => {
  let drafted = false;
  const result = await runAssist({ customer_description: '大学生写论文，预算 8000 元，已有华为手机', model: 'HUAWEI MateBook 14' }, {
    interactive: true,
    planTask: async () => ({ value: { ...inferCustomer('大学生使用 MateBook 14 写论文，预算 8000 元'), summary: '学生选购电脑', retrieval_queries: ['MateBook 14'] }, meta: { model: 'test-model' } }),
    retrieveEvidence: async () => ({ evidence: [], ambiguous_model: true, model_candidates: ['MateBook 14（鸿蒙版）', 'MateBook 14 酷睿 Ultra'] }),
    generateCustomer: async () => { drafted = true; throw new Error('draft should not run for ambiguous version'); },
  });
  assert.equal(result.status, 'needs_clarification');
  assert.match(result.clarification.questions[0], /鸿蒙版/);
  assert.equal(drafted, false);
});

test('customer assist asks the store staff to choose between local product variants', async () => {
  const result = await assistCustomer({
    customer_description: '学生，担心电脑太重',
    model: 'HUAWEI MateBook 14',
  }, {
    retrieveEvidence: async () => ({
      evidence: [],
      ambiguous_model: true,
      model_candidates: ['MateBook 14（鸿蒙版）', 'MateBook 14 酷睿 Ultra'],
    }),
  });

  assert.equal(result.solution.status, 'needs_model_clarification');
  assert.match(result.solution.rationale, /多个同系列版本/);
  assert.ok(result.clarification.questions.some((item) => /鸿蒙版/.test(item)));
  assert.equal(result.solution.candidate_models.length, 2);
});

test('customer assist ranks in-budget scenario candidates ahead of closer but over-budget matches', async () => {
  const { assistCustomer } = require('../services/api/src/agent/customerAgent.cjs');
  const products = [
    { name: '高价强匹配', positioning: '轻薄旗舰', suitable_tasks: ['轻薄便携'], source_path: 'a.md', reason: '轻薄旗舰' },
    { name: '预算内匹配', positioning: '轻便学习本', suitable_tasks: ['学习办公'], source_path: 'b.md', reason: '适合学习' },
  ];
  const result = await runAssist({ customer_description: '学生，日常学习办公，关注轻便', budget: '7000' }, {
    planTask: async (task) => { const insight = inferCustomer(task.customer_description); return { value: { ...insight, summary: '', retrieval_queries: insight.evidence_queries }, meta: { model: 'test-model' } }; },
    generateCustomer: async ({ task }) => ({ value: {
      questions: [], rationale: '按预算和用途比较。',
      sales_script: { opening: '明白。', recommendation: '先看预算内候选。', close: '您更倾向哪款？' },
      objection_responses: [], follow_up_plan: [],
    }, meta: { model: 'test-model' } }),
    retrieveEvidence: async () => ({ evidence: [] }),
    recommendProductsForScenario: () => products,
    buildPriceSolution: (model) => model === '预算内匹配'
      ? { status: 'available', budget_status: 'within_budget', minimum_price: 6500 }
      : { status: 'available', budget_status: 'over_budget', minimum_price: 9000, budget_gap: 2000 },
  });

  assert.equal(result.solution.candidate_products[0].model, '预算内匹配');
  assert.equal(result.solution.candidate_products.length, 1);
  assert.equal(result.clarification.required_before_specific_recommendation, false);
  assert.ok(!result.clarification.questions.some((item) => /预算是多少|哪一款|价位段/.test(item)));
});

test('source-backed recommendations survive rejected generated claims without exposing them', async () => {
  const result = await assistCustomer({ customer_description: '学生学习办公', budget: '7000' }, {
    retrieveEvidence: async () => ({ evidence: [] }),
    recommendProductsForScenario: () => [{ name: '学习本', positioning: '学习办公', suitable_tasks: ['学习'], source_path: 'product.md' }],
    buildPriceSolution: () => ({ status: 'available', budget_status: 'within_budget', budget: 7000, configurations: [{ configuration: '16GB/512GB', price: 6000 }] }),
    generateCustomer: async () => ({ value: { questions: [], rationale: '保证兼容，续航99小时', sales_script: {}, objection_responses: [], follow_up_plan: [] }, meta: { model: 'test-model' } }),
  });
  assert.equal(result.status, 'partial');
  assert.equal(result.solution.candidate_products[0].recommended_configuration.price, 6000);
  assert.doesNotMatch(JSON.stringify(result), /保证兼容|99小时/);
});

test('follow-up fallback stays specific to day and customer concern', async () => {
  const { buildFollowUpPlan } = require('../services/api/src/agent/customerAgent.cjs');
  const result = buildFollowUpPlan([1, 3, 7], { needs: ['关注便携与移动使用'], concerns: ['担心携带负担'] }, { model: 'MateBook 14' });
  assert.deepEqual(result.map((item) => item.day), [1, 3, 7]);
  assert.match(result[0].message_draft, /软件|系统要求/);
  assert.match(result[1].message_draft, /拿起来|装包|可用优惠/);
  assert.match(result[2].message_draft, /按自己的节奏|仍没确认/);
  assert.notEqual(result[0].action, result[0].message_draft);
});

test('rejected price claim still returns a usable result without candidate cards', async () => {
  const result = await assistCustomer({ customer_description: '客户想买电脑，预算7000元', model: '已选型号' }, {
    retrieveEvidence: async () => ({ evidence: [{ title: '产品事实', content: '事实', confidence: 'high' }] }),
    buildPriceSolution: () => ({ status: 'unavailable', model: '已选型号', tiers: [] }),
    generateCustomer: async () => ({ value: { questions: [], rationale: '价格为6999元', sales_script: { opening: '您好', recommendation: '价格为6999元', close: '欢迎到店' }, objection_responses: [], follow_up_plan: [1, 3, 7].map((day) => ({ day, objective: '确认', action: '核对', message_draft: '价格为6999元' })) }, meta: { model: 'test-model' } }),
  });
  assert.equal(result.status, 'partial');
  assert.equal(result.solution.price_solution.status, 'unavailable');
  assert.doesNotMatch(JSON.stringify(result), /6999/);
  assert.equal(result.follow_up_plan.length, 3);
});

test('over-budget intent produces concrete in-budget alternatives with configuration and price gap', async () => {
  const products = [
    { name: '意向型号', positioning: '旗舰', suitable_tasks: ['学生学习'], source_path: 'intent.md', reason: '同名应排除' },
    { name: '预算替代 A', positioning: '轻便学习', suitable_tasks: ['学生学习'], source_path: 'a.md', reason: '较轻' },
    { name: '预算替代 B', positioning: '基础学习', suitable_tasks: ['学生学习'], source_path: 'b.md', reason: '价格更低' },
  ];
  const priceData = {
    '意向型号': { status: 'available', budget_status: 'over_budget', minimum_price: 9000, minimum_configuration: '32GB/1TB', budget_gap: 2000 },
    '预算替代 A': { status: 'available', budget_status: 'within_budget', budget: 7000, configurations: [{ configuration: '16GB/512GB', price: 6800 }, { configuration: '24GB/512GB', price: 7000 }] },
    '预算替代 B': { status: 'available', budget_status: 'within_budget', budget: 7000, configurations: [{ configuration: '16GB/512GB', price: 5900 }] },
  };
  const result = await assistCustomer({ customer_description: '学生在图书馆学习，关注轻便', model: '意向型号', budget: '7000' }, {
    retrieveEvidence: async () => ({ evidence: [{ title: '意向产品资料', content: '事实', confidence: 'high' }] }),
    recommendProductsForScenario: () => products,
    buildPriceSolution: (model) => priceData[model] || null,
  });
  assert.equal(result.solution.recommendation_stage, 'budget_alternatives');
  assert.equal(result.solution.price_solution.minimum_price, 9000);
  assert.deepEqual(result.solution.candidate_products.map((item) => item.model), ['预算替代 A', '预算替代 B']);
  assert.equal(result.solution.candidate_products[0].recommended_configuration.configuration, '24GB/512GB');
  assert.equal(result.solution.candidate_products[0].recommended_configuration.price, 7000);
  assert.equal(result.solution.candidate_products[0].comparison.saving, 2000);
  assert.equal(result.solution.candidate_products[1].recommended_configuration.configuration, '16GB/512GB');
});
