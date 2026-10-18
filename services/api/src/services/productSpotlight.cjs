const fs = require('fs');
const path = require('path');
const { ROOT } = require('./localKnowledgeBrowser.cjs');

const productRoot = path.join(ROOT, 'P1-产品参数库');

function section(text, heading) {
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex((line) => line.trim() === `## ${heading}`);
  if (start < 0) return '';
  const body = [];
  for (let index = start + 1; index < lines.length; index += 1) {
    if (/^##\s/.test(lines[index])) break;
    body.push(lines[index]);
  }
  return body.join('\n').trim();
}

function extractAudience(text) {
  const taskSection = section(text, '适合进入候选清单的任务');
  const bullets = [...taskSection.matchAll(/^[-*]\s+(.+)$/gm)].map((match) => match[1].trim());
  // Keep the full task index: scenario search (for example "大学生") may
  // depend on a bullet that appears after the first five positioning points.
  return bullets.slice(0, 20);
}

function listImages(directory) {
  if (!fs.existsSync(directory)) return [];
  const images = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) images.push(...listImages(target));
    else if (entry.isFile() && /\.(?:jpe?g|png|webp)$/i.test(entry.name)) images.push(target);
  }
  return images;
}

function getSpotlightProducts() {
  if (!fs.existsSync(productRoot)) return [];
  const results = [];
  const walk = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const target = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(target);
      else if (entry.isFile() && entry.name === '产品事实.md') {
        const content = fs.readFileSync(target, 'utf8');
        const companion = path.join(path.dirname(target), '卖点与限制.md');
        const salesNotes = fs.existsSync(companion) ? fs.readFileSync(companion, 'utf8') : '';
        const name = content.match(/^#\s+(.+?)(?:\s*[｜|].*)?$/m)?.[1]?.replace(/\s+-\s+产品事实$/, '').trim() || path.basename(path.dirname(target));
        const positioning = section(salesNotes, '一句话定位').split(/\r?\n/).find((line) => line.trim() && !line.startsWith('这句话')) || '';
        const relative = path.relative(ROOT, target).replace(/\\/g, '/');
        const images = listImages(path.join(path.dirname(target), 'images'));
        const checkedAt = content.match(/(?:抓取日期|事实基准日)[：:]\s*(\d{4}-\d{2}-\d{2})/)?.[1]
          || salesNotes.match(/事实基准日[：:]\s*(\d{4}-\d{2}-\d{2})/)?.[1] || null;
        results.push({
          id: relative,
          name,
          category: path.basename(path.dirname(path.dirname(target))),
          positioning,
          suitable_tasks: extractAudience(salesNotes),
          checked_at: checkedAt,
          source_path: relative,
          source_url: content.match(/^-\s*产品页：[ \t]*(https?:\/\/\S+)/m)?.[1] || '',
          vmall_search_url: `https://www.vmall.com/portal/search/index.html?targetRoute=searchresult&searchWord=${encodeURIComponent(name)}`,
          detail: content,
          image: images[0] ? `/api/v1/products/image?path=${encodeURIComponent(path.relative(ROOT, images[0]).replace(/\\/g, '/'))}` : '',
        });
      }
    }
  };
  walk(productRoot);
  return results.sort((a, b) => (b.checked_at || '').localeCompare(a.checked_at || '') || a.name.localeCompare(b.name, 'zh-CN'));
}

function resolveProductImage(relativePath) {
  const resolved = path.resolve(ROOT, String(relativePath || ''));
  if (!resolved.startsWith(`${ROOT}${path.sep}`) || !/\.(?:jpe?g|png|webp)$/i.test(resolved)) return null;
  return fs.existsSync(resolved) && fs.statSync(resolved).isFile() ? resolved : null;
}

module.exports = { getSpotlightProducts, resolveProductImage };
