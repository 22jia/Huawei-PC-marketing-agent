const test = require('node:test');
const assert = require('node:assert/strict');
const { readProductFacts } = require('../services/api/src/services/localProductKnowledge.cjs');
const { retrieveEvidence } = require('../services/api/src/services/evidenceService.cjs');

test('local product retrieval returns a dated snapshot only for an explicit product variant', () => {
  const result = readProductFacts('HUAWEI MateBook 14 酷睿 Ultra');

  assert.equal(result.ambiguous_model, false);
  assert.equal(result.evidence.length, 1);
  assert.equal(result.evidence[0].source_status, 'local_snapshot');
  assert.equal(result.evidence[0].updated_at, '2026-10-17');
  assert.match(result.evidence[0].source_url, /^https:\/\/consumer\.huawei\.com/);
  assert.doesNotMatch(result.evidence[0].source_path, /价格|库存|政策/);
});

test('local product retrieval asks for a variant when the model name is ambiguous', () => {
  const result = readProductFacts('HUAWEI MateBook 14');

  assert.equal(result.ambiguous_model, true);
  assert.deepEqual(result.evidence, []);
  assert.ok(result.model_candidates.some((title) => /酷睿 Ultra/.test(title)));
  assert.ok(result.model_candidates.some((title) => /MateBook 14/.test(title)));
});

test('local knowledge retrieval runs before any remote source', async () => {
  let remoteCalls = 0;
  const result = await retrieveEvidence('HUAWEI MateBook 14 酷睿 Ultra', {
    imaClient: {
      findKnowledgeBase: async () => { remoteCalls += 1; throw new Error('should not be called'); },
      searchKnowledge: async () => { remoteCalls += 1; return []; },
      getMediaInfo: async () => { remoteCalls += 1; return {}; },
      fetchSourceText: async () => { remoteCalls += 1; return ''; },
    },
  });

  assert.equal(result.retrieval_mode, 'local_knowledge_base');
  assert.equal(result.evidence.length, 1);
  assert.equal(remoteCalls, 0);
});

test('unmatched local query does not fall back to the retired ima source', async () => {
  const result = await retrieveEvidence('不存在的型号 999', { localKnowledge: { root: 'C:/nonexistent-local-kb' } });
  assert.equal(result.retrieval_mode, 'local_knowledge_base');
  assert.equal(result.evidence.length, 0);
  assert.equal(result.dynamic_source.status, 'not_requested');
});
