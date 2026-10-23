const fs = require('fs');
const path = require('path');
const { ROOT } = require('../../services/localKnowledgeBrowser.cjs');
const { ImageProviderError, assertActive } = require('./provider.cjs');

function imageLibrary() {
  try { return require('sharp'); }
  catch { throw new ImageProviderError('IMAGE_PROCESSOR_NOT_INSTALLED', '请先在 services/api 安装图片处理依赖'); }
}

// One layout drives both the model request and deterministic product placement.
function compositionLayout(input = {}, style = {}) {
  const brief = String(input.task?.visual_brief || '');
  const commercial = /MateBook/i.test(String(input.task?.model || '')) && /商业|发布会|Behance|CTA|EXPLORE NOW/i.test(brief) && !/不添加文字|不生成文案|无文字/.test(brief);
  const portrait = commercial || style.group === 'daily' || /3\s*[:：/]\s*4|3比4/.test(brief);
  const width = portrait ? 768 : 1024;
  const height = 1024;
  let x = 0.5;
  if (/中央偏右|中间偏右/.test(brief)) x = 0.65;
  if (/中央偏左|中间偏左/.test(brief)) x = 0.35;
  return { width, height, commercial, model: String(input.task?.model || ''), x: commercial ? 0.5 : x, y: commercial ? 0.51 : style.group === 'poster' ? 0.66 : 0.59,
    maxWidth: Math.round(width * (commercial ? 0.76 : style.group === 'daily' ? 0.72 : 0.78)),
    maxHeight: Math.round(height * (commercial ? 0.46 : style.group === 'daily' ? 0.54 : 0.43)) };
}

function huaweiIconData() {
  try {
    const file = path.join(__dirname, '../../../../../assets-huawei-icon.png');
    return `data:image/png;base64,${fs.readFileSync(file).toString('base64')}`;
  } catch { return ''; }
}

function posterLayers(layout, ink = '#17232e', light = false) {
  const { width: w, height: h } = layout;
  const title = String(layout.model).replace(/^HUAWEI\s*/i, '').slice(0, 70).replace(/[&<>"']/g, '');
  const svg = body => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><g font-family="Helvetica Neue, Arial, sans-serif" fill="${ink}">${body}</g></svg>`);
  return {
    back: svg(`<defs><linearGradient id="metal" x1="0" y1="0" x2="0" y2="1"><stop stop-color="${light ? '#ffffff' : '#62717a'}" stop-opacity=".95"/><stop offset=".48" stop-color="${light ? '#dce6e8' : '#8a999d'}" stop-opacity=".72"/><stop offset="1" stop-color="${light ? '#98b3b8' : '#acb8b7'}" stop-opacity=".12"/></linearGradient></defs><text x="${w*.5}" y="${h*.25}" text-anchor="middle" font-size="${w*.145}" font-weight="700" letter-spacing="0" fill="url(#metal)">MateBook</text>`),
    front: svg(`<image x="${w*.5-88}" y="${h*.045}" width="32" height="32" href="${huaweiIconData()}" opacity=".95"/><text x="${w*.5-43}" y="${h*.072}" text-anchor="start" font-size="${w*.035}" font-weight="700" letter-spacing="0">HUAWEI</text><text x="${w*.5}" y="${h*.755}" text-anchor="middle" font-size="${Math.min(w*.048,w*.84/Math.max(title.length,1)*1.6)}" font-weight="400" letter-spacing="0">${title}</text><text x="${w*.5}" y="${h*.79}" text-anchor="middle" font-size="${w*.021}" letter-spacing="1.2" opacity=".82">POWER &amp; PERFORMANCE. REFINED.</text><rect x="${w*.35}" y="${h*.855}" width="${w*.3}" height="42" rx="21" fill="${ink}"/><text x="${w*.5}" y="${h*.855+26}" text-anchor="middle" font-size="12" font-weight="600" letter-spacing="0" fill="${light ? '#17232e' : '#fff'}">EXPLORE NOW  ›</text><text x="${w*.5}" y="${h*.935}" text-anchor="middle" font-size="12" letter-spacing="0">consumer.huawei.com</text><text x="${w*.5}" y="${h*.963}" text-anchor="middle" font-size="10" letter-spacing="0" opacity=".75">YouTube   /   Instagram   /   X</text>`),
  };
}

function posterFacts(evidence = [], width = 768, height = 1024, optionsModel) {
  const facts = evidence.filter((item) => item?.content && item.model === optionsModel && item.retrievable !== false && item.confidence !== 'unavailable' && /^https:\/\/(?:consumer\.huawei\.com|(?:www\.)?vmall\.com)\//i.test(item.source_url || ''))
    .flatMap((item) => String(item.content).split(/[\n。；;]/).map((line) => line.replace(/^[-*#\s]+/, '').trim()))
    .filter((line) => line.length >= 6 && line.length <= 20 && /\d|屏|芯|续航|轻薄|重量|厚度|色域|分辨率|刷新率|接口|内存|硬盘|电池/.test(line))
    .filter((line, index, all) => all.indexOf(line) === index).slice(0, 4);
  if (!facts.length) return null;
  const col = width / facts.length;
  const cells = facts.map((fact, index) => {
    const cx = col * (index + .5);
    const short = fact.replace(/[&<>"']/g, '');
    const icon = index % 2 === 0
      ? `<rect x="${cx-11}" y="${height*.806}" width="22" height="16" rx="2" fill="none" stroke="#e7f3ff" stroke-width="1.4"/><path d="M${cx-6} ${height*.814}h12m-12 5h8" stroke="#e7f3ff" stroke-width="1.2"/>`
      : `<circle cx="${cx}" cy="${height*.814}" r="10" fill="none" stroke="#e7f3ff" stroke-width="1.4"/><path d="M${cx-5} ${height*.814}h10m-5-5v10" stroke="#e7f3ff" stroke-width="1.2"/>`;
    return `${icon}<text x="${cx}" y="${height*.844}" text-anchor="middle" font-size="9" font-weight="600" fill="#f5f9ff">${short}</text>`;
  }).join('');
  const separators = facts.slice(1).map((_, index) => `<path d="M${col*(index+1)} ${height*.795}v${height*.06}" stroke="#dceaff" stroke-opacity=".32"/>`).join('');
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${cells}${separators}</svg>`);
}

async function readOfficialReference(asset, options = {}) {
  assertActive(options.signal);
  if (typeof asset.source_path !== 'string' || !asset.source_path) throw new ImageProviderError('IMAGE_INVALID_SOURCE', '官方图缺少本地素材路径');
  let root;
  let file;
  try { root = fs.realpathSync(ROOT); file = fs.realpathSync(path.resolve(root, asset.source_path)); }
  catch { throw new ImageProviderError('IMAGE_INVALID_SOURCE', '官方图文件不存在'); }
  if (!file.startsWith(`${root}${path.sep}`) || !/\.(png|jpe?g|webp)$/i.test(file) || !fs.statSync(file).isFile() || fs.statSync(file).size > 12 * 1024 * 1024) throw new ImageProviderError('IMAGE_INVALID_SOURCE', '官方图路径或大小无效');
  try {
    const sharp = imageLibrary();
    const data = fs.readFileSync(file);
    const metadata = await sharp(data, { limitInputPixels: 25000000 }).metadata();
    if (!['png', 'jpeg', 'webp'].includes(metadata.format) || (metadata.pages || 1) !== 1) throw new ImageProviderError('IMAGE_INVALID_SOURCE', '官方图必须是静态 PNG、JPEG 或 WebP');
    return { buffer: data, metadata, mime: metadata.format === 'jpeg' ? 'image/jpeg' : `image/${metadata.format}` };
  } catch (error) {
    if (error instanceof ImageProviderError) throw error;
    throw new ImageProviderError('IMAGE_PROCESSING_FAILED', '官方图无法解码或处理');
  }
}

async function prepareSubject(asset, options = {}) {
  const { buffer: data, metadata, mime } = await readOfficialReference(asset, options);
  try {
    const sharp = imageLibrary();
    let subjectData = data;
    const sourcePixels = await sharp(data, { limitInputPixels: 25000000 }).rotate().ensureAlpha().raw().toBuffer();
    let sourceHasTransparency = false;
    for (let i = 3; i < sourcePixels.length; i += 4) if (sourcePixels[i] < 255) { sourceHasTransparency = true; break; }
    if (!sourceHasTransparency) {
      const apiKey = process.env.REMOVE_BG_API_KEY;
      if (!apiKey) throw new ImageProviderError('IMAGE_CUTOUT_NOT_CONFIGURED', '所选官方图没有透明背景。请在服务端配置 REMOVE_BG_API_KEY 后重试；未使用近似抠图，以免损伤产品边缘。');
      const form = new FormData();
      form.append('image_file', new Blob([data], { type: mime }), `product.${metadata.format}`);
      form.append('size', 'auto');
      form.append('format', 'png');
      let response;
      try {
        const timeout = AbortSignal.timeout(90000);
        const signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout;
        response = await (options.fetch || fetch)('https://api.remove.bg/v1.0/removebg', { method: 'POST', headers: { 'X-Api-Key': apiKey }, body: form, signal });
      } catch {
        if (options.signal?.aborted) assertActive(options.signal);
        throw new ImageProviderError('IMAGE_CUTOUT_PROVIDER_FAILED', '背景移除服务连接失败，请检查网络后重试。');
      }
      if (!response.ok) {
        const code = response.status === 402 ? 'IMAGE_CUTOUT_QUOTA_EXHAUSTED' : 'IMAGE_CUTOUT_PROVIDER_FAILED';
        throw new ImageProviderError(code, response.status === 402 ? '背景移除服务额度不足，请检查 remove.bg 账户额度。' : `背景移除服务返回错误（HTTP ${response.status}），请检查 REMOVE_BG_API_KEY 和服务状态。`);
      }
      subjectData = Buffer.from(await response.arrayBuffer());
      if (!subjectData.length || subjectData.length > 20 * 1024 * 1024) throw new ImageProviderError('IMAGE_CUTOUT_INVALID_OUTPUT', '背景移除服务返回了无效图片。');
      const cutoutMetadata = await sharp(subjectData, { limitInputPixels: 25000000 }).metadata();
      if (cutoutMetadata.format !== 'png' || !cutoutMetadata.hasAlpha) throw new ImageProviderError('IMAGE_CUTOUT_INVALID_OUTPUT', '背景移除服务没有返回透明 PNG。');
    }
    const decoded = await sharp(subjectData, { limitInputPixels: 25000000 }).rotate().ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const { width, height, channels } = decoded.info;
    let left = width, top = height, right = -1, bottom = -1, transparent = false;
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const alpha = decoded.data[(y * width + x) * channels + 3];
      if (alpha < 255) transparent = true;
      if (alpha > 0) { left = Math.min(left, x); top = Math.min(top, y); right = Math.max(right, x); bottom = Math.max(bottom, y); }
    }
    if (!sourceHasTransparency && !transparent) throw new ImageProviderError('IMAGE_CUTOUT_INVALID_OUTPUT', '背景移除服务返回的图片仍然不透明，已停止合成。');
    if (right < 0) throw new ImageProviderError('IMAGE_INVALID_SOURCE', '官方图没有可见主体');
    // Crop only fully transparent margins; never infer a mask from white/silver pixels.
    const buffer = await sharp(decoded.data, { raw: decoded.info })
      .extract({ left, top, width: right - left + 1, height: bottom - top + 1 }).png().toBuffer();
    assertActive(options.signal);
    return { buffer, hasAlpha: transparent, cutout: !sourceHasTransparency };

  } catch (error) {
    if (error instanceof ImageProviderError) throw error;
    throw new ImageProviderError('IMAGE_PROCESSING_FAILED', '官方图无法解码或处理');
  }
}

async function composeSubject(background, subject, options = {}) {
  assertActive(options.signal);
  try {
    const sharp = imageLibrary();
    const layout = options.layout || compositionLayout({}, options.style);
    // Use the actual background brightness rather than assuming a dark campaign.
    const sample = await sharp(background).resize(1, 1).removeAlpha().raw().toBuffer();
    const lightInk = .2126 * sample[0] + .7152 * sample[1] + .0722 * sample[2] < 140;
    const ink = lightInk ? '#f3f6fa' : '#17232e';
    const typography = layout.commercial ? posterLayers(layout, ink, lightInk) : null;
    const backgroundBuffer = background;
    if (!Buffer.isBuffer(backgroundBuffer)) throw new ImageProviderError('IMAGE_INVALID_OUTPUT', '缺少可用的生成背景');
    const metadata = await sharp(backgroundBuffer, { limitInputPixels: 25000000 }).metadata();
    if (!['png', 'jpeg', 'webp', 'svg'].includes(metadata.format) || (metadata.pages || 1) !== 1) throw new ImageProviderError('IMAGE_INVALID_OUTPUT', '生成背景不是支持的静态图片');
    const resized = await sharp(subject.buffer).resize({ width: layout.maxWidth, height: layout.maxHeight, fit: 'inside', withoutEnlargement: !layout.commercial && options.style?.group !== 'daily' }).png().toBuffer({ resolveWithObject: true });
    const left = Math.max(0, Math.min(layout.width - resized.info.width, Math.round(layout.width * layout.x - resized.info.width / 2)));
    const top = Math.max(0, Math.min(layout.height - resized.info.height, Math.round(layout.height * layout.y - resized.info.height / 2)));
    const overlays = [];
    if (typography) overlays.push({ input: typography.back, left: 0, top: 0 });
    if (subject.hasAlpha) {
      // A detached poster shadow creates lift without repainting official product pixels.
      const shadow = Buffer.from(`<svg width="${layout.width}" height="${layout.height}"><defs><filter id="blur"><feGaussianBlur stdDeviation="${layout.commercial ? 16 : 8}"/></filter></defs><ellipse cx="${left + resized.info.width / 2}" cy="${top + resized.info.height + (layout.commercial ? 38 : -3)}" rx="${resized.info.width * (layout.commercial ? 0.34 : 0.40)}" ry="${layout.commercial ? 13 : 9}" fill="black" opacity="${layout.commercial ? 0.28 : 0.16}" filter="url(#blur)"/></svg>`);
      overlays.push({ input: shadow, left: 0, top: 0 });
    }
    overlays.push({ input: resized.data, left, top });
    if (typography) {
      const facts = null; // Keep the compact footer free of overlapping automatic fact cards.
      if (facts) overlays.push({ input: Buffer.from(facts.toString().replace(/#e7f3ff|#f5f9ff|#dceaff/g, ink)), left: 0, top: 0 });
    }
    if (typography) overlays.push({ input: typography.front, left: 0, top: 0 });
    const buffer = await sharp(backgroundBuffer, { limitInputPixels: 25000000 }).resize(layout.width, layout.height, { fit: 'cover' }).composite(overlays).png().toBuffer();
    assertActive(options.signal);
    return { buffer, extension: 'png' };
  } catch (error) {
    if (error instanceof ImageProviderError) throw error;
    throw new ImageProviderError('IMAGE_INVALID_OUTPUT', '生成背景无法解码或合成');
  }
}
module.exports = { readOfficialReference, prepareSubject, composeSubject, compositionLayout, posterFacts };
