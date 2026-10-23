const test = require('node:test');
const assert = require('node:assert/strict');
const { extractSelectedPrice } = require('../services/api/src/services/vmallPublicPrice.cjs');
const { queryChannelPrices } = require('../services/api/src/services/channelPriceService.cjs');
const model = 'HUAWEI MateBook 14（鸿蒙版）';
const configuration = 'HarmonyOS；24GB/512GB/柔光版；原野绿；麒麟X90；圆键盘';
const title = 'HUAWEI MateBook 14 鸿蒙版 24GB 512GB 柔光版 圆键盘 原野绿';
const page = `首页 > ${title}\n1\n/\n19\n${title}\nOLED 屏\n¥\n7399\n¥7999\n系统\nHarmonyOS\n配件 ¥299\n已选：HarmonyOS·24GB/512GB/柔光版·原野绿·麒麟X90\n`;
test('selected SKU price excludes crossed-out prices, accessories and different variants', () => {
  assert.equal(extractSelectedPrice(page, model, configuration).price, 7399);
  assert.equal(extractSelectedPrice(page, model, configuration.replace('/柔光版', '')), null);
  assert.equal(extractSelectedPrice(page, model, configuration.replace('原野绿', '樱粉金')), null);
  assert.equal(extractSelectedPrice(page.replaceAll('麒麟X90', '麒麟X90Plus'), model, configuration), null);
  assert.equal(extractSelectedPrice(page, 'HUAWEI MateBook X', configuration), null);
  assert.equal(extractSelectedPrice('<p>¥7399</p>', model, configuration), null);
});
test('verified public price is applied automatically; subsequent failures invalidate old channel prices', async () => {
  const { applyPublicReport, createDemoProfile, buildDemoPlan } = await import('../apps/web/src/lib/demoStorePlan.mjs');
  const report = await queryChannelPrices({ model, configuration, live: true }, {
    queryVmallPublicPrice: async () => ({ online: { status: 'verified', price: 7299, source_url: 'https://item.vmall.com/product/1' }, education: { status: 'qualification_required', sources: [] } }),
  });
  const profile = applyPublicReport(createDemoProfile(), report);
  assert.equal(profile.onlineConfirmed, true);
  assert.equal(buildDemoPlan(profile).result.plans.find(p => p.name === '华为商城价格').price, 7299);
  assert.equal(profile.educationConfirmed, false);
  const failed = applyPublicReport(profile, { ...report, online: { status: 'unavailable' } });
  assert.equal(failed.onlinePrice, '');
  assert.equal(failed.onlineConfirmed, false);
  const spoofed = applyPublicReport(profile, { ...report, online: { status: 'verified', price: 1, source_url: 'https://example.com' } });
  assert.equal(spoofed.onlineConfirmed, false);
});
test('public collector failure returns a specific retryable reason without invented prices', async () => {
  const report = await queryChannelPrices({ model, live: true }, { queryVmallPublicPrice: async () => { throw new Error('浏览器页面请求超时'); } });
  assert.equal(report.online.status, 'unavailable');
  assert.match(report.online.message, /浏览器页面请求超时/);
  assert.equal(report.online.price, undefined);
});
