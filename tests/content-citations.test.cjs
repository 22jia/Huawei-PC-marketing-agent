const test = require('node:test');
const assert = require('node:assert/strict');
const { resolveContentCitations } = require('../services/api/src/agent/contentCitations.cjs');

test('article sources resolve to the exact server evidence path without changing prose', () => {
  const path = 'P1-产品知识库/电脑/产品事实.md';
  const content = { title: '出差包里做减法', lead: '包里已经够热闹了。', body: '标准版约798克。[E2]', hashtags: [], cta: '你出门会带些什么？' };
  const result = resolveContentCitations(content, [{ source_path: '其他.md' }, { source_path: path }], [{ evidence_id: 'E2' }]);
  assert.equal(result.body, `标准版约798克。[2](#knowledge?path=${encodeURIComponent(path)})`);
  assert.equal(result.lead, content.lead);
  assert.equal(content.body, '标准版约798克。[E2]');
});

test('invented and unplanned evidence cannot become article citations', () => {
  for (const body of ['一句话[E9]', '一句话[E1]']) {
    assert.throws(() => resolveContentCitations({ body }, [{ source_path: '真实.md' }], []), { code: 'UNSUPPORTED_CLAIM' });
  }
});

test('unsafe or unavailable knowledge paths do not produce navigation links', () => {
  for (const source_path of ['../private.md', '/absolute.md', 'C:\\private.md', 'photo.jpg', undefined]) {
    assert.equal(resolveContentCitations({ body: '事实[E1]' }, [{ source_path }], [{ evidence_id: 'E1' }]).body, '事实');
  }
});
