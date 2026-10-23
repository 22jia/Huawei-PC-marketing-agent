// Public messages are selected by code, never from provider response bodies.
const reasons = {
  IMAGE_PROVIDER_NOT_CONFIGURED: '后端未配置生图 Key，或 IMAGE_PROVIDER 被设为 none，因此没有调用生图模型。',
  IMAGE_PROVIDER_TIMEOUT: '生图接口超过后端配置的等待时间。',
  IMAGE_PROVIDER_HTTP_ERROR: '生图接口返回 HTTP 错误；请查看对应请求的运行日志。',
  IMAGE_NO_MATCHED_ASSET: '没有找到符合型号、配色和画面要求的完整产品素材。',
  IMAGE_CUTOUT_NOT_CONFIGURED: '官方原图需要抠图，但后端尚未配置抠图服务，因此还没有调用生图模型。',
  IMAGE_CUTOUT_PROVIDER_FAILED: '抠图服务调用失败，因此还没有调用生图模型。',
  IMAGE_CUTOUT_QUOTA_EXHAUSTED: '抠图服务额度不足，因此还没有调用生图模型。',
  IMAGE_CUTOUT_INVALID_OUTPUT: '抠图服务没有返回有效的透明产品图，因此还没有调用生图模型。',
  IMAGE_GENERATION_TIMEOUT: '生图服务响应超时。',
};
function imageFailureWarning(error) {
  const code = /^IMAGE_[A-Z_]+$/.test(error?.code || '') ? error.code : 'IMAGE_GENERATION_FAILED';
  return `图片生成未完成（${code}）：${reasons[code] || '图片生成子 Agent 未完成，请查看运行日志排查素材或服务问题。'} 已保留本次策划的官方配图。`;
}
module.exports = { imageFailureWarning };
