export function isAllowedImageUrl(src) {
  return typeof src === 'string' && (
    /^\/api\/v1\/products\/image\?path=/.test(src) ||
    /^\/api\/v1\/generated-assets\/[A-Za-z0-9_-]+\.(png|jpe?g|webp)$/.test(src)
  );
}
