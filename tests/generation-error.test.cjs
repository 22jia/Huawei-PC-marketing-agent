const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const renderer = import(`data:text/javascript;base64,${fs.readFileSync(path.join(__dirname, '../apps/web/src/lib/generationError.js')).toString('base64')}`);

test('generation errors explain a local API connection failure', async () => {
  const { formatGenerationError } = await renderer;
  assert.match(formatGenerationError(new TypeError('Failed to fetch')), /无法连接本地创作服务/);
});

test('generation errors preserve server-side messages', async () => {
  const { formatGenerationError } = await renderer;
  assert.match(formatGenerationError(new Error('模型服务暂时不可用（LLM_REQUEST_FAILED）')), /LLM_REQUEST_FAILED/);
});

test('blocked content shows the run ID and an actionable diagnostic instruction', async () => {
  const { formatGenerationError } = await renderer;
  const error = Object.assign(new Error('核验未通过'), { code: 'UNSUPPORTED_CLAIM', request_id: 'req_example' });
  const text = formatGenerationError(error);
  assert.match(text, /req_example/);
  assert.match(text, /运行日志/);
  assert.doesNotMatch(text, /请稍后重试/);
});
