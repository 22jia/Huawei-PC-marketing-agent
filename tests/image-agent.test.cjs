const test = require('node:test');
const assert = require('node:assert/strict');
const { generateCreativeImages, validateImageAgentResult } = require('../services/api/src/agent/imageAgent/index.cjs');

const asset = { id: 'product-1', url: '/api/v1/products/image?path=matebook.png', description: '官方产品图', model: 'MateBook 14', source_url: 'https://consumer.huawei.com/example' };
const strategy = { image_plan: [{ asset_id: asset.id, placement: 'cover', after_paragraph: 0, caption: '产品外观', purpose: '封面' }] };

test('default image agent preserves the current official asset workflow', async () => {
  const result = await generateCreativeImages({ task: { model: 'MateBook 14' }, assets: [asset], strategy });
  assert.equal(result.status, 'success');
  assert.equal(result.provider, 'catalog');
  assert.equal(result.images[0].url, asset.url);
  assert.equal(result.images[0].generated, false);
});

test('image agent rejects outputs that do not reference a supplied product image', () => {
  assert.throws(() => validateImageAgentResult({ status: 'success', provider: 'test', images: [{ ...asset, source_product_image: 'unknown' }] }, [asset]), { code: 'IMAGE_AGENT_INVALID_OUTPUT' });
});

test('image agent rejects external or malformed asset URLs', () => {
  assert.throws(() => validateImageAgentResult({ status: 'success', provider: 'test', images: [{ ...asset, source_product_image: asset.id, url: 'https://attacker.invalid/image.png', placement: 'cover', caption: '封面', purpose: '封面' }] }, [asset]), { code: 'IMAGE_AGENT_INVALID_OUTPUT' });
});

test('image agent accepts generated artifacts under the dedicated API route', () => {
  const result = validateImageAgentResult({ status: 'success', provider: 'jimeng', images: [{ id: 'generated-1', url: '/api/v1/generated-assets/generated-1.png', description: '产品与学习场景', model: 'MateBook 14', source_url: asset.source_url, source_product_image: asset.id, generated: true, placement: 'cover', after_paragraph: 0, caption: '学习场景', purpose: '封面' }], warnings: [] }, [asset]);
  assert.equal(result.images[0].generated, true);
});
