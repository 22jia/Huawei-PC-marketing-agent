const test = require('node:test');
const assert = require('node:assert/strict');
const { createRepairPolicy } = require('../services/api/src/agent/repairPolicy.cjs');

test('changing issues can continue beyond two revisions within the budget', () => {
  const policy = createRepairPolicy({ maxRevisions: 4, timeoutMs: 1000 });
  for (let attempt = 0; attempt < 4; attempt++) {
    assert.equal(policy.decide({ attempt, content: { body: `draft ${attempt}` }, issues: [`issue ${attempt}`] }).action, 'revise');
  }
  assert.equal(policy.decide({ attempt: 4, content: { body: 'last' }, issues: ['last'] }).reason, 'revision_budget_exhausted');
});

test('unchanged drafts stop early and repeated issues cannot consume the whole budget', () => {
  const policy = createRepairPolicy({ maxRevisions: 5 });
  policy.decide({ attempt: 0, content: { body: 'same' }, issues: ['bad claim'] });
  assert.equal(policy.decide({ attempt: 1, content: { body: 'same' }, issues: ['bad claim'] }).reason, 'unchanged_draft');
  const repeated = createRepairPolicy({ maxRevisions: 5 });
  for (let attempt = 0; attempt < 2; attempt++) assert.equal(repeated.decide({ attempt, content: `draft ${attempt}`, issues: ['same claim'] }).action, 'revise');
  assert.equal(repeated.decide({ attempt: 2, content: 'new wording', issues: ['same claim'] }).reason, 'repeated_issues');
});

test('shrinking issue sets continue and elapsed budget prevents another call', () => {
  let now = 0;
  const policy = createRepairPolicy({ maxRevisions: 4, timeoutMs: 100, now: () => now });
  policy.decide({ attempt: 0, content: 'one', issues: ['a', 'b'] });
  assert.equal(policy.decide({ attempt: 1, content: 'two', issues: ['b'] }).action, 'revise');
  now = 101;
  assert.equal(policy.decide({ attempt: 2, content: 'three', issues: ['c'] }).reason, 'time_budget_exhausted');
});
