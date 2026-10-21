const crypto = require('crypto');
const { planTask, planContent, reviewCopy, generateCopy, generateReply, failure } = require('../clients/llmClient.cjs');
const { creativeAssets, resolveImagePlan } = require('../services/creativeAssets.cjs');
const { styleReferences } = require('../services/styleReferences.cjs');
const { collectEvidence, assertGrounded, pipelineMeta } = require('./agentRuntime.cjs');
const { recommendProductsForScenario } = require('../services/scenarioProductSearch.cjs');
const { integrateImages } = require('./imageAgent/integration.cjs');

const PLATFORMS = require('./platformStrategies.cjs');

function analyzeTask(input = {}) {
  const task = {
    audience: input.audience || '',
    scenario: input.scenario || '',
    goal: input.goal || '',
    platform: input.platform || '',
    model: input.model || '',
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
  return {
    ...task,
    missing_fields: [...new Set(missing_fields)],
    need_clarification: missing_fields.length > 0,
    questions: missing_fields.map((field) => ({
      field,
      question: field === 'model' ? '请补充具体产品型号，例如 HUAWEI MateBook 14。' : `请补充 ${field}。`,
    })),
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


async function generate(input, options = {}) {
  let task = analyzeTask(input);
  if (task.need_clarification && !task.history.some((m) => m.role === 'user')) return { status: 'needs_clarification', task };
  const planned = await (options.planTask || planTask)(task);
  task = analyzeTask({ ...task, ...(planned.value.task_updates || {}) });
  if (['generate', 'revise'].includes(planned.value.intent) && !task.model && task.scenario) {
    const candidates = (options.recommendProductsForScenario || recommendProductsForScenario)(task.scenario, { limit: 3 });
    if (candidates.length) {
      const choices = candidates.map((product, index) => [
        `${index + 1}. ${product.name}`,
        `产品定位：${product.positioning}`,
        `推荐理由：${product.reason || '暂无可匹配的具体适用任务，请核对产品资料。'}`,
      ].join('\n')).join('\n\n');
      return {
        status: 'needs_clarification',
        result_type: 'product_selection',
        generation_mode: 'not_generated',
        reply: `根据“${task.scenario}”，以下产品与场景较匹配：\n\n${choices}\n\n请回复序号或型号，确认后我再按该型号生成内容。`,
        task: { ...task, scenario_candidates: candidates, questions: [{ field: 'model', question: '请从推荐型号中选择一款。', options: candidates.map((product) => product.name) }] },
      };
    }
  }
  if (planned.value.intent === 'answer') {
    const retrieved = planned.value.needs_evidence ? await collectEvidence(task, planned.value, options) : { evidence: [] };
    const answered = await (options.generateReply || generateReply)({ task, analysis: planned.value, evidence: retrieved.evidence, runtime: { model: planned.meta.model, ambiguous_model: Boolean(retrieved.ambiguous_model), model_candidates: retrieved.model_candidates || [] } });
    if (planned.value.needs_evidence) assertGrounded(answered.reply, retrieved.evidence);
    return {
      status: 'success', result_type: 'answer', reply: answered.reply, task, generation_mode: 'llm',
      llm: pipelineMeta(planned.meta, answered.meta, planned.value.retrieval_queries),
      facts: retrieved.evidence.map(({ title, source_path, source_url, confidence, source_status, updated_at }) => ({ title, source_path, source_url, confidence, source_status, updated_at })),
    };
  }
  if (task.need_clarification) return { status: 'needs_clarification', generation_mode: 'not_generated', task, llm: { status: 'needs_clarification', stages: [{ stage: 'analysis', ...planned.meta }] } };
  const retrieved = await collectEvidence(task, planned.value, options);
  if (retrieved.ambiguous_model) return { status: 'needs_clarification', generation_mode: 'not_generated', task: { ...task, questions: [{ field: 'model', question: `请确认产品版本：${(retrieved.model_candidates || []).join('、')}` }] }, llm: { status: 'needs_clarification', stages: [{ stage: 'analysis', ...planned.meta }] } };
  const usableEvidence = retrieved.evidence.filter((item) => item.retrievable !== false && item.content);
  const platform = { ...PLATFORMS[task.platform], style_references: styleReferences(task.platform) };
  if (!usableEvidence.length) return { status: 'needs_confirmation', result_type: 'blocked', task, reply: '没有找到目标型号的可核验资料，已停止生成产品软文。请确认型号或补充本地产品事实资料。', validation: { status: 'fail', blocking_issues: ['缺少产品事实依据'] } };
  if (task.include_price && !usableEvidence.some((e) => e.source_status === 'vmall_official')) throw failure('PRICE_EVIDENCE_REQUIRED', '未获取到可核验的官方商城价格，请取消包含价格或补充资料后重试。');
  const assets = (options.creativeAssets || creativeAssets)(usableEvidence);
  const strategy = await (options.planContent || planContent)({ task, evidence: usableEvidence, analysis: planned.value, platform, assets });
  if (strategy.value.conflicts?.length) return {
    status: 'needs_confirmation', result_type: 'blocked', task, generation_mode: 'not_generated',
    reply: `资料存在冲突，已停止生成，请人工确认：\n${strategy.value.conflicts.map((c) => `- ${c.reason}`).join('\n')}`,
    conflicts: strategy.value.conflicts,
    validation: { status: 'fail', checks: { facts: 'fail' }, blocking_issues: strategy.value.conflicts.map((c) => c.reason), pending_confirmation: strategy.value.conflicts.map((c) => c.reason) },
    llm: { status: 'needs_confirmation', stages: [{ stage: 'analysis', ...planned.meta }, { stage: 'strategy', ...strategy.meta }] },
  };
  let images = resolveImagePlan(strategy.value.image_plan, assets, task.image_count);
  if (!images.length) return { status: 'needs_confirmation', result_type: 'blocked', task, generation_mode: 'not_generated', reply: `没有可用的同型号配图，暂不能交付图文软文。${strategy.value.asset_gap || '请补充该型号的图片与图片索引。'}`, validation: { status: 'fail', checks: { images: 'fail' }, blocking_issues: ['缺少同型号配图'] } };
  assertGrounded(images.map(({ caption }) => caption).join('\n'), usableEvidence);
  const context = { task, evidence: usableEvidence, analysis: planned.value, platform, strategy: strategy.value, images, history: task.history };
  const stages = [{ stage: 'analysis', ...planned.meta }, { stage: 'strategy', ...strategy.meta }];
  async function inspect(content) {
    const checked = await (options.reviewCopy || reviewCopy)({ ...context, content });
    const issues = [];
    if (/!\[[^\]]*\]\([^)]*\)|<img\b/i.test([content.lead, content.body].join('\n'))) issues.push('删除正文和导语中自行生成的图片链接或img标签，图片由服务端已核对的素材ID统一插入。保留文字与段落结构。');
    if (issues.length) checked.value = { ...checked.value, passed: false, issues: [...checked.value.issues, ...issues], revision_instructions: [...checked.value.revision_instructions, ...issues] };
    return checked;
  }
  let generated, review, feedback;
  let revision_count = 0;
  let editorialFailures = 0;
  const repair_history = [];
  // Share a bounded repair budget between deterministic and model reviews.
  for (let attempt = 0; attempt <= 2; attempt++) {
    generated = await (options.generateCopy || generateCopy)({ ...context, feedback, previous_content: generated?.content });
    stages.push({ stage: attempt ? 'revision' : 'generation', ...generated.meta });
    revision_count = attempt;
    try {
      assertGrounded(generated.content, usableEvidence, strategy.value.fact_points);
    } catch (error) {
      if (!['UNSUPPORTED_CLAIM', 'UNVERIFIED_PRICE'].includes(error.code)) throw error;
      stages.push({ stage: 'grounding', status: 'failed', code: error.code });
      repair_history.push({ attempt: attempt + 1, source: 'grounding', code: error.code, issues: [error.message] });
      if (attempt === 2) throw failure(error.code, '已根据事实核验意见自动修改两轮，仍存在无依据的产品表述，暂未交付。');
      feedback = [error.message, '产品规格只能使用本次strategy.fact_points明确选中的事实及其逐字引文；不要从完整知识库、常识或历史消息补充本稿未选用的参数。遇到未选入清单的比例、分辨率、PPI、屏幕类型、尺寸或其他参数，整句删除，或改成不声称产品能力的现场核验建议。不能用近义词保留同一承诺，也不能从OLED或色域推导护眼、疲劳改善等效果。缺少依据时省略该卖点，仍需完整输出标题、导语、正文及行动邀请。'];
      continue;
    }
    review = await inspect(generated.content);
    stages.push({ stage: 'review', ...review.meta });
    if (review.value.passed) break;
    editorialFailures++;
    repair_history.push({ attempt: attempt + 1, source: 'editorial', issues: review.value.issues });
    if (attempt === 2 || editorialFailures >= 2) throw failure('CONTENT_REVIEW_FAILED', '文案自动修订后仍未通过事实与内容审核，暂未生成图片。请调整需求后重试。');
    feedback = [...review.value.revision_instructions];
    if (review.value.issues.some((issue) => /事实|证据|参数|规格|功能|卖点/.test(issue))) {
      feedback.push('产品规格只能使用本次strategy.fact_points明确选中的事实及其逐字引文；审稿指出未获选定引文支持的参数时，整句删除或改成现场核验建议，不要从完整知识库补回。');
    }
  }
  const content = generated.content;
  assertGrounded(content, usableEvidence, strategy.value.fact_points);
  const imageResult = await integrateImages({ task, evidence: usableEvidence, assets, platform, strategy: strategy.value }, images, options);
  images = imageResult.images;
  if (imageResult.stage) stages.push(imageResult.stage);
  const generation_mode = 'llm';
  const validation = validate(task, retrieved.evidence, content);
  validation.checks.images = images.every((i) => i.model && i.source_url) ? 'metadata_matched' : 'warning';
  validation.checks.editorial = 'model_review_passed';
  validation.pending_confirmation = ['图片画面、版本及使用权尚需发布人员核对', ...(images.length < Math.min(platform.image_target, task.image_count) ? ['同型号素材不足，实际配图数量未达到平台目标'] : [])];
  validation.warnings.push(...validation.pending_confirmation);
  if (validation.status === 'pass') validation.status = 'warning';
  return {
    request_id: `req_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
    status: validation.status === 'pass' ? 'success' : 'warning',
    task,
    content,
    result_type: planned.value.intent === 'revise' ? 'revise' : 'generate',
    generation_mode,
    llm: { status: 'success', model: generated.meta.model, stages, retrieval_queries: planned.value.retrieval_queries },
    content_strategy: strategy.value,
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
    warnings: [...validation.blocking_issues, ...(validation.warnings || []), ...imageResult.warnings, ...(retrieved.retrieval_warning ? [retrieved.retrieval_warning] : []), ...(strategy.value.asset_gap ? [strategy.value.asset_gap] : []), ...(images.length ? ['配图按同型号资料索引匹配，尚未视觉核验；发布前核对画面、版本和使用权。'] : [])],
    editable: true,
  };
}

module.exports = { analyzeTask, generate };
