const fs = require('fs');
const path = require('path');

const DEFAULT_ROOT = path.resolve(__dirname, '../../../../华为PC全板块深度知识库_v7');
const IGNORED_DIRS = new Set(['images', '.git', 'node_modules']);
const MAX_FILE_BYTES = 256 * 1024;
let indexCache = null;

function rootPath(options = {}) {
  return path.resolve(options.root || process.env.LOCAL_KNOWLEDGE_BASE_PATH || DEFAULT_ROOT);
}

function walk(directory, files = [], root = directory) {
  if (!fs.existsSync(directory)) return files;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || (entry.isDirectory() && IGNORED_DIRS.has(entry.name))) continue;
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(full, files, root);
    else if (entry.isFile() && /\.(md|txt|json)$/i.test(entry.name)) {
      const stat = fs.statSync(full);
      if (stat.size <= MAX_FILE_BYTES) files.push(full);
    }
  }
  return files;
}

function buildIndex(root) {
  return walk(root).map((filePath) => {
    const content = fs.readFileSync(filePath, 'utf8');
    const relative = path.relative(root, filePath).replace(/\\/g, '/');
    const title = content.match(/^#\s+(.+)$/m)?.[1] || path.basename(filePath, path.extname(filePath));
    return { filePath, relative, title, content, normalized: `${relative}\n${title}\n${content}`.toLowerCase() };
  });
}

function getIndex(options = {}) {
  const root = rootPath(options);
  if (!indexCache || indexCache.root !== root) indexCache = { root, files: buildIndex(root), builtAt: new Date().toISOString() };
  return indexCache;
}

function terms(query) { return String(query || '').toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((term) => term.length > 1); }

function search(query, options = {}) {
  const index = getIndex(options);
  const queryTerms = terms(query);
  const scored = index.files.map((item) => {
    const score = queryTerms.reduce((total, term) => total + (item.normalized.includes(term) ? (item.title.toLowerCase().includes(term) ? 4 : 1) : 0), 0);
    return { item, score };
  }).filter(({ score }) => score > 0).sort((a, b) => b.score - a.score || a.item.relative.localeCompare(b.item.relative, 'zh-CN'));
  const limit = Math.min(Number(options.limit) || 5, 20);
  return {
    knowledge_base: '华为PC全板块深度知识库_v7',
    root: index.root,
    index_built_at: index.builtAt,
    evidence: scored.slice(0, limit).map(({ item, score }) => ({
      title: item.title,
      content: item.content.slice(0, options.maxChars || 12000),
      source_path: item.relative,
      source_url: '',
      confidence: score >= 4 ? 'high' : 'medium',
      source_status: 'local_knowledge_base',
      retrievable: true,
      match_score: score,
    })),
  };
}

function invalidate() { indexCache = null; }
module.exports = { DEFAULT_ROOT, rootPath, search, invalidate };
