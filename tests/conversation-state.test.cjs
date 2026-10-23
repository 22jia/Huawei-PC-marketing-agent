const test = require('node:test');
const assert = require('node:assert/strict');
const { titleFor, ticketDecision } = require('../services/api/src/services/conversationState.cjs');

test('conversation titles use platform, model and audience for content tasks', () => {
	assert.equal(titleFor({}, { task: { platform: 'xiaohongshu', model: 'MateBook 14', audience: '大学生' } }), '小红书-大学生-MateBook 14');
});

test('stored content sessions recalculate their historical title from the confirmed task', () => {
	assert.equal(titleFor({ title: '旧标题', task: { platform: 'wechat', model: 'MateBook X Pro', audience: '职场新人' } }, {}), '公众号-职场新人-MateBook X Pro');
});

test('customer conversation titles identify the mode and inferred audience', () => {
  assert.equal(titleFor({}, { conversation_mode: 'customer', task: { model: 'MateBook 14' }, customer: { audience: '学生' } }), '成交辅助-MateBook 14-学生');
});

test('ticket creation asks for a customer name only after explicit consent', () => {
  let created = null;
  const session = { awaiting_ticket_consent: true, awaiting_ticket_name: false, customer_task: { customer_description: '学生选购电脑', model: 'MateBook 14' } };
  const no = ticketDecision(session, '暂不需要', value => { created = value; return value; });
  assert.equal(no.awaiting_ticket_consent, false);
  assert.equal(created, null);

  const yes = ticketDecision(session, '需要', value => { created = value; return value; });
  assert.match(yes.reply, /客户备注名/);
  assert.equal(yes.awaiting_ticket_name, true);
  assert.equal(created, null);

  const named = ticketDecision({ ...session, awaiting_ticket_consent: false, awaiting_ticket_name: true }, '张同学', value => { created = { ...value, id: 'ticket-1' }; return created; });
  assert.equal(named.ticket_id, 'ticket-1');
  assert.equal(created.customer_name, '张同学');
  assert.equal(created.model, 'MateBook 14');
});
