const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { assertActive, ImageProviderError } = require('./provider.cjs');

const EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'webp']);
const MIME_TYPES = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp' };

function resourceRoot(options = {}) {
  return path.resolve(options.root || process.env.GENERATED_ASSET_DIR || path.join(process.cwd(), 'tmp', 'generated-assets'));
}

function safeExtension(value) {
  const extension = String(value || 'png').replace(/^\./, '').toLowerCase();
  if (!EXTENSIONS.has(extension)) throw Object.assign(new Error('不支持的生成图片格式'), { code: 'IMAGE_INVALID_FORMAT' });
  return extension;
}

function saveGeneratedImage(buffer, extension, options = {}) {
  assertActive(options.signal);
  if (!Buffer.isBuffer(buffer) || !buffer.length) throw Object.assign(new Error('图片服务未返回有效图片'), { code: 'IMAGE_EMPTY_OUTPUT' });
  if (buffer.length > Number(options.maxBytes || 12 * 1024 * 1024)) throw Object.assign(new Error('生成图片超过大小限制'), { code: 'IMAGE_TOO_LARGE' });
  const ext = safeExtension(extension);
  const root = resourceRoot(options);
  fs.mkdirSync(root, { recursive: true });
  const id = `img_${crypto.randomBytes(16).toString('hex')}`;
  const filename = `${id}.${ext}`;
  fs.writeFileSync(path.join(root, filename), buffer, { flag: 'wx' });
  return { id, filename, path: path.join(root, filename), url: `/api/v1/generated-assets/${filename}`, content_type: MIME_TYPES[ext] };
}

function resolveGeneratedImage(filename, options = {}) {
  const name = path.basename(String(filename || ''));
  if (name !== filename || !/^img_[a-f0-9]{32}\.(?:png|jpg|jpeg|webp)$/.test(name)) return null;
  const root = resourceRoot(options);
  const target = path.resolve(root, name);
  if (!target.startsWith(`${root}${path.sep}`) || !fs.existsSync(target) || !fs.lstatSync(target).isFile()) return null;
  return target;
}

function removeGeneratedImage(filename, options = {}) {
  const target = resolveGeneratedImage(filename, options);
  if (target) fs.unlinkSync(target);
}

// Explicit maintenance command; do not delete assets while an article is delivered.
function cleanupGeneratedImages(options = {}) {
  const maxAgeMs = Number(options.maxAgeMs ?? 7 * 24 * 60 * 60 * 1000);
  if (!Number.isFinite(maxAgeMs) || maxAgeMs <= 0) throw new ImageProviderError('IMAGE_INVALID_CONFIG', '资源保留期无效');
  const root = resourceRoot(options);
  if (!fs.existsSync(root)) return 0;
  let removed = 0;
  for (const name of fs.readdirSync(root)) {
    const target = resolveGeneratedImage(name, options);
    if (target && Date.now() - fs.statSync(target).mtimeMs > maxAgeMs) { fs.unlinkSync(target); removed++; }
  }
  return removed;
}

module.exports = { resourceRoot, saveGeneratedImage, resolveGeneratedImage, removeGeneratedImage, cleanupGeneratedImages, MIME_TYPES };
