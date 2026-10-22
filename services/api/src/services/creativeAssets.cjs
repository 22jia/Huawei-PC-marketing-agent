const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { ROOT } = require('./localKnowledgeBrowser.cjs');
const { resolveProductImage } = require('./productSpotlight.cjs');

function parseCsv(text) {
  const rows = []; let row = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') { if (quoted && text[i + 1] === '"') { field += '"'; i++; } else quoted = !quoted; }
    else if (c === ',' && !quoted) { row.push(field); field = ''; }
    else if (c === '\n' && !quoted) { row.push(field.replace(/\r$/, '')); rows.push(row); row = []; field = ''; }
    else field += c;
  }
  if (field || row.length) { row.push(field.replace(/\r$/, '')); rows.push(row); }
  const headers = (rows.shift() || []).map((x) => x.replace(/^\uFEFF/, ''));
  return rows.filter((r) => r.some(Boolean)).map((r) => Object.fromEntries(headers.map((h, i) => [h, r[i] || ''])));
}
function creativeAssets(evidence) {
  // Only images belonging to this retrieval's exact product facts directory.
  const anchors = evidence.filter((e) => /^P1-/.test(e.source_path || '') && /[\\/]产品事实\.md$/.test(e.source_path));
  const assets = [];
  for (const anchor of anchors) {
    const directory = path.resolve(ROOT, path.dirname(anchor.source_path));
    if (!directory.startsWith(`${ROOT}${path.sep}`)) continue;
    for (const sub of ['', '商城款式图片']) {
      const folder = path.join(directory, sub);
      const index = path.join(folder, '图片索引.csv');
      if (!fs.existsSync(index)) continue;
      for (const row of parseCsv(fs.readFileSync(index, 'utf8'))) {
        const name = row['文件名'];
        if (!name || path.basename(name) !== name) continue;
        const file = [path.join(folder, 'images', name), path.join(folder, name)].find((f) => fs.existsSync(f));
        if (!file) continue;
        const relative = path.relative(ROOT, file).replace(/\\/g, '/');
        if (!resolveProductImage(relative)) continue;
        const source = row['来源页面'] || row['商品页URL'];
        try { if (!/(^|\.)(consumer\.huawei\.com|vmall\.com)$/.test(new URL(source).hostname)) continue; } catch { continue; }
        assets.push({ id: `img_${crypto.createHash('sha256').update(relative).digest('hex').slice(0, 12)}`, name, source_path: relative, url: `/api/v1/products/image?path=${encodeURIComponent(relative)}`, description: row['官网图片说明'] || row['画面说明'] || name, model: row['产品型号'] || anchor.title, source_url: source, width: Number(row['宽度']) || null, height: Number(row['高度']) || null, review_status: 'metadata_matched_pending_manual_review' });
      }
    }
  }
  return [...new Map(assets.map((a) => [a.id, a])).values()].slice(0, 24);
}
function resolveImagePlan(plan, candidates, limit, options = {}) {
  const used = new Set();
  return plan.map((p) => {
    const asset = candidates.find((a) => a.id === p.asset_id);
    if (!asset || (!options.allowRepeated && used.has(p.asset_id)) || !['cover', 'inline', 'closing'].includes(p.placement) || typeof p.caption !== 'string' || !p.caption.trim() || typeof p.purpose !== 'string') throw Object.assign(new Error('模型配图规划含无效素材或重复引用，请重试。'), { code: 'LLM_INVALID_IMAGE_PLAN' });
    used.add(p.asset_id);
    if (!Number.isInteger(p.after_paragraph) || p.after_paragraph < 0 || (p.placement !== 'cover' && p.after_paragraph < 1)) throw Object.assign(new Error('配图缺少有效的正文段落插入位置'), { code: 'LLM_INVALID_IMAGE_PLAN' });
    return { ...asset, caption: p.caption, purpose: p.purpose, placement: p.placement, after_paragraph: p.after_paragraph };
  }).slice(0, limit);
}
module.exports = { creativeAssets, resolveImagePlan, parseCsv };
