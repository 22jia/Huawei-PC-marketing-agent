const { test } = require('node:test');
const assert = require('node:assert/strict');
const { recommendTrends } = require('../services/api/src/services/trendRecommendation.cjs');
const { offerTrends } = require('../services/api/src/services/trendSelection.cjs');
const task = { platform: 'xiaohongshu', model: 'MateBook 14', audience: '大学生', scenario: '上课做笔记' };
const snapshot = { snapshot_id: 's', items: [
  { id: 'food', topic: '周末美食', rank: 1 },
  { id: 'travel', topic: '秋日风景拍照姿势', rank: 2 },
  { id: 'study', topic: '大学生的数字笔记方法', rank: 18, source_url: 'https://example.com/study' },
] };
test('passes whole ranking and confirmed context; accepts only original source IDs with explanations', async () => {
  const result = await recommendTrends(task, snapshot, { requestJson: async (system, input) => {
    assert.equal(input.candidates.length, 3);
    assert.equal(input.task.scenario, task.scenario);
    assert.match(system, /美食、旅游风景/);
    return { value: { recommendations: [
      { id: 'invented', relevance: 'product', reason: 'fake', angle: 'fake' },
      { id: 'study', relevance: 'scenario', reason: '上课笔记与数字笔记方法直接相关', angle: '课堂记录整理', source_url: 'https://fake.com' },
      { id: 'study', relevance: 'scenario', reason: 'duplicate', angle: 'duplicate' },
    ] } };
  } });
  assert.deepEqual(result.items.map(row => row.id), ['study']);
  assert.equal(result.items[0].rank, 18);
  assert.equal(result.items[0].source_url, snapshot.items[2].source_url);
});
test('empty results and model errors never fall back to unrelated raw rankings', async () => {
  for (const requestJson of [async () => ({ value: { recommendations: [] } }), async () => { throw Error('provider down'); }]) {
    const result = await recommendTrends(task, snapshot, { requestJson });
    assert.deepEqual(result.items, []);
    assert.ok(['no_match', 'filter_failed'].includes(result.recommendation_status));
  }
});
test('legacy unfiltered pending lists are re-evaluated and context changes invalidate recommendations', async () => {
  const current = { ...task, trend_selection: { platform: task.platform, status: 'pending', items: snapshot.items } };
  let calls = 0;
  const options = { requestJson: async () => { calls++; return { value: { recommendations: [] } }; } };
  await offerTrends(current, async () => snapshot, options);
  assert.deepEqual(current.trend_selection.items, []);
  await offerTrends(current, async () => snapshot, options);
  assert.equal(calls, 1);
  current.scenario = '出差办公';
  await offerTrends(current, async () => snapshot, options);
  assert.equal(calls, 2);
});
