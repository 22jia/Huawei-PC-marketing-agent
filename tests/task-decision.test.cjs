const test = require('node:test');
const assert = require('node:assert/strict');
const { generate } = require('../services/api/src/agent/taskAgent.cjs');
const { planContent } = require('../services/api/src/clients/llmClient.cjs');
const task = { model: '测试型号', audience: '学生', scenario: '课堂', goal: '到店', platform: 'wechat', requirements: ['续航100小时'] };
const evidence = [{ title: '产品规格', source_path: 'P1-test', source_status: 'local_snapshot', content: '目标配置续航约8小时。' }];
const issue = { kind: 'conflict', requirement: '续航100小时', reason: '目标配置原文为约8小时', references: [{ evidence_id: 'E1', quote: evidence[0].content }] };
const meta = { model: 'test', duration_ms: 1 };
const options = {
  planTask: async () => ({ value: { retrieval_queries: ['测试型号'], task_updates: {} }, meta }),
  retrieveEvidence: async () => ({ evidence }), creativeAssets: () => [],
  planContent: async () => ({ value: { requirement_issues: [issue] }, meta }),
  generateCopy: async () => { throw new Error('must wait for decision'); },
};

test('planner safely converts existing quote IDs used as document IDs without a retry', async () => {
  let calls = 0;
  const value = { angle: '选择', reader_tension: '课堂', platform_reason: '说明', outline: ['选择'], evidence_ids: ['E1Q1', 'E1'], fact_points: [], conflicts: [], requirement_issues: [], image_plan: [], asset_gap: '' };
  const result = await planContent({ task, evidence, platform: {}, analysis: {}, assets: [] }, { fetch: async () => { calls++; return { ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify(value) } }] }) }; } });
  assert.deepEqual(result.value.evidence_ids, ['E1']);
  assert.equal(calls, 1);
});

test('invalid document IDs receive field-specific retry feedback and error details', async () => {
  let calls = 0;
  const value = { angle: '选择', reader_tension: '课堂', platform_reason: '说明', outline: ['选择'], evidence_ids: ['E1Q999'], fact_points: [], conflicts: [], requirement_issues: [], image_plan: [], asset_gap: '' };
  await assert.rejects(planContent({ task, evidence, platform: {}, analysis: {}, assets: [] }, { fetch: async (_url, request) => {
    if (++calls === 2) assert.match(JSON.parse(request.body).messages[1].content, /evidence_ids.*E1Q999/);
    return { ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify(value) } }] }) };
  } }), error => error.code === 'LLM_INVALID_SCHEMA' && error.details.schema_issues.some(issue => issue.field === 'evidence_ids'));
  assert.equal(calls, 2);
});

test('requirements conflicting with evidence return a concrete user decision before writing', async () => {
  const result = await generate(task, options);
  assert.equal(result.status, 'needs_confirmation');
  assert.equal(result.decision_required.questions[0].sources[0].quote, evidence[0].content);
  assert.match(result.reply, /续航100小时/);
  assert.match(result.reply, /约8小时/);
  assert.match(result.reply, /修改或删除/);
  assert.equal(result.content, undefined);
});

test('missing support is distinguished from a contradictory fact', async () => {
  const result = await generate(task, { ...options, planContent: async () => ({ value: { requirement_issues: [{ ...issue, kind: 'unsupported', references: [], reason: '本次未找到续航依据' }] }, meta }) });
  assert.match(result.reply, /不代表产品一定不具备/);
  assert.doesNotMatch(result.reply, /存在冲突/);
});

test('user decision updates requirements and resumes evidence checking', async () => {
  const first = await generate(task, options);
  let checked = false;
  const result = await generate({ ...task, history: [{ role: 'assistant', content: first.reply }, { role: 'user', content: '删除续航要求，继续' }] }, {
    ...options,
    planTask: async ({ history }) => { assert.match(history.at(-1).content, /删除续航/); return { value: { retrieval_queries: ['测试型号'], task_updates: { requirements: [] } }, meta }; },
    creativeAssets: () => [{ id: 'image', model: '测试型号', source_url: 'https://consumer.huawei.com/' }],
    planContent: async ({ task }) => { checked = true; assert.deepEqual(task.requirements, []); return { value: { requirement_issues: [], conflicts: [], image_plan: [{ asset_id: 'image', placement: 'cover', after_paragraph: 0, caption: '产品外观', purpose: '封面' }] }, meta }; },
    generateCopy: async () => ({ content: { title: '课堂选购', lead: '带上课程资料。', body: '现场打开课件，确认是否符合你的使用习惯。', cta: '到店体验', hashtags: [] }, meta }),
    reviewCopy: async () => ({ value: { passed: true, issues: [], revision_instructions: [] }, meta }),
  });
  assert.equal(checked, true);
  assert.equal(result.decision_required, undefined);
  assert.ok(result.content.body);
});

test('an unchanged requirement is checked again after a vague continue reply', async () => {
  const result = await generate({ ...task, history: [{ role: 'user', content: '继续' }] }, options);
  assert.equal(result.status, 'needs_confirmation');
  assert.equal(result.content, undefined);
});

test('requirement decisions reject fabricated requirements and unreferenced contradictions', async () => {
  const base = { angle: '选择', reader_tension: '课堂', platform_reason: '说明', outline: ['选择'], evidence_ids: ['E1'], fact_points: [], conflicts: [], image_plan: [], asset_gap: '' };
  for (const invalid of [{ ...issue, requirement: '用户没有提出的要求' }, { ...issue, references: [] }]) {
    await assert.rejects(planContent({ task, evidence, platform: {}, analysis: {}, assets: [] }, { fetch: async () => ({ ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify({ ...base, requirement_issues: [invalid] }) } }] }) }) }), { code: 'LLM_INVALID_SCHEMA' });
  }
});

test('requirement quote IDs resolve to server-held originals', async () => {
  const value = { angle: '选择', reader_tension: '课堂', platform_reason: '说明', outline: ['选择'], evidence_ids: ['E1'], fact_points: [], conflicts: [], image_plan: [], asset_gap: '', requirement_issues: [{ ...issue, references: [{ evidence_id: 'E1', quote_id: 'E1Q1' }] }] };
  const result = await planContent({ task, evidence, platform: {}, analysis: {}, assets: [] }, { fetch: async () => ({ ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify(value) } }] }) }) });
  assert.equal(result.value.requirement_issues[0].references[0].quote, evidence[0].content);
});

test('planner rejects invented quotations in requirement conflicts', async () => {
  const strategy = { angle: '选择', reader_tension: '课堂', platform_reason: '说明', outline: ['选择'], evidence_ids: ['E1'], fact_points: [], conflicts: [], image_plan: [], asset_gap: '', requirement_issues: [{ ...issue, references: [{ evidence_id: 'E1', quote: '产品续航已经验证为100小时' }] }] };
  await assert.rejects(planContent({ task, evidence, platform: {}, analysis: {}, assets: [] }, { fetch: async () => ({ ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify(strategy) } }] }) }) }), { code: 'UNSUPPORTED_CITATION' });
});
