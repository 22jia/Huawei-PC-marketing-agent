const test = require('node:test');
const assert = require('node:assert/strict');
const { integrateImages } = require('../services/api/src/agent/imageAgent/integration.cjs');
const { generate } = require('../services/api/src/agent/taskAgent.cjs');
const source = { id: 'official', model: '测试型号', source_path: 'P1-产品参数库/01-鸿蒙电脑/HUAWEI MateBook 14/images/hwpc_matebook-14-harmonyos_深空灰沉稳配色_05.png', source_url: 'https://consumer.huawei.com/cn/',
  url: '/api/v1/products/image?path=test.png', description: '官方产品图', placement: 'cover', after_paragraph: 0, caption: '官方产品图', purpose: '封面' };
const input = { task: { model: '测试型号', image_count: 2 }, assets: [source], evidence: [], platform: {}, strategy: {} };
const output = () => ({ status: 'success', images: [{ ...source, id: 'generated', source_product_image: 'official', generated: true,
  url: '/api/v1/generated-assets/generated.png' }], warnings: [] });

test('workbench replaces one reviewed placement and preserves remaining official images', async () => {
  const second = { ...source, id: 'second', placement: 'inline', after_paragraph: 1 };
  let captured;
  const result = await integrateImages(input, [source, second], { generateCreativeImages: async (value) => { captured = value; return output(); } });
  assert.equal(captured.strategy.image_plan.length, 1);
  assert.deepEqual(captured.assets.map(asset => asset.id), [source.id]);
  assert.equal(result.images[0].generated, true);
  assert.equal(result.images[0].source_path, source.source_path);
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

test('workbench pilot selects a transparent exact-model source and preserves its original display slot', async () => {
  const { creativeAssets } = require('../services/api/src/services/creativeAssets.cjs');
  const model = 'HUAWEI MateBook 14（鸿蒙版）';
  const assets = creativeAssets([{ title: `${model} - 产品事实`, source_path: 'P1-产品参数库/01-鸿蒙电脑/HUAWEI MateBook 14/产品事实.md' }]);
  assert.ok(assets.length);
  for (const [goal, expected] of [['高级商业产品宣传海报', 'img_0391312d4f63'], ['日常生活照', 'img_578dcffad7c3']]) {
    const placement = { ...assets[0], placement: 'cover', after_paragraph: 0, caption: '产品外观', purpose: '封面' };
    const original = JSON.stringify(placement);
    const result = await integrateImages({ ...input, task: { model, goal, scenario: '图书馆自习', image_count: 1 }, assets }, [placement], {
      generateCreativeImages: async value => {
        const plan = value.strategy.image_plan[0];
        const asset = value.assets[0];
        assert.equal(asset.id, expected);
        assert.equal(asset.hasTransparency, true);
        assert.equal(plan.asset_id, expected);
        assert.match(value.task.visual_brief, /3:4/);
        return { status: 'success', warnings: [], images: [{ ...asset, ...plan, id: 'generated', model, source_product_image: asset.id, generated: true, description: 'AI合成图', url: '/api/v1/generated-assets/generated.png' }] };
      },
    });
    assert.equal(result.stage.status, 'success', JSON.stringify(result.warnings));
    assert.equal(result.images[0].source_product_image, expected);
    assert.equal(result.images[0].placement, 'cover');
    assert.equal(JSON.stringify(placement), original);
  }
  let calls = 0;
  const failed = await integrateImages({ ...input, task: { model, image_count: 1 }, assets: [] }, [source], { generateCreativeImages: async () => { calls++; } });
  assert.equal(failed.stage.code, 'IMAGE_NO_MATCHED_ASSET');
  assert.equal(calls, 0);
});

test('source selection supports any exact model with a transparent official asset and never borrows another model', () => {
  const { selectSourceAsset } = require('../services/api/src/agent/imageAgent/sourceSelection.cjs');
  const model = 'HUAWEI MateBook Pro';
  const asset = { ...source, id: 'pro-transparent', model, hasTransparency: true, description: '精致产品外观' };
  const input = { task: { model, goal: '高级商业海报' }, assets: [asset], evidence: [], platform: {}, strategy: {} };
  assert.equal(selectSourceAsset(input, [asset], { purpose: '高端商业产品宣传海报' }).id, asset.id);
  assert.throws(() => selectSourceAsset(input, [{ ...asset, model: '其他型号' }], { purpose: '高端商业产品宣传海报' }), { code: 'IMAGE_NO_MATCHED_ASSET' });
  assert.throws(() => selectSourceAsset(input, [{ ...asset, hasTransparency: false }], { purpose: '高端商业产品宣传海报' }), { code: 'IMAGE_NO_MATCHED_ASSET' });
});

test('image-only generation skips copy and review and returns generated images', async () => {
  const order = [];
  const meta = { model: 'test', duration_ms: 1 };
  const result = await generate({ model: '测试型号', audience: '学生', scenario: '学习', goal: '仅生成海报', output_type: 'image', platform: 'wechat_moments', image_count: 1 }, {
    planTask: async () => ({ value: { intent: 'generate', task_updates: {}, retrieval_queries: [] }, meta }),
    retrieveEvidence: async () => ({ evidence: [{ title: '测试型号', source_path: 'P1-产品参数库/产品事实.md', content: '请现场确认软件需求。', source_status: 'local_snapshot' }] }),
    creativeAssets: () => [source],
    planContent: async () => ({ value: { conflicts: [], fact_points: [], image_plan: [{ asset_id: source.id, placement: 'cover', after_paragraph: 0, caption: source.caption, purpose: source.purpose }] }, meta }),
    generateCopy: async () => { throw new Error('image-only must not generate copy'); },
    reviewCopy: async () => { order.push('review'); return { value: { passed: true, issues: [], revision_instructions: [] }, meta }; },
    generateCreativeImages: async (value) => { order.push('image'); assert.equal(value.task.model, '测试型号'); const r = output(); r.images[0].purpose = value.strategy.image_plan[0].purpose; return r; },
  });
  assert.deepEqual(order, ['image']);
  assert.equal(result.result_type, 'image_generation');
  assert.equal(result.content, undefined);
  assert.equal(result.images[0].generated, true);
  assert.equal(result.llm.stages.at(-1).stage, 'imageGeneration');
});

test('hero selection rejects cropped detail PNGs even when larger than a full product', () => {
  const { selectSourceAsset } = require('../services/api/src/agent/imageAgent/sourceSelection.cjs');
  const hero = { ...source, id: 'hero', description: '完整产品外观', hasTransparency: true };
  const detail = { ...hero, id: 'detail', source_path: '舒适键盘细节.png', description: '舒适键盘细节', width: 9000, height: 9000 };
  assert.equal(selectSourceAsset(input, [detail, hero], { purpose: '商业海报' }).id, 'hero');
  assert.throws(() => selectSourceAsset(input, [detail], { purpose: '商业海报' }), { code: 'IMAGE_NO_MATCHED_ASSET' });
});

test('Ultra workbench uses full exact-model derived subject for poster and daily scenes', async () => {
  const { creativeAssets } = require('../services/api/src/services/creativeAssets.cjs');
  const { resolveProductImage } = require('../services/api/src/services/productSpotlight.cjs');
  const sharp = require('../services/api/node_modules/sharp');
  const model = 'HUAWEI MateBook 14 酷睿 Ultra';
  const assets = creativeAssets([{ title: `${model} - 产品事实`, source_path: 'P1-产品参数库/02-MateBook-Windows/MateBook 14 酷睿 Ultra/产品事实.md' }]);
  const hero = assets.find(a => a.id === 'img_adbd7386ab0e');
  assert.ok(hero, 'reviewed full Ultra subject must be indexed');
  const { data, info } = await sharp(resolveProductImage(hero.source_path)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const pixel = (x, y) => (y * info.width + x) * 4;
  assert.equal(data[pixel(30, 400) + 3], 0, 'original background lettering removed');
  assert.equal(data[pixel(510, 810) + 3], 255, 'bottom palm rest retained');
  assert.equal(data[pixel(480, 65) + 3], 255, 'screen top retained');
  const original = await sharp(resolveProductImage(hero.source_path.replace(hero.name, 'hwpc_matebook-14-2024_高质感主视觉_02_b694be0b.jpg'))).ensureAlpha().raw().toBuffer();
  for (const [x, y] of [[480, 65], [510, 810], [490, 520]]) {
    const i = pixel(x, y);
    assert.deepEqual(data.subarray(i, i + 3), original.subarray(i, i + 3), 'product pixels must not be redrawn');
  }
  for (const goal of ['高级商业海报', '日常生活照']) {
    const placement = { ...assets[0], placement: 'cover', after_paragraph: 0, caption: '产品外观', purpose: goal };
    const result = await integrateImages({ ...input, task: { model, goal, scenario: '书桌学习' }, assets }, [placement], {
      generateCreativeImages: async value => {
        const asset = value.assets[0];
        const plan = value.strategy.image_plan[0];
        assert.equal(asset.id, hero.id);
        assert.equal(asset.hasTransparency, true);
        assert.equal(asset.composition_profile.view, 'oblique');
        if (goal === '日常生活照') {
          assert.equal(asset.composition_profile.dailyRotation, 35);
          const { sourceCameraDirection } = require('../services/api/src/agent/imageAgent/sourceSelection.cjs');
          assert.match(sourceCameraDirection(asset), /front edge horizontal/);
        }
        return { status: 'success', warnings: [], images: [{ ...asset, ...plan, id: 'ultra_generated', source_product_image: asset.id, generated: true, description: 'AI合成图', url: '/api/v1/generated-assets/ultra_generated.png' }] };
      },
    });
    assert.equal(result.stage.status, 'success', JSON.stringify(result.warnings));
    assert.equal(result.images[0].source_product_image, hero.id);
  }
});
