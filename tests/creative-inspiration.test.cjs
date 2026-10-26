const test = require('node:test');
const assert = require('node:assert/strict');
const { discover, choose, parseBing, parseSogou } = require('../services/api/src/services/creativeInspiration.cjs');
const { applyTrendChoice } = require('../services/api/src/services/trendSelection.cjs');

test('search parsers preserve source links but never treat indexing time as publication time', () => {
  const rows = parseBing('<rss><item><title>不烧心文学</title><link>https://example.com/a</link><description>一种表达</description><pubDate>today</pubDate></item></rss>');
  assert.equal(rows[0].published_at, null);
  assert.equal(rows[0].source_url, 'https://example.com/a');
  assert.deepEqual(parseSogou('<html>请完成验证</html>'), []);
  assert.deepEqual(parseBing('<item><link>javascript:alert(1)</link></item>'), []);
});

test('only source-supported expressions can be selected and resumed in the unchanged conversation', async () => {
  const task = { platform: 'xiaohongshu', model: 'test-inspiration', audience: '大学生', history: [] };
  const item = { topic: '不烧心', meaning: '表达靠谱', reason: '表达选购取舍', angle: '转译表达', example: '选得明白，心里踏实', source_ids: ['S1'] };
  const result = await discover(task, {
    query: 'test-supported', search: async () => [{ title: '不烧心文学', snippet: '表达靠谱的句式', source_url: 'https://example.com/meme' }],
    requestJson: async () => ({ value: { items: [{ ...item, topic: '凭空编梗' }, { ...item, source_ids: ['S1', 'S404'] }, item] } }),
  });
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].published_at, null);
  assert.equal(result.items[0].verification, 'search_summary_only');
  assert.equal(choose(result.discovery_id, result.items[0].id, { ...task, audience: '其他人群' }), null);
  task.trend_selection = choose(result.discovery_id, result.items[0].id, task);
  task.history.push({ role: 'user', content: '自然融入话题：不烧心' });
  assert.equal(applyTrendChoice(task), true);
  assert.equal(task.trend_selection.selected.kind, 'expression');
});

test('unavailable search returns an honest empty result without invoking the model', async () => {
  const result = await discover({ model: 'test-search-failed', platform: 'weibo' }, { search: async () => { throw new Error('blocked'); }, requestJson: async () => { throw new Error('must not call'); } });
  assert.equal(result.recommendation_status, 'source_unavailable');
  assert.deepEqual(result.items, []);
});


test('publication and popularity labels require separate evidence, never fetch time or model claims', () => {
  const { assessSources } = require('../services/api/src/services/creativeInspiration.cjs');
  const now = new Date('2026-10-26T00:00:00Z');
  const source = { source_url: 'https://example.com/a', published_at: '2026-10-25T00:00:00Z' };
  assert.equal(assessSources([source], now).label, '表达参考（时间待核实）');
  const recent = { ...source, publication_verified: true };
  assert.equal(assessSources([recent], now).label, '近期表达参考');
  assert.equal(assessSources([{ ...recent, propagation_evidence: { verified: true, type: 'platform_ranking', source_url: source.source_url, description: '平台榜单第3位' } }], now).label, '热门梗');
  assert.equal(assessSources([{ ...recent, published_at: '2025-01-01' }], now).freshness, 'source_time_unknown');
  assert.equal(assessSources([{ ...recent, published_at: '2027-01-01' }], now).freshness, 'source_time_unknown');
});
