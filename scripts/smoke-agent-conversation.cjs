// Manual end-to-end smoke check. Calls the configured model through the local API.
const assert = require('node:assert/strict');

async function main() {
  let task = { audience: '大学生', scenario: '学习和移动办公', goal: '引导到店体验', platform: 'xiaohongshu', model: 'HUAWEI MateBook 14', requirements: ['突出便携'], include_price: false };
  let artifact = null;
  const history = [];
  async function turn(text) {
    history.push({ role: 'user', content: text });
    const response = await fetch('http://127.0.0.1:3000/api/v1/generate', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...task, history, last_artifact: artifact }),
    });
    const r = await response.json();
    assert.ok(response.ok, `${r.code || response.status}: ${r.message || 'request failed'}`);
    task = { ...task, ...r.task };
    if (r.content) artifact = r.content;
    history.push({ role: 'assistant', content: r.reply || (r.content ? `${r.content.title}\n${r.content.body}` : r.task.questions.map((q) => q.question).join('\n')) });
    console.log(JSON.stringify({ input: text, status: r.status, result_type: r.result_type, model: r.task.model, llm_model: r.llm?.model || r.llm?.stages?.[0]?.model, has_reply: Boolean(r.reply), has_draft: Boolean(r.content) }));
    return r;
  }
  const first = await turn('按当前设定写一篇场景化营销文案。');
  assert.equal(first.status, 'needs_clarification');
  const created = await turn('鸿蒙版');
  assert.match(created.task.model, /鸿蒙/);
  assert.ok(created.content?.body);
  const original = artifact;
  const answered = await turn('你是哪个模型生成的内容？');
  assert.equal(answered.result_type, 'answer');
  assert.ok(answered.reply);
  assert.equal(answered.content, undefined);
  assert.strictEqual(artifact, original);
  const revised = await turn('把刚才的文案缩短到100字以内，不要具体参数，保留到店体验引导。');
  assert.equal(revised.result_type, 'revise');
  assert.ok(revised.content.body.length < original.body.length);
  assert.match(revised.task.model, /鸿蒙/);
  console.log('PASS: clarification → creation → question → revision share one task and artifact.');
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; });
