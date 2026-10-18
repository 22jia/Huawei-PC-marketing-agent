#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { imaApi } = require('../ima-skill/ima_api.cjs');

function loadDotEnv() {
  const envPath = path.resolve(__dirname, '..', '.env');
  if (!fs.existsSync(envPath)) throw new Error('未找到项目根目录 .env');
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)\s*$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
  }
}

function parseResponse(raw, label) {
  let response;
  try {
    response = JSON.parse(raw);
  } catch {
    throw new Error(`${label} 返回了无法解析的响应`);
  }
  if (response.code !== 0) throw new Error(`${label} 失败：${response.msg || '未知错误'}`);
  return response.data || {};
}

function safeItem(item) {
  return {
    title: item.title || item.name || item.kb_name || '',
    media_type: item.media_type,
    media_id: item.media_id ? '[已隐藏]' : undefined,
    description: item.description || item.snippet || item.content || '',
    path: item.path || item.folder_path || '',
  };
}

async function main() {
  loadDotEnv();
  const query = process.argv.slice(2).join(' ').trim() || 'HUAWEI MateBook 14';
  const kbData = parseResponse(
    await imaApi('openapi/wiki/v1/search_knowledge_base', {
      query: '任德耀新建华为PC知识库',
      cursor: '',
      limit: 20,
    }),
    '知识库定位',
  );
  const kb = (kbData.info_list || [])[0];
  if (!kb || !kb.kb_id) throw new Error('没有找到目标华为 PC 知识库');

  const searchData = parseResponse(
    await imaApi('openapi/wiki/v1/search_knowledge', {
      query,
      knowledge_base_id: kb.kb_id,
      cursor: '',
    }),
    '知识库搜索',
  );
  const results = (searchData.info_list || searchData.list || []).map(safeItem);
  console.log(JSON.stringify({
    status: 'ok',
    query,
    knowledge_base: kb.kb_name,
    result_count: results.length,
    results,
  }, null, 2));
}

main().catch((error) => {
  console.error(JSON.stringify({ status: 'error', message: error.message }, null, 2));
  process.exitCode = 1;
});
