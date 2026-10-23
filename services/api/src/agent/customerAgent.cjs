const { retrieveEvidence } = require('../services/evidenceService.cjs');
const { planTask, generateCustomer } = require('../clients/llmClient.cjs');
const { collectEvidence, assertGrounded, pipelineMeta } = require('./agentRuntime.cjs');
const { buildPriceSolution } = require('../services/priceSolutionService.cjs');
const { recommendProductsForScenario, classifyCustomerSegment } = require('../services/scenarioProductSearch.cjs');

const FOLLOW_UP_DAYS = [1, 3, 7];

function normalizeInput(input = {}) {
  const description = String(input.customer_description || input.user_input || '').trim();
  const budgetMatch = [...description.matchAll(/预算\s*(?:是|为|在|大概|大约|约|不超过|以内|[:：])?\s*(\d+(?:\.\d+)?)\s*(万|千|[kK])?/g)].at(-1);
  const inferredBudget = budgetMatch ? String(Number(budgetMatch[1]) * (budgetMatch[2] === '万' ? 10000 : /千|k/i.test(budgetMatch[2] || '') ? 1000 : 1)) : '';
  return {
    customer_description: description,
    model: String(input.model || '').trim(),
    budget: String(input.budget || inferredBudget).trim(),
    store_name: String(input.store_name || '').trim(),
    follow_up_days: input.needs_follow_up === false ? [] : Array.isArray(input.follow_up_days)
      ? [...new Set(input.follow_up_days.map(Number).filter((day) => FOLLOW_UP_DAYS.includes(day)))].sort((a, b) => a - b)
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
  if (!task.budget && !/预算|价格|贵|便宜|优惠|\d+(?:\.\d+)?\s*(?:万|千|元|块)/.test(task.customer_description)) questions.push('这次购机大致预算是多少？');
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

function buildFollowUpPlan(days, insight, task = {}) {
  // Fallback copy must not repeat rejected model prose, raw prices or unverified
  // product claims. Use only the customer's stated scenario to choose a topic.
  const scenario = String(task.customer_description || insight.needs?.join(' ') || '');
  const thesis = /论文/.test(scenario);
  const creative = /剪辑|建模|渲染|设计/.test(scenario);
  const phone = /手机|传文件|互传|协同/.test(scenario);
  const portable = /轻|便携|太重|移动|出差/.test(scenario);
  const softwareKnown = /\b(?:Word|WPS|Excel|SPSS|CAD|MATLAB|Photoshop|Premiere)\b/i.test(scenario);
  const topic = thesis ? '论文模板和引用插件' : creative ? '常用创作软件和项目文件' : '常用软件和文件';
  const concern = portable ? '携带负担' : phone ? '手机传文件的操作' : creative ? '软件和项目的适配' : '日常使用体验';
  const scope = task.model ? '这款电脑' : '合适的候选';
  const overBudget = task.over_budget === true;
  const experience = portable ? '您可以先拿起来感受一下，看看平时装包带着是否合适'
    : phone ? '您可以带手机试传一份常用文件，看看操作顺不顺手'
      : '您可以带一份常用文件，试一下编辑和日常操作';
  const messages = {
    1: softwareKnown
      ? `您好，您提到的常用软件，我们选电脑时先核对它的系统要求。您可以准备一份日常文件，用来试一下${scope}的实际操作。`
      : `您好，您在意${concern}，${topic}也值得一起确认。平时最离不开的是哪个软件或插件？我先按它的要求帮您缩小选择范围。`,
    3: overBudget
      ? '您好，咱们先把预算守住。我可以帮您核实意向款的门店优惠，也可以把预算内替代款的主要取舍列清楚；您更想先比较哪一项？'
      : `您好，${experience}。配置取舍和本店可用优惠也可以一起核清，您目前最想先确认哪一点？`,
    7: '您好，电脑选购可以按自己的节奏决定。如果还没定下来，您可以把仍没确认的一点告诉我，我只围绕那一点补充；如果已经选好了或暂时不买，我这边就不再打扰。',
  };
  const byDay = {
    1: { objective: '补齐一个影响选型的条件', action: `先核对${topic}及对应系统要求，已提供的软件不重复询问。收到回复后记录支持情况并缩小候选；未回复不当天追加消息。` },
    3: { objective: overBudget ? '守住预算，比较优惠与替代' : '解决一个取舍，核实门店权益', action: `${overBudget ? '核实意向款报价、优惠资格和叠加关系；仍超预算时准备预算内替代及具体差异。' : '围绕客户首要顾虑准备一次针对性演示，并核实所选配置的门店报价、可用优惠及叠加关系。'}有回复则按其关注点继续；未回复且无新增信息不重复催问。` },
    7: { objective: '确认决定并尊重联系意愿', action: '如已成交，转为首次使用和迁移帮助；仍在比较，只处理一个未决问题；明确不买或拒绝联系则停止，持续未回复则暂停主动跟进并记录。' },
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

  const planned = await (options.planTask || planTask)(task, { signal: options.signal });
  const customerSegment = classifyCustomerSegment(task.customer_description);
  const insight = { ...planned.value, evidence_queries: planned.value.retrieval_queries };
  const questions = buildQuestions(task, insight);
  if (options.interactive && questions.length) {
    return {
      status: 'needs_clarification',
      customer: { audience: insight.audience, needs: insight.needs, concerns: insight.concerns, buying_stage: insight.buying_stage, summary: insight.summary },
      clarification: { questions: [questions[0]], required_before_specific_recommendation: true },
      solution: null,
      sales_script: null,
      objection_responses: [],
      follow_up_plan: [],
    };
  }
  // A specific model is the strongest retrieval anchor. Scenario terms influence
  // the explanation and can later drive a secondary, targeted retrieval pass.
  const query = task.model || insight.evidence_queries[0] || task.customer_description;
  let retrieved = { evidence: [], knowledge_base: '' };
  let retrievalError = '';
  options.signal?.throwIfAborted();
  options.onProgress?.({ stage: 'retrieval', status: 'started' });
  try {
    retrieved = await collectEvidence(task, planned.value, options);
    retrievalError = retrieved.retrieval_warning || '';
    options.onProgress?.({ stage: 'retrieval', status: 'success' });
  } catch (error) {
    options.signal?.throwIfAborted();
    options.onProgress?.({ stage: 'retrieval', status: 'failed' });
    retrievalError = error.message || '知识检索暂不可用';
  }
  options.signal?.throwIfAborted();

  // Scenario queries can match several versions without the customer choosing
  // any model. Only an explicit model selection requires version clarification.
  if (!task.model) retrieved = { ...retrieved, ambiguous_model: false, model_candidates: [] };
  if (options.interactive && task.model && retrieved.ambiguous_model) {
    return {
      status: 'needs_clarification',
      customer: { audience: insight.audience, needs: insight.needs, concerns: insight.concerns, buying_stage: insight.buying_stage, summary: insight.summary },
      clarification: { questions: [`资料中有多个相近版本：${(retrieved.model_candidates || []).join('、')}。客户关注的是哪一个？`], required_before_specific_recommendation: true },
      solution: { status: 'needs_model_clarification', candidate_models: retrieved.model_candidates || [] },
      sales_script: null,
      objection_responses: [],
      follow_up_plan: [],
    };
  }

  const evidence = (retrieved.evidence || []).filter((item) => item.content && item.confidence !== 'unavailable');
  if (!retrievalError && !evidence.length) {
    const unavailable = (retrieved.evidence || []).find((item) => item.warning);
    if (unavailable) retrievalError = unavailable.warning;
  }
  if (retrieved.ambiguous_model) questions.unshift('本地资料中有多个同系列版本；客户关注的是鸿蒙版，还是 Windows 酷睿 Ultra 版？');
  const recommendationStatus = retrieved.ambiguous_model ? 'needs_model_clarification'
    : evidence.length ? 'needs_staff_confirmation' : 'insufficient_evidence';
  const hasProductScenario = customerSegment.key !== 'unknown' || insight.needs?.some((need) => !/预算与购机成本/.test(need));
  const priceSolution = (options.buildPriceSolution || buildPriceSolution)(task.model, task.budget);
  const needsAlternatives = Boolean(task.model && priceSolution?.budget_status === 'over_budget');
  const candidateProducts = (!task.model || needsAlternatives) && !retrieved.ambiguous_model && hasProductScenario
    ? (options.recommendProductsForScenario || recommendProductsForScenario)(task.customer_description, { limit: 20 }).map((product) => ({
      score: product.score,
      model: product.name,
      positioning: product.positioning,
      reason: product.reason || product.positioning,
      recommendation_points: product.recommendation_points,
      recommendation_source_path: product.recommendation_source_path,
      suitable_tasks: product.matched_tasks || product.suitable_tasks?.slice(0, 3) || [],
      source_path: product.source_path,
      source_url: product.source_url,
      image: product.image || '',
      price_solution: (options.buildPriceSolution || buildPriceSolution)(product.name, task.budget),
    })).filter((product) => product.model !== task.model && (!(needsAlternatives || task.budget) || product.price_solution?.budget_status === 'within_budget')).sort((a, b) => {
      const aFit = a.price_solution?.budget_status === 'within_budget' ? 1 : 0;
      const bFit = b.price_solution?.budget_status === 'within_budget' ? 1 : 0;
      const aKnown = a.price_solution?.status === 'available' ? 1 : 0;
      const bKnown = b.price_solution?.status === 'available' ? 1 : 0;
      return bFit - aFit || bKnown - aKnown || (b.score || 0) - (a.score || 0);
    }).slice(0, 3).map(({ score, ...product }) => {
      const prices = product.price_solution;
      const affordable = (prices?.configurations || []).filter((item) => !prices.budget || item.price <= prices.budget);
      const recommended = affordable.sort((a, b) => b.price - a.price)[0] || prices?.tiers?.[0] || null;
      return { ...product, recommended_configuration: recommended,
        comparison: needsAlternatives && recommended ? {
          reference_model: task.model,
          saving: Math.round((priceSolution.minimum_price - recommended.price) * 100) / 100,
          configuration: `${priceSolution.minimum_configuration || '意向配置待核'} → ${recommended.configuration}`,
          note: '不同型号，系统、屏幕及软件兼容性需分别核对',
        } : null };
    })
    : [];

  options.onProgress?.({ stage: 'generateReply', status: 'started' });
  let generated;
  try {
    generated = await (options.generateCustomer || generateCustomer)({ task, analysis: planned.value, evidence, ambiguous_model: Boolean(retrieved.ambiguous_model), model_candidates: retrieved.model_candidates || [] }, { signal: options.signal });
    options.signal?.throwIfAborted();
    options.onProgress?.({ stage: 'generateReply', status: 'success' });
  } catch (error) {
    options.onProgress?.({ stage: 'generateReply', status: 'failed' });
    throw error;
  }
  let output = generated.value;
  try {
    assertGrounded(output, evidence);
  } catch (error) {
    // Keep source-backed product cards when generated prose fails verification.
    // Never return the rejected prose or weaken factual validation.
    if (!['UNSUPPORTED_CLAIM', 'UNVERIFIED_PRICE'].includes(error.code)) throw error;
    retrievalError = retrievalError || '生成话术未通过核验，已改用基础讲解；产品参考信息仍可比较。';
    output = {
      rationale: '先按用途和预算比较候选产品，再核实门店优惠。',
      questions: [],
      sales_script: buildTalkTrack({ ...task, model: '' }, inferCustomer(task.customer_description), [], Boolean(retrieved.ambiguous_model)),
      objection_responses: buildObjectionResponses(insight, []),
      follow_up_plan: buildFollowUpPlan(task.follow_up_days, insight, { ...task, over_budget: needsAlternatives }),
    };
  }
  const displayedRecommendationStatus = candidateProducts.length && recommendationStatus === 'insufficient_evidence'
    ? 'needs_staff_confirmation' : recommendationStatus;

  return {
    status: retrievalError ? 'partial' : 'success',
    generation_mode: 'llm',
    llm: pipelineMeta(planned.meta, generated.meta, planned.value.retrieval_queries),
    customer: {
      segment: customerSegment,
      audience: insight.audience,
      needs: insight.needs,
      concerns: insight.concerns,
      buying_stage: insight.buying_stage,
      summary: insight.summary,
    },
    clarification: { questions: [...new Set([...questions, ...output.questions])], required_before_specific_recommendation: Boolean(retrieved.ambiguous_model || (!evidence.length && !candidateProducts.length)) },
    solution: {
      status: displayedRecommendationStatus,
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
      candidate_products: candidateProducts,
      recommendation_stage: needsAlternatives ? 'budget_alternatives' : task.model ? 'selected' : 'shortlist',
      price_solution: priceSolution,
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
