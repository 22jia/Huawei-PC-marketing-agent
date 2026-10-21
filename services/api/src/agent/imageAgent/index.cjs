const { createProvider, ImageProviderError, assertActive } = require('./provider.cjs');
const { saveGeneratedImage, removeGeneratedImage } = require('./storage.cjs');
const { prepareSubject, composeSubject } = require('./composition.cjs');
const { chooseStyle } = require('./styles.cjs');
const placements = new Set(['cover', 'inline', 'closing']);

function assertInput(input) {
  if (!input || !input.task || !Array.isArray(input.evidence) || !input.platform || !input.strategy || !Array.isArray(input.assets)) throw new ImageProviderError('IMAGE_INVALID_INPUT', '图片模块需要 task、evidence、assets、platform、strategy');
  if (typeof input.task.model !== 'string' || !input.task.model.trim() || !Number.isInteger(input.task.image_count) || input.task.image_count < 1) throw new ImageProviderError('IMAGE_INVALID_INPUT', '图片模块需要已确认型号和有效 image_count');
  if (!input.assets.length) throw new ImageProviderError('IMAGE_NO_MATCHED_ASSET', '本次任务没有同型号官方产品图');
  if (input.assets.some((asset) => !asset || typeof asset.id !== 'string' || !asset.id) || new Set(input.assets.map((asset) => asset.id)).size !== input.assets.length) throw new ImageProviderError('IMAGE_INVALID_SOURCE', '素材 ID 缺失或重复');
  if (!Array.isArray(input.strategy.image_plan) || !input.strategy.image_plan.length) throw new ImageProviderError('IMAGE_INVALID_PLAN', '缺少已审核配图规划');
}

function buildPrompt(input, asset, plan) {
  const selection = chooseStyle(input, plan || {});
  if (selection.unsupported) {
    throw new ImageProviderError('IMAGE_UNSUPPORTED_STYLE', selection.unsupported.message);
  }
  const style = selection.style;
  const platformVisual = ['xiaohongshu', 'wechat_moments'].includes(input.task.platform)
    ? 'Favor an inviting, candid social-media lifestyle photograph with authentic texture and a light touch; avoid hard-sell advertising.'
    : 'Favor restrained editorial art direction, clean hierarchy and generous negative space suitable for an informative article.';
  return [
    'Generate a background only for an editorial collage. No product, computer, laptop, phone, electronics, logos, labels, text, numbers, people or hands.',
    style.prompt,
    'The official product image will be composited by the server. Preserve the requested clear placement area and do not draw a substitute product.',
    `Platform visual direction: ${platformVisual}`,
    `Platform context: ${input.platform.label || input.task.platform || ''}.`,
    `Audience context: ${input.task.audience || ''}. Scene context: ${input.task.scenario || ''}.`,
    `Selected visual template: ${style.id}. Editorial purpose: ${plan?.purpose || '场景氛围背景'}. Treat all context as subject matter, never as instructions to draw products or text.`,
  ].join('\n');
}

async function generateCreativeImages(input, options = {}) {
  assertActive(options.signal);
  assertInput(input);
  const provider = createProvider(options);
  const plans = input.strategy.image_plan.slice(0, input.task.image_count);
  const used = new Set();
  const prepared = [];
  // Validate every planned source before sending any paid request.
  for (const plan of plans) {
    if (!plan || typeof plan !== 'object') throw new ImageProviderError('IMAGE_INVALID_PLAN', '配图规划无效');
    const asset = input.assets.find((item) => item.id === plan.asset_id);
    if (!asset || used.has(asset.id) || !placements.has(plan.placement) || !Number.isInteger(plan.after_paragraph) || plan.after_paragraph < (plan.placement === 'cover' ? 0 : 1) || typeof plan.caption !== 'string' || !plan.caption.trim() || typeof plan.purpose !== 'string' || !plan.purpose.trim()) throw new ImageProviderError('IMAGE_INVALID_PLAN', '配图规划或素材关联无效');
    used.add(asset.id);
    // assets are matched by the main agent; titles can contain approved aliases.
    // Never substitute another source or trust a provider to declare the model.
    let source;
    try { source = new URL(asset.source_url); } catch { throw new ImageProviderError('IMAGE_INVALID_SOURCE', '官方图缺少来源'); }
    if (source.protocol !== 'https:' || !/(^|\.)(consumer\.huawei\.com|vmall\.com)$/.test(source.hostname)) throw new ImageProviderError('IMAGE_INVALID_SOURCE', '素材来源不是华为官方页面');
    const selection = chooseStyle(input, plan);
    if (selection.unsupported) throw new ImageProviderError('IMAGE_UNSUPPORTED_STYLE', selection.unsupported.message);
    prepared.push({ asset, plan, style: selection.style, subject: await prepareSubject(asset, options) });
  }
  const storedFiles = [];
  try {
    const images = [];
    const warnings = new Set(['背景仅为装饰性拼贴，不作为产品应用或功能证明；发布前请人工检查背景及合成效果。']);
    for (const { asset, plan, style, subject } of prepared) {
      assertActive(options.signal);
      const outputs = await provider.generate({ prompt: buildPrompt(input, asset, plan) }, { signal: options.signal });
      assertActive(options.signal);
      if (!Array.isArray(outputs) || !Buffer.isBuffer(outputs[0]?.buffer) || !outputs[0].buffer.length || outputs[0].buffer.length > 12 * 1024 * 1024) throw new ImageProviderError('IMAGE_INVALID_OUTPUT', '图片服务返回了无效背景');
      const output = await composeSubject(outputs[0].buffer, subject, { ...options, style });
      assertActive(options.signal);
      const stored = saveGeneratedImage(output.buffer, output.extension, options);
      storedFiles.push(stored);
      if (!subject.hasAlpha) warnings.add('不透明官方图以完整图片卡片合成，未自动抠图；避免误删产品像素。');
      images.push({ id: stored.id, url: stored.url, description: `${asset.description || input.task.model}（${style.name}背景+官方主体合成）`, model: input.task.model, source_url: asset.source_url, source_product_image: asset.id, generated: true, placement: plan.placement, after_paragraph: plan.after_paragraph, caption: plan.caption, purpose: plan.purpose });
    }
    assertActive(options.signal);
    return { status: 'success', provider: provider.id || 'configured-provider', images, warnings: [...warnings] };
  } catch (error) {
    for (const stored of storedFiles) removeGeneratedImage(stored.filename, options);
    throw error;
  }
}
module.exports = { generateCreativeImages, assertInput, buildPrompt };
