const fs = require('fs');
const path = require('path');
const { ROOT } = require('../../services/localKnowledgeBrowser.cjs');
const { ImageProviderError, assertActive } = require('./provider.cjs');

function imageLibrary() {
  try { return require('sharp'); }
  catch { throw new ImageProviderError('IMAGE_PROCESSOR_NOT_INSTALLED', '请先在 services/api 安装图片处理依赖'); }
}

async function prepareSubject(asset, options = {}) {
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
    const buffer = await sharp(data, { limitInputPixels: 25000000 }).rotate().resize({ width: 820, height: 650, fit: 'inside', withoutEnlargement: true }).png().toBuffer();
    assertActive(options.signal);
    // Transparent official material retains its supplied mask. Opaque pictures stay intact:
    // no heuristic white removal, which could erase silver/white product pixels.
    return { buffer, hasAlpha: Boolean(metadata.hasAlpha) };
  } catch (error) {
    if (error instanceof ImageProviderError) throw error;
    throw new ImageProviderError('IMAGE_PROCESSING_FAILED', '官方图无法解码或处理');
  }
}

async function composeSubject(background, subject, options = {}) {
  assertActive(options.signal);
  try {
    const sharp = imageLibrary();
    const metadata = await sharp(background, { limitInputPixels: 25000000 }).metadata();
    if (!['png', 'jpeg', 'webp'].includes(metadata.format) || (metadata.pages || 1) !== 1) throw new ImageProviderError('IMAGE_INVALID_OUTPUT', '生成背景不是支持的静态图片');
    const style = options.style;
    let overlay = { input: subject.buffer, gravity: 'south' };
    if (style) {
      const x = style.id === 'a1' ? 0.68 : ['a2', 'a4'].includes(style.id) ? 0.32 : 0.5;
      const y = style.id === 'b1' ? 0.38 : 0.5;
      const maxWidth = style.group === 'daily' ? 480 : 700;
      const resized = await sharp(subject.buffer).resize({ width: maxWidth, height: 480, fit: 'inside', withoutEnlargement: true }).png().toBuffer({ resolveWithObject: true });
      overlay = { input: resized.data, left: Math.max(0, Math.min(1024 - resized.info.width, Math.round(1024 * x - resized.info.width / 2))), top: Math.max(0, Math.min(1024 - resized.info.height, Math.round(1024 * y - resized.info.height / 2))) };
    }
    const buffer = await sharp(background, { limitInputPixels: 25000000 }).resize(1024, 1024, { fit: 'cover' }).composite([overlay]).png().toBuffer();
    assertActive(options.signal);
    return { buffer, extension: 'png' };
  } catch (error) {
    if (error instanceof ImageProviderError) throw error;
    throw new ImageProviderError('IMAGE_INVALID_OUTPUT', '生成背景无法解码或合成');
  }
}
module.exports = { prepareSubject, composeSubject };
