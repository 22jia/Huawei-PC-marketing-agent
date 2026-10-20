const { generateCreativeImages } = require('./index.cjs');
const { assertActive, ImageProviderError } = require('./provider.cjs');

// Only replace reviewed placements. Configuration and credentials stay server-side.
async function integrateImages(input, officialImages, options = {}) {
  assertActive(options.signal);
  const enabled = process.env.IMAGE_PROVIDER !== 'none' &&
    Boolean(options.generateCreativeImages || process.env.CREDIT_MEDIA_API_KEY || process.env.IMAGE_API_KEY);
  if (!enabled) return { images: officialImages, warnings: [], stage: null };
  const started = Date.now();
  const configuredLimit = Number(process.env.IMAGE_MAX_IMAGES || 1);
  const limit = Number.isInteger(configuredLimit) && configuredLimit >= 1 && configuredLimit <= 6 ? configuredLimit : 1;
  const selected = [...officialImages].sort((a, b) => Number(b.placement === 'cover') - Number(a.placement === 'cover')).slice(0, limit);
  const strategy = { ...input.strategy, image_plan: selected.map((image) => ({
    asset_id: image.id, placement: image.placement, after_paragraph: image.after_paragraph,
    caption: image.caption, purpose: image.purpose,
  })) };
  try {
    const result = await (options.generateCreativeImages || generateCreativeImages)({ ...input, strategy }, { signal: options.signal });
    assertActive(options.signal);
    const sources = new Map(selected.map((image) => [image.id, image]));
    const seen = new Set();
    if (result?.status !== 'success' || !Array.isArray(result.images) || result.images.length !== selected.length ||
      !Array.isArray(result.warnings) || result.warnings.some((w) => typeof w !== 'string')) {
      throw new ImageProviderError('IMAGE_INVALID_OUTPUT', '图片结果结构不符合约定');
    }
    const replacements = new Map();
    for (const image of result.images) {
      const source = sources.get(image?.source_product_image);
      if (!source || seen.has(source.id) || !image.id || typeof image.id !== 'string' ||
        image.generated !== true || image.model !== input.task.model || image.source_url !== source.source_url ||
        !/^\/api\/v1\/generated-assets\/[A-Za-z0-9_-]+\.(png|jpe?g|webp)$/.test(image.url || '') ||
        !image.description || typeof image.description !== 'string' ||
        image.placement !== source.placement || image.after_paragraph !== source.after_paragraph ||
        image.caption !== source.caption || image.purpose !== source.purpose) {
        throw new ImageProviderError('IMAGE_INVALID_OUTPUT', '图片型号、来源或展示位置不符合约定');
      }
      seen.add(source.id);
      // Keep source metadata for the existing evidence/download panel.
      replacements.set(source.id, { ...source, ...image });
    }
    return { images: officialImages.map((image) => replacements.get(image.id) || image), warnings: result.warnings,
      stage: { stage: 'imageGeneration', status: 'success', duration_ms: Date.now() - started } };
  } catch (error) {
    assertActive(options.signal);
    if (error.code === 'IMAGE_GENERATION_CANCELLED') throw error;
    // Never expose provider response bodies or arbitrary exception messages.
    const code = /^IMAGE_[A-Z_]+$/.test(error.code || '') ? error.code : 'IMAGE_GENERATION_FAILED';
    return { images: officialImages, warnings: [`图片生成未完成（${code}），已保留本次策划的官方配图。`],
      stage: { stage: 'imageGeneration', status: 'failed', code, duration_ms: Date.now() - started } };
  }
}
module.exports = { integrateImages };
