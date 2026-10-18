const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const renderer = import(`data:text/javascript;base64,${fs.readFileSync(path.join(__dirname, '../apps/web/src/lib/creativeArticle.js')).toString('base64')}`);

test('delivery includes four reviewable sections while article copy stays clean', async () => {
  const { creativeArticle, creativeReport } = await renderer;
  const result = {
    content: { title: '选购建议', lead: '导语内容', body: '段落甲\n\n段落乙\n\n段落丙', cta: '带上课件到店体验', hashtags: [] },
    scene_judgment: { audience: '学生', scenario: '课堂', content_goal: '体验', platform: '小红书' },
    facts: [{ id: 'E1', title: '产品事实', model: '目标型号', source_path: '本地/产品事实.md', fact_points: [{ fact: '屏幕事实', quote: '官方逐字引用' }] }],
    images: [{ name: '官方图片.png', url: '/api/v1/products/image?path=local.png', description: '产品外观', caption: '官方图', placement: 'inline', after_paragraph: 2, source_path: '本地/images/官方图片.png', source_url: 'https://consumer.huawei.com/cn/' }],
    validation: { checks: { compliance: 'pass' }, pending_confirmation: ['使用权待核对'] }, editorial_review: { passed: true },
  };
  const article = creativeArticle(result);
  assert.ok(article.indexOf('段落乙') < article.indexOf('![产品外观]'));
  assert.ok(article.indexOf('![产品外观]') < article.indexOf('段落丙'));
  assert.equal(article.match(/带上课件到店体验/g).length, 1);
  assert.ok(!article.includes('知识库依据'));
  const report = creativeReport(result);
  for (const section of ['一、场景判断', '二、知识库依据', '三、图文软文', '四、核验结果']) assert.ok(report.includes(section));
  for (const text of ['导语内容', '官方逐字引用', '官方图片.png', '正文第 2 段后', '使用权待核对']) assert.ok(report.includes(text));
});
