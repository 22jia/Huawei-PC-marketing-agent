const test = require('node:test');
const assert = require('node:assert/strict');
const { integrateImages } = require('../services/api/src/agent/imageAgent/integration.cjs');
const { generate } = require('../services/api/src/agent/taskAgent.cjs');
const source = { id: 'official', model: '测试型号', source_path: 'test.png', source_url: 'https://consumer.huawei.com/cn/',
  url: '/api/v1/products/image?path=test.png', description: '官方产品图', placement: 'cover', after_paragraph: 0, caption: '官方产品图', purpose: '封面' };
const input = { task: { model: '测试型号', image_count: 2 }, assets: [source], evidence: [], platform: {}, strategy: {} };
const output = () => ({ status: 'success', images: [{ ...source, id: 'generated', source_product_image: 'official', generated: true,
  url: '/api/v1/generated-assets/generated.png' }], warnings: [] });

test('workbench replaces one reviewed placement and preserves remaining official images', async () => {
  const second = { ...source, id: 'second', placement: 'inline', after_paragraph: 1 };
  let captured;
  const result = await integrateImages(input, [source, second], { generateCreativeImages: async (value) => { captured = value; return output(); } });
  assert.equal(captured.strategy.image_plan.length, 1);
  assert.equal(captured.assets, input.assets);
  assert.equal(result.images[0].generated, true);
  assert.equal(result.images[0].source_path, 'test.png');
  assert.equal(result.images[1], second);
  assert.equal(result.stage.status, 'success');
});

test('provider failure and untrusted output fall back without leaking raw errors', async () => {
  const bad = [
    (r) => { r.images[0].model = '另一型号'; },
    (r) => { r.images[0].url = 'https://evil.invalid/image.png'; },
    (r) => { r.images[0].source_product_image = 'other'; },
    (r) => { r.images[0].source_url = 'https://evil.invalid/'; },
    (r) => { r.images[0].caption = '没有审核的参数'; },
    (r) => { r.images.push(r.images[0]); },
  ];
  for (const mutate of bad) {
    const result = await integrateImages(input, [source], { generateCreativeImages: async () => { const r = output(); mutate(r); return r; } });
    assert.equal(result.images[0], source);
    assert.equal(result.stage.code, 'IMAGE_INVALID_OUTPUT');
  }
  const failed = await integrateImages(input, [source], { generateCreativeImages: async () => { throw Object.assign(new Error('secret raw provider body'), { code: 'IMAGE_GENERATION_TIMEOUT' }); } });
  assert.equal(failed.stage.status, 'failed');
  assert.match(failed.warnings[0], /IMAGE_GENERATION_TIMEOUT/);
  assert.doesNotMatch(JSON.stringify(failed), /secret/);
});

test('cancellation propagates instead of returning official-image success', async () => {
  const controller = new AbortController();
  await assert.rejects(integrateImages(input, [source], { signal: controller.signal, generateCreativeImages: async (_input, options) => {
    assert.equal(options.signal, controller.signal);
    controller.abort();
    throw new Error('aborted');
  } }), { code: 'IMAGE_GENERATION_CANCELLED' });
});

test('public generation pipeline calls image agent only after copy review', async () => {
  const order = [];
  const meta = { model: 'test', duration_ms: 1 };
  const result = await generate({ model: '测试型号', audience: '学生', scenario: '学习', goal: '咨询', platform: 'wechat_moments', image_count: 1 }, {
    planTask: async () => ({ value: { intent: 'generate', task_updates: {}, retrieval_queries: [] }, meta }),
    retrieveEvidence: async () => ({ evidence: [{ title: '测试型号', source_path: 'P1-产品参数库/产品事实.md', content: '请现场确认软件需求。', source_status: 'local_snapshot' }] }),
    creativeAssets: () => [source],
    planContent: async () => ({ value: { conflicts: [], fact_points: [], image_plan: [{ asset_id: source.id, placement: 'cover', after_paragraph: 0, caption: source.caption, purpose: source.purpose }] }, meta }),
    generateCopy: async () => ({ content: { title: '学习选购', lead: '先明确任务。', body: '请现场确认软件需求。', hashtags: [], cta: '欢迎咨询。' }, meta }),
    reviewCopy: async () => { order.push('review'); return { value: { passed: true, issues: [], revision_instructions: [] }, meta }; },
    generateCreativeImages: async (value) => { order.push('image'); assert.equal(value.task.model, '测试型号'); return output(); },
  });
  assert.deepEqual(order, ['review', 'image']);
  assert.equal(result.images[0].generated, true);
  assert.equal(result.llm.stages.at(-1).stage, 'imageGeneration');
});

test('frontend allows generated local files and rejects external or traversing URLs', async () => {
  const { isAllowedImageUrl } = await import('../apps/web/src/lib/imageUrl.js');
  assert.equal(isAllowedImageUrl('/api/v1/generated-assets/image_123.png'), true);
  assert.equal(isAllowedImageUrl(source.url), true);
  for (const url of ['https://evil.invalid/a.png', '//evil.invalid/a.png', 'data:image/png;base64,AA', '/api/v1/generated-assets/../x.png', '/api/v1/generated-assets/%2e%2e.png', '/api/v1/generated-assets/a.png?x=1']) assert.equal(isAllowedImageUrl(url), false);
});
