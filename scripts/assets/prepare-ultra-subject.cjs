// Reviewed contour for this exact official KV only; never apply to other photos.
// Keeps the source RGB pixels; only alpha is changed (no AI redraw or recoloring).
const fs = require('node:fs');
const path = require('node:path');
const sharp = require('../../services/api/node_modules/sharp');
const folder = path.resolve(__dirname, '../../华为PC全板块深度知识库_v7/P1-产品参数库/02-MateBook-Windows/MateBook 14 酷睿 Ultra');
const original = 'hwpc_matebook-14-2024_高质感主视觉_02_b694be0b.jpg';
const output = 'hwpc_matebook-14-2024_完整主体_透明抠图.png';
const contour = 'M 305.8 453.6 L 460.8 48 Q 465 33 472 31 Q 477 29 484 33 L 706 151 Q 713 155 711 163 L 585.8 430.8 L 740 674 Q 743 681 737 685 L 525 836 Q 516 842 509 835 L 310 478 Q 303 465 305.8 453.6 Z';
async function main() {
  const source = path.join(folder, 'images', original);
  const meta = await sharp(source).metadata();
  if (meta.width !== 1104 || meta.height !== 870) throw new Error('Reviewed Ultra source dimensions changed; inspect again.');
  const mask = await sharp(Buffer.from(`<svg width="1104" height="870" viewBox="0 0 1104 870"><path d="${contour}" fill="white"/></svg>`), { density: 288 }).resize(1104, 870).png().toBuffer();
  await sharp(source).ensureAlpha().composite([{ input: mask, blend: 'dest-in' }]).png().toFile(path.join(folder, 'images', output));
  const index = path.join(folder, '图片索引.csv');
  const csv = fs.readFileSync(index, 'utf8');
  if (!csv.includes(output)) fs.appendFileSync(index, `${csv.endsWith('\n') ? '' : '\n'}${output},HUAWEI MateBook 14 酷睿 Ultra,https://consumer.huawei.com/cn/laptops/matebook-14-2024/,https://consumer.huawei.com/content/dam/huawei-cbg-site/cn/mkt/pdp/laptops/matebook-14-2024/images/huawei-matebook-14-2024-kv1.jpg,完整打开产品侧上视角（官方KV人工轮廓抠图；保留原始像素）,1104,870,由${original}派生；仅去背景；非官方透明原文件；非俯拍素材\n`);
  console.log(path.join(folder, 'images', output));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
