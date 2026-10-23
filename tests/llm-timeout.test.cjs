const test = require('node:test');
const assert = require('node:assert/strict');
const { requestJson } = require('../services/api/src/clients/llmClient.cjs');
process.env.LLM_API_KEY = 'test-timeout-key';
process.env.LLM_BASE_URL = 'https://model.invalid/v1';
process.env.LLM_MODEL = 'test-model';
process.env.LLM_TIMEOUT_MS = '200';

function pending(signal) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, 500);
    const abort = () => { clearTimeout(timer); reject(signal.reason); };
    if (signal.aborted) abort();
    else signal.addEventListener('abort', abort, { once: true });
  });
}

test('configured model budget allows a slower valid response', async () => {
  const result = await requestJson('system', {}, { fetch: async (_, { signal }) => {
    await new Promise(resolve => setTimeout(resolve, 30));
    assert.equal(signal.aborted, false);
    return { ok: true, json: async () => ({ choices: [{ message: { content: '{"ok":true}' } }] }) };
  } });
  assert.equal(result.value.ok, true);
});

test('timeout before response headers has a distinct timeout code', async () => {
  await assert.rejects(requestJson('system', {}, { timeoutMs: 15, fetch: (_, { signal }) => pending(signal) }), { code: 'LLM_TIMEOUT' });
});

test('timeout while reading the body is not misreported as malformed JSON', async () => {
  await assert.rejects(requestJson('system', {}, { timeoutMs: 15, fetch: async (_, { signal }) => ({ ok: true, text: () => pending(signal) }) }), { code: 'LLM_TIMEOUT' });
});

test('user cancellation remains distinct from model timeout', async () => {
  const controller = new AbortController();
  await assert.rejects(requestJson('system', {}, { signal: controller.signal, fetch: (_, { signal }) => {
    controller.abort();
    return pending(signal);
  } }), { code: 'RUN_CANCELLED' });
});
