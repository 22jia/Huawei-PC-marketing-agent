const test = require('node:test');
const assert = require('node:assert/strict');
const { assistCustomer: runAssist, inferCustomer } = require('../services/api/src/agent/customerAgent.cjs');

// Deterministic model doubles: production never falls back to these templates.
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
