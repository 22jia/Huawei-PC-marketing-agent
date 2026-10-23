const test = require('node:test');
const assert = require('node:assert/strict');
const { generate } = require('../services/api/src/agent/taskAgent.cjs');
const { assistCustomer } = require('../services/api/src/agent/customerAgent.cjs');
const { requestJson, planContent, reviewCopy, generateCustomer, generateReply } = require('../services/api/src/clients/llmClient.cjs');
const task = { audience: '学生', scenario: '学习', goal: '到店', platform: 'xiaohongshu', model: 'MateBook 14 酷睿 Ultra', history: [{ role: 'assistant', content: '上一轮成稿' }, { role: 'user', content: '缩短一点' }] };
const meta = { model: 'test-model', duration_ms: 2, usage: { total_tokens: 10 } };
const plan = { value: { audience: '学生', needs: ['学习'], concerns: [], buying_stage: '比较', summary: '用于学习', retrieval_queries: ['学习 场景'] }, meta };
const evidence = [{ title: '产品事实', source_path: 'P1-产品参数库/产品事实.md', content: '屏幕\n14.2 英寸\n限定目标配置。', source_status: 'local_snapshot' }];
const editorialOptions = {
  creativeAssets: () => [{ id: 'test-image', url: '/api/v1/products/image?path=test.png', description: '官方产品图' }],
  planContent: async () => ({ value: { angle: '带着课件选电脑', reader_tension: '课堂任务', platform_reason: '场景建议', outline: ['任务', '选择'], evidence_ids: ['E1'], fact_points: [], conflicts: [], requirement_issues: [], image_plan: [{ asset_id: 'test-image', placement: 'cover', after_paragraph: 0, caption: '官方产品图', purpose: '封面' }], asset_gap: '' }, meta }),
  reviewCopy: async () => ({ value: { passed: true, platform_fit: '通过', issues: [], revision_instructions: [] }, meta }),
};
const options = { planTask: async () => plan, retrieveEvidence: async () => ({ evidence }), generateCopy: async ({ evidence: docs, history }) => { assert.match(docs[0].content, /14.2 英寸/); assert.equal(history[0].content, '上一轮成稿'); return { content: { title: '学习选购', body: '先用课件试用。', hashtags: [], cta: '到店体验' }, meta }; } };
Object.assign(options, editorialOptions);

test('successful review accepts explicit empty strings as empty lists without bypassing rejection', async () => {
  const provider = (passed) => ({ fetch: async () => ({ ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify({ passed, platform_fit: '符合', issues: [], revision_instructions: '' }) } }] }) }) });
  const context = { task, evidence, platform: {}, strategy: {}, content: { body: '文案' }, images: [] };
  const accepted = await reviewCopy(context, provider(true));
  assert.deepEqual(accepted.value.revision_instructions, []);
  await assert.rejects(reviewCopy(context, provider(false)), { code: 'LLM_INVALID_SCHEMA' });
});

test('customer output normalizes string follow-up days and filters unselected dates', async () => {
  const value = { questions: [], rationale: '按需求确认', sales_script: { opening: '您好', recommendation: '先试用', close: '欢迎到店' }, objection_responses: [], follow_up_plan: [1, 3, 7].map((day) => ({ day: String(day), objective: '确认需求', action: '核对软件', message_draft: '您常用什么软件？' })) };
  const result = await generateCustomer({ task: { follow_up_days: [1, 3] }, analysis: {}, evidence: [], ambiguous_model: false, model_candidates: [] }, { fetch: async () => ({ ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify(value) } }] }) }) });
  assert.deepEqual(result.value.follow_up_plan.map((item) => item.day), [1, 3]);
});

test('dialogue reply converts legacy numbered choices into structured quick replies', async () => {
  const saved = Object.fromEntries(['LLM_API_KEY', 'LLM_BASE_URL', 'LLM_MODEL'].map(key => [key, process.env[key]]));
  process.env.LLM_API_KEY = 'test-key';
  process.env.LLM_BASE_URL = 'https://llm.invalid/v1';
  process.env.LLM_MODEL = 'test-model';
  try {
    const reply = '你说的这个版本具体是哪款电脑的哪个版本？\n\n1. 我提供完整型号和版本\n2. 请先按出差办公需求帮我筛选型号\n\n可以选一项，也可以直接告诉我的想法。';
    const result = await generateReply({ task, analysis: {}, evidence: [], runtime: {} }, {
      fetch: async () => ({
        ok: true,
        headers: { get: () => null },
        text: async () => JSON.stringify({ choices: [{ message: { content: JSON.stringify({ reply, options: [] }) } }] }),
      }),
    });
    assert.equal(result.reply, '你说的这个版本具体是哪款电脑的哪个版本？');
    assert.deepEqual(result.options, ['我提供完整型号和版本', '请先按出差办公需求帮我筛选型号']);
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test('customer output gets one schema repair with concrete field feedback', async () => {
  let calls = 0;
  const complete = { questions: [], rationale: '根据图书馆学习场景，先核对软件和预算。', sales_script: { opening: '您主要用来写论文，对吗？', recommendation: '先带上常用文件试用。', close: '欢迎到店体验。' }, objection_responses: [], follow_up_plan: [1, 3, 7].map((day) => ({ day, objective: '确认需求', action: '核对软件', message_draft: '您常用哪些软件？' })) };
  const fetch = async (_url, request) => {
    calls++;
    const sent = JSON.parse(request.body).messages[1].content;
    if (calls === 2) assert.match(sent, /follow_up_plan 缺少所选日期/);
    const reply = calls === 1 ? { ...complete, follow_up_plan: complete.follow_up_plan.slice(0, 2) } : complete;
    return { ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify(reply) } }] }) };
  };
  const result = await generateCustomer({ task: { follow_up_days: [1, 3, 7] }, analysis: {}, evidence: [], ambiguous_model: false, model_candidates: [] }, { fetch });
  assert.equal(calls, 2);
  assert.equal(result.meta.attempts, 2);
  assert.equal(result.value.follow_up_plan.length, 3);
});

test('customer generation prompt keeps prices in the deterministic price panel', async () => {
  let prompt = '';
  const value = { questions: [], rationale: '按预算比较', sales_script: { opening: '您好', recommendation: '先看适合您的配置', close: '您可以先体验一下' }, objection_responses: [], follow_up_plan: [] };
  await generateCustomer({ task: { follow_up_days: [] }, analysis: {}, evidence: [], ambiguous_model: false, model_candidates: [] }, {
    fetch: async (_url, request) => {
      prompt = JSON.parse(request.body).messages[0].content;
      return { ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify(value) } }] }) };
    },
  });
  assert.match(prompt, /价格、预算金额、折扣、补贴金额和优惠后金额/);
  assert.match(prompt, /禁止.*任何.*元/);
});

test('missing evidence, conflicting facts and missing images stop article delivery', async () => {
  const mustNotGenerate = async () => { throw new Error('must not generate unsupported article'); };
  const missing = await generate(task, { ...options, retrieveEvidence: async () => ({ evidence: [] }), generateCopy: mustNotGenerate });
  assert.equal(missing.result_type, 'blocked');
  assert.equal(missing.content, undefined);
  const conflict = await generate(task, { ...options, planContent: async () => ({ value: { conflicts: [{ reason: '相同配置屏幕参数矛盾', references: [{ evidence_id: 'E1', quote: '原文甲' }, { evidence_id: 'E2', quote: '原文乙' }] }] }, meta }), generateCopy: mustNotGenerate });
  assert.equal(conflict.result_type, 'blocked');
  assert.match(conflict.reply, /相同配置屏幕参数矛盾/);
  assert.equal(conflict.content, undefined);
  const noImage = await generate(task, { ...options, planContent: async () => ({ value: { conflicts: [], requirement_issues: [], image_plan: [], asset_gap: '缺少同型号素材' }, meta }), generateCopy: mustNotGenerate });
  assert.equal(noImage.result_type, 'blocked');
  assert.match(noImage.reply, /缺少同型号素材/);
  assert.equal(noImage.content, undefined);
});
test('creation uses model planning, full evidence and previous drafts', async () => {
  const result = await generate(task, options);
  assert.equal(result.generation_mode, 'llm');
  assert.deepEqual(result.llm.stages.map((s) => s.stage), ['analysis', 'strategy', 'imageGeneration', 'generation', 'review']);
});

test('main agent shares the selected writing skill through planning, generation and review', async () => {
  const skills = [];
  const wrap = fn => async input => { skills.push(input.copywriting_skill); return fn(input); };
  const result = await generate(task, {
    ...options,
    planContent: wrap(options.planContent),
    generateCopy: wrap(options.generateCopy),
    reviewCopy: wrap(options.reviewCopy),
  });
  assert.equal(skills.length, 3);
  assert.ok(skills[0]);
  assert.ok(skills.every(skill => skill === skills[0]));
  assert.equal(result.writing_skill.name, 'platform-copywriting-skill');
  assert.equal(result.writing_skill.version, skills[0].version);
});
test('image agent receives confirmed product context and can replace planned assets', async () => {
  let received;
  const result = await generate(task, { ...options, imageAgent: async (input) => {
    received = input;
    return { status: 'success', provider: 'test-image-agent', images: [{ id: 'generated-cover', url: '/api/v1/generated-assets/generated-cover.png', description: '学生学习场景', model: task.model, source_url: 'https://consumer.huawei.com/', source_product_image: 'test-image', generated: true, placement: 'cover', after_paragraph: 0, caption: '学习场景', purpose: '封面' }], warnings: [] };
  } });
  assert.equal(received.task.model, task.model);
  assert.equal(received.task.audience, task.audience);
  assert.equal(received.platform.label, '小红书');
  assert.equal(received.evidence[0].title, evidence[0].title);
  assert.equal(result.images[0].id, 'generated-cover');
  assert.ok(result.llm.stages.some((stage) => stage.stage === 'imageGeneration'));
});

test('image agent failure falls back to the existing official product image', async () => {
  const result = await generate(task, { ...options, imageAgent: async () => { throw new Error('provider unavailable secret=do-not-show'); } });
  assert.equal(result.images[0].id, 'test-image');
  assert.ok(result.warnings.some((warning) => /图片生成子 Agent/.test(warning)));
  assert.doesNotMatch(result.warnings.join(' '), /do-not-show/);
});

test('generated image captions are corrected before review rather than stuck in copy-only repairs', async () => {
  let reviews = 0;
  const result = await generate(task, { ...options,
    imageAgent: async () => ({ status: 'success', provider: 'test', images: [{ id: 'ai-cover', url: '/api/v1/generated-assets/ai-cover.png', description: '产品配图', model: task.model, source_url: 'https://consumer.huawei.com/', source_product_image: 'test-image', generated: true, placement: 'cover', after_paragraph: 0, caption: '官方主视觉，作为文章封面呈现产品外观', purpose: '封面' }], warnings: [] }),
    reviewCopy: async ({ images }) => {
      reviews++;
      assert.doesNotMatch(images[0].caption, /官方主视觉|作为文章封面/);
      assert.match(images[0].caption, /AI 创意配图（非实拍）/);
      return editorialOptions.reviewCopy();
    },
  });
  assert.equal(reviews, 1);
  assert.equal(result.editorial_review.revision_count, 0);
  assert.match(result.images[0].caption, /非实拍/);
});

test('repair exhaustion keeps detailed review findings in diagnostics, not the chat message', async () => {
  await assert.rejects(generate(task, { ...options, repairPolicy: { maxRevisions: 0 },
    reviewCopy: async () => ({ value: { passed: false, issues: ['内部图注错误 E1Q9 generation_mode'], revision_instructions: ['修正图注'] }, meta }),
  }), error => {
    assert.equal(error.code, 'CONTENT_REVIEW_FAILED');
    assert.match(error.message, /运行日志/);
    assert.doesNotMatch(error.message, /E1Q9|generation_mode/);
    assert.match(error.details.diagnostic_message, /E1Q9/);
    assert.equal(error.details.repair_history.length, 1);
    return true;
  });
});

test('image cutout failure preserves a safe actionable reason through the main agent', async () => {
  const result = await generate(task, { ...options, imageAgent: async () => {
    throw Object.assign(new Error('secret provider details'), { code: 'IMAGE_CUTOUT_NOT_CONFIGURED' });
  } });
  assert.equal(result.images[0].generated, false);
  assert.ok(result.warnings.some(warning => /图片生成未完成.*IMAGE_CUTOUT_NOT_CONFIGURED.*尚未配置抠图服务/.test(warning)));
  assert.doesNotMatch(result.warnings.join(' '), /secret provider details/);
});
test('model failure is surfaced without template content', async () => {
  await assert.rejects(generate(task, { ...options, generateCopy: async () => { throw Object.assign(new Error('HTTP 429'), { code: 'LLM_HTTP_ERROR' }); } }), { code: 'LLM_HTTP_ERROR' });
  await assert.rejects(assistCustomer({ customer_description: '学生' }, { planTask: async () => { throw new Error('model unavailable'); } }), /model unavailable/);
});
test('unsupported product numbers block output instead of switching templates', async () => {
  await assert.rejects(generate(task, { ...options, generateCopy: async () => ({ content: { title: '学习', body: '配备99 GB内存', hashtags: [], cta: '到店' }, meta }) }), { code: 'UNSUPPORTED_CLAIM' });
});

test('OLED and colour gamut alone cannot support eye health promises', async () => {
  const { assertGrounded } = require('../services/api/src/agent/agentRuntime.cjs');
  assert.throws(() => assertGrounded('OLED屏幕保护你的眼睛，长时间使用不易疲劳。', [{ content: 'OLED屏幕，100% sRGB色域', source_status: 'local_snapshot' }]), { code: 'UNSUPPORTED_CLAIM' });
  assert.throws(() => assertGrounded('让你不再有视觉负担。', [{ content: 'OLED屏幕', source_status: 'local_snapshot' }]), { code: 'UNSUPPORTED_CLAIM' });
});

test('unsupported health copy is automatically rewritten with feedback before delivery', async () => {
  let calls = 0, reviews = 0;
  const r = await generate(task, { ...options,
    generateCopy: async ({ feedback, previous_content }) => {
      calls++;
      if (calls === 2) { assert.match(feedback.join(' '), /护眼/); assert.match(previous_content.body, /不易疲劳/); }
      return { content: { title: '选购', body: calls === 1 ? 'OLED屏幕让你不易疲劳。' : '带上课程报告，现场检查阅读和编辑体验。', cta: '到店体验', hashtags: [] }, meta };
    },
    reviewCopy: async () => { reviews++; return editorialOptions.reviewCopy(); },
  });
  assert.equal(calls, 2);
  assert.equal(reviews, 1);
  assert.equal(r.editorial_review.revision_count, 1);
  assert.equal(r.editorial_review.repair_history[0].code, 'UNSUPPORTED_CLAIM');
  assert.doesNotMatch(r.content.body, /不易疲劳/);
});

test('unchanged grounding failures stop after one ineffective revision without delivering bad copy', async () => {
  let calls = 0;
  await assert.rejects(generate(task, { ...options, generateCopy: async () => { calls++; return { content: { title: '选购', body: '保护你的眼睛', cta: '到店', hashtags: [] }, meta }; } }), { code: 'UNSUPPORTED_CLAIM' });
  assert.equal(calls, 2);
});

test('specific grounding feedback allows a third revision when the earlier issues change', async () => {
  let calls = 0;
  const result = await generate(task, { ...options, repairPolicy: { maxRevisions: 4 },
    generateCopy: async ({ feedback }) => {
      calls++;
      if (calls > 1) {
        assert.match(feedback.join(' '), new RegExp(`${98 + calls}小时`));
        assert.match(feedback.join(' '), /parameter_or_promise/);
      }
      return { content: { title: '选购', body: calls < 4 ? `续航${99 + calls}小时。` : '带课程报告到店验证。', cta: '到店', hashtags: [] }, meta };
    },
  });
  assert.equal(calls, 4);
  assert.equal(result.editorial_review.revision_count, 3);
});

test('configured revision cap stops novel failures and exposes a diagnostic reason', async () => {
  let calls = 0;
  await assert.rejects(generate(task, { ...options, repairPolicy: { maxRevisions: 1 },
    generateCopy: async () => ({ content: { title: '选购', body: `续航${100 + ++calls}小时`, cta: '到店', hashtags: [] }, meta }),
  }), error => {
    assert.equal(error.code, 'UNSUPPORTED_CLAIM');
    assert.equal(error.details.repair_decision.reason, 'revision_budget_exhausted');
    assert.equal(error.details.repair_history.length, 2);
    return true;
  });
  assert.equal(calls, 2);
});

test('editorial rewrite that introduces an unsupported claim gets a further factual repair', async () => {
  let calls = 0, reviews = 0;
  const r = await generate(task, { ...options,
    generateCopy: async () => ({ content: { title: '选购', body: ++calls === 2 ? '保护你的眼睛' : '用课程报告现场验证阅读体验。', cta: '到店', hashtags: [] }, meta }),
    reviewCopy: async () => ({ value: { passed: ++reviews > 1, platform_fit: '场景', issues: ['补充任务'], revision_instructions: ['具体写课程报告'] }, meta }),
  });
  assert.equal(calls, 3);
  assert.equal(reviews, 2);
  assert.equal(r.editorial_review.revision_count, 2);
});
test('ambiguous versions are clarified before generation', async () => {
  const result = await generate(task, { ...options, retrieveEvidence: async () => ({ evidence: [], ambiguous_model: true, model_candidates: ['鸿蒙', 'Windows'] }), generateCopy: async () => { throw new Error('must not run'); } });
  assert.equal(result.status, 'needs_clarification');
  assert.equal(result.content, undefined);
});

test('chat clarification updates the retrieval model and proceeds to generation', async () => {
  const { retrieveEvidence } = require('../services/api/src/services/evidenceService.cjs');
  const queries = [];
  const r = await generate({ ...task, model: 'HUAWEI MateBook 14', history: [{ role: 'assistant', content: '请选择鸿蒙版或Windows版' }, { role: 'user', content: '鸿蒙版' }] }, {
    ...editorialOptions,
    planTask: async (t) => {
      assert.equal(t.history.at(-1).content, '鸿蒙版');
      return { ...plan, value: { ...plan.value, task_updates: { model: 'HUAWEI MateBook 14（鸿蒙版）' } } };
    },
    retrieveEvidence: async (query, opts) => { queries.push(query); return retrieveEvidence(query, opts); },
    generateCopy: async ({ task: t, evidence: docs }) => {
      assert.match(t.model, /鸿蒙版/);
      assert.ok(docs.some((e) => /01-鸿蒙电脑/.test(e.source_path)));
      assert.ok(!docs.some((e) => /02-MateBook-Windows/.test(e.source_path)));
      return { content: { title: '学习选购', body: '带上课件到店体验。', hashtags: [], cta: '到店体验' }, meta };
    },
  });
  assert.equal(queries[0], 'HUAWEI MateBook 14（鸿蒙版）');
  assert.equal(r.generation_mode, 'llm');
  assert.equal(r.task.model, queries[0]);
});

test('chat can fill a missing task field before required field checks', async () => {
  const r = await generate({ ...task, audience: '' }, { ...options, planTask: async () => ({ ...plan, value: { ...plan.value, task_updates: { audience: '大学生' } } }) });
  assert.equal(r.task.audience, '大学生');
  assert.equal(r.generation_mode, 'llm');
});

test('an unrelated reply does not silently choose a product version', async () => {
  const r = await generate({ ...task, model: 'HUAWEI MateBook 14', history: [{ role: 'user', content: '继续' }] }, {
    ...options, planTask: async () => ({ ...plan, value: { ...plan.value, task_updates: {} } }),
    retrieveEvidence: async () => ({ evidence: [], ambiguous_model: true, model_candidates: ['鸿蒙版', 'Windows版'] }),
    generateCopy: async () => { throw new Error('must not generate'); },
  });
  assert.equal(r.status, 'needs_clarification');
});
test('HTTP and invalid JSON responses become safe diagnostic errors', async () => {
  await assert.rejects(requestJson('test', {}, { fetch: async () => ({ ok: false, status: 401 }) }), { code: 'LLM_HTTP_ERROR' });
  await assert.rejects(requestJson('test', {}, { fetch: async () => ({ ok: true, json: async () => ({ choices: [{ message: { content: 'not json' } }] }) }) }), { code: 'LLM_INVALID_JSON' });
});

test('model identity questions are answered without regenerating a draft or requiring a product', async () => {
  const r = await generate({ history: [{ role: 'user', content: '你是哪个模型生成的内容？' }] }, {
    planTask: async () => ({ ...plan, value: { ...plan.value, intent: 'answer', needs_evidence: false, task_updates: {} } }),
    retrieveEvidence: async () => { throw new Error('must not retrieve'); },
    generateCopy: async () => { throw new Error('must not generate a draft'); },
    generateReply: async ({ runtime }) => ({ reply: `本次使用${runtime.model}。`, meta }),
  });
  assert.equal(r.result_type, 'answer');
  assert.match(r.reply, /test-model/);
  assert.equal(r.content, undefined);
});

test('revision uses the current artifact even after intervening questions', async () => {
  const draft = { title: '原稿', body: '原稿正文', cta: '到店' };
  const r = await generate({ ...task, last_artifact: draft, history: [{ role: 'user', content: '你是什么模型？' }, { role: 'assistant', content: '本次使用test-model。' }, { role: 'user', content: '把刚才文案缩短' }] }, {
    ...options,
    planTask: async () => ({ ...plan, value: { ...plan.value, intent: 'revise', task_updates: {} } }),
    generateCopy: async ({ task: t }) => {
      assert.equal(t.last_artifact.body, draft.body);
      return { content: { ...draft, body: '缩短后的正文', hashtags: [] }, meta };
    },
  });
  assert.equal(r.result_type, 'revise');
  assert.equal(r.content.body, '缩短后的正文');
});

test('product questions retrieve evidence and cannot bypass claim validation', async () => {
  await assert.rejects(generate(task, {
    ...options,
    planTask: async () => ({ ...plan, value: { ...plan.value, intent: 'answer', needs_evidence: true, task_updates: {} } }),
    generateReply: async ({ evidence: docs }) => { assert.ok(docs.length); return { reply: '内存99 GB', meta }; },
  }), { code: 'UNSUPPORTED_CLAIM' });
});

test('editorial feedback triggers exactly one grounded rewrite and a second review', async () => {
  let reviews = 0, generations = 0;
  const r = await generate(task, { ...options,
    generateCopy: async ({ feedback }) => { generations++; if (generations === 2) assert.deepEqual(feedback, ['补充课堂任务']); return { content: { title: '选购', body: '用课件验证。', cta: '到店', hashtags: [] }, meta }; },
    reviewCopy: async () => ({ value: { passed: ++reviews > 1, platform_fit: '场景化', issues: ['场景不足'], revision_instructions: ['补充课堂任务'] }, meta }),
  });
  assert.equal(generations, 2); assert.equal(reviews, 2); assert.equal(r.editorial_review.revision_count, 1);
});
test('failed second editorial review blocks delivery with no endless rewrite', async () => {
  let reviews = 0;
  await assert.rejects(generate(task, { ...options, reviewCopy: async () => { reviews++; return { value: { passed: false, issues: ['过于泛化'], revision_instructions: ['写具体任务'], platform_fit: '不足' }, meta }; } }), { code: 'CONTENT_REVIEW_FAILED' });
  assert.equal(reviews, 2);
});

test('model approval cannot allow invented inline image links into article delivery', async () => {
  let calls = 0;
  const r = await generate(task, { ...options, generateCopy: async ({ feedback }) => {
    calls++;
    if (calls === 2) assert.match(feedback.join(' '), /图片链接/);
    return { content: { title: '选购', body: calls === 1 ? '![假图](https://example.com/invented.png)' : '带课件核对。', cta: '到店', hashtags: [] }, meta };
  } });
  assert.equal(calls, 2);
  assert.equal(r.editorial_review.revision_count, 1);
  assert.doesNotMatch(r.content.body, /invented/);
});

test('automatic revision strips model image markup before final review', async () => {
  let calls = 0;
  const r = await generate(task, { ...options, generateCopy: async () => {
    calls++;
    return { content: { title: '选购', lead: calls === 2 ? '<img src="https://example.com/bad.png">导语' : '导语', body: calls === 1 ? '![假图](https://example.com/bad.png)正文' : '<img src="https://example.com/bad.png">正文', cta: '到店', hashtags: [] }, meta };
  } });
  assert.equal(calls, 2);
  assert.doesNotMatch(`${r.content.lead}\n${r.content.body}`, /!\[|<img\b|example\.com/i);
  assert.match(r.content.body, /正文/);
  assert.equal(r.editorial_review.passed, true);
});

test('citation IDs resolve to exact server-held text and invented IDs are rejected', async () => {
  const value = { angle: '屏幕选购', reader_tension: '看课件', platform_reason: '具体任务', outline: ['体验'], evidence_ids: ['E1'], fact_points: [{ fact: '14.2英寸', evidence_id: 'E1', quote_id: 'E1Q1' }], conflicts: [], requirement_issues: [], image_plan: [], asset_gap: '' };
  const fetchResult = (v) => async () => ({ ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify(v) } }], model: 'test-model' }) });
  const input = { task: { image_count: 3 }, evidence: [{ content: '14.2 英寸' }], platform: {}, analysis: {}, assets: [] };
  const r = await planContent(input, { fetch: fetchResult(value) });
  assert.equal(r.value.fact_points[0].quote, '14.2 英寸');
  await assert.rejects(planContent(input, { fetch: fetchResult({ ...value, fact_points: [{ ...value.fact_points[0], quote_id: 'E1Q999' }] }) }), { code: 'UNSUPPORTED_CITATION' });
});
