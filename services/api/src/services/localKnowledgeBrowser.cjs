const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(process.env.LOCAL_KNOWLEDGE_BASE_PATH || path.join(__dirname, '../../../../华为PC全板块深度知识库_v7'));
const ROOT_ID = 'local-root';

function safePath(id = ROOT_ID) {
  if (!id || id === ROOT_ID) return ROOT;
  const relative = String(id).replace(/^local:/, '');
  const resolved = path.resolve(ROOT, relative);
  if (resolved !== ROOT && !resolved.startsWith(`${ROOT}${path.sep}`)) throw new Error('知识库路径无效');
  return resolved;
}

function list(folderId = ROOT_ID) {
  const directory = safePath(folderId);
  const items = fs.readdirSync(directory, { withFileTypes: true })
    .filter((entry) => !entry.name.startsWith('.'))
    .sort((a, b) => Number(b.isDirectory()) - Number(a.isDirectory()) || a.name.localeCompare(b.name, 'zh-CN'))
    .map((entry) => {
      const relative = path.relative(ROOT, path.join(directory, entry.name)).replace(/\\/g, '/');
      return { id: `local:${relative}`, title: entry.name, kind: entry.isDirectory() ? 'folder' : 'file', media_type: entry.isDirectory() ? 99 : 7 };
    });
  return { items, knowledge_base: '华为PC全板块深度知识库_v7', folder: folderId, source_status: 'local_knowledge_base' };
}

function readItem(id, title = '') {
  const filePath = safePath(id);
  if (!fs.statSync(filePath).isFile()) throw new Error('请选择具体知识条目');
  const content = fs.readFileSync(filePath, 'utf8');
  return { title: title || path.basename(filePath), content: content.slice(0, 50000), source_path: path.relative(ROOT, filePath).replace(/\\/g, '/'), source_status: 'local_knowledge_base' };
}

module.exports = { ROOT, ROOT_ID, list, readItem };
