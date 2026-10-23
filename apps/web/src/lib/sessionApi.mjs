export async function sessionRequest(path, options = {}) {
  const response = await fetch(path, options);
  const data = await response.json().catch(() => null);
  if (!response.ok || !data || data.status === 'error') {
    throw new Error(data?.message || `会话服务暂不可用（HTTP ${response.status}），请重试。`);
  }
  return data;
}

export async function createStudioSession() {
  const session = await sessionRequest('/api/v1/sessions', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
  });
  if (!session.id) throw new Error('会话服务未返回有效会话，请重试。');
  return session;
}
