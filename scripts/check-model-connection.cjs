#!/usr/bin/env node
// Print only diagnostic status; never print credentials or provider response bodies.
async function main() {
  const { LLM_BASE_URL: base, LLM_API_KEY: key, LLM_MODEL: model } = process.env;
  if (!base || !key || !model) {
    console.log('CONFIG_MISSING: run with node --env-file=.env scripts/check-model-connection.cjs');
    process.exitCode = 1;
    return;
  }
  const endpoint = base.replace(/\/$/, '');
  const headers = { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
  console.log('Configured model:', model);
  for (const stage of ['models', 'chat']) {
    const started = Date.now();
    console.log(stage === 'models' ? 'Checking model list...' : 'Checking one minimal text generation (may use a small amount of text credit)...');
    try {
      const response = await fetch(`${endpoint}/${stage === 'models' ? 'models' : 'chat/completions'}`, {
        method: stage === 'models' ? 'GET' : 'POST',
        headers,
        redirect: 'error',
        signal: AbortSignal.timeout(60000),
        ...(stage === 'chat' ? { body: JSON.stringify({ model, temperature: 0.3,
          response_format: { type: 'json_object' },
          messages: [{ role: 'system', content: 'Reply with JSON only.' }, { role: 'user', content: 'Return {"ok":true} only.' }],
        }) } : {}),
      });
      console.log(`${stage}: HTTP ${response.status}, ${Math.round((Date.now() - started) / 1000)}s`);
      if (!response.ok) {
        await response.body?.cancel();
        process.exitCode = 1;
        continue;
      }
      const payload = await response.json();
      if (stage === 'models') {
        const available = Array.isArray(payload.data) && payload.data.some((item) => item.id === model);
        console.log('Configured model listed:', available);
      } else {
        const content = payload.choices?.[0]?.message?.content;
        console.log('Chat response received:', typeof content === 'string' && content.length > 0);
        if (typeof content !== 'string' || !content.length) process.exitCode = 1;
      }
    } catch (error) {
      const code = error.cause?.code || error.code;
      console.log(`${stage}: ${error.name}, ${typeof code === 'string' && /^[A-Z0-9_]+$/.test(code) ? code : 'REQUEST_FAILED'}, ${Math.round((Date.now() - started) / 1000)}s`);
      process.exitCode = 1;
    }
  }
}
main().catch(() => { console.log('DIAGNOSTIC_FAILED'); process.exitCode = 1; });
