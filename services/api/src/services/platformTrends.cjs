const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const SOURCES = {
  weibo: [
    { id: 'weibo_web', url: 'https://weibo.com/ajax/side/hotSearch', referer: 'https://weibo.com/', list_type: '微博热搜', rows: b => b.ok === 1 && b.data?.realtime },
    { id: '60s_weibo', url: 'https://60s.viki.moe/v2/weibo', list_type: '微博热搜（聚合）', rows: b => b.code === 200 && b.data },
  ],
  xiaohongshu: [
    { id: '60s_rednote', url: 'https://60s.viki.moe/v2/rednote', list_type: '小红书热搜（聚合）', rows: b => b.code === 200 && b.data },
  ],
};

function normalize(rows, platform) {
  if (!Array.isArray(rows)) throw new Error('榜单响应缺少条目数组');
  const seen = new Set();
  const items = rows.flatMap((row, i) => {
    const topic = String(row.title || row.word || '').trim();
    if (!topic || seen.has(topic) || row.is_ad) return [];
    seen.add(topic);
    const fallback = platform === 'weibo' ? `https://s.weibo.com/weibo?q=${encodeURIComponent(topic)}` : `https://www.xiaohongshu.com/search_result?keyword=${encodeURIComponent(topic)}`;
    let source_url = fallback;
    try {
      const link = new URL(row.link || fallback);
      const domain = platform === 'weibo' ? 'weibo.com' : 'xiaohongshu.com';
      if (link.protocol === 'https:' && (link.hostname === domain || link.hostname.endsWith(`.${domain}`))) source_url = link.href;
    } catch { /* Use the platform search link when the provider link is invalid. */ }
    return [{ id: crypto.createHash('sha256').update(`${platform}:${topic}`).digest('hex').slice(0, 16), topic, rank: Number(row.realpos || row.rank) > 0 ? Number(row.realpos || row.rank) : i + 1, heat_value: row.hot_value ?? row.num ?? row.score ?? null, source_url }];
  });
  if (!items.length) throw new Error('榜单为空，未更新缓存');
  return items;
}

function createTrendService({ fetchImpl = fetch, directory = path.resolve(__dirname, '../../../../data/platform-trends'), now = Date.now, ttl = 30 * 60 * 1000, maxAge = 24 * 60 * 60 * 1000, log = () => {} } = {}) {
  const snapshots = new Map();
  const pending = new Map();
  const retryAfter = new Map();
  const failures = new Map();
  function read(platform) {
    if (snapshots.has(platform)) return snapshots.get(platform);
    try {
      const snapshot = JSON.parse(fs.readFileSync(path.join(directory, `${platform}.json`), 'utf8'));
      if (snapshot.platform === platform && Array.isArray(snapshot.items) && snapshot.items.length && Number.isFinite(Date.parse(snapshot.fetched_at))) {
        snapshots.set(platform, snapshot); return snapshot;
      }
    } catch { /* A missing or broken snapshot triggers a fresh request. */ }
  }
  function present(snapshot, errors = []) {
    const age = snapshot ? Math.max(0, now() - Date.parse(snapshot.fetched_at)) : Infinity;
    if (age >= maxAge) return { status: 'unavailable', items: [], errors, last_success_at: snapshot?.fetched_at || null };
    return { ...snapshot, status: age >= ttl ? 'stale' : 'available', source_updated_at: null, freshness: 'source_time_unknown', cached: true, errors, note: '采集时间仅表示本系统取得数据的时间；上游未提供榜单更新时间，不能据此确认实时性。' };
  }
  async function refresh(platform) {
    const errors = [];
    for (const source of SOURCES[platform]) {
      const started = now();
      try {
        const response = await fetchImpl(source.url, { signal: AbortSignal.timeout(10000), headers: { 'User-Agent': 'Mozilla/5.0', ...(source.referer ? { Referer: source.referer } : {}) } });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const items = normalize(source.rows(await response.json()), platform);
        const fetched_at = new Date(now()).toISOString();
        const snapshot = { platform, provider: source.id, provider_url: source.url, list_type: source.list_type, snapshot_id: crypto.randomUUID(), fetched_at, expires_at: new Date(now() + ttl).toISOString(), items };
        fs.mkdirSync(directory, { recursive: true });
        const file = path.join(directory, `${platform}.json`);
        const temp = `${file}.${crypto.randomUUID()}.tmp`;
        fs.writeFileSync(temp, JSON.stringify(snapshot), { mode: 0o600 });
        fs.renameSync(temp, file);
        snapshots.set(platform, snapshot);
        retryAfter.delete(platform); failures.delete(platform);
        log('trend_fetch', { platform, provider: source.id, duration_ms: now() - started, count: items.length }, 'success');
        return { ...present(snapshot, errors), cached: false };
      } catch (error) {
        errors.push({ provider: source.id, message: error.message });
        log('trend_fetch', { platform, provider: source.id, duration_ms: now() - started, message: error.message }, 'failed');
      }
    }
    failures.set(platform, errors);
    retryAfter.set(platform, now() + 60000);
    return present(read(platform), errors);
  }
  async function get(platform) {
    if (!Object.hasOwn(SOURCES, platform)) throw Object.assign(new Error('platform 仅支持 weibo 或 xiaohongshu'), { code: 'INVALID_PLATFORM' });
    const snapshot = read(platform);
    if (snapshot && now() - Date.parse(snapshot.fetched_at) < ttl) return present(snapshot);
    if ((retryAfter.get(platform) || 0) > now()) return present(snapshot, failures.get(platform));
    if (!pending.has(platform)) pending.set(platform, refresh(platform).finally(() => pending.delete(platform)));
    return pending.get(platform);
  }
  return { get };
}

module.exports = { createTrendService, normalize };
