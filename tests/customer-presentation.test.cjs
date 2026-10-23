const test = require('node:test');
const assert = require('node:assert/strict');
const sessions = require('../services/api/src/services/sessionStore.cjs');

const resultFor = model => ({
  status: 'success', result_type: 'customer_assist', reply: `推荐 ${model}`,
  solution: { candidate_products: [{ model }] },
  follow_up_plan: [{ day: 1, message_draft: `关于 ${model} 的体验` }],
  awaiting_ticket_consent: true,
  task: { history: ['should not be duplicated in presentation'] },
});

test('each assistant turn keeps its own cards after another result and a disk reload', async () => {
  const { customerPresentation, restoreChatMessages } = await import('../apps/web/src/lib/customerPresentation.mjs');
  const session = sessions.create({ title: 'inline presentation test' });
  try {
    for (const model of ['MateBook 14', 'MateBook X Pro']) {
      const result = resultFor(model);
      sessions.append(session.id, [{ role: 'assistant', content: [{ type: 'text', text: result.reply }], metadata: { custom: { studio_customer: customerPresentation(result) } } }], { result });
    }
    const restored = restoreChatMessages(sessions.get(session.id));
    assert.deepEqual(restored.map(m => m.metadata.custom.studio_customer.solution.candidate_products[0].model), ['MateBook 14', 'MateBook X Pro']);
    assert.match(restored[0].metadata.custom.studio_customer.follow_up_plan[0].message_draft, /MateBook 14/);
    assert.equal(restored[0].metadata.custom.studio_customer.task, undefined);
  } finally { sessions.remove(session.id); }
});

test('legacy result is restored only on the matching assistant reply', async () => {
  const { restoreChatMessages, customerPresentation } = await import('../apps/web/src/lib/customerPresentation.mjs');
  const result = resultFor('MateBook 14');
  const messages = [
    { role: 'user', content: [{ type: 'text', text: result.reply }] },
    { role: 'assistant', content: [{ type: 'text', text: result.reply }] },
    { role: 'assistant', content: [{ type: 'text', text: '已为你建立工单' }] },
  ];
  const restored = restoreChatMessages({ result, messages });
  assert.equal(restored[0].metadata, undefined);
  assert.equal(restored[1].metadata.custom.studio_customer.solution.candidate_products[0].model, 'MateBook 14');
  assert.equal(restored[2].metadata, undefined);
  assert.equal(restoreChatMessages({ messages: [messages[2]], result })[0].metadata, undefined);
  assert.equal(customerPresentation({ ...result, status: 'needs_clarification' }), undefined);
  assert.equal(customerPresentation({ ...result, result_type: 'ticket_created' }), undefined);
});

test('continuing a legacy conversation preserves its cards before replacing the latest result', async () => {
  const { restoreChatMessages } = await import('../apps/web/src/lib/customerPresentation.mjs');
  const result = resultFor('MateBook 14');
  const session = sessions.create();
  try {
    sessions.update(session.id, { result, messages: [{ role: 'assistant', content: result.reply }] });
    sessions.append(session.id, [{ role: 'assistant', content: '请告诉我客户备注名' }], { result: { result_type: 'ticket_decision', reply: '请告诉我客户备注名' } });
    const messages = restoreChatMessages(sessions.get(session.id));
    assert.equal(messages[0].metadata.custom.studio_customer.solution.candidate_products[0].model, 'MateBook 14');
    assert.equal(messages[1].metadata, undefined);
  } finally { sessions.remove(session.id); }
});

test('streamed final reply includes structured customer data, progress never does', async () => {
  const { createStudioAdapter } = await import('../apps/web/src/lib/studioAdapter.mjs');
  const result = resultFor('MateBook 14');
  const adapter = createStudioAdapter({ getTask: () => ({}), getArtifact: () => null,
    fetchImpl: async () => new Response(`event: result\ndata: ${JSON.stringify(result)}\n\n`, { headers: { 'Content-Type': 'text/event-stream' } }),
    formatError: error => error.message,
  });
  const updates = [];
  for await (const value of adapter.run({ messages: [] })) updates.push(value);
  assert.equal(updates[0].metadata.custom.studio_customer, undefined);
  assert.equal(updates.at(-1).metadata.custom.studio_customer.solution.candidate_products[0].model, 'MateBook 14');
  assert.equal(updates.at(-1).content[0].text, result.reply);
});
