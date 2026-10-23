const { resolveImagePlan } = require('../../services/creativeAssets.cjs');

const GENERATED_ASSET_URL = /^\/api\/v1\/generated-assets\/[a-zA-Z0-9_-]+\.(?:png|jpe?g|webp)$/i;
const PRODUCT_ASSET_URL = /^\/api\/v1\/products\/image\?path=[^\s]+$/;

function imageFailure(message) {
  return Object.assign(new Error(message), { code: 'IMAGE_AGENT_INVALID_OUTPUT' });
}

function validateImageAgentResult(result, assets, limit = 6) {
  if (!result || result.status !== 'success' || typeof result.provider !== 'string' || !result.provider || !Array.isArray(result.images) || result.images.length > limit) {
    throw imageFailure('图片 Agent 返回状态或图片列表无效。');
  }
  const assetById = new Map(assets.map((asset) => [asset.id, asset]));
  const ids = new Set();
  const images = result.images.map((image) => {
    if (!image || typeof image.id !== 'string' || !image.id || ids.has(image.id) || typeof image.url !== 'string' || !image.url.startsWith('/') || image.url.startsWith('//') || !/^\/[a-zA-Z0-9_./?=&%+-]+$/.test(image.url) || typeof image.description !== 'string' || typeof image.model !== 'string' || typeof image.source_product_image !== 'string' || !assetById.has(image.source_product_image) || !['cover', 'inline', 'closing'].includes(image.placement) || !Number.isInteger(image.after_paragraph) || image.after_paragraph < 0 || typeof image.caption !== 'string' || !image.caption.trim() || typeof image.purpose !== 'string' || !image.purpose.trim()) {
      throw imageFailure('图片 Agent 输出缺少必要字段，或引用了未提供的产品素材。');
    }
    if (!PRODUCT_ASSET_URL.test(image.url) && !GENERATED_ASSET_URL.test(image.url)) throw imageFailure('图片 Agent 返回了不受支持的图片地址。');
    const source = assetById.get(image.source_product_image);
    if (source.model && image.model && source.model !== image.model && source.model !== `${image.model} - 产品事实`) throw imageFailure('图片 Agent 输出型号与源产品图型号不一致。');
    if (image.generated && !GENERATED_ASSET_URL.test(image.url)) throw imageFailure('生成图片必须使用 generated-assets 地址。');
    if (!image.generated && !PRODUCT_ASSET_URL.test(image.url)) throw imageFailure('官方产品图必须使用产品图片地址。');
    ids.add(image.id);
    return { ...image, generated: Boolean(image.generated) };
  });
  return { ...result, images, warnings: Array.isArray(result.warnings) ? result.warnings.filter((warning) => typeof warning === 'string') : [] };
}

async function generateCreativeImages({ task, assets, strategy, evidence = [], platform = {} }, options = {}) {
  options.signal?.throwIfAborted();
  const selected = resolveImagePlan(strategy.image_plan || [], assets, task.image_count);
  const result = {
    status: 'success',
    provider: 'catalog',
    images: selected.map((image) => ({ ...image, model: image.model || task.model, source_product_image: image.id, generated: false })),
    warnings: [],
  };
  if (task.image_count !== 0 && selected.length) {
    const { integrateImages } = require('./integration.cjs');
    const integrated = await integrateImages({ task: { ...task, image_count: task.image_count ?? selected.length }, assets, strategy, evidence, platform }, result.images, options);
    if (integrated.stage?.status === 'failed') {
      throw Object.assign(new Error(integrated.warnings.join('；')), { code: integrated.stage.code });
    }
    result.images = integrated.images;
    result.warnings = integrated.warnings;
    if (integrated.stage) result.provider = process.env.IMAGE_PROVIDER || 'openai-next';
  }
  return validateImageAgentResult(result, assets, task.image_count);
}

module.exports = { generateCreativeImages, validateImageAgentResult };
