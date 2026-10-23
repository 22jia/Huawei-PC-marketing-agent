const { event } = require('./runTrace.cjs');
const LABELS = { planTask: '理解需求', retrieval: '检索产品资料', planContent: '检查要求并策划图文', imageGeneration: '生成并合成产品配图', generateCopy: '撰写文案', generateReply: '整理回复', customerAssist: '准备成交建议', grounding: '核对事实依据', reviewCopy: '审核文案', repair: '按核验意见修改' };

async function streamGeneration(response, requestId, action) {
  const controller = new AbortController();
  let disconnected = false;
  const started = Date.now();
  const send = (type, data) => {
    if (!disconnected && !response.destroyed && !response.writableEnded) response.write(`event: ${type}\ndata: ${JSON.stringify({ ...data, request_id: requestId })}\n\n`);
  };
  // Closing a browser subscription must not cancel the server-side run.
  // Explicit cancellation is handled by generation-jobs/:id/cancel.
  const close = () => { disconnected = true; };
  response.on('close', close);
  response.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache, no-transform', 'X-Accel-Buffering': 'no' });
  response.flushHeaders?.();
  send('progress', { stage: 'accepted', label: '任务已接收', status: 'started', elapsed_ms: 0 });
  const timer = setInterval(() => send('heartbeat', { elapsed_ms: Date.now() - started }), 10000);
  timer.unref?.();
  try {
    const result = await action({ signal: controller.signal, onProgress: ({ stage, status, duration_ms, attempt }) => {
      if (LABELS[stage]) send('progress', { stage, label: LABELS[stage], status, duration_ms, attempt, elapsed_ms: Date.now() - started });
    } });
    send('result', result);
    return { ...result, request_id: requestId };
  } catch (error) {
    if (controller.signal.aborted) error = Object.assign(new Error('本次任务已停止。'), { code: 'RUN_CANCELLED' });
    event('request_error', { error: require('./runTrace.cjs').errorInfo(error) }, 'failed');
    const result = { status: 'error', code: error.code || 'INTERNAL_ERROR', message: error.message, request_id: requestId, log_url: `/api/v1/runs/${requestId}` };
    send('result', result);
    return result;
  } finally {
    clearInterval(timer);
    response.off('close', close);
    if (!disconnected) response.end();
  }
}
module.exports = { streamGeneration, LABELS };
