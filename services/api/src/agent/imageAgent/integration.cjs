const { generateCreativeImages } = require('./engine.cjs');
const { assertActive, ImageProviderError } = require('./provider.cjs');
const { selectSourceAsset } = require('./sourceSelection.cjs');
const { chooseStyle } = require('./styles.cjs');
const { imageFailureWarning } = require('./failureReason.cjs');


function sceneDirection(task, index) {
  const context = `${task.audience || ''} ${task.scenario || ''}`;
  const scenes = /大学|学生|校园/.test(context)
    ? ['明亮宿舍书桌，开学整理的生活感', '图书馆窗边长桌，安静学习氛围', '校园咖啡馆，课间整理资料', '共享自习空间，傍晚暖光', '家中书房，周末学习', '校园休息区桌面，自然日光']
    : /出差|差旅|通勤/.test(context)
    ? ['高铁窗边桌面，轻装出行', '酒店书桌，柔和晨光', '机场休息区桌面，等待出发', '咖啡馆临窗桌面，移动办公', '联合办公空间，日常工作', '家中书房，返程整理']
    : ['临窗书桌，自然晨光', '咖啡馆桌面，轻松日常', '共享工作空间，午后光线', '家中书房，温暖夜灯', '旅行休息区桌面，轻装出行', '简洁工作室，柔和侧光'];
  return `本组第${index + 1}张。差异化场景建议：${scenes[index % scenes.length]}。与其他图片在地点、光线、道具和取景上有明显区别；如与用户明确指定的场景冲突，保留用户场景并只变化光线与构图。不得因此改变产品型号、配色或虚构功能。`;
}

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
  selected = selected.map((placement, index) => {
    const goal = input.task.goal || '';
    const requestedPurpose = /海报/.test(goal) ? '高端商业产品宣传海报' : /日常|生活照|氛围照/.test(goal) ? '日常生活照片' : placement.purpose;
    const asset = selectSourceAsset(input, candidates, { ...placement, purpose: requestedPurpose });
    return { ...asset, placement: placement.placement, after_paragraph: placement.after_paragraph, caption: placement.caption, purpose: requestedPurpose, scene_direction: sceneDirection(input.task, index) };
  });
  const style = chooseStyle(input, selected[0] || {});
  const visual_brief = input.task.visual_brief || (style.style?.group === 'poster'
    ? `生成3:4高级商业产品宣传海报，产品为${input.task.model}，品牌华为。现代极简科技广告，配色与官方产品原色协调；高级棚拍光影、空间层次、轻微悬浮及柔和阴影。背景超大英文排版，银白渐变文字，底部 EXPLORE NOW CTA 和官网信息，Behance 产品发布会质感。未要求时不添加山水。产品主体使用官方原图，不重新绘制，不编造参数。`
    : `生成3:4竖版INS风真实日常生活照片，场景为${input.task.scenario}。柔和窗光，真实木纹或织物，少量小型生活道具置于边缘，电脑为唯一主体，比例真实，接触阴影自然，无文字无水印。`);
  // Placements may reuse one official subject for several generated variants.
  // The source catalog, unlike the placement plan, must contain unique IDs.
  const sources = [...new Map(selected.map(asset => [asset.id, asset])).values()];
  return { selected, input: { ...input, task: { ...input.task, visual_brief }, assets: sources } };
}

// Only replace reviewed placements. Configuration and credentials stay server-side.
async function integrateImages(input, officialImages, options = {}) {
  assertActive(options.signal);
  const enabled = Boolean(options.generateCreativeImages) || (process.env.IMAGE_PROVIDER !== 'none' &&
    Boolean(process.env.CREDIT_MEDIA_API_KEY || process.env.IMAGE_API_KEY));
  if (!enabled) return { images: officialImages, warnings: [], stage: null };
  const started = Date.now();
  const configuredLimit = Number(process.env.IMAGE_MAX_IMAGES || 3);
  const limit = Number.isInteger(configuredLimit) && configuredLimit >= 1 && configuredLimit <= 6 ? configuredLimit : 3;
  const count = Math.min(limit, Number.isInteger(input.task.image_count) ? input.task.image_count : 3);
  if (!count || !officialImages.length) return { images: officialImages, warnings: [], stage: null };
  let selected = [...officialImages].sort((a, b) => Number(b.placement === 'cover') - Number(a.placement === 'cover')).slice(0, count);
  const seeds = [...selected];
  while (selected.length < count) {
    const index = selected.length;
    selected.push({ ...seeds[index % seeds.length], placement: 'inline', after_paragraph: index, caption: `场景配图 ${index + 1}` });
  }
  const originalSlots = selected.map(image => image.id);
  try {
    ({ input, selected } = await workbenchInput(input, selected));
    assertActive(options.signal);
    const strategy = { ...input.strategy, image_plan: selected.map((image) => ({
    asset_id: image.id, placement: image.placement, after_paragraph: image.after_paragraph,
    caption: image.caption, purpose: image.purpose, scene_direction: image.scene_direction,
  })) };
    const result = await (options.generateCreativeImages || generateCreativeImages)({ ...input, strategy }, { signal: options.signal });
    assertActive(options.signal);
    const sources = new Map(selected.map((image) => [image.id, image]));
    const generatedIds = new Set();
    if (result?.status !== 'success' || !Array.isArray(result.images) || result.images.length !== selected.length ||
      !Array.isArray(result.warnings) || result.warnings.some((w) => typeof w !== 'string')) {
      throw new ImageProviderError('IMAGE_INVALID_OUTPUT', '图片结果结构不符合约定');
    }
    for (const [index, image] of result.images.entries()) {
      const source = sources.get(image?.source_product_image);
      // One official subject may intentionally back several image variants.
      // Validate placement metadata against the ordered plan slot in that mode;
      // the source catalog itself remains deduplicated by ID.
      const expected = selected[index];
      if (!source || source.id !== expected.id || generatedIds.has(image.id) || !image.id || typeof image.id !== 'string' ||
        image.generated !== true || image.model !== input.task.model || image.source_url !== source.source_url ||
        !/^\/api\/v1\/generated-assets\/[A-Za-z0-9_-]+\.(png|jpe?g|webp)$/.test(image.url || '') ||
        !image.description || typeof image.description !== 'string' ||
        !expected || image.placement !== expected.placement || image.after_paragraph !== expected.after_paragraph ||
        image.caption !== expected.caption || image.purpose !== expected.purpose) {
        throw new ImageProviderError('IMAGE_INVALID_OUTPUT', '图片型号、来源或展示位置不符合约定');
      }
      generatedIds.add(image.id);
    }
    return { images: [...result.images.map((image, index) => ({ ...selected[index], ...image })), ...officialImages.filter(image => !originalSlots.includes(image.id))].slice(0, input.task.image_count ?? count), warnings: result.warnings,
      stage: { stage: 'imageGeneration', status: 'success', duration_ms: Date.now() - started } };
  } catch (error) {
    assertActive(options.signal);
    if (error.code === 'IMAGE_GENERATION_CANCELLED') throw error;
    // Never expose provider response bodies or arbitrary exception messages.
    const code = /^IMAGE_[A-Z_]+$/.test(error.code || '') ? error.code : 'IMAGE_GENERATION_FAILED';
    // Keep the stable error code for clients, but include our own safe reason so
    // the workbench can tell a bad asset mapping from a provider failure. Never
    // surface arbitrary provider bodies or credentials.
    return { images: officialImages, warnings: [imageFailureWarning({ code })],
      stage: { stage: 'imageGeneration', status: 'failed', code, duration_ms: Date.now() - started } };
  }
}
module.exports = { integrateImages };
