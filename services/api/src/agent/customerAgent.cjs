const { retrieveEvidence } = require('../services/evidenceService.cjs');
const { planTask, generateCustomer } = require('../clients/llmClient.cjs');
const { collectEvidence, assertGrounded, pipelineMeta } = require('./agentRuntime.cjs');
const { buildPriceSolution } = require('../services/priceSolutionService.cjs');

const FOLLOW_UP_DAYS = [1, 3, 7];

function normalizeInput(input = {}) {
  const description = String(input.customer_description || input.user_input || '').trim();
  return {
    customer_description: description,
    model: String(input.model || '').trim(),
    budget: String(input.budget || '').trim(),
    store_name: String(input.store_name || '').trim(),
    follow_up_days: Array.isArray(input.follow_up_days)
      ? input.follow_up_days.filter((day) => FOLLOW_UP_DAYS.includes(Number(day))).map(Number)
      : FOLLOW_UP_DAYS,
  };
}

function inferCustomer(description) {
  const text = description.toLowerCase();
  const needs = [];
  const concerns = [];
  const evidenceQueries = [];

  const groups = [
    { terms: ['轻', '太重', '重量', '便携', '背着', '通勤'], need: '关注便携与移动使用', query: '轻薄 便携 重量', concern: '担心携带负担' },
    { terms: ['屏幕', '护眼', '看着舒服', '显示'], need: '关注屏幕体验', query: '屏幕 显示 参数', concern: '关注长时间使用的屏幕体验' },
    { terms: ['论文', '上课', '学习', '宿舍', '图书馆'], need: '用于学习与校园场景', query: '学习 校园 场景', concern: '希望设备适合学习任务' },
    { terms: ['开会', '会议', '出差', '办公', '文件'], need: '用于办公与会议场景', query: '办公 会议 协同', concern: '需要确认实际办公软件和连接需求' },
    { terms: ['剪辑', '设计', '渲染', '建模', '创作'], need: '涉及创作或图形任务', query: '创作 设计 图形性能', concern: '需要确认具体软件和工作负载' },
    { terms: ['传文件', '互传', '手机', '平板', '协同', '生态'], need: '关注多设备协同', query: '多设备 协同 互联', concern: '需要确认现有设备及系统版本' },
    { terms: ['价格', '预算', '便宜', '贵', '优惠', '补贴'], need: '关注预算与购机成本', query: '价格 配置 购机', concern: '预算和当前活动需由门店确认' },
    { terms: ['续航', '电池', '充电'], need: '关注续航与补能', query: '续航 电池 充电', concern: '实际续航需结合配置和使用条件说明' },
  ];

  for (const group of groups) {
    if (group.terms.some((term) => text.includes(term))) {
      needs.push(group.need);
      concerns.push(group.concern);
      evidenceQueries.push(group.query);
    }
  }

  let audience = '待确认';
  if (/大学生|学生|宿舍|图书馆|上课/.test(text)) audience = '学生';
  else if (/商务|职场|通勤|出差|客户|会议/.test(text)) audience = '职场人士';
  else if (/设计师|剪辑师|创作者|博主/.test(text)) audience = '创作者';

  let buyingStage = '需求了解';
  if (/对比|犹豫|考虑|担心|纠结/.test(text)) buyingStage = '比较评估';
  if (/到店|试用|体验|今天买|下单|购买/.test(text)) buyingStage = '体验或购买决策';

  return {
    audience,
    needs: [...new Set(needs)],
    concerns: [...new Set(concerns)],
    buying_stage: buyingStage,
    evidence_queries: [...new Set(evidenceQueries)],
  };
}

function buildQuestions(task, insight) {
  const questions = [];
  if (!task.model) questions.push('您目前在看哪一款或哪个价位段的 MateBook？');
  if (!/预算|价格|贵|便宜|优惠/.test(task.customer_description)) questions.push('这次购机大致预算是多少？');
  if (insight.audience === '待确认') questions.push('这台电脑主要是谁使用，日常最常做什么？');
  if (!/配置|软件|剪辑|设计|游戏|办公|论文|学习/.test(task.customer_description)) questions.push('最常使用的软件或任务是什么？');
  if (!/手机|平板|设备|协同|生态/.test(task.customer_description)) questions.push('您现在是否在使用华为手机或平板，希望电脑和它们协同吗？');
  return questions.slice(0, 4);
}

function buildTalkTrack(task, insight, evidence, ambiguousModel = false) {
  const evidenceBackedPoints = evidence.slice(0, 3).map((item) => ({
    point: item.title,
    source: item.source_path || item.title,
    verified: Boolean(item.content && ['local_knowledge_base', 'local_snapshot', 'vmall_official'].includes(item.source_status)),
  }));
  const needsText = insight.needs.length ? insight.needs.map((need) => need.replace(/^(关注|用于|涉及)/, '')).join('、') : '日常使用';
  const experience = [];
  if (/便携|移动/.test(needsText)) experience.push('实际装包，感受携带是否轻松');
  if (/学习|办公|创作/.test(needsText)) experience.push('用您的常用软件和文件试一下，确认运行和操作是否符合习惯');
  if (/屏幕/.test(needsText)) experience.push('用平时的亮度和字号看一段熟悉的内容');
  if (/协同/.test(needsText)) experience.push('带上现有手机或平板，确认设备和系统版本后演示文件互传');
  return {
    opening: `我先不急着给您定型号，想先确认您主要用它来做什么。听起来您的重点是${needsText}，我理解得对吗？`,
    discovery_questions: buildQuestions(task, insight),
    recommendation: ambiguousModel
      ? '您关注的这个系列有不同系统版本。想先确认您常用的软件，以及更倾向鸿蒙版还是 Windows 版，再一起比较适合的配置。'
      : evidence.length && task.model
        ? `可以先把${task.model}作为候选来体验。您在意的是${needsText}，建议重点${experience.length ? experience.join('；') : '对照日常用途试用'}。确认这些体验符合需求，再结合预算选择具体配置。`
        : '先按您的日常用途和预算缩小选择范围。您可以告诉我常用的软件和已有设备，我们确认兼容情况后，再一起比较具体型号。',
    evidence_points: evidenceBackedPoints,
    close: '建议您带上常用文件或软件，到店实际体验键盘、屏幕和多设备协同，再决定配置。',
  };
}

function buildObjectionResponses(insight, evidence) {
  const text = insight.concerns.join(' ');
  const hasPriceEvidence = evidence.some((item) => /价格|售价|优惠|补贴/.test(`${item.title}\n${item.content}`));
  const responses = [];
  if (/预算|购机成本/.test(text)) {
    responses.push({
      objection: '价格或预算顾虑',
      response: hasPriceEvidence
        ? '可以先按您的预算核对对应配置和当前门店政策，再比较哪些配置对您的任务真正有用。'
        : '我先不口头承诺价格或优惠；我们可以按您的预算核对当前在售配置和门店政策。',
      requires_store_confirmation: true,
    });
  }
  if (/携带负担/.test(text)) responses.push({ objection: '担心电脑太重', response: '我们可以现场称重或查看对应配置的官方重量信息，并让您实际装包体验；不同配置以对应资料为准。', requires_store_confirmation: true });
  if (/屏幕体验/.test(text)) responses.push({ objection: '担心屏幕不适合自己', response: '建议现场用您熟悉的亮度和字体体验屏幕；具体屏幕规格按目标型号和配置资料核对。', requires_store_confirmation: true });
  if (/多设备/.test(text)) responses.push({ objection: '担心设备协同不方便', response: '先确认您现有设备型号、系统版本和常用操作，再现场演示已支持的协同功能及适用条件。', requires_store_confirmation: true });
  if (/办公|任务|创作/.test(text)) responses.push({ objection: '担心性能或软件适配', response: '请先确认常用软件、文件大小和工作负载，我们可以在目标配置上现场运行您的典型任务。', requires_store_confirmation: true });
  return responses;
}

function buildFollowUpPlan(days, insight) {
  const topic = (insight.needs[0] || '电脑选购').replace(/^(关注|用于|涉及)/, '');
  const messages = {
    1: `您好，接着上次关于${topic}的沟通，想再确认一下您的预算和常用软件，方便我整理适合您的型号资料。`,
    3: `您好，关于${topic}，您目前还有哪些地方拿不准？可以把最想比较的一点告诉我，我们一起看看，也欢迎带上常用文件到店试用。`,
    7: '您好，最近电脑选购考虑得怎么样了？您的用途或预算有没有变化？如果还在比较，我们可以约个方便的时间，用您的日常任务实际体验一下。',
  };
  const byDay = {
    1: { objective: '补齐需求并发送匹配资料', action: '根据到店沟通确认的预算、软件和设备生态，发送对应型号的官方资料与未决问题清单。' },
    3: { objective: '处理比较中的顾虑', action: '针对客户最在意的一项顾虑，提供可核验的配置说明或邀请到店体验；不重复发送泛化促销。' },
    7: { objective: '确认决策状态并给出下一步', action: '询问需求或预算是否变化；如仍在考虑，安排一次针对目标任务的短时体验，不虚构库存或优惠紧迫感。' },
  };
  return days.map((day) => ({
    day,
    objective: byDay[day].objective,
    action: byDay[day].action,
    message_draft: messages[day],
    requires_staff_review: true,
  }));
}

async function assistCustomer(input, options = {}) {
  const task = normalizeInput(input);
  if (!task.customer_description) {
    return {
      status: 'needs_clarification',
      code: 'MISSING_CUSTOMER_DESCRIPTION',
      questions: ['请描述一下客户的使用场景、关注点或顾虑。'],
    };
  }

  const planned = await (options.planTask || planTask)(task);
  const insight = { ...planned.value, evidence_queries: planned.value.retrieval_queries };
  // A specific model is the strongest retrieval anchor. Scenario terms influence
  // the explanation and can later drive a secondary, targeted retrieval pass.
  const query = task.model || insight.evidence_queries[0] || task.customer_description;
  let retrieved = { evidence: [], knowledge_base: '' };
  let retrievalError = '';
  try {
    retrieved = await collectEvidence(task, planned.value, options);
    retrievalError = retrieved.retrieval_warning || '';
  } catch (error) {
    retrievalError = error.message || '知识检索暂不可用';
  }

  const evidence = (retrieved.evidence || []).filter((item) => item.content && item.confidence !== 'unavailable');
  if (!retrievalError && !evidence.length) {
    const unavailable = (retrieved.evidence || []).find((item) => item.warning);
    if (unavailable) retrievalError = unavailable.warning;
  }
  const questions = buildQuestions(task, insight);
  if (retrieved.ambiguous_model) questions.unshift('本地资料中有多个同系列版本；客户关注的是鸿蒙版，还是 Windows 酷睿 Ultra 版？');
  const recommendationStatus = retrieved.ambiguous_model ? 'needs_model_clarification'
    : evidence.length ? 'needs_staff_confirmation' : 'insufficient_evidence';

  const generated = await (options.generateCustomer || generateCustomer)({ task, analysis: planned.value, evidence, ambiguous_model: Boolean(retrieved.ambiguous_model), model_candidates: retrieved.model_candidates || [] });
  assertGrounded(generated.value, evidence);
  const output = generated.value;

  return {
    status: retrievalError ? 'partial' : 'success',
    generation_mode: 'llm',
    llm: pipelineMeta(planned.meta, generated.meta, planned.value.retrieval_queries),
    customer: {
      audience: insight.audience,
      needs: insight.needs,
      concerns: insight.concerns,
      buying_stage: insight.buying_stage,
      summary: insight.summary,
    },
    clarification: { questions: [...new Set([...questions, ...output.questions])], required_before_specific_recommendation: Boolean(retrieved.ambiguous_model || !task.model || !evidence.length) },
    solution: {
      status: recommendationStatus,
      model: task.model || null,
      rationale: retrieved.ambiguous_model ? '本地资料存在多个同系列版本，请先选择版本。' : output.rationale,
      evidence: evidence.map((item) => ({
        title: item.title,
        source_path: item.source_path || item.title,
        source_url: item.source_url || '',
        excerpt: item.content.slice(0, 600),
        model: item.model || null,
        confidence: item.confidence,
        source_status: item.source_status || 'unknown',
        updated_at: item.updated_at || null,
      })),
      candidate_models: retrieved.model_candidates || [],
      price_solution: buildPriceSolution(task.model, task.budget),
    },
    sales_script: { ...output.sales_script, discovery_questions: output.questions },
    objection_responses: output.objection_responses.map((item) => ({ ...item, requires_store_confirmation: true })),
    follow_up_plan: output.follow_up_plan.map((item) => ({ ...item, requires_staff_review: true })),
    guardrails: {
      price_promises_allowed: false,
      automatic_message_sending: false,
      note: '推荐、价格和跟进内容均需店员结合客户实际情况确认；本接口不会自动联系客户。',
      retrieval_warning: retrievalError || null,
    },
  };
}

module.exports = { assistCustomer, inferCustomer, buildFollowUpPlan };
