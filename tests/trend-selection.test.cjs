const { test } = require('node:test');
const assert = require('node:assert/strict');
const { offerTrends, applyTrendChoice } = require('../services/api/src/services/trendSelection.cjs');
const { generate } = require('../services/api/src/agent/taskAgent.cjs');
const snapshot = { provider: 'test', items: [{ id: 'a', topic: '通勤', source_url: 'https://www.xiaohongshu.com/' }], snapshot_id: 'snapshot' };
const recommendTrendsJson = async () => ({ value: { recommendations: [{ id: 'a', relevance: 'scenario', reason: '通勤需要携带电脑', angle: '通勤办公的装包需求' }] } });

test('pauses before generation and resumes only with a choice from the saved platform snapshot', async () => {
  const task = { platform: 'xiaohongshu', scenario: '通勤办公', history: [] };
  const offered = await offerTrends(task, async () => snapshot, { requestJson: recommendTrendsJson });
  assert.equal(offered.result_type, 'trend_selection');
  task.history = [{ role: 'user', content: '围绕话题创作：不存在' }];
  assert.equal(applyTrendChoice(task), false);
  task.history = [{ role: 'user', content: '自然融入话题：通勤' }];
  assert.equal(applyTrendChoice(task), true);
  assert.equal(task.trend_selection.selected.integration_mode, 'natural_insert');
  assert.equal(await offerTrends(task, () => { throw Error('must not fetch again'); }), null);
  task.platform = 'weibo';
  assert.equal((await offerTrends(task, async () => snapshot, { requestJson: recommendTrendsJson })).result_type, 'trend_selection');
  task.history = [{ role: 'user', content: '跳过热点，直接创作' }];
  assert.equal(applyTrendChoice(task), true);
  assert.equal(task.trend_selection.status, 'skipped');
});

test('complete article requests offer trends before retrieving product evidence', async () => {
  const result = await generate({ platform: 'xiaohongshu', model: '测试型号', audience: '大学生', scenario: '通勤', goal: '到店', history: [{ role: 'user', content: '写一篇软文' }] }, {
    planTask: async () => ({ value: { intent: 'generate', task_updates: {}, retrieval_queries: [] }, meta: {} }),
    discoverInspiration: async () => ({ ...snapshot, inspiration_type: 'expression' }),
    getTrends: async () => { throw Error('must search expressions first'); },
    recommendTrendsJson,
  });
  assert.equal(result.result_type, 'trend_selection');
  assert.equal(result.task.trend_selection.items[0].topic, '通勤');
});
