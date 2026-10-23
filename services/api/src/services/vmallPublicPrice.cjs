const { chromium } = require('playwright-core');
const fs = require('node:fs');

const EDUCATION_URL = 'https://www.vmall.com/portal/activity/index.html?isShowLayout=false&pn=educationcenterpc';
const cache = new Map();
let browserPromise;
let tail = Promise.resolve();
const normalize = value => String(value || '').toLowerCase().replace(/华为/g, 'huawei').replace(/[^a-z0-9\u3400-\u9fff]/g, '');

async function browser() {
  if (!browserPromise) {
    const executablePath = process.env.PRICE_BROWSER_EXECUTABLE || [
      'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
      'C:/Program Files/Google/Chrome/Application/chrome.exe',
      '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome',
    ].find(file => fs.existsSync(file));
    browserPromise = chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) })
      .then(instance => { instance.on('disconnected', () => { browserPromise = undefined; }); return instance; })
      .catch(error => { browserPromise = undefined; throw new Error('查价浏览器启动失败，请安装 Chromium 或配置 PRICE_BROWSER_EXECUTABLE：' + error.message.split('\n')[0]); });
  }
  return browserPromise;
}

// Only the selected product's price block is accepted, never accessories or list prices.
function extractSelectedPrice(text, model, configuration) {
  const selected = text.match(/已选[：:]\s*([^\n]+)/)?.[1] || '';
  const breadcrumb = text.match(/首页\s*[>＞]\s*([^\n]+)/)?.[1] || '';
  const expectedModel = normalize(model.replace(/｜.*$/, '').replace(/官方公开价格卡|价格卡/g, ''));
  if (!selected || !breadcrumb || !normalize(breadcrumb).includes(expectedModel)) return null;
  const tokens = configuration.split(/[；;]/).map(token => token.trim()).filter(Boolean);
  // Whole dimension equality avoids matching 24GB/512GB to its soft-light variant.
  const selectedTokens = selected.split(/[·；;]/).map(normalize);
  if (!tokens.every(token => selectedTokens.includes(normalize(token)) || (/键盘/.test(token) && normalize(breadcrumb).includes(normalize(token))))) return null;
  const start = text.indexOf(breadcrumb, text.indexOf(breadcrumb) + breadcrumb.length);
  const block = start >= 0 ? text.slice(start + breadcrumb.length).split(/\n(?:系统|配置|颜色|版本|CPU型号)\n/)[0] : '';
  const match = block.match(/(?:¥|￥)\s*([\d,]+(?:\.\d{1,2})?)/);
  const price = Number(match?.[1]?.replace(/,/g, ''));
  if (!(price > 0) || /暂不销售|已下架|暂时缺货/.test(block)) return null;
  return { price, selected_configuration: selected, product_title: breadcrumb, excerpt: block.trim().slice(0, 500) };
}

async function collect({ source_url, model, configuration }) {
  const url = new URL(source_url);
  if (url.protocol !== 'https:' || !/(^|\.)vmall\.com$/.test(url.hostname) || url.username || url.password || (url.port && url.port !== '443')) throw new Error('查价仅支持华为商城官方 HTTPS 地址');
  const context = await (await browser()).newContext({ locale: 'zh-CN' });
  const page = await context.newPage();
  page.setDefaultTimeout(5000);
  const deadline = setTimeout(() => context.close().catch(() => {}), 45000);
  try {
    await page.goto(url.href, { waitUntil: 'domcontentloaded', timeout: 25000 });
    await page.getByText(/^已选[：:]/).first().waitFor({ timeout: 12000 });
    const tokens = configuration.split(/[；;]/).map(s => s.trim()).filter(Boolean);
    // Select only public configuration controls. Never sign in, add to cart or purchase.
    for (const token of tokens) {
      const option = page.getByText(token, { exact: true }).first();
      if (await option.isVisible()) {
        await option.click();
        await page.waitForFunction(value => {
          const text = document.body.innerText.match(/已选[：:]\s*([^\n]+)/)?.[1] || '';
          return text.split(/[·；;]/).some(part => part.trim() === value);
        }, token, { timeout: 6000 });
      }
    }
    // Wait for asynchronous SKU switch and its matching price to finish together.
    await page.waitForFunction(() => !/正在加载/.test(document.body.innerText.slice(0, 2500)), null, { timeout: 8000 });
    const text = await page.locator('body').innerText();
    const evidence = extractSelectedPrice(text, model, configuration);
    const online = evidence ? { status: 'verified', ...evidence, message: '已自动匹配商城同配置公开售价（未扣个人资格优惠）。' }
      : { status: 'sku_unavailable', message: '商城页面未能匹配所选配置的可售价格，未将其他配置或配件金额参与比较。' };
    Object.assign(online, { source_url: page.url(), checked_at: new Date().toISOString(), method: 'official_browser', candidates: [] });
    const education = { status: 'unavailable', rules: [], sources: [], message: '教育活动页面暂未读取成功。' };
    try {
      await page.goto(EDUCATION_URL, { waitUntil: 'domcontentloaded', timeout: 15000 });
      await page.locator('a[href*="prdId="]').first().waitFor({ timeout: 6000 });
      const productId = url.searchParams.get('prdId');
      const cards = await page.locator('a[href*="prdId="]').evaluateAll(es => es.map(e => ({ url: e.href, text: e.innerText })));
      const card = cards.find(c => new URL(c.url).searchParams.get('prdId') === productId);
      Object.assign(education, { status: card ? 'discount_not_disclosed' : 'not_listed', checked_at: new Date().toISOString(),
        sources: [{ source_url: EDUCATION_URL, title: '华为商城官方教育专区' }],
        message: card ? '官方教育专区已收录此产品，但系统尚未取得所选配置明确的教育优惠金额。专区商品卡展示价未作为同配置教育价；领取优惠需符合教育认证资格，不代表公开价格必须认证才能查看。' : '已查询官方教育专区，未找到此产品的公开教育报价。',
        product_listed: Boolean(card), excerpt: card?.text || '' });
    } catch (error) { education.message = '教育活动查询失败：' + error.message.split('\n')[0]; }
    return { online, education };
  } finally { clearTimeout(deadline); await context.close(); }
}

function queryVmallPublicPrice(input) {
  const key = JSON.stringify([input.source_url, input.model, input.configuration]);
  const prior = cache.get(key);
  if (prior && prior.expires > Date.now()) return prior.promise;
  // Coalesce duplicates and serialize collection to bound browser resource use.
  const promise = tail.then(() => collect(input));
  tail = promise.catch(() => {});
  cache.set(key, { promise, expires: Date.now() + 120000 });
  promise.then(result => { if (result.online.status !== 'verified') cache.delete(key); }, () => cache.delete(key));
  if (cache.size > 100) cache.delete(cache.keys().next().value);
  return promise;
}
module.exports = { queryVmallPublicPrice, extractSelectedPrice };
