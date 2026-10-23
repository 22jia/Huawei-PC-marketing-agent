const test = require('node:test');
const assert = require('node:assert/strict');
const { generate } = require('../services/api/src/agent/taskAgent.cjs');
const { getSpotlightProducts } = require('../services/api/src/services/productSpotlight.cjs');

test('natural conversation asks only the planner-selected missing detail without retrieving or drafting', async () => {
  const question = { field: 'platform', question: '你打算把这篇文案发在哪里？', options: ['小红书', '朋友圈', '公众号'] };
  const result = await generate({ history: [{ role: 'user', content: '帮我给大学生写一篇 MateBook 14 文案' }] }, {
    planTask: async () => ({ value: { intent: 'generate', needs_evidence: true, task_updates: { model: 'HUAWEI MateBook 14', audience: '大学生' }, clarification: question }, meta: {} }),
    retrieveEvidence: async () => { throw new Error('must wait for clarification'); },
  });
  assert.equal(result.status, 'needs_clarification');
  assert.deepEqual(result.task.questions, [question]);
  assert.doesNotMatch(result.reply, /小红书/);
  assert.equal(result.task.scenario, '');
});

test('clarification cannot replace a missing field with a question about an already confirmed field', async () => {
  const result = await generate({ model: 'MateBook 14', history: [{ role: 'user', content: '帮我写文案' }] }, {
    planTask: async () => ({ value: { intent: 'generate', needs_evidence: true, task_updates: {}, clarification: { field: 'model', question: '哪款产品？' } }, meta: {} }),
  });
  assert.equal(result.task.questions.length, 1);
  assert.notEqual(result.task.questions[0].field, 'model');
  assert.doesNotMatch(result.reply, /请补充 audience/);
});

test('explicit audience in the opening request is remembered before planner clarification', async () => {
  const result = await generate({
    history: [{ role: 'user', content: '为准备开学购机的大学新生生成小红书图文，重点讲学习、携带和续航' }],
  }, {
    planTask: async () => ({ value: {
      intent: 'generate', needs_evidence: true, task_updates: { model: 'HUAWEI MateBook GT 14' },
      clarification: { field: 'audience', question: '这篇内容主要想写给谁？' },
    }, meta: {} }),
  });
  assert.equal(result.task.audience, '准备开学购机的大学新生');
  assert.notEqual(result.task.questions[0].field, 'audience');
});

test('customer assistance is routed into conversational clarification before evidence retrieval', async () => {
  let retrieved = false;
  const result = await generate({
    history: [{ role: 'user', content: '客户是大学生，在图书馆写论文，担心电脑太重' }],
  }, {
    planTask: async () => ({ value: {
      intent: 'customer_assist', needs_evidence: true, audience: '学生', needs: ['学习与校园场景'], concerns: ['担心携带负担'], buying_stage: '比较评估', summary: '学生需要轻便学习电脑', retrieval_queries: ['MateBook 14'], task_updates: {}, clarification: null,
    }, meta: { model: 'test-model' } }),
    retrieveEvidence: async () => { retrieved = true; throw new Error('interactive flow should clarify first'); },
  });
  assert.equal(result.status, 'needs_clarification');
  assert.equal(result.result_type, 'customer_assist');
  assert.match(result.reply, /预算/);
  assert.equal(result.conversation_mode, 'customer');
  assert.equal(retrieved, false);
});

test('explicitly declining copywriting keeps customer assistance out of the article workflow', async () => {
  const result = await generate({ history: [{ role: 'user', content: '不是写软文，我是华为门店店员，客户是大学生，在图书馆写论文，担心电脑太重，请给我成交建议' }] }, {
    planTask: async () => ({ value: { intent: 'customer_assist', needs_evidence: true, audience: '学生', needs: ['学习'], concerns: [], buying_stage: '比较评估', summary: '学生选购电脑', retrieval_queries: [], task_updates: {}, clarification: null }, meta: { model: 'test-model' } }),
    recommendProductsForScenario: () => { throw new Error('must not enter article product selection'); },
    retrieveEvidence: async () => { throw new Error('should ask for missing budget first'); },
  });
  assert.equal(result.result_type, 'customer_assist');
  assert.match(result.reply, /预算/);
});

test('open-ended planning requests get a conversational answer without soft-copy fields', async () => {
  const result = await generate({
    history: [{ role: 'user', content: '我想给内容创作加一个生图子 Agent，工程上应该怎么接？' }],
  }, {
    planTask: async () => ({ value: {
      intent: 'answer', needs_evidence: false, audience: '', needs: [], concerns: [], buying_stage: '', summary: '讨论子 Agent 接入方案', retrieval_queries: [], task_updates: {}, clarification: null,
    }, meta: { model: 'test-model' } }),
    retrieveEvidence: async () => { throw new Error('exploratory discussion should not retrieve product facts'); },
    generateCopy: async () => { throw new Error('exploratory discussion should not draft a post'); },
    generateReply: async ({ task }) => ({ reply: `可以先定义子 Agent 接口。当前产品型号：${task.model || '未指定'}`, meta: { model: 'test-model' } }),
  });
  assert.equal(result.result_type, 'answer');
  assert.match(result.reply, /定义子 Agent 接口/);
  assert.equal(result.task.model, '');
});

test('answer replies expose guided choices separately from the text prompt', async () => {
  const choices = ['小红书', '朋友圈'];
  const result = await generate({
    history: [{ role: 'user', content: '我还没想好发哪个平台' }],
  }, {
    planTask: async () => ({ value: {
      intent: 'answer', needs_evidence: false, audience: '', needs: [], concerns: [], buying_stage: '', summary: '选择发布平台', retrieval_queries: [], task_updates: {}, clarification: null,
    }, meta: { model: 'test-model' } }),
    generateReply: async () => ({ reply: '这篇内容你更想发到哪里？', options: choices, meta: { model: 'test-model' } }),
  });
  assert.equal(result.reply, '这篇内容你更想发到哪里？');
  assert.deepEqual(result.quick_replies, choices);
});

test('scenario-first copy requests return knowledge-backed product choices instead of asking the store employee to name a model', async () => {
  let planned = false;
  const result = await generate({
    history: [{ role: 'user', content: '轻便易携带，减少出行负担' }],
  }, {
    planTask: async () => {
      planned = true;
      return { value: { intent: 'generate', needs_evidence: true, task_updates: {}, clarification: { field: 'model', question: '想介绍哪款产品？' } }, meta: {} };
    },
  });
  assert.equal(planned, true);
  assert.equal(result.status, 'needs_clarification');
  assert.equal(result.task.content_flow, 'awaiting_product_confirmation');
  assert.match(result.task.scenario, /减少出行负担/);
  assert.ok(result.task.scenario_candidates.length > 0);
  assert.deepEqual(result.task.questions[0].options, result.task.scenario_candidates.map(item => item.name));
  assert.match(result.reply, /MateBook/);
  assert.doesNotMatch(result.reply, /请告诉我型号/);
  assert.match(result.reply, /推荐理由/);
  assert.doesNotMatch(result.reply, /产品资料列出的匹配任务/);
  assert.doesNotMatch(result.reply, /“.*”[；;]/);
  assert.ok(result.task.scenario_candidates.every(item => item.reason && item.matched_tasks?.length));
  assert.doesNotMatch(result.reply, /资料中.*明确列出/);
  const references = [...result.reply.matchAll(/\[(\d+)\]\(#knowledge\?path=([^\s)]+)\)/g)];
  assert.equal(references.length, result.task.scenario_candidates.length);
  const { readItem } = require('../services/api/src/services/localKnowledgeBrowser.cjs');
  references.forEach(([, number, encodedPath], index) => {
    assert.equal(Number(number), index + 1);
    const sourcePath = decodeURIComponent(encodedPath);
    assert.equal(sourcePath, result.task.scenario_candidates[index].source_path);
    assert.ok(readItem(`local:${sourcePath}`).content.length > 0);
  });
});

test('a store employee scenario copy request stays in content creation even if the planner misclassifies it as an answer', async () => {
  const result = await generate({
    history: [{ role: 'user', content: '我是华为门店员工，想给出差办公的人写一篇轻便电脑推荐小红书软文' }],
  }, {
    planTask: async () => ({ value: {
      intent: 'answer', needs_evidence: false, task_updates: {}, clarification: null,
    }, meta: {} }),
  });
  assert.equal(result.result_type, 'product_selection');
  assert.doesNotMatch(result.task.audience, /门店员工/);
  assert.match(result.task.scenario, /出差办公/);
  assert.ok(result.task.scenario_candidates.length > 0);
  assert.match(result.reply, /MateBook/);
});

test('an explicit product model from the local catalog is remembered without starting scenario selection', async () => {
  const product = getSpotlightProducts().find(item => /MateBook 14/i.test(item.name));
  assert.ok(product, 'expected a MateBook 14 entry in the local catalog');
  const result = await generate({
    history: [{ role: 'user', content: `我是华为门店员工，帮大学生写一篇${product.name}的小红书软文` }],
  }, {
    planTask: async task => {
      assert.equal(task.model, product.name);
      assert.equal(task.audience, '大学生');
      return { value: { intent: 'generate', needs_evidence: true, task_updates: {}, clarification: { field: 'platform', question: '发在哪个平台？' } }, meta: {} };
    },
  });
  assert.equal(result.task.model, product.name);
  assert.equal(result.task.content_flow, 'collecting_copy_details');
  assert.notEqual(result.result_type, 'product_selection');
});

test('brand answer continues the saved scenario selection instead of restarting model discovery', async () => {
  const result = await generate({
    scenario: '出差办公，轻便易携带，减少出行负担',
    content_flow: 'awaiting_product_confirmation',
    scenario_candidates: [{ name: 'HUAWEI MateBook 14', positioning: '轻薄便携', reason: '适合移动办公', source_path: 'P1/产品事实.md' }],
    history: [
      { role: 'user', content: '出差办公，轻便易携带' },
      { role: 'assistant', content: '我会先筛选几款型号，你偏好什么品牌？' },
      { role: 'user', content: '华为' },
    ],
  }, {
    planTask: async () => { throw new Error('brand clarification should use saved selection state'); },
  });
  assert.equal(result.status, 'needs_clarification');
  assert.equal(result.task.content_flow, 'awaiting_product_confirmation');
  assert.match(result.reply, /HUAWEI MateBook 14/);
  assert.match(result.reply, /选择|回复/);
});

test('choosing a recommended model advances to copy details without asking for the model again', async () => {
  const result = await generate({
    scenario: '出差办公，轻便易携带',
    content_flow: 'awaiting_product_confirmation',
    scenario_candidates: [{ name: 'HUAWEI MateBook 14', positioning: '轻薄便携', reason: '适合移动办公', source_path: 'P1/产品事实.md' }],
    history: [
      { role: 'user', content: '出差办公，轻便易携带' },
      { role: 'assistant', content: '推荐：1. HUAWEI MateBook 14' },
      { role: 'user', content: '1' },
    ],
  }, {
    planTask: async (task) => {
      assert.equal(task.model, 'HUAWEI MateBook 14');
      return { value: { intent: 'generate', needs_evidence: true, task_updates: {}, clarification: { field: 'platform', question: '准备发布在哪个平台？', options: ['小红书', '朋友圈'] } }, meta: {} };
    },
  });
  assert.equal(result.task.model, 'HUAWEI MateBook 14');
  assert.equal(result.task.content_flow, 'collecting_copy_details');
  assert.equal(result.task.questions[0].field, 'platform');
});

test('a pure model choice preserves the variant and reaches retrieval without a redundant planner call', async () => {
  let retrieved = false;
  const result = await generate({
    audience: '办公人群', scenario: '办公', goal: '写产品推荐软文', platform: 'xiaohongshu',
    content_flow: 'awaiting_product_confirmation',
    scenario_candidates: [{ name: 'HUAWEI MateBook D 14 2024', positioning: '普通办公' }],
    history: [{ role: 'user', content: 'HUAWEI MateBook D 14 2024标准版' }],
  }, {
    planTask: async () => { throw new Error('redundant planner must not run'); },
    retrieveEvidence: async model => {
      retrieved = true;
      assert.equal(model, 'HUAWEI MateBook D 14 2024标准版');
      return { evidence: [] };
    },
  });
  assert.equal(retrieved, true);
  assert.equal(result.task.model, 'HUAWEI MateBook D 14 2024标准版');
  assert.equal(result.task.content_flow, 'collecting_copy_details');
});

test('a model choice with additional instructions still uses the planner', async () => {
  let planned = false;
  await generate({
    scenario: '办公', content_flow: 'awaiting_product_confirmation',
    scenario_candidates: [{ name: 'HUAWEI MateBook D 14 2024', positioning: '普通办公' }],
    history: [{ role: 'user', content: 'HUAWEI MateBook D 14 2024，改发朋友圈，不要写价格' }],
  }, {
    planTask: async task => {
      planned = true;
      assert.match(task.history.at(-1).content, /改发朋友圈/);
      return { value: { intent: 'generate', task_updates: { platform: 'wechat_moments' } }, meta: {} };
    },
  });
  assert.equal(planned, true);
});
