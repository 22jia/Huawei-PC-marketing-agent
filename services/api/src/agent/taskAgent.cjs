const { createRepairPolicy } = require('./repairPolicy.cjs');
const { requirementDecision, validateRequirementIssues } = require('./taskDecision.cjs');
const { event, span } = require('../services/runTrace.cjs');
const { planTask, planContent, reviewCopy, generateCopy, generateReply, failure } = require('../clients/llmClient.cjs');
const { creativeAssets, resolveImagePlan } = require('../services/creativeAssets.cjs');
const { styleReferences } = require('../services/styleReferences.cjs');
const { collectEvidence, assertGrounded, pipelineMeta } = require('./agentRuntime.cjs');
const { generateCreativeImages, validateImageAgentResult } = require('./imageAgent/index.cjs');
const { imageFailureWarning } = require('./imageAgent/failureReason.cjs');
const { assistCustomer } = require('./customerAgent.cjs');
const { recommendProductsForScenario } = require('../services/scenarioProductSearch.cjs');
const { getSpotlightProducts } = require('../services/productSpotlight.cjs');

const PLATFORMS = require('./platformStrategies.cjs');
const { loadCopywritingSkill } = require('./copywritingSkill.cjs');
const { resolveContentCitations } = require('./contentCitations.cjs');
const { bindProductIdentity } = require('./productIdentity.cjs');

function inferExplicitFields(task) {
  if (!task.history.length) return task;
  const userText = task.history.filter(message => message.role === 'user').map(message => message.content).join('\n');
  if (!task.model) {
    const normalizedText = userText.toLowerCase().replace(/[^a-z0-9\u3400-\u9fff]/g, '');
    const matches = getSpotlightProducts().filter(product => {
      const fullName = product.name.toLowerCase().replace(/[^a-z0-9\u3400-\u9fff]/g, '');
      return fullName && normalizedText.includes(fullName);
    });
    if (matches.length === 1) task.model = matches[0].name;
  }
  const audienceMatch = !task.audience && userText.match(/(?:为|给|帮)([^，。！？!?\n]{1,30}?)(?:生成|写|创作|制作)(?:一篇|一则|一份)?/);
  if (audienceMatch?.[1]) {
    const candidate = audienceMatch[1].trim();
    if (candidate && !/^(我|我们|用户|客户)$/.test(candidate)) task.audience = candidate;
  }
  if (!task.scenario && /出差|出行|通勤|移动办公|旅途|轻便|轻薄|便携|携带|减负|续航/.test(userText)) task.scenario = userText.slice(-1200);
  return task;
}

function explicitlyRequestsCopy(history) {
  const latest = (history.filter(message => message.role === 'user').at(-1)?.content || '')
    .replace(/(?:不是|不要|不用|无需|不需要|不想|不打算)\s*(?:帮我|给我)?\s*(?:写|生成|创作|制作)?\s*(?:软文|笔记|帖子|图文|种草)/g, '');
  return /(?:写|生成|创作|制作).{0,24}(?:软文|笔记|帖子|图文|种草)|(?:软文|笔记|帖子|图文|种草).{0,18}(?:写|生成|创作|制作)/s.test(latest);
}

function analyzeTask(input = {}) {
  const task = {
    audience: input.audience || '',
    scenario: input.scenario || '',
    goal: input.goal || '',
    visual_brief: typeof input.visual_brief === 'string' ? input.visual_brief.slice(0, 4000) : '',
    output_type: input.output_type === 'image' ? 'image' : 'article',
    platform: input.platform || '',
    model: input.model || '',
    content_flow: input.content_flow || '',
    scenario_candidates: Array.isArray(input.scenario_candidates) ? input.scenario_candidates.slice(0, 5) : [],
    requirements: Array.isArray(input.requirements) ? input.requirements : [],
    image_count: Number.isFinite(Number(input.image_count)) ? Math.max(0, Math.min(6, Math.floor(Number(input.image_count)))) : 6,
    include_price: Boolean(input.include_price),
    last_artifact: input.last_artifact && typeof input.last_artifact === 'object' ? Object.fromEntries(['title', 'lead', 'body', 'cta'].filter((k) => typeof input.last_artifact[k] === 'string').map((k) => [k, input.last_artifact[k].slice(0, 24000)])) : null,
    history: Array.isArray(input.history) ? input.history.filter((m) => m && ['user', 'assistant'].includes(m.role) && typeof m.content === 'string').slice(-12).map((m) => ({ role: m.role, content: m.content.slice(0, 12000) })) : [],
  };
  const missing_fields = ['audience', 'scenario', 'goal', 'platform', 'model']
    .filter((field) => !task[field]);
  const invalid_platform = task.platform && !PLATFORMS[task.platform];
  if (invalid_platform) missing_fields.push('platform');
  inferExplicitFields(task);
  const resolvedMissingFields = ['audience', 'scenario', 'goal', 'platform', 'model'].filter((field) => !task[field]);
  return {
    ...task,
    missing_fields: [...new Set(resolvedMissingFields)],
    need_clarification: resolvedMissingFields.length > 0,
    questions: resolvedMissingFields.map((field) => ({
      field,
      question: field === 'model' ? '请补充具体产品型号，例如 HUAWEI MateBook 14。' : `请补充 ${field}。`,
    })),
  };
}

function scenarioSelectionReply(task) {
  const choices = task.scenario_candidates.map((product, index) => [
    `${index + 1}. **${product.name}**`,
    `   ${naturalScenarioReason(product, task.scenario)}${product.source_path ? ` [${index + 1}](#knowledge?path=${encodeURIComponent(product.source_path)})` : ''}`,
  ].join('\n')).join('\n\n');
  return `你提到的是“${task.scenario}”。我先按这个使用场景筛了几款，区别主要在便携、屏幕和扩展能力：\n\n${choices}\n\n你可以直接回复序号或型号；如果更看重轻便、屏幕或接口，也可以告诉我，我再缩小范围。`;
}

function naturalScenarioReason(product, scenario) {
  const text = String(scenario || '');
  const matched = (product.matched_tasks || []).slice(0, 2).map(item => String(item).replace(/[。；;，,]+$/, '').trim());
  const weight = String(product.reason || '').match(/约\s*([\d.,]+\s*(?:g|kg))/i)?.[1];
  const reasons = [];
  if (/出差|出行|通勤|移动办公|携带|轻便|轻薄|减负|重量|便携/.test(text) && weight) {
    reasons.push(`机身约${weight}，更适合经常带着电脑移动办公`);
  }
  if (matched.length) reasons.push(`适合${matched.join('、')}等任务`);
  const positioning = String(product.positioning || '').replace(/^产品定位[:：]\s*/, '').trim();
  if (positioning && reasons.length < 2) reasons.push(positioning.replace(/[；;。]+$/, ''));
  return reasons.length ? `推荐理由：${reasons.join('，')}。` : `推荐理由：${positioning || '它与当前场景的适配度较高'}。`;
}

function setScenarioChoices(task) {
  task.questions = [{ field: 'model', question: '你更想先了解哪一款？', options: task.scenario_candidates.map(product => product.name) }];
}

function applyScenarioSelection(task) {
  if (task.content_flow !== 'awaiting_product_confirmation' || !task.scenario_candidates.length) return null;
  const latest = task.history.filter(message => message.role === 'user').at(-1)?.content.trim() || '';
  if (!latest) return null;
  const numbered = latest.match(/^(?:第\s*)?([1-5])(?:\s*(?:款|个|号))?$/);
  const selected = numbered
    ? task.scenario_candidates[Number(numbered[1]) - 1]
    : task.scenario_candidates.find(product => latest.toLowerCase().includes(product.name.toLowerCase()));
  if (selected) {
    const remainder = numbered ? '' : latest.replace(new RegExp(selected.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), '').trim();
    const pureChoice = Boolean(numbered) || /^(?:标准版|SE版|se版|高配版|低配版)?$/.test(remainder);
    task.model = selected.name + (pureChoice ? remainder : '');
    task.content_flow = 'collecting_copy_details';
    task.scenario_candidates = [];
    return { confirmed: true, pureChoice };
  }
  // A brand preference such as "华为" is not a model choice; keep the flow on the saved candidates.
  setScenarioChoices(task);
  return {
    status: 'needs_clarification',
    result_type: 'product_selection',
    generation_mode: 'not_generated',
    reply: scenarioSelectionReply(task),
    task,
  };
}


function validate(task, evidence, content) {
  const blocking_issues = [];
  const warnings = [];
  if (!task.model) blocking_issues.push('缺少具体产品型号');
  const usableEvidence = evidence.filter((item) => item.retrievable !== false && item.content);
  if (!usableEvidence.length) blocking_issues.push('当前没有可直接核验的产品原文，文案未写入具体参数');
  if (usableEvidence.some((item) => ['local_snapshot', 'local_knowledge_base'].includes(item.source_status))) {
    warnings.push('当前使用仓库内本地知识库；发布前核对目标 SKU 的官方页面与销售配置');
  }
  if (task.include_price && !usableEvidence.some((item) => /价格|¥|售价/.test(item.content || ''))) {
    blocking_issues.push('请求包含价格，但没有价格证据');
  }
  return {
    status: blocking_issues.length ? 'fail' : warnings.length ? 'warning' : 'pass',
    checks: {
      model: task.model && evidence.some((item) => item.title.includes(task.model)) ? 'pass' : 'warning',
      facts: usableEvidence.length ? 'pass' : 'warning',
      platform: PLATFORMS[task.platform] ? 'pass' : 'fail',
      compliance: /第一|唯一|绝对|全网最低/.test(content.body) ? 'warning' : 'pass',
    },
    blocking_issues,
    warnings,
  };
}

function stripInlineImageMarkup(content) {
  if (!content || typeof content !== 'object') return content;
  const clean = (value) => String(value || '')
    .replace(/!\[[^\]]*\]\([^)]*\)/gi, '')
    .replace(/<img\b[^>]*>/gi, '')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return { ...content, lead: clean(content.lead), body: clean(content.body) };
}


async function generate(input, options = {}) {
  const progress = (stage, status, extra = {}) => options.onProgress?.({ stage, status, ...extra });
  const call = async (stage, fn, data) => {
    options.signal?.throwIfAborted();
    const started = Date.now();
    progress(stage, 'started');
    try {
      const result = await span(stage, data, () => fn(data, { signal: options.signal }));
      options.signal?.throwIfAborted();
      progress(stage, 'success', { duration_ms: Date.now() - started });
      return result;
    } catch (error) { progress(stage, 'failed', { duration_ms: Date.now() - started }); throw error; }
  };
  const grounded = (content, evidence) => {
    progress('grounding', 'started');
    try { assertGrounded(content, evidence); progress('grounding', 'success'); }
    catch (error) { progress('grounding', 'failed'); throw error; }
  };
  let task = analyzeTask(input);
  if (task.need_clarification && !task.history.some((m) => m.role === 'user')) return { status: 'needs_clarification', task };
  const savedSelection = applyScenarioSelection(task);
  if (savedSelection && !savedSelection.confirmed) return savedSelection;
  task = analyzeTask(task);
  // A completed choice already defines the next action. Keep extra instructions on the normal planner path.
  const directSelection = savedSelection?.pureChoice && !task.need_clarification;
  const planned = directSelection ? {
    value: { intent: 'generate', needs_evidence: true, task_updates: {}, needs: [], concerns: [], buying_stage: '', summary: task.goal, retrieval_queries: [task.model] },
    meta: { status: 'success', source: 'confirmed_product_selection' },
  } : await call('planTask', options.planTask || planTask, task);
  if (directSelection) {
    event('product_selection_confirmed', { model: task.model, next_stage: 'retrieval', planner_skipped: true });
  }
  if (explicitlyRequestsCopy(task.history)) planned.value.intent = 'generate';
  task = analyzeTask({ ...task, ...(planned.value.task_updates || {}) });
  if (['generate', 'revise'].includes(planned.value.intent) && !task.model && task.scenario) {
    const candidates = (options.recommendProductsForScenario || recommendProductsForScenario)(task.scenario, { limit: 3 });
    if (candidates.length) {
      task.content_flow = 'awaiting_product_confirmation';
      task.scenario_candidates = candidates;
      setScenarioChoices(task);
      return {
        status: 'needs_clarification',
        result_type: 'product_selection',
        generation_mode: 'not_generated',
        reply: scenarioSelectionReply(task),
        task,
      };
    }
  }
  if (task.model && task.content_flow !== 'awaiting_product_confirmation') task.content_flow = 'collecting_copy_details';
  if (planned.value.intent === 'customer_assist') {
    const customerTask = {
      customer_description: [...new Set(task.history.filter(message => message.role === 'user').map(message => message.content.trim()))].join('；').slice(0, 12000),
      model: task.model,
      budget: task.budget || '',
      follow_up_days: [1, 3, 7],
    };
    if (!customerTask.customer_description) return { status: 'needs_clarification', result_type: 'customer_assist', reply: '请说说客户的使用场景和主要顾虑，我会逐步梳理。', task };
    const customer = await call('customerAssist', (data) => assistCustomer(data, { ...options, planTask: async () => planned, interactive: true }), customerTask);
    const result = customer;
    const taskState = { ...task, workflow: 'customer', model: customerTask.model };
    if (result.status === 'needs_clarification') {
      const question = result.clarification?.questions?.[0] || '还需要确认客户的主要需求。';
      return { ...result, result_type: 'customer_assist', reply: question, task: taskState, customer_task: customerTask, conversation_mode: 'customer', awaiting_ticket_consent: false };
    }
    const lines = [
      '## 客户成交辅助方案',
      `**客户需求**：${result.customer?.summary || customerTask.customer_description}`,
      `**判断依据**：${result.solution?.rationale || '当前资料不足，需要继续确认。'}`,
      ...(result.solution?.candidate_products || []).map(product => [
        `### ${product.model}`,
        `**推荐原因**：${product.reason || product.positioning}`,
        `**适合任务**：${(product.suitable_tasks || []).join('、') || '需要结合常用软件核对'}`,
        product.recommended_configuration ? `**参考配置与价格**：${product.recommended_configuration.configuration} · ¥${product.recommended_configuration.price}（官网历史参考，门店价待核）` : '价格待核',
        product.comparison ? `与意向款最低参考价相比约省 ¥${product.comparison.saving}；${product.comparison.note}` : '',
      ].filter(Boolean).join('\n\n')),
      `**开场**：${result.sales_script?.opening || ''}`,
      `**推荐表达**：${result.sales_script?.recommendation || ''}`,
      `**收尾**：${result.sales_script?.close || ''}`,
      ...(result.objection_responses || []).map(item => `**${item.objection}**：${item.response}`),
      ...((result.follow_up_plan || []).length ? [
        '## 1/3/7 天跟进话术',
        '以下为店员审核后使用的草稿，不会自动发送。产品比价可在本条回复的产品卡片下展开。',
        ...result.follow_up_plan.map(item => `### 第 ${item.day} 天：${item.objective}\n\n**店员操作**：${item.action}\n\n**客户消息草稿**：${item.message_draft}`),
      ] : []),
      '\n需要我为这位客户建立跟进工单吗？回复“需要”或“暂不需要”。',
    ];
    return { ...result, result_type: 'customer_assist', reply: lines.join('\n\n'), task: taskState, customer_task: customerTask, conversation_mode: 'customer', awaiting_ticket_consent: true };
  }
  if (planned.value.intent === 'answer') {
    const retrieved = planned.value.needs_evidence ? await call('retrieval', () => collectEvidence(task, planned.value, options), { task }) : { evidence: [] };
    const answered = await call('generateReply', options.generateReply || generateReply, { task, analysis: planned.value, evidence: retrieved.evidence, runtime: { model: planned.meta.model, ambiguous_model: Boolean(retrieved.ambiguous_model), model_candidates: retrieved.model_candidates || [] } });
    if (planned.value.needs_evidence) grounded(answered.reply, retrieved.evidence);
    return {
      status: 'success', result_type: 'answer', reply: answered.reply, quick_replies: answered.options || [], task, generation_mode: 'llm',
      llm: pipelineMeta(planned.meta, answered.meta, planned.value.retrieval_queries),
      facts: retrieved.evidence.map(({ title, source_path, source_url, confidence, source_status, updated_at }) => ({ title, source_path, source_url, confidence, source_status, updated_at })),
    };
  }
  if (task.need_clarification) {
    const proposed = planned.value.clarification;
    const fallback = {
      model: '这次想介绍哪款产品？可以直接告诉我型号。',
      audience: '这篇内容主要想写给谁看？',
      platform: '你打算把这篇内容发在哪里？例如小红书、朋友圈或公众号。',
      scenario: '你希望围绕什么使用场景来写？',
      goal: '你希望读者看完后做什么？例如到店体验、咨询或了解产品。',
    };
    const valid = proposed && task.missing_fields.includes(proposed.field) && typeof proposed.question === 'string' && proposed.question.trim();
    const field = valid ? proposed.field : ['model', 'audience', 'platform', 'scenario', 'goal'].find(key => task.missing_fields.includes(key));
    const question = { field, question: valid ? proposed.question.trim() : fallback[field] };
    if (valid && Array.isArray(proposed.options)) question.options = proposed.options.filter(option => typeof option === 'string' && option.trim()).slice(0, 4);
    return { status: 'needs_clarification', generation_mode: 'not_generated', reply: question.question, task: { ...task, questions: [question] }, llm: { status: 'needs_clarification', stages: [{ stage: 'analysis', ...planned.meta }] } };
  }
  const retrieved = await call('retrieval', () => collectEvidence(task, planned.value, options), { task, queries: planned.value.retrieval_queries });
  if (retrieved.ambiguous_model) return { status: 'needs_clarification', generation_mode: 'not_generated', reply: '知识库找到多个相近版本，请选择本次要介绍的型号：', task: { ...task, questions: [{ field: 'model', question: '请确认产品版本', options: retrieved.model_candidates || [] }] }, llm: { status: 'needs_clarification', stages: [{ stage: 'analysis', ...planned.meta }] } };
  const usableEvidence = retrieved.evidence.filter((item) => item.retrievable !== false && item.content);
  const platform = { ...PLATFORMS[task.platform], style_references: styleReferences(task.platform) };
  if (!usableEvidence.length) return { status: 'needs_confirmation', result_type: 'blocked', task, reply: '没有找到目标型号的可核验资料，已停止生成产品软文。请确认型号或补充本地产品事实资料。', validation: { status: 'fail', blocking_issues: ['缺少产品事实依据'] } };
  if (task.include_price && !usableEvidence.some((e) => e.source_status === 'vmall_official')) throw failure('PRICE_EVIDENCE_REQUIRED', '未获取到可核验的官方商城价格，请取消包含价格或补充资料后重试。');
  const binding = bindProductIdentity(task, usableEvidence, (options.creativeAssets || creativeAssets)(usableEvidence));
  Object.assign(task, binding.task);
  const assets = binding.assets;
  if (task.product_identity) event('product_identity_resolved', task.product_identity);
  const copywriting_skill = loadCopywritingSkill(task);
  if (copywriting_skill) {
    const { rules, ...metadata } = copywriting_skill;
    event('skill_loaded', metadata);
  }
  const strategy = await call('planContent', options.planContent || planContent, { task, evidence: usableEvidence, analysis: planned.value, platform, assets, copywriting_skill });
  if (strategy.value.requirement_issues?.length) {
    const decision = requirementDecision(task, strategy.value.requirement_issues, usableEvidence);
    event('user_decision_required', decision.decision_required);
    return { ...decision, llm: { status: 'needs_confirmation', stages: [{ stage: 'analysis', ...planned.meta }, { stage: 'strategy', ...strategy.meta }] } };
  }
  if (strategy.value.conflicts?.length) return {
    status: 'needs_confirmation', result_type: 'blocked', task, generation_mode: 'not_generated',
    reply: `资料存在冲突，需要你重新决策：\n${strategy.value.conflicts.map((c) => `- ${c.reason}\n${c.references.map((ref) => `  《${usableEvidence[Number(ref.evidence_id.slice(1)) - 1]?.title || ref.evidence_id}》：${ref.quote}`).join('\n')}`).join('\n')}\n请确认目标型号、配置和适用条件，或补充可核验来源；也可以明确删除相关卖点。回复后会重新核对，不能仅凭选定某个数值将其当作已核实事实。`,
    conflicts: strategy.value.conflicts,
    validation: { status: 'fail', checks: { facts: 'fail' }, blocking_issues: strategy.value.conflicts.map((c) => c.reason), pending_confirmation: strategy.value.conflicts.map((c) => c.reason) },
    llm: { status: 'needs_confirmation', stages: [{ stage: 'analysis', ...planned.meta }, { stage: 'strategy', ...strategy.meta }] },
  };
  const stages = [{ stage: 'analysis', ...planned.meta }, { stage: 'strategy', ...strategy.meta }];
  const imageInput = { task, evidence: usableEvidence, assets, platform, strategy: strategy.value };
  let images;
  let imageWarnings = [];
  try {
    const imageResult = await call('imageGeneration', options.imageAgent || ((input, config) => generateCreativeImages(input, { ...config, generateCreativeImages: options.generateCreativeImages })), imageInput);
    const validated = validateImageAgentResult(imageResult, assets, task.image_count);
    images = validated.images;
    imageWarnings = validated.warnings;
    stages.push({ stage: 'imageGeneration', status: 'success', provider: validated.provider });
  } catch (error) {
    if (options.signal?.aborted) throw error;
    stages.push({ stage: 'imageGeneration', status: 'failed', code: error.code || 'IMAGE_AGENT_FAILED' });
    imageWarnings.push(imageFailureWarning(error));
    images = resolveImagePlan(strategy.value.image_plan || [], assets, task.image_count).map((image) => ({ ...image, source_product_image: image.id, generated: false }));
  }
  if (!images.length) return { status: 'needs_confirmation', result_type: 'blocked', task, generation_mode: 'not_generated', reply: `没有可用的同型号配图，暂不能交付图文软文。${strategy.value.asset_gap || '请补充该型号的图片与图片索引。'}`, validation: { status: 'fail', checks: { images: 'fail' }, blocking_issues: ['缺少同型号配图'] } };
  if (task.output_type === 'image') {
    const generatedImages = images.filter(image => image.generated);
    const success = generatedImages.length > 0;
    return {
      status: success ? 'success' : 'needs_confirmation', result_type: 'image_generation',
      generation_mode: success ? 'llm' : 'not_generated', task, images: generatedImages,
      reply: success ? undefined : `本次没有生成 AI 图片。${imageWarnings.join('；') || '请检查后端图片服务配置。'}`,
      llm: { status: success ? 'success' : 'failed', stages }, warnings: imageWarnings,
      validation: { status: success ? 'warning' : 'fail', pending_confirmation: ['产品外观与合成画面需人工核对'] },
    };
  }
  // Image plans precede generation: their captions can still describe official
  // originals or contain editor instructions. Copy revisions cannot edit images.
  // Use a neutral, metadata-backed caption for generated assets before review.
  images = images.map(image => image.generated
    ? { ...image, caption: `${image.model || task.model} · AI 创意配图（非实拍）` }
    : image);
  grounded(images.map(({ caption }) => caption).join('\n'), usableEvidence);
  const context = { task, evidence: usableEvidence, analysis: planned.value, platform, strategy: strategy.value, images, history: task.history, copywriting_skill };
  function decisionExit(result, stage) {
    const issues = validateRequirementIssues(task, result.value.requirement_issues, usableEvidence);
    const decision = requirementDecision(task, issues, usableEvidence);
    event('user_decision_required', { stage, ...decision.decision_required });
    return { ...decision, llm: { status: 'needs_confirmation', stages } };
  }
  async function inspect(content) {
    const checked = await call('reviewCopy', options.reviewCopy || reviewCopy, { ...context, content });
    if (checked.value.action === 'ask_user') return checked;
    const issues = [];
    if (/!\[[^\]]*\]\([^)]*\)|<img\b/i.test([content.lead, content.body].join('\n'))) issues.push('删除正文和导语中自行生成的图片链接或img标签，图片由服务端已核对的素材ID统一插入。保留文字与段落结构。');
    if (issues.length) checked.value = { ...checked.value, passed: false, issues: [...checked.value.issues, ...issues], revision_instructions: [...checked.value.revision_instructions, ...issues] };
    return checked;
  }
  let generated, review, feedback;
  let revision_count = 0;
  const repairPolicy = createRepairPolicy(options.repairPolicy);
  const repair_history = [];
  function decideRepair(attempt, error, issues) {
    const decision = repairPolicy.decide({ attempt, content: generated.content, issues });
    event('repair_decision', { ...decision, code: error.code, issues });
    progress('repair', decision.action === 'stop' ? 'failed' : 'started', { attempt: attempt + 1 });
    if (decision.action === 'stop') {
      event('repair_stopped', { code: error.code, diagnostic_message: error.message, details: error.details, repair_decision: decision, repair_history }, 'failed');
      const reasons = {
        unchanged_draft: '修稿再次返回相同的失败草稿',
        repeated_issues: '同一组问题已连续或累计出现三次，继续改写缺少有效进展',
        revision_budget_exhausted: '已达到本次自动修稿预算',
        time_budget_exhausted: '已达到本次修稿等待时间预算',
      };
      throw Object.assign(failure(error.code, `${reasons[decision.reason]}，本次未能完成核验通过的成稿。详细原因已记录在运行日志中，可继续要求助手修改。`), {
        details: { ...error.details, diagnostic_message: error.message, repair_decision: decision, repair_history },
      });
    }
  }
  // Both reviewers share one progress-aware policy and bounded resource budget.
  for (let attempt = 0; ; attempt++) {
    generated = await call('generateCopy', options.generateCopy || generateCopy, { ...context, feedback, previous_content: generated?.content });
    if (attempt > 0) progress('repair', 'success', { attempt });
    if (generated.value?.action === 'ask_user') {
      stages.push({ stage: 'generation', ...generated.meta });
      return decisionExit(generated, 'generateCopy');
    }
    if (attempt > 0) generated.content = stripInlineImageMarkup(generated.content);
    stages.push({ stage: attempt ? 'revision' : 'generation', ...generated.meta });
    revision_count = attempt;
    try {
      grounded(generated.content, usableEvidence);
      // Check references before delivery, so a bad ID uses the existing repair policy.
      resolveContentCitations(generated.content, usableEvidence, strategy.value.fact_points);
    } catch (error) {
      if (!['UNSUPPORTED_CLAIM', 'UNVERIFIED_PRICE'].includes(error.code)) throw error;
      stages.push({ stage: 'grounding', status: 'failed', code: error.code });
      repair_history.push({ attempt: attempt + 1, source: 'grounding', code: error.code, issues: [error.message], details: error.details });
      event('repair', { attempt: attempt + 1, repair_history, draft: generated.content }, 'failed');
      decideRepair(attempt, error, [error.details?.rule || error.code, ...(error.details?.matches || [])]);
      feedback = [error.message, `本轮具体核验结果：${JSON.stringify(error.details || {})}。逐一删除或纠正命中的原句；可用事实以本次evidence及strategy.fact_points为准。`, '删除或改写无证据表述，不用近义词保留同一承诺。不能从OLED、色域推导保护眼睛、不易疲劳或健康效果。缺少参数、价格或效果依据时，若该卖点是task.requirements中用户明确的事实要求，返回ask_user及requirement_issues请用户决策，不能静默省略；否则省略该卖点，用有依据的其他特点延续生活场景与原有语气，不补选购核验清单或免责段落。'];
      continue;
    }
    review = await inspect(generated.content);
    stages.push({ stage: 'review', ...review.meta });
    if (review.value.action === 'ask_user') return decisionExit(review, 'reviewCopy');
    if (review.value.passed) break;
    repair_history.push({ attempt: attempt + 1, source: 'editorial', issues: review.value.issues });
    decideRepair(attempt, failure('CONTENT_REVIEW_FAILED', `审稿未通过：${review.value.issues.join('；')}。`), ['editorial', ...review.value.issues, ...review.value.revision_instructions]);
    event('repair', { attempt: attempt + 1, repair_history, feedback: review.value.revision_instructions });
    feedback = review.value.revision_instructions;
  }
  grounded(generated.content, usableEvidence);
  const content = resolveContentCitations(generated.content, usableEvidence, strategy.value.fact_points);
  const generation_mode = 'llm';
  const validation = validate(task, retrieved.evidence, content);
  validation.checks.images = images.every((i) => i.model && i.source_url) ? 'metadata_matched' : 'warning';
  validation.checks.editorial = 'model_review_passed';
  validation.pending_confirmation = ['图片画面、版本及使用权尚需发布人员核对', ...(images.length < Math.min(platform.image_target, task.image_count) ? ['同型号素材不足，实际配图数量未达到平台目标'] : [])];
  validation.warnings.push(...validation.pending_confirmation);
  if (validation.status === 'pass') validation.status = 'warning';
  return {
    status: validation.status === 'pass' ? 'success' : 'warning',
    task,
    content,
    result_type: planned.value.intent === 'revise' ? 'revise' : 'generate',
    generation_mode,
    llm: { status: 'success', model: generated.meta.model, stages, retrieval_queries: planned.value.retrieval_queries },
    content_strategy: strategy.value,
    writing_skill: copywriting_skill ? { name: copywriting_skill.name, version: copywriting_skill.version, platform: copywriting_skill.platform } : null,
    scene_judgment: { audience: task.audience, scenario: task.scenario, buying_stage: planned.value.buying_stage, main_problems: planned.value.concerns?.length ? planned.value.concerns : planned.value.needs, content_goal: task.goal, platform: platform.label, angle: strategy.value.angle },
    style_references: platform.style_references,
    editorial_review: { ...review.value, revision_count, repair_history },
    facts: usableEvidence.map(({ title, source_path, source_url, confidence, source_status, updated_at }, index) => ({
      id: `E${index + 1}`, model: task.model, title, source_path, source_url, confidence, source_status, updated_at,
      fact_points: (strategy.value.fact_points || []).filter((p) => p.evidence_id === `E${index + 1}`),
    })),
    evidence_meta: { matched_count: retrieved.matched_count, unavailable_count: retrieved.evidence.filter((item) => item.confidence === 'unavailable').length },
    images,
    validation,
    warnings: [...imageWarnings, ...validation.blocking_issues, ...(validation.warnings || []), ...(retrieved.retrieval_warning ? [retrieved.retrieval_warning] : []), ...(strategy.value.asset_gap ? [strategy.value.asset_gap] : []), ...(images.length ? ['配图按同型号资料索引匹配，尚未视觉核验；发布前核对画面、版本和使用权。'] : [])],
    editable: true,
  };
}

module.exports = { analyzeTask, generate };
