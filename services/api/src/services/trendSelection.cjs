const { recommendTrends, contextKey, VERSION } = require('./trendRecommendation.cjs');
function applyTrendChoice(task) {
  const state = task.trend_selection;
  if (!state || state.platform !== task.platform || state.status !== 'pending') return false;
  const text = task.history.filter(m => m.role === 'user').at(-1)?.content.trim() || '';
  if (text === '跳过热点，直接创作') {
    state.status = 'skipped'; return true;
  }
  const match = text.match(/^(围绕话题创作|自然融入话题)：(.+)$/);
  const item = match && state.items.find(item => item.topic === match[2]);
  if (!item) return false;
  state.status = 'selected';
  state.selected = { ...item, integration_mode: match[1] === '围绕话题创作' ? 'topic_driven' : 'natural_insert' };
  return true;
}

async function offerTrends(task, getTrends, options = {}) {
  if (!['xiaohongshu', 'weibo', 'wechat', 'wechat_moments', 'douyin', 'bilibili'].includes(task.platform) || task.output_type === 'image') return null;
  if (task.trend_selection?.platform === task.platform && task.trend_selection.status !== 'pending') return null;
  if (task.last_artifact && !task.trend_selection) return null;
  if (task.trend_selection?.platform !== task.platform || task.trend_selection.relevance_version !== VERSION || task.trend_selection.context_key !== contextKey(task)) {
    const filtered = options.discover
      ? await options.discover(task, { signal: options.signal })
      : await recommendTrends(task, await getTrends(task.platform), options);
    task.trend_selection = { ...filtered, platform: task.platform, status: 'pending' };
  }
  const state = task.trend_selection;
  return { status: 'needs_confirmation', result_type: 'trend_selection', generation_mode: 'not_generated', task, trend_selection: state,
    reply: state.items.length ? '已读取需求并检索来源，按平台、人群和产品筛选了几个切入点。请先选择，再开始创作；也可以按原需求直接写。' : state.recommendation_status === 'no_match' ? '当前榜单没有适合这次创作的话题，可以跳过热点，按原需求创作。' : '暂时未能完成热点筛选，可以跳过热点，按原需求创作。',
    quick_replies: ['跳过热点，直接创作'] };
}
module.exports = { applyTrendChoice, offerTrends };
