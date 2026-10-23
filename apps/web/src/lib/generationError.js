export function formatGenerationError(error) {
  if (error?.errorFields) return '请先补充左侧必填的创作信息，然后重新发送。';
  if (error instanceof TypeError && /failed to fetch/i.test(error.message || '')) {
    return '无法连接本地创作服务。请确认 API 服务运行在 3000 端口后，再直接发送一次。';
  }
  if (/invalid response/i.test(error?.message || '')) {
    return '本地创作服务返回了无效响应，请检查 API 服务状态后重试。';
  }
  const trace = error?.request_id ? ` 运行编号：${error.request_id}，可点击“运行日志”查看。` : '';
  if (/^(UNSUPPORTED_|UNVERIFIED_|CONTENT_REVIEW_|PRICE_EVIDENCE_)/.test(error?.code || '')) return `本次创作未完成：${error.message}。请查看核验详情，调整表述或补充证据。${trace}`;
  return `本次创作未完成：${error?.message || '未知错误'}。请稍后重试。${trace}`;
}
