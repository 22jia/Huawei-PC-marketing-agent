const fs = require('fs');
const path = require('path');
const { imaApi } = require('../../../../ima-skill/ima_api.cjs');

function loadLocalEnv() {
  const envPath = path.resolve(__dirname, '../../../../.env');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)\s*$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
  }
}

function assertCredentials() {
  if (!process.env.IMA_OPENAPI_CLIENTID || !process.env.IMA_OPENAPI_APIKEY) {
    throw new Error('未配置 IMA_OPENAPI_CLIENTID 或 IMA_OPENAPI_APIKEY');
  }
}

function parseResponse(raw, operation) {
  let response;
  try {
    response = JSON.parse(raw);
  } catch {
    throw new Error(`${operation} 返回了无法解析的响应`);
  }
  if (response.code !== 0) throw new Error(`${operation} 失败：${response.msg || '未知错误'}`);
  return response.data || {};
}

async function call(apiPath, body, operation = apiPath) {
  loadLocalEnv();
  assertCredentials();
  return parseResponse(await imaApi(apiPath, body), operation);
}

async function findKnowledgeBase(name) {
  const data = await call('openapi/wiki/v1/search_knowledge_base', {
    query: name,
    cursor: '',
    limit: 20,
  }, '知识库定位');
  const match = (data.info_list || []).find((item) => item.kb_name === name) || data.info_list?.[0];
  if (!match?.kb_id) throw new Error(`没有找到知识库：${name}`);
  return { id: match.kb_id, name: match.kb_name };
}

async function searchKnowledge(query, knowledgeBaseId) {
  const data = await call('openapi/wiki/v1/search_knowledge', {
    query,
    knowledge_base_id: knowledgeBaseId,
    cursor: '',
  }, '知识库搜索');
  return data.info_list || [];
}

async function listKnowledge(knowledgeBaseId, folderId, cursor = '', limit = 50) {
  const body = { knowledge_base_id: knowledgeBaseId, cursor, limit };
  if (folderId) body.folder_id = folderId;
  return call('openapi/wiki/v1/get_knowledge_list', body, '知识库目录');
}

async function getMediaInfo(mediaId) {
  return call('openapi/wiki/v1/get_media_info', { media_id: mediaId }, '原文获取');
}

async function fetchSourceText(mediaInfo) {
  const url = mediaInfo?.url_info?.url;
  if (!url) return '';
  const headers = mediaInfo.url_info.headers || {};
  const response = await fetch(url, { headers });
  if (!response.ok) throw new Error(`原文下载失败：HTTP ${response.status}`);
  return response.text();
}

module.exports = {
  call,
  findKnowledgeBase,
  searchKnowledge,
  listKnowledge,
  getMediaInfo,
  fetchSourceText,
};
