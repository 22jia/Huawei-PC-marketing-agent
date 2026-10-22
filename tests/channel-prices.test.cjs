const test = require('node:test');
const assert = require('node:assert/strict');
const { queryChannelPrices, pagePriceCandidates } = require('../services/api/src/services/channelPriceService.cjs');

test('ambiguous series offers actual knowledge versions instead of missing-price error', async () => {
  const report = await queryChannelPrices({ model: 'HUAWEI MateBook 14', live: false });
  assert.equal(report.status, 'needs_model_clarification');
  assert.ok(report.models.includes('HUAWEI MateBook 14（鸿蒙版）'));
  assert.ok(report.models.includes('HUAWEI MateBook 14 酷睿 Ultra'));
  assert.equal((await queryChannelPrices({ model: 'HUAWEI MateBook 14（鸿蒙版）', live: false })).status, 'success');
});

test('knowledge title and Chinese brand alias resolve to the correct version', async () => {
  for (const model of ['HUAWEI MateBook 14（鸿蒙版）｜官方公开价格卡', '华为 MateBook 14（鸿蒙版）']) {
    const report = await queryChannelPrices({ model, live: false });
    assert.equal(report.status, 'success', model);
    assert.equal(report.tier.price, 5899);
  }
});

test('local quote loads actual knowledge-card configuration without querying network', async () => {
  const report = await queryChannelPrices({ model: 'HUAWEI MateBook 14（鸿蒙版）', configuration: 'HarmonyOS；24GB/512GB；原野绿；麒麟X90；圆键盘', live: false }, { fetchText: () => { throw new Error('unexpected network'); } });
  assert.equal(report.status, 'success');
  assert.equal(report.tier.price, 6599);
  assert.equal(report.subsidy_rule.rate, 0.15);
  assert.equal(report.subsidy_rule.cap, 1500);
  assert.match(report.store_basis, /历史快照/);
  assert.equal(report.online, undefined);
});
test('live candidates stay unconfirmed and education only accepts VMall evidence', async () => {
  const report = await queryChannelPrices({ model: 'HUAWEI MateBook 14（鸿蒙版）', live: true }, {
    fetchText: async () => '<p>¥5,899</p><script>¥999</script><p>￥6599</p>',
    fetchOfferRules: async (input) => {
      assert.equal(input.channel, 'education');
      return { rules: [{ name: '教育优惠', source: 'invalid' }, { name: '教育优惠', source: 'https://www.vmall.com/edu' }], sources: [] };
    },
  });
  assert.deepEqual(report.online.candidates, [5899, 6599]);
  assert.equal(report.online.status, 'needs_sku_confirmation');
  assert.equal(report.education.rules.length, 1);
});
test('unreadable VMall does not fall back to fictional prices', async () => {
  const report = await queryChannelPrices({ model: 'HUAWEI MateBook 14（鸿蒙版）', live: true }, {
    fetchText: async () => { throw new Error('timeout'); }, fetchOfferRules: async () => { throw new Error('timeout'); },
  });
  assert.equal(report.online.status, 'unavailable');
  assert.deepEqual(report.online.candidates, []);
  assert.deepEqual(report.education.rules, []);
  assert.deepEqual(pagePriceCandidates('<script>¥100</script>'), []);
});
