// Resolve only server-provided evidence paths. The model never chooses a URL.
function resolveContentCitations(content, evidence, factPoints = []) {
  const allowed = new Set(factPoints.map(point => point.evidence_id));
  const replace = text => text.replace(/(?<!!)\[E(\d+)\](?!\()/g, (_marker, number) => {
    const id = `E${number}`;
    const source = evidence[Number(number) - 1];
    if (!source || !allowed.has(id)) {
      throw Object.assign(new Error(`文案引用了未策划的资料 ${id}，请重新引用本次事实依据。`), { code: 'UNSUPPORTED_CLAIM' });
    }
    const path = source.source_path;
    if (!path || path.startsWith('/') || path.includes('\\') || path.split('/').some(part => part === '..' || part === '.') || !/\.md$/i.test(path)) return '';
    return `[${number}](#knowledge?path=${encodeURIComponent(path)})`;
  });
  return Object.fromEntries(Object.entries(content).map(([key, value]) => [key,
    ['lead', 'body', 'cta'].includes(key) && typeof value === 'string' ? replace(value) : value,
  ]));
}

module.exports = { resolveContentCitations };
