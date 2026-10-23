function boundedNumber(value, fallback, min, max) {
  if (value === undefined || value === '' || !Number.isFinite(Number(value))) return fallback;
  return Math.max(min, Math.min(max, Math.floor(Number(value))));
}

function createRepairPolicy(options = {}) {
  const maxRevisions = boundedNumber(options.maxRevisions ?? process.env.AGENT_MAX_REVISIONS, 4, 0, 8);
  const timeoutMs = boundedNumber(options.timeoutMs ?? process.env.AGENT_REPAIR_TIMEOUT_MS, 180000, 1, 600000);
  const now = options.now || Date.now;
  const started = now();
  const drafts = new Set();
  const failures = new Map();
  function normalize(value) {
    if (typeof value === 'string') return value.replace(/\s+/g, ' ').trim();
    if (Array.isArray(value)) return value.map(normalize);
    if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().filter(key => value[key] !== '' && value[key] != null).map(key => [key, normalize(value[key])]));
    return value;
  }
  function decide({ attempt, content, issues }) {
    const fingerprint = JSON.stringify(normalize(content));
    const signature = JSON.stringify([...new Set(issues.map(issue => String(issue).replace(/\s+/g, '').toLowerCase()))].sort());
    const repeated = (failures.get(signature) || 0) + 1;
    failures.set(signature, repeated);
    const unchanged = drafts.has(fingerprint);
    drafts.add(fingerprint);
    const elapsed_ms = now() - started;
    const reason = elapsed_ms >= timeoutMs ? 'time_budget_exhausted'
      : unchanged ? 'unchanged_draft'
      : repeated >= 3 ? 'repeated_issues'
      : attempt >= maxRevisions ? 'revision_budget_exhausted' : 'actionable_feedback';
    return { action: reason === 'actionable_feedback' ? 'revise' : 'stop', reason, attempt, max_revisions: maxRevisions, elapsed_ms, timeout_ms: timeoutMs, repeated_issue_count: repeated };
  }
  return { decide };
}

module.exports = { createRepairPolicy };
