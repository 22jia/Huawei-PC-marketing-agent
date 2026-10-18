const fs = require('fs');
const path = require('path');

const DEFAULT_ROOT = path.resolve(
  __dirname,
  '../../../../华为PC全板块深度知识库_v7',
);

function walkProductFacts(directory, files = []) {
  if (!fs.existsSync(directory)) return files;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) walkProductFacts(fullPath, files);
    else if (entry.isFile() && entry.name === '产品事实.md') files.push(fullPath);
  }
  return files;
}

function normalize(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9\u3400-\u9fff]/g, '');
}

function requestedModel(query) {
  return String(query || '').match(/(?:huawei\s*)?(?:matebook\s*(?:x|d|gt|pro)?\s*\d+[a-z]?|matebook\s*[x])|(?:华为)?擎云\s*[a-z]?\s*\d+/i)?.[0] || '';
}

function readProductFacts(query, options = {}) {
  const model = requestedModel(query);
  if (!model) return { evidence: [], ambiguous_model: false };

  const root = options.root || process.env.LOCAL_KNOWLEDGE_BASE_PATH || DEFAULT_ROOT;
  const productRoots = [
    path.join(root, 'P1-产品参数库', '01-鸿蒙电脑'),
    path.join(root, 'P1-产品参数库', '02-MateBook-Windows'),
    path.join(root, 'P1-产品参数库', '03-华为擎云商用'),
  ];
  const modelKey = normalize(model.replace(/^(?:huawei\s*|华为)/i, ''));
  let matches = productRoots.flatMap((directory) => walkProductFacts(directory))
    .filter((filePath) => normalize(path.relative(root, filePath)).includes(modelKey))
    .map((filePath) => {
      const content = fs.readFileSync(filePath, 'utf8');
      const relativePath = path.relative(root, filePath).replace(/\\/g, '/');
      const title = content.match(/^#\s+(.+)$/m)?.[1] || path.basename(path.dirname(filePath));
      const sourceUrl = content.match(/^-\s*产品页：\s*(https?:\/\/\S+)/m)?.[1] || '';
      const checkedAt = content.match(/(?:抓取日期|事实基准日)[：:]\s*(\d{4}-\d{2}-\d{2})/)?.[1] || null;
      return {
        title,
        content: content.slice(0, 12000),
        source_path: relativePath,
        source_url: sourceUrl,
        model,
        confidence: 'local_snapshot',
        source_status: 'local_snapshot',
        updated_at: checkedAt,
        retrievable: true,
      };
    });

  const versionTerms = /(鸿蒙|harmonyos|酷睿|ultra|windows|linux|pro\s*s)/i;
  const isVersionSpecified = versionTerms.test(query);
  if (/(鸿蒙|harmonyos)/i.test(query)) {
    matches = matches.filter((item) => /(鸿蒙|harmonyos)/i.test(item.source_path));
  } else if (/(酷睿|ultra|windows)/i.test(query)) {
    matches = matches.filter((item) => /02-MateBook-Windows/i.test(item.source_path));
  }
  const ambiguous = matches.length > 1 && !isVersionSpecified;
  return {
    evidence: ambiguous ? [] : matches.slice(0, 1),
    ambiguous_model: ambiguous,
    model_candidates: ambiguous ? matches.map((item) => item.title) : [],
  };
}

module.exports = { readProductFacts, requestedModel };
