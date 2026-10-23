const fs = require('node:fs');
const path = require('node:path');
const { LABELS } = require('./progressStream.cjs');
function createJobManager({ execute, directory = process.env.GENERATION_JOBS_DIR || path.resolve(__dirname, '../../../../data/generation-jobs'), maxConcurrent = Number(process.env.AGENT_MAX_CONCURRENT) || 4 } = {}) {
  const jobs = new Map(), queue = [], runningSessions = new Set(), controllers = new Map();
  let active = 0;
  fs.mkdirSync(directory, { recursive: true });
  const terminal = job => !['queued', 'running'].includes(job.status);
  const failure = (job, code, message) => ({ status: 'error', code, message, request_id: job.request_id, log_url: `/api/v1/runs/${job.request_id}` });
  function save(job) {
    const filename = path.join(directory, `${job.request_id}.json`);
    fs.writeFileSync(`${filename}.tmp`, JSON.stringify(job), { mode: 0o600 });
    fs.renameSync(`${filename}.tmp`, filename);
  }
  function snapshot(job) { return job ? structuredClone({ ...job, elapsed_ms: Math.max(0, (job.finished_at || Date.now()) - job.created_at) }) : null; }
  for (const file of fs.readdirSync(directory).filter(name => /^req_[a-zA-Z0-9_]+\.json$/.test(name))) {
    let job;
    try { job = JSON.parse(fs.readFileSync(path.join(directory, file), 'utf8')); } catch { continue; }
    if (!terminal(job)) {
      job.status = 'failed'; job.finished_at = Date.now();
      job.result = failure(job, 'RUN_INTERRUPTED', '服务重启中断了任务，请重新发送。'); save(job);
    }
    jobs.set(job.request_id, job);
  }
  function pump() {
    while (active < Math.max(1, maxConcurrent)) {
      const index = queue.findIndex(entry => !runningSessions.has(entry.job.session_id));
      if (index < 0) return;
      const { job, body } = queue.splice(index, 1)[0];
      if (terminal(job)) continue;
      active++; runningSessions.add(job.session_id);
      const controller = new AbortController(); controllers.set(job.request_id, controller);
      job.status = 'running'; job.started_at = Date.now(); job.progress = { label: '正在理解需求', stage: 'accepted' }; save(job);
      Promise.resolve().then(() => {
        controller.signal.throwIfAborted();
        return execute(body, job.request_id, { signal: controller.signal, onProgress(value) {
          if (terminal(job)) return;
          job.progress = { ...value, label: value.label || LABELS[value.stage] || job.progress.label, at: Date.now() }; save(job);
        } });
      }).then(result => {
        if (job.status === 'cancelled') return;
        job.result = result;
        job.status = result?.code === 'RUN_CANCELLED' ? 'cancelled' : result?.status === 'error' ? 'failed' : 'completed';
      }).catch(error => {
        if (job.status === 'cancelled') return;
        job.status = 'failed'; job.result = failure(job, error?.code || 'INTERNAL_ERROR', error?.message || '任务执行失败');
      }).finally(() => {
        job.finished_at = Date.now(); save(job); controllers.delete(job.request_id);
        active--; runningSessions.delete(job.session_id); pump();
      });
    }
  }
  return {
    submit(requestId, body) {
      if (!/^req_[a-zA-Z0-9_]+$/.test(requestId)) throw new Error('Invalid request id');
      if (jobs.has(requestId)) return snapshot(jobs.get(requestId));
      const job = { request_id: requestId, session_id: body.session_id, user_text: body.history?.filter(m => m.role === 'user').at(-1)?.content || '', status: 'queued', created_at: Date.now(), progress: { stage: 'queued', label: '任务已排队，等待执行' } };
      jobs.set(requestId, job); save(job); queue.push({ job, body: structuredClone(body) }); pump(); return snapshot(job);
    },
    get(id) { return snapshot(jobs.get(id)); },
    latest(sessionId) {
      const records = [...jobs.values()].filter(job => job.session_id === sessionId).sort((a,b) => a.created_at - b.created_at);
      return snapshot(records.find(job => job.status === 'running') || records.find(job => job.status === 'queued') || records.at(-1));
    },
    cancel(id) {
      const job = jobs.get(id);
      if (!job || terminal(job)) return snapshot(job);
      job.status = 'cancelled'; job.finished_at = Date.now(); job.result = failure(job, 'RUN_CANCELLED', '本次任务已停止。');
      save(job); controllers.get(id)?.abort(); pump(); return snapshot(job);
    },
  };
}
module.exports = { createJobManager };
