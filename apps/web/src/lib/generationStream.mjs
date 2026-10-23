export async function* readGenerationEvents(response, { idleTimeoutMs = 35000 } = {}) {
  if (!response.body) throw new Error('创作服务未返回进度流');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    while (true) {
      let timer;
      let chunk;
      try {
        chunk = await Promise.race([
          reader.read(),
          new Promise((_, reject) => {
            timer = setTimeout(() => reject(Object.assign(new Error('创作服务长时间未返回进度，连接可能已中断或服务已重启。请查看运行日志后重试。'), { code: 'GENERATION_STREAM_TIMEOUT' })), idleTimeoutMs);
          }),
        ]);
      } finally { clearTimeout(timer); }
      const { done, value } = chunk;
      buffer += decoder.decode(value, { stream: !done });
      let match;
      while ((match = /\r?\n\r?\n/.exec(buffer))) {
        const frame = buffer.slice(0, match.index); buffer = buffer.slice(match.index + match[0].length);
        const lines = frame.split(/\r?\n/);
        const type = lines.find(line => line.startsWith('event:'))?.slice(6).trim();
        const data = lines.filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n');
        if (!type || !data) continue;
        const event = { type, data: JSON.parse(data) };
        yield event;
        if (type === 'result') return;
      }
      if (done) throw new Error('创作连接中断，尚未收到最终结果。请查看运行日志后重试。');
    }
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
}
