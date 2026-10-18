// Manual integration check: makes real calls to the configured LLM via the API.
const assert = require('node:assert/strict');
async function main() {
  const results = [];
  for (const platform of ['xiaohongshu', 'wechat']) {
    const response = await fetch('http://127.0.0.1:3000/api/v1/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ platform, model: 'HUAWEI MateBook 14（鸿蒙版）', audience: '大学生', scenario: '开学选电脑，需要在课堂整理笔记、在图书馆修改课程报告', goal: '帮助选购并引导带课件到店验证', image_count: 3, requirements: ['结合具体学习任务，不虚构亲测'], include_price: false }) });
    const r = await response.json();
    assert.ok(response.ok, `${r.code}: ${r.message}`);
    assert.ok(r.content?.body); assert.ok(r.content_strategy?.angle);
    assert.ok(r.images.length > 0); assert.ok(r.editorial_review.passed);
    for (const image of r.images) {
      const res = await fetch(`http://127.0.0.1:3000${image.url}`);
      assert.ok(res.ok); assert.match(res.headers.get('content-type'), /^image\//);
      await res.arrayBuffer();
    }
    results.push(r);
    console.log(JSON.stringify({ platform, model: r.llm.model, title: r.content.title, body_length: r.content.body.length, angle: r.content_strategy.angle, opening: r.content.body.slice(0, 330), images: r.images.map((i) => ({ description: i.description, caption: i.caption })), stages: r.llm.stages.map((s) => s.stage), review: r.editorial_review }, null, 2));
  }
  assert.notEqual(results[0].content.body, results[1].content.body);
  console.log('PASS: two real platform-specific illustrated drafts, editorial review and all image URLs.');
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; });
