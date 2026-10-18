const { search: searchLocalKnowledge } = require('./localKnowledgeSearch.cjs');
const { searchVmall } = require('./vmallService.cjs');
const { readProductFacts } = require('./localProductKnowledge.cjs');

function needsVmall(query, options = {}) {
  return Boolean(options.dynamic || /(价格|售价|多少钱|优惠|促销|补贴|库存|现货|购买|在售|商城)/i.test(String(query || '')));
}

async function retrieveEvidence(query, options = {}) {
  const local = searchLocalKnowledge(query, { root: options.localKnowledge?.root, limit: options.limit || 5, maxChars: options.maxChars || 12000 });
  const product = readProductFacts(query, options.localKnowledge);
  const evidence = [...(product.evidence.length ? product.evidence : local.evidence)];
  let warning = null;
  let dynamic = null;
  if (!options.localOnly && needsVmall(query, options)) {
    dynamic = await searchVmall(query, { timeoutMs: options.vmallTimeoutMs || 8000 });
    evidence.push(...(dynamic.evidence || []));
    warning = dynamic.warning || null;
  }
  return {
    knowledge_base: '华为PC全板块深度知识库_v7', query, evidence,
    usable_evidence: evidence.filter((item) => item.retrievable !== false && item.content),
    matched_count: evidence.length, retrieval_warning: warning,
    retrieval_mode: dynamic?.evidence?.length ? 'local_plus_vmall' : 'local_knowledge_base',
    local_source: { status: 'available', name: '华为PC全板块深度知识库_v7', root: local.root },
    dynamic_source: dynamic ? { status: dynamic.source_status, url: dynamic.source_url, checked_at: dynamic.checked_at } : { status: 'not_requested', url: 'https://www.vmall.com/' },
    ambiguous_model: product.ambiguous_model, model_candidates: product.model_candidates || [],
  };
}

module.exports = { retrieveEvidence, needsVmall };
