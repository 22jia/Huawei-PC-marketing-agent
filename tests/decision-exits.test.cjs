const test = require('node:test');
const assert = require('node:assert/strict');
const { generateCopy, reviewCopy } = require('../services/api/src/clients/llmClient.cjs');
const { generate } = require('../services/api/src/agent/taskAgent.cjs');
const task = { audience: '学生', scenario: '课堂', goal: '到店', platform: 'wechat', model: '测试型号', requirements: ['续航100小时'], image_count: 1 };
const evidence = [{ title: '规格', source_status: 'local_snapshot', content: '目标配置续航约8小时。' }];
const decision = { action: 'ask_user', requirement_issues: [{ kind: 'conflict', requirement: '续航100小时', reason: '原文是约8小时', references: [{ evidence_id: 'E1', quote_id: 'E1Q1' }] }] };
const provider = value => ({ fetch: async () => ({ ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify(value) } }] }) }) });
test('writer and reviewer can request a decision using verified requirements and references', async () => {
  for (const fn of [generateCopy, reviewCopy]) {
    const result = await fn({ task, evidence }, provider(decision));
    assert.equal(result.value.action, 'ask_user');
    assert.equal(result.value.requirement_issues[0].references[0].quote, evidence[0].content);
    const invalid = { ...decision, requirement_issues: [{ ...decision.requirement_issues[0], references: [{ evidence_id: 'E1', quote_id: 'E1Q999' }] }] };
    await assert.rejects(fn({task,evidence},provider(invalid)), {code:'UNSUPPORTED_CITATION'});
  }
});
test('a decision during writing or review returns a question without delivering or retrying the draft', async () => {
  for (const phase of ['writing', 'review']) {
    let drafts = 0;
    const options = {
      planTask: async () => ({ value: { task_updates: {}, retrieval_queries: [] }, meta: {} }),
      retrieveEvidence: async () => ({ evidence }),
      creativeAssets: () => [{ id: 'image' }],
      planContent: async () => ({ value: { image_plan: [{asset_id:'image',placement:'cover',after_paragraph:0,caption:'外观',purpose:'封面'}], fact_points: [], requirement_issues: [] }, meta: {} }),
      generateCopy: async () => { drafts++; return phase === 'writing' ? {value:decision,meta:{}} : {content:{title:'选择',body:'现场体验',lead:'课堂',cta:'到店'},meta:{}}; },
      reviewCopy: async () => ({value:decision,meta:{}}),
    };
    const result = await generate(task, options);
    assert.equal(result.status, 'needs_confirmation');
    assert.equal(result.content, undefined);
    assert.equal(drafts, 1);
    assert.match(result.reply, /约8小时/);
  }
});
