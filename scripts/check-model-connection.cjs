#!/usr/bin/env node
// Run locally; never print credentials or provider response bodies.
const { isConfigured, requestJson } = require('../services/api/src/clients/llmClient.cjs');
async function main() {
  console.log('文字模型配置完整：', isConfigured());
  if (!isConfigured()) { process.exitCode = 1; return; }
  console.log('文字模型：', process.env.LLM_MODEL);
  console.log('发送最小连接测试，最多等待 60 秒……');
  const started = Date.now();
  try {
    const result = await requestJson('只返回 JSON：{"ok":true}', {}, { timeoutMs: 60000 });
    console.log('连接成功；耗时（秒）：', ((Date.now() - started) / 1000).toFixed(1));
    console.log('JSON 响应有效：', result.value.ok === true);
  } catch (error) {
    console.log('检测失败：', error.code || 'UNKNOWN');
    console.log('说明：', error.code ? error.message : '请检查本机网络连接。');
    console.log('耗时（秒）：', ((Date.now() - started) / 1000).toFixed(1));
    process.exitCode = 1;
  }
}
main().catch(() => { console.log('检测未完成。'); process.exitCode = 1; });
