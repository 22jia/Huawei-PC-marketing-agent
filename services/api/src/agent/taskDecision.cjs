const { evidenceContext } = require('../clients/evidenceContext.cjs');
function validateRequirementIssues(task, issues, evidence) {
  const fail = (code, message) => { throw Object.assign(new Error(message), { code }); };
  if (!Array.isArray(issues) || !issues.length || issues.some(issue =>
    !issue || !['conflict', 'unsupported'].includes(issue.kind) ||
    !(task.requirements || []).includes(issue.requirement) || typeof issue.reason !== 'string' || !issue.reason.trim() ||
    !Array.isArray(issue.references) || (issue.kind === 'conflict' && !issue.references.length))) {
    fail('LLM_INVALID_SCHEMA', '要求冲突检查格式无效，不能据此要求用户决策。');
  }
  const documents = evidenceContext(evidence);
  const normalize = value => String(value || '').replace(/[\s*`]/g, '');
  return issues.map(issue => ({ ...issue, references: issue.references.map(ref => {
    const doc = documents.find(doc => doc.id === ref?.evidence_id);
    const original = doc?.quote_candidates.find(q => q.quote_id === ref?.quote_id);
    const quote = ref?.quote_id ? original?.quote : ref?.quote;
    if (!doc || typeof quote !== 'string' || quote.trim().length <= 3 || !normalize(doc.content).includes(normalize(quote))) {
      fail('UNSUPPORTED_CITATION', '要求冲突引用了不存在的原文，已停止生成。');
    }
    return { ...ref, quote };
  }) }));
}
function requirementDecision(task, issues, evidence) {
  const questions = issues.map((issue, index) => {
    const sources = issue.references.map(ref => ({
      evidence_id: ref.evidence_id,
      title: evidence[Number(ref.evidence_id.slice(1)) - 1]?.title,
      source_path: evidence[Number(ref.evidence_id.slice(1)) - 1]?.source_path,
      quote: ref.quote,
    }));
    return {
      id: `requirement_${index + 1}`, field: 'requirements',
      kind: issue.kind, requirement: issue.requirement, reason: issue.reason, sources,
      choices: ['删除或修改这项要求，按已核实事实继续', '提供该型号及配置的可核验来源后重新检查', '更换产品型号或版本后重新检索'],
    };
  });
  const reply = ['有要求需要你决定：', ...questions.map((question, index) => [
    `${index + 1}. 你的要求：“${question.requirement}”`,
    question.kind === 'conflict' ? '本次资料与这项要求存在冲突。' : '本次检索资料暂未支持这项要求；这不代表产品一定不具备该能力。',
    question.reason,
    ...question.sources.map(source => `资料《${source.title}》：${source.quote}`),
    '可以选择：' + question.choices.join('；') + '。',
  ].join('\n')), '请直接回复要修改或删除哪项要求，或提供具体来源。我会根据你的决定重新核对后继续。'].join('\n\n');
  return { status: 'needs_confirmation', result_type: 'blocked', generation_mode: 'not_generated', task,
    reply, decision_required: { type: 'requirement_evidence', questions },
    validation: { status: 'fail', blocking_issues: questions.map(q => q.reason) },
  };
}
module.exports = { requirementDecision, validateRequirementIssues };
