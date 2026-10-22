const { generateCreativeImages } = require('./index.cjs');
const { assertActive, ImageProviderError } = require('./provider.cjs');
const { selectSourceAsset } = require('./sourceSelection.cjs');
const { chooseStyle } = require('./styles.cjs');

async function workbenchInput(input, selected) {
  const model = input.task.model?.trim();
  if (!model) return { input, selected };
  const sharp = require('sharp');
  const { resolveProductImage } = require('../../services/productSpotlight.cjs');
  const candidates = await Promise.all(input.assets.filter(asset => asset.model === model || asset.model === `${model} - 产品事实`).map(async asset => {
    let hasTransparency = false;
    const file = resolveProductImage(asset.source_path);
    if (file) {
      const { data, info } = await sharp(file, { limitInputPixels: 25000000 }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      for (let i = 3; i < data.length; i += info.channels) if (data[i] < 255) { hasTransparency = true; break; }
    }
    // A missing CSV model inherits the exact product-facts document title.
    const normalizedModel = asset.model === `${model} - 产品事实` ? model : asset.model;
    return { ...asset, model: normalizedModel, hasTransparency };
  }));
  // Image-only requests can generate multiple variants; article delivery keeps
  // the pilot's single AI replacement and leaves other official placements intact.
  const imageOnly = input.task.output_type === 'image' || /(?:海报|日常照|生活照|生图)/.test(input.task.goal || '');
  selected = (imageOnly ? selected : selected.slice(0, 1)).map(placement => {
    const goal = input.task.goal || '';
    const requestedPurpose = /海报/.test(goal) ? '高端商业产品宣传海报' : /日常|生活照|氛围照/.test(goal) ? '日常生活照片' : placement.purpose;
    const asset = selectSourceAsset(input, candidates, { ...placement, purpose: requestedPurpose });
    return { ...asset, placement: placement.placement, after_paragraph: placement.after_paragraph, caption: placement.caption, purpose: requestedPurpose };
  });
  const style = chooseStyle(input, selected[0] || {});
  const visual_brief = input.task.visual_brief || (style.style?.group === 'poster'
    ? `生成3:4高级商业产品宣传海报，产品为${input.task.model}，品牌华为。现代极简科技广告，配色与官方产品原色协调；高级棚拍光影、空间层次、轻微悬浮及柔和阴影。背景超大英文排版，银白渐变文字，底部 EXPLORE NOW CTA 和官网信息，Behance 产品发布会质感。未要求时不添加山水。产品主体使用官方原图，不重新绘制，不编造参数。`
    : `生成3:4竖版INS风真实日常生活照片，场景为${input.task.scenario}。柔和窗光，真实木纹或织物，少量小型生活道具置于边缘，电脑为唯一主体，比例真实，接触阴影自然，无文字无水印。`);
  return { selected, input: { ...input, task: { ...input.task, visual_brief }, assets: selected } };
}

// Only replace reviewed placements. Configuration and credentials stay server-side.
async function integrateImages(input, officialImages, options = {}) {
  assertActive(options.signal);
  const enabled = process.env.IMAGE_PROVIDER !== 'none' &&
    Boolean(options.generateCreativeImages || process.env.CREDIT_MEDIA_API_KEY || process.env.IMAGE_API_KEY);
  if (!enabled) return { images: officialImages, warnings: [], stage: null };
  const started = Date.now();
  const configuredLimit = Number(process.env.IMAGE_MAX_IMAGES || 3);
  const limit = Number.isInteger(configuredLimit) && configuredLimit >= 1 && configuredLimit <= 6 ? configuredLimit : 3;
  let selected = [...officialImages].sort((a, b) => Number(b.placement === 'cover') - Number(a.placement === 'cover')).slice(0, limit);
  const originalSlots = selected.map(image => image.id);
  try {
    ({ input, selected } = await workbenchInput(input, selected));
    assertActive(options.signal);
    const strategy = { ...input.strategy, image_plan: selected.map((image) => ({
    asset_id: image.id, placement: image.placement, after_paragraph: image.after_paragraph,
    caption: image.caption, purpose: image.purpose,
  })) };
    const result = await (options.generateCreativeImages || generateCreativeImages)({ ...input, strategy }, { signal: options.signal });
    assertActive(options.signal);
    const sources = new Map(selected.map((image) => [image.id, image]));
    const seen = new Set();
    const allowRepeatedSubject = input.task.output_type === 'image' || /(?:海报|日常照|生活照|生图)/.test(input.task.goal || '');
    if (result?.status !== 'success' || !Array.isArray(result.images) || result.images.length !== selected.length ||
      !Array.isArray(result.warnings) || result.warnings.some((w) => typeof w !== 'string')) {
      throw new ImageProviderError('IMAGE_INVALID_OUTPUT', '图片结果结构不符合约定');
    }
    const replacements = new Map();
    for (const image of result.images) {
      const source = sources.get(image?.source_product_image);
      if (!source || (!allowRepeatedSubject && seen.has(source.id)) || !image.id || typeof image.id !== 'string' ||
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
    if (allowRepeatedSubject) {
      return { images: result.images.map((image, index) => ({ ...selected[index % selected.length], ...image })), warnings: result.warnings,
        stage: { stage: 'imageGeneration', status: 'success', duration_ms: Date.now() - started } };
    }
    const slotReplacements = new Map(selected.map((source, index) => [originalSlots[index], replacements.get(source.id)]));
    return { images: officialImages.map((image) => slotReplacements.get(image.id) || image), warnings: result.warnings,
      stage: { stage: 'imageGeneration', status: 'success', duration_ms: Date.now() - started } };
  } catch (error) {
    assertActive(options.signal);
    if (error.code === 'IMAGE_GENERATION_CANCELLED') throw error;
    // Never expose provider response bodies or arbitrary exception messages.
    const code = /^IMAGE_[A-Z_]+$/.test(error.code || '') ? error.code : 'IMAGE_GENERATION_FAILED';
    // Keep the stable error code for clients, but include our own safe reason so
    // the workbench can tell a bad asset mapping from a provider failure. Never
    // surface arbitrary provider bodies or credentials.
    const allowedReasons = new Set([
      '官方图缺少来源', '素材来源不是华为官方页面', '官方图缺少本地素材路径',
      '官方图文件不存在', '官方图路径或大小无效', '官方图必须是静态 PNG、JPEG 或 WebP',
      '官方图没有可见主体', '官方图没有透明背景。请在服务端配置 REMOVE_BG_API_KEY 后重试；未使用近似抠图，以免损伤产品边缘。',
    ]);
    const safeReason = allowedReasons.has(error.message)
      ? error.message
      : '请检查所选型号的官方素材映射和服务配置。';
    return { images: officialImages, warnings: [`图片生成未完成（${code}）：${safeReason} 已保留本次策划的官方配图。`],
      stage: { stage: 'imageGeneration', status: 'failed', code, duration_ms: Date.now() - started } };
  }
}
module.exports = { integrateImages };
