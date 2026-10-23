const { event } = require('../services/runTrace.cjs');
const { retrieveEvidence } = require('../services/evidenceService.cjs');
const { failure } = require('../clients/llmClient.cjs');

async function collectEvidence(task, analysis, options = {}) {
  const retrieve = options.retrieveEvidence || retrieveEvidence;
  const anchor = task.model || analysis.retrieval_queries[0] || task.customer_description || task.scenario;
  const primary = await retrieve(anchor, { limit: 5, dynamic: Boolean(task.include_price || /价格|优惠|库存|补贴/.test(task.customer_description || '')) });
  const evidence = primary.ambiguous_model ? [] : [...(primary.usable_evidence || primary.evidence || [])];
  const warnings = [primary.retrieval_warning].filter(Boolean);
  warnings.push(...(primary.evidence || []).map((e) => e.warning).filter(Boolean));
  for (const query of analysis.retrieval_queries.slice(0, 2)) {
    if (query === anchor) continue;
    const extra = await retrieve(query, { limit: 3, localOnly: true });
    // Supplemental scenarios cannot replace the selected product's facts.
    evidence.push(...(extra.usable_evidence || extra.evidence || []).filter((item) => !/^P[134][-/]/.test(item.source_path || '')));
    if (extra.retrieval_warning) warnings.push(extra.retrieval_warning);
  }
  const usable = [...new Map(evidence.filter((item) => item.content && item.retrievable !== false && item.confidence !== 'unavailable' && !/^(P4-|90-|99-)/.test(item.source_path || '')).map((item) => [item.source_path || item.source_url || item.title, item])).values()].slice(0, 8);
  return { ...primary, evidence: usable, usable_evidence: usable, matched_count: usable.length, retrieval_warning: [...new Set(warnings)].join('；') || null };
}

function assertGrounded(value, evidence) {
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  const facts = evidence.filter((e) => /^(P1-|P7-)/.test(e.source_path || '') || ['local_snapshot', 'vmall_official'].includes(e.source_status));
  const corpus = facts.map((e) => e.content).join('\n').replace(/\s+/g, '').toLowerCase();
  function blocked(code, message, rule, matches) {
    const details = { rule, matches, sentences: text.split(/(?<=[。！？\n])/).filter(sentence => matches.some(match => sentence.includes(match))), evidence_ids: facts.map((e) => e.source_path || e.source_url) };
    event('grounding', { error: { code, message, details } }, 'failed');
    return Object.assign(failure(code, message), { details });
  }
  // An OLED label or colour gamut does not establish a health benefit.
  // Keep this check independent of the model's semantic review.
  const eyeClaims = text.match(/保护(?:你的|您的)?眼睛|不易疲劳|缓解(?:眼部|视觉|用眼)疲劳|不伤眼|长时间使用也不累眼|(?:不再有|没有|减少|减轻)(?:视觉|用眼|眼部)负担/g) || [];
  if (eyeClaims.some((claim) => !corpus.includes(claim))) throw blocked('UNSUPPORTED_CLAIM', '文案包含未被产品原文支持的护眼或疲劳改善效果，已拦截。', 'eye_claim', eyeClaims.filter(claim => !corpus.includes(claim)));
  const claims = text.match(/\d+(?:\.\d+)?\s*(?:英寸|GB|TB|小时|Hz|nit|kg|公斤|mm|尼特|W)/gi) || [];
  if (claims.some((claim) => !corpus.includes(claim.replace(/\s+/g, '').toLowerCase())) || /全网最低|唯一选择|保证兼容|百分百兼容/.test(text)) throw blocked('UNSUPPORTED_CLAIM', '模型输出含缺少对应证据的参数或承诺，已拦截，请补充资料或重试。', 'parameter_or_promise', [...claims.filter(claim => !corpus.includes(claim.replace(/\s+/g, '').toLowerCase())), ...(text.match(/全网最低|唯一选择|保证兼容|百分百兼容/g) || [])]);
  const priceClaims = text.match(/(?:[¥￥]\s*\d+(?:\.\d+)?|\d+(?:\.\d+)?\s*元)/g) || [];
  if (priceClaims.length && !evidence.some((e) => e.source_status === 'vmall_official' && priceClaims.every((p) => String(e.content).replace(/\s+/g, '').includes(p.replace(/\s+/g, ''))))) throw blocked('UNVERIFIED_PRICE', '模型输出包含未经本次官方商城证据支持的价格，已拦截。', 'price', priceClaims);
}
function pipelineMeta(analysis, generation, queries) {
  return { status: 'success', model: generation.model, stages: [{ stage: 'analysis', ...analysis }, { stage: 'generation', ...generation }], retrieval_queries: queries };
}
module.exports = { collectEvidence, assertGrounded, pipelineMeta };
