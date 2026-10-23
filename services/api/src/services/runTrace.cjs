const fs = require('node:fs');
const path = require('node:path');
const { AsyncLocalStorage } = require('node:async_hooks');
const context = new AsyncLocalStorage();

function sanitize(value) {
  const secrets = Object.entries(process.env).filter(([key, val]) => /key|token|secret|password/i.test(key) && val?.length >= 6).map(([, val]) => val);
  const clean = (item, key = '') => {
    if (/api.?key|authorization|password|secret|access.?token|refresh.?token/i.test(key)) return '[REDACTED]';
    if (typeof item === 'string') {
      let text = item.replace(/Bearer\s+[^\s"',}]+/gi, 'Bearer [REDACTED]');
      for (const secret of secrets) text = text.split(secret).join('[REDACTED]');
      return text.length > 240000 ? text.slice(0, 240000) + '\n[TRUNCATED]' : text;
    }
    if (Array.isArray(item)) return item.map(value => clean(value));
    if (item && typeof item === 'object') return Object.fromEntries(Object.entries(item).map(([key, val]) => [key, clean(val, key)]));
    return item;
  };
  return clean(value);
}
function errorInfo(error) {
  return { code: error.code || 'INTERNAL_ERROR', message: error.message, stack: error.stack, details: error.details };
}
function createTraceStore(directory = process.env.AGENT_LOG_DIR || path.resolve(__dirname, '../../../../data/run-logs')) {
  const filename = id => /^req_[a-zA-Z0-9_]+$/.test(id) ? path.join(directory, `${id}.jsonl`) : null;
  function append(id, record) {
    const file = filename(id);
    if (!file) throw new Error('Invalid request ID');
    fs.mkdirSync(directory, { recursive: true });
    fs.appendFileSync(file, JSON.stringify(sanitize(record)) + '\n', { encoding: 'utf8', mode: 0o600 });
  }
  function read(id) {
    const file = filename(id);
    if (!file || !fs.existsSync(file)) return null;
    const events = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).flatMap(line => {
      try { return [JSON.parse(line)]; } catch { return []; } // Preserve earlier events after an interrupted write.
    });
    const end = events.findLast(e => e.stage === 'run' && e.status !== 'started');
    return { request_id: id, started_at: events[0]?.at, status: end?.status || 'running', duration_ms: end?.data?.duration_ms, error: end?.data?.error, route: events[0]?.data?.route, events };
  }
  function list({ status, limit = 50 } = {}) {
    if (!fs.existsSync(directory)) return [];
    return fs.readdirSync(directory).filter(name => /^req_[a-zA-Z0-9_]+\.jsonl$/.test(name))
      .map(name => read(name.slice(0, -6))).filter(item => !status || item.status === status)
      .sort((a, b) => (b.started_at || '').localeCompare(a.started_at || ''))
      .slice(0, Math.max(1, Math.min(100, Number(limit) || 50))).map(({ events, ...summary }) => summary);
  }
  return { append, read, list, directory };
}
const store = createTraceStore();
function event(stage, data, status = 'recorded') {
  const active = context.getStore();
  if (!active) return;
  try { active.store.append(active.id, { at: new Date().toISOString(), stage, status, data }); }
  catch (error) { console.error(JSON.stringify({ code: 'TRACE_WRITE_FAILED', request_id: active.id, message: error.message })); }
}
async function span(stage, input, action) {
  const started = Date.now();
  event(stage, { input }, 'started');
  try {
    const result = await action();
    event(stage, { result, duration_ms: Date.now() - started }, 'success');
    return result;
  } catch (error) {
    event(stage, { error: errorInfo(error), duration_ms: Date.now() - started }, 'failed');
    throw error;
  }
}
async function withRun(id, input, action, traceStore = store) {
  return context.run({ id, store: traceStore }, async () => {
    const started = Date.now();
    event('run', input, 'started');
    try {
      const result = await action();
      event('run', { duration_ms: Date.now() - started, result, ...(result?.status === 'error' ? { error: { code: result.code, message: result.message } } : {}) }, result?.status === 'error' ? 'failed' : result?.status || 'success');
      return result;
    } catch (error) {
      event('run', { duration_ms: Date.now() - started, error: errorInfo(error) }, 'failed');
      throw error;
    }
  });
}
module.exports = { store, createTraceStore, withRun, event, span, errorInfo };
