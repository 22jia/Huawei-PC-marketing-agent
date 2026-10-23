import { readGenerationEvents } from './generationStream.mjs';
import { customerPresentation } from './customerPresentation.mjs';

// assistant-ui replaces the current message with each yielded snapshot.
// Returning a Promise here leaves the assistant bubble empty until completion.
export function createStudioAdapter({ getTask, getArtifact, sessionId, fetchImpl = fetch, onStart, onProgress, onResult, onError, onFinish, formatReport, formatError }) {
  const message = (text, pending) => ({ content: [{ type: 'text', text }], metadata: { custom: { studio_progress: pending } } });
  let activeJob;
  let cancelRequested = false;
  return {
    async cancelCurrent() {
      cancelRequested = true;
      if (activeJob) await fetchImpl(`/api/v1/generation-jobs/${activeJob}/cancel`, { method: 'POST' });
    },
    async *run({ messages, abortSignal }) {
      let requestId;
      let current;
      cancelRequested = false;
      onStart?.();
      try {
        const values = getTask();
        // Cancelled progress messages are UI feedback, not conversation evidence.
        const history = messages.filter(m => ['user', 'assistant'].includes(m.role) && !m.metadata?.custom?.studio_progress).slice(-12).map(m => ({ role: m.role, content: m.content.filter(p => p.type === 'text').map(p => p.text).join('\n') }));
        yield message('正在连接创作服务…', true);
        // The submission outlives this component. Aborting a view only stops polling.
        const response = await fetchImpl('/api/v1/generate', { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' }, body: JSON.stringify({ ...values, background: true, session_id: typeof sessionId === 'function' ? sessionId() : sessionId, history, last_artifact: getArtifact() }) });
        let data;
        if (response.status === 202) {
          let job = await response.json();
          requestId = activeJob = job.request_id;
          if (cancelRequested) await fetchImpl(`/api/v1/generation-jobs/${requestId}/cancel`, { method: 'POST' });
          let pollFailures = 0;
          while (['queued', 'running'].includes(job.status)) {
            abortSignal?.throwIfAborted();
            current = { ...job.progress, request_id: requestId, elapsed_ms: job.elapsed_ms };
            onProgress?.(current);
            yield message(`**${current.label || '正在处理'}${job.status === 'queued' ? '' : '…'}**\n\n已等待 ${Math.floor((job.elapsed_ms || 0) / 1000)} 秒。`, true);
            await new Promise((resolve, reject) => {
              const finish = () => { abortSignal?.removeEventListener('abort', cancel); resolve(); };
              const timer = setTimeout(finish, 1000);
              const cancel = () => { clearTimeout(timer); abortSignal?.removeEventListener('abort', cancel); reject(abortSignal.reason || new DOMException('Aborted', 'AbortError')); };
              abortSignal?.addEventListener('abort', cancel, { once: true });
              if (abortSignal?.aborted) cancel();
            });
            try {
              const poll = await fetchImpl(`/api/v1/generation-jobs/${requestId}`, { signal: abortSignal });
              if (!poll.ok) throw new Error(`状态查询 HTTP ${poll.status}`);
              job = await poll.json();
              pollFailures = 0;
            } catch (error) {
              abortSignal?.throwIfAborted();
              pollFailures++;
              yield message(`暂时无法读取进度，正在重新连接（第 ${pollFailures} 次）…\n\n后台任务不会因此停止。可以切换对话，稍后回来查看。`, true);
            }
          }
          data = job.result;
        } else if (response.headers.get('content-type')?.includes('text/event-stream')) {
          for await (const frame of readGenerationEvents(response)) {
            requestId = frame.data.request_id || requestId;
            if (frame.type === 'progress') {
              current = frame.data;
              onProgress?.(current);
            } else if (frame.type === 'heartbeat' && current) {
              current = { ...current, elapsed_ms: frame.data.elapsed_ms };
            } else if (frame.type === 'result') { data = frame.data; continue; }
            else continue;
            const suffix = current.status === 'success' ? '完成，正在进入下一步…' : current.status === 'failed' ? '未通过，正在处理核验结果…' : '中…';
            const seconds = Math.floor((current.elapsed_ms || 0) / 1000);
            yield message(`**${current.label}${suffix}**${seconds ? `\n\n已等待 ${seconds} 秒。` : ''}${requestId ? `\n\n运行编号：${requestId}` : ''}`, true);
          }
        } else {
          try { data = await response.json(); } catch { throw new Error('创作服务返回了无效响应'); }
        }
        if (!response.ok || data?.status === 'error') {
          throw Object.assign(new Error(`${data?.message || '生成失败，请重试'}${data?.code ? `（${data.code}）` : ''}`), { code: data?.code, request_id: data?.request_id || requestId });
        }
        abortSignal?.throwIfAborted();
        onResult?.(data, values);
        const text = data.reply || (data.content || data.result_type === 'image_generation' ? formatReport(data) : `${data.task?.questions?.map(q => q.question).join('\n') || '请补充任务信息。'}\n直接在这里回复即可，我会继续处理。`);
        const final = message(text, false);
        const customer = customerPresentation(data);
        if (customer) final.metadata.custom.studio_customer = customer;
        yield final;
      } catch (error) {
        if (!error.request_id && requestId) error.request_id = requestId;
        onError?.(error, Boolean(abortSignal?.aborted));
        if (error.name === 'AbortError' || abortSignal?.aborted) throw error;
        yield message(formatError(error), false);
      } finally { activeJob = null; onFinish?.(); }
    },
  };
}
