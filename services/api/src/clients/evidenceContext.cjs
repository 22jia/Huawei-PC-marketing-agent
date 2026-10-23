function evidenceContext(evidence) {
  return evidence.slice(0, 8).map((item, index) => {
    const content = String(item.content || '').slice(0, 12000);
    return { id: `E${index + 1}`, title: item.title, source_path: item.source_path, source_status: item.source_status, source_url: item.source_url, updated_at: item.updated_at || item.checked_at, content, quote_candidates: content.split(/\r?\n\s*\r?\n/).map((s) => s.trim()).filter((s) => s.length > 3 && !s.startsWith('#')).slice(0, 100).map((quote, q) => ({ quote_id: `E${index + 1}Q${q + 1}`, quote })) };
  });
}
module.exports = { evidenceContext };
