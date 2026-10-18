const fs = require('fs');
const path = require('path');

const DEFAULT_ROOT = path.resolve(__dirname, '../../../../华为PC全板块深度知识库_v7');
const PRICE_ROOT = path.join(DEFAULT_ROOT, 'P1-产品参数库', '08-官方公开价格快照');

function normalize(value) { return String(value || '').toLowerCase().replace(/[^a-z0-9\u3400-\u9fff]/g, ''); }
function walk(directory, files = []) {
  if (!fs.existsSync(directory)) return files;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(full, files);
    else if (entry.isFile() && entry.name.endsWith('-价格卡.md')) files.push(full);
  }
  return files;
}
function extractRows(content) {
  const rows = [];
  for (const line of content.split(/\r?\n/)) {
    if (!/^\|\s*20\d\d-\d\d-\d\d/.test(line)) continue;
    const cells = line.split('|').slice(1, -1).map((cell) => cell.trim());
    if (cells.length < 8) continue;
    const amount = Number(cells[3].replace(/[^\d.]/g, ''));
    const type = cells[2];
    if (!amount || !/当前商城(?:活动页价|页面价)/.test(type) || /缺货|下架|无货/.test(cells[5])) continue;
    rows.push({ snapshot_date: cells[0].slice(0, 10), configuration: cells[1], price_type: type, price: amount, status: cells[5], conditions: cells[6], source_url: cells[7].match(/\((https?:\/\/[^)]+)\)/)?.[1] || '' });
  }
  const unique = new Map();
  rows.sort((a, b) => b.snapshot_date.localeCompare(a.snapshot_date));
  for (const row of rows) unique.set(`${row.configuration}|${row.price}`, row);
  return [...unique.values()].sort((a, b) => a.price - b.price);
}

function buildPriceSolution(model, budget) {
  const query = String(model || '').trim();
  if (!query) return null;
  const queryKey = normalize(query);
  const files = walk(PRICE_ROOT).filter((file) => normalize(path.basename(file)).includes(queryKey.replace(/价格卡$/, '')) || queryKey.includes(normalize(path.basename(file).replace('-价格卡.md', ''))));
  if (!files.length) return null;
  if (files.length > 1 && !/(鸿蒙|harmonyos|ultra|酷睿|windows)/i.test(query)) {
    return { status: 'needs_model_clarification', model: query, tiers: [], message: '该系列存在不同系统或配置版本，请先确认具体版本，再比较对应价格档。' };
  }
  const preferred = files.find((file) => {
    const fileName = normalize(path.basename(file));
    return fileName === queryKey || queryKey.includes(fileName.replace('价格卡md', '')) || fileName.includes(queryKey);
  }) || files[0];
  const content = fs.readFileSync(preferred, 'utf8');
  const candidates = extractRows(content);
  if (!candidates.length) return { status: 'unavailable', model: query, tiers: [], message: '本地价格卡没有足够的可用商城页面价记录，不能拼出四档价格方案。' };

  const indices = candidates.length <= 4
    ? candidates.map((_, index) => index)
    : [0, Math.floor((candidates.length - 1) / 3), Math.floor(2 * (candidates.length - 1) / 3), candidates.length - 1];
  const picked = [...new Set(indices)].map((index) => candidates[index]);
  const labels = ['价格优先', '均衡配置', '体验升级', '高配进阶'];
  const numericBudget = Number(String(budget || '').replace(/[^\d.]/g, '')) || 0;
  let recommendedIndex = -1;
  if (numericBudget) {
    for (let index = 0; index < picked.length; index += 1) if (picked[index].price <= numericBudget) recommendedIndex = index;
  }
  return {
    status: 'available', model: content.match(/^#\s+(.+)$/m)?.[1] || query,
    snapshot_date: picked[0]?.snapshot_date || null,
    budget: numericBudget || null,
    recommended_index: recommendedIndex,
    tiers: picked.map((item, index) => ({ ...item, label: labels[index] || `配置档 ${index + 1}`, recommended: index === recommendedIndex })),
    source_path: path.relative(DEFAULT_ROOT, preferred).replace(/\\/g, '/'),
    note: numericBudget ? '根据预算标出不超预算的最高价格档；仍需结合常用软件、目标配置和当日库存确认是否适合。' : '尚未填写预算，先展示价格梯度；填写预算后可标出预算内候选。价格为本地官方页面快照，不代表实时成交价。',
  };
}

module.exports = { buildPriceSolution };
