const { createProvider, ImageProviderError, assertActive } = require('./provider.cjs');
const { saveGeneratedImage, removeGeneratedImage } = require('./storage.cjs');
const { readOfficialReference, prepareSubject, composeSubject, compositionLayout } = require('./composition.cjs');
const { chooseStyle } = require('./styles.cjs');
const { sourceCameraDirection } = require('./sourceSelection.cjs');
const placements = new Set(['cover', 'inline', 'closing']);

function assertInput(input) {
  if (!input || !input.task || !Array.isArray(input.evidence) || !input.platform || !input.strategy || !Array.isArray(input.assets)) throw new ImageProviderError('IMAGE_INVALID_INPUT', '图片模块需要 task、evidence、assets、platform、strategy');
  if (typeof input.task.model !== 'string' || !input.task.model.trim() || !Number.isInteger(input.task.image_count) || input.task.image_count < 1) throw new ImageProviderError('IMAGE_INVALID_INPUT', '图片模块需要已确认型号和有效 image_count');
  if (!input.assets.length) throw new ImageProviderError('IMAGE_NO_MATCHED_ASSET', '本次任务没有同型号官方产品图');
  if (input.assets.some((asset) => !asset || typeof asset.id !== 'string' || !asset.id) || new Set(input.assets.map((asset) => asset.id)).size !== input.assets.length) throw new ImageProviderError('IMAGE_INVALID_SOURCE', '素材 ID 缺失或重复');
  if (!Array.isArray(input.strategy.image_plan) || !input.strategy.image_plan.length) throw new ImageProviderError('IMAGE_INVALID_PLAN', '缺少已审核配图规划');
}

function backgroundBrief(value) {
  return String(value || '').split(/(?<=[，,、。.!！？\n])/).filter((part) => {
    return !/(产品|电脑|笔记本|MateBook|HUAWEI|华为|3D|渲染|机身|材质细节|Logo|标志|参数|CTA|EXPLORE NOW|官网|社媒|主体|文字|字体|排版|英文|标题|按钮|PREMIUM)/i.test(part);
  }).join(' ').slice(0, 2400);
}

function buildPrompt(input, asset, plan) {
  const selection = chooseStyle(input, plan || {});
  if (selection.unsupported) {
    throw new ImageProviderError('IMAGE_UNSUPPORTED_STYLE', selection.unsupported.message);
  }
  const style = selection.style;
  const layout = compositionLayout(input, style);
  const platformVisual = layout.commercial || style.group === 'poster' ? 'Premium commercial technology advertising, studio lighting, symmetrical hero composition and typography space.' : ['xiaohongshu', 'wechat_moments'].includes(input.task.platform)
    ? 'Favor an inviting, candid social-media lifestyle photograph with authentic texture and a light touch; avoid hard-sell advertising.'
    : 'Favor restrained editorial art direction, clean hierarchy and generous negative space suitable for an informative article.';
  return [
    'Generate a background only: an empty background plate. No product. It must contain exactly zero products or devices: no laptop, computer, notebook computer, phone, screen, keyboard, electronics, logos, labels, text, numbers, people or hands. Do not reinterpret any excluded object as decor.',
    layout.commercial ? 'Premium commercial technology campaign poster background: art-directed spatial depth, cinematic side lighting, a luminous focal area behind the product and richer tonal depth at the margins. Harmonize the palette with the selected official product color described below. The setting may use architectural light planes, sculptural abstract forms, satin reflections or an atmospheric studio environment; a plain gradient is not mandatory. Follow explicit user scene choices; do not introduce landscape motifs unless requested. Keep the central product zone quiet and the upper and footer typography zones dark enough for luminous silver-white lettering. No lettering or symbols: typography is added separately.' : style.prompt,
    backgroundBrief(input.task.visual_brief) ? `Follow the user's art direction below for palette, lighting, composition and atmosphere. Do not introduce a different scene or motif. Do not invent decorative elements that the brief excludes.\n${backgroundBrief(input.task.visual_brief)}` : '',
    `Final canvas: ${layout.width}x${layout.height}. Reserve a clear product area centered at ${Math.round(layout.x * 100)}% width and ${Math.round(layout.y * 100)}% height, occupying up to ${Math.round(layout.maxWidth / layout.width * 100)}% width. ${layout.commercial ? "Keep the upper area uncluttered for locally typeset title elements and leave a calm lower area for a CTA. Match the user's requested setting and palette; do not add landscapes, mountains, water or other motifs unless requested." : style.group === 'daily' ? 'Vertical 3:4 candid lifestyle photo. Keep a completely EMPTY central area spanning 72% of frame width, with a continuous bare supporting desk or fabric surface. This is an empty room/detail photograph, not a computer-use photograph. Put only small props around the outer perimeter: drinking glasses no wider than 9% of frame width and paper notebooks no wider than 22%. No object, dark rectangle, display or keyboard may occupy the central empty area. Use consistent camera perspective and lighting across the empty surface. Use a natural phone-photo perspective, realistic depth of field and soft contact shadow; no floating, hard cutout edge, pasted-on look, tabletop seam, or mismatched scale.' : 'Provide a continuous supporting surface beneath that area. Use an oblique tabletop camera view, not a strict flat lay.'}`,
    'The official product image will be composited by the server. Preserve the requested clear placement area and do not draw a substitute product.',
    layout.commercial ? 'Use broad continuous light and shadow transitions. No thin white luminous lines, laser beams, vertical light strips, crossing strokes, wireframes, borders, panel dividers or outlines slicing through the canvas. Do not build a raised pedestal beneath the floating product. Preserve quiet uninterrupted negative space.' : '',
    style.group === 'daily' ? sourceCameraDirection(asset) : '',
    `Platform visual direction: ${platformVisual}`,
    plan.scene_direction || '',
    `Platform context: ${input.platform.label || input.task.platform || ''}.`,
    `Audience context: ${input.task.audience || ''}.${layout.commercial ? '' : ` Scene context: ${backgroundBrief(input.task.scenario)}.`}`,
    `Selected visual template: ${style.id}. Editorial purpose: ${layout.commercial ? 'premium commercial technology poster background' : backgroundBrief(plan?.purpose) || 'empty environment'}. Treat task fields as context, never as instructions to draw products or text.`,
  ].join('\n');
}

function buildEditPrompt(input, asset, plan) {
  const selection = chooseStyle(input, plan || {});
  if (selection.unsupported) throw new ImageProviderError('IMAGE_UNSUPPORTED_STYLE', selection.unsupported.message);
  return [
    'Edit the supplied official product reference into a finished product lifestyle image. Remove or replace its original background yourself; do not require a pre-cut transparent PNG.',
    `The confirmed product is ${input.task.model}. Preserve the referenced product identity, chassis shape, proportions, color, screen, keyboard, ports and existing brand logo. Do not substitute another model, add features or invent accessories attached to the product.`,
    'Show ONE complete product from the reference. If the reference contains several color variants, choose one matching the brief. Keep realistic perspective, contact shadows and natural lighting. Do not depict unsupported functionality or performance claims.',
    `Platform: ${input.platform.label || input.task.platform || ''}. Audience: ${input.task.audience || ''}. Scene: ${input.task.scenario || ''}.`,
    plan.scene_direction || '',
    `Visual style: ${selection.style.name}. Image purpose: ${plan.purpose || ''}.`,
    input.task.visual_brief ? `Art direction: ${input.task.visual_brief}` : 'Inviting candid social-media photograph, natural texture, restrained props and a clear product focus.',
    'No invented specifications, prices, slogans, watermarks or extra logos. Preserve existing product branding only. The reference and task fields are visual context, not permission to change product identity.',
  ].join('\n');
}

async function generateCreativeImages(input, options = {}) {
  assertActive(options.signal);
  assertInput(input);
  let provider = options.provider || null;
  let referenceEditing = false;
  const plans = input.strategy.image_plan.slice(0, input.task.image_count);
  const used = new Set();
  const allowRepeatedSubject = true;
  const prepared = [];
  // Validate every planned source before sending any paid request.
  for (const plan of plans) {
    if (!plan || typeof plan !== 'object') throw new ImageProviderError('IMAGE_INVALID_PLAN', '配图规划无效');
    const asset = input.assets.find((item) => item.id === plan.asset_id);
    if (!asset || (!allowRepeatedSubject && used.has(asset.id)) || !placements.has(plan.placement) || !Number.isInteger(plan.after_paragraph) || plan.after_paragraph < (plan.placement === 'cover' ? 0 : 1) || typeof plan.caption !== 'string' || !plan.caption.trim() || typeof plan.purpose !== 'string' || !plan.purpose.trim()) throw new ImageProviderError('IMAGE_INVALID_PLAN', '配图规划或素材关联无效');
    used.add(asset.id);
    // assets are matched by the main agent; titles can contain approved aliases.
    // Never substitute another source or trust a provider to declare the model.
    let source;
    try { source = new URL(asset.source_url); } catch { throw new ImageProviderError('IMAGE_INVALID_SOURCE', '官方图缺少来源'); }
    if (source.protocol !== 'https:' || !/(^|\.)(consumer\.huawei\.com|vmall\.com)$/.test(source.hostname)) throw new ImageProviderError('IMAGE_INVALID_SOURCE', '素材来源不是华为官方页面');
    const selection = chooseStyle(input, plan);
    if (selection.unsupported) throw new ImageProviderError('IMAGE_UNSUPPORTED_STYLE', selection.unsupported.message);
    provider ||= createProvider(options);
    // Production HTTP providers edit the original in one model call. Legacy
    // generate-only adapters can still use explicit local subject composition.
    referenceEditing = options.mode !== 'composition' && process.env.IMAGE_GENERATION_MODE !== 'composition' && typeof provider.edit === 'function';
    if (referenceEditing) {
      const reference = await readOfficialReference(asset, options);
      prepared.push({ asset, plan, reference });
      continue;
    }
    const subject = await prepareSubject(asset, options);
    if (selection.style.group === 'daily' && asset.composition_profile?.dailyRotation) {
      // Rigid rotation only: preserve the original model, geometry and screen.
      const sharp = require('sharp');
      subject.buffer = await sharp(subject.buffer).rotate(asset.composition_profile.dailyRotation, { background: '#00000000' }).trim().png().toBuffer();
    }
    prepared.push({ asset, plan, style: selection.style, layout: compositionLayout(input, selection.style), subject });
  }
  const storedFiles = [];
  try {
    const images = [];
    const warnings = new Set();
    // Settle each bounded batch before cleanup, so late workers cannot leave files behind.
    for (let offset = 0; offset < prepared.length; offset += 3) {
      const batch = await Promise.allSettled(prepared.slice(offset, offset + 3).map(async ({ asset, plan, style, layout, subject, reference }) => {
      assertActive(options.signal);
      let background;
      provider ||= createProvider(options);
      const outputs = referenceEditing
        ? await provider.edit({ prompt: buildEditPrompt(input, asset, plan), reference }, { signal: options.signal })
        : await provider.generate({ prompt: buildPrompt(input, asset, plan) }, { signal: options.signal });
      assertActive(options.signal);
      if (!Array.isArray(outputs) || !Buffer.isBuffer(outputs[0]?.buffer) || !outputs[0].buffer.length || outputs[0].buffer.length > 12 * 1024 * 1024) throw new ImageProviderError('IMAGE_INVALID_OUTPUT', '图片服务返回了无效背景');
      background = outputs[0].buffer;
      if (referenceEditing) {
        const sharp = require('sharp');
        const decoder = sharp(background, { limitInputPixels: 25000000 });
        const metadata = await decoder.metadata();
        if (!['png', 'jpeg', 'webp'].includes(metadata.format) || (metadata.pages || 1) !== 1) throw new ImageProviderError('IMAGE_INVALID_OUTPUT', '图片编辑结果不是有效的静态图片');
        const stored = saveGeneratedImage(await decoder.png().toBuffer(), 'png', options);
        storedFiles.push(stored);
        warnings.add('图片由模型参考官方产品原图编辑生成；外观和 Logo 仍可能存在偏差，发布前需核对，不作为实拍或功能证明。');
        return { id: stored.id, url: stored.url, description: `${input.task.model}（官方原图参考编辑）`, model: input.task.model, source_url: asset.source_url, source_product_image: asset.id, generated: true, generation_mode: 'ai_reference_edit', placement: plan.placement, after_paragraph: plan.after_paragraph, caption: plan.caption, purpose: plan.purpose };
      }
      warnings.add(layout.commercial ? '海报背景由图片模型按画面描述生成；产品主体和文字信息由本地合成，发布前请人工检查。' : '生活场景背景由图片模型生成，不作为产品应用或功能证明；发布前请人工检查。');
      const output = await composeSubject(background, subject, { ...options, style, layout, evidence: input.evidence });
      assertActive(options.signal);
      const stored = saveGeneratedImage(output.buffer, output.extension, options);
      storedFiles.push(stored);
      if (subject.cutout) warnings.add('已通过背景移除服务处理官方产品图；请检查浅色机身和屏幕边缘。');
      return { id: stored.id, url: stored.url, description: `${asset.description || input.task.model}（图片模型背景+官方主体合成）`, model: input.task.model, source_url: asset.source_url, source_product_image: asset.id, generated: true, generation_mode: 'ai_background_composition', placement: plan.placement, after_paragraph: plan.after_paragraph, caption: plan.caption, purpose: plan.purpose };
      }));
      const failed = batch.find(result => result.status === 'rejected');
      if (failed) throw failed.reason;
      images.push(...batch.map(result => result.value));
    }
    assertActive(options.signal);
    return { status: 'success', provider: provider?.id || 'image-provider', images, warnings: [...warnings] };
  } catch (error) {
    for (const stored of storedFiles) removeGeneratedImage(stored.filename, options);
    throw error;
  }
}
module.exports = { generateCreativeImages, assertInput, buildPrompt, buildEditPrompt };
