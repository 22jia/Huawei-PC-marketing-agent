const test = require('node:test');
const assert = require('node:assert/strict');
const { loadCopywritingSkill } = require('../services/api/src/agent/copywritingSkill.cjs');
const { planContent, generateCopy, reviewCopy, generateReply } = require('../services/api/src/clients/llmClient.cjs');

process.env.LLM_API_KEY = 'skill-test-key';
process.env.LLM_BASE_URL = 'https://llm.invalid/v1';
process.env.LLM_MODEL = 'skill-test-model';

test('selects common and matching platform rules, omits examples and unrelated platforms', () => {
  const platforms = { wechat: '公众号人感规则', weibo: '微博人感规则', xiaohongshu: '小红书人感规则', wechat_moments: '朋友圈人感规则', douyin: '抖音人感规则', bilibili: 'B站人感规则' };
  for (const [platform, marker] of Object.entries(platforms)) {
    const skill = loadCopywritingSkill({ platform });
    assert.match(skill.version, /^[a-f0-9]{12}$/);
    assert.match(skill.rules, /开头先立张力/);
    assert.ok(skill.rules.includes(marker));
    assert.doesNotMatch(skill.rules, /正例 vs 温度低反例|双职工作的第 6 年，我早把|周报以前手搓/);
    for (const other of Object.values(platforms).filter(x => x !== marker)) assert.ok(!skill.rules.includes(other));
    assert.match(skill.rules, /不为满足事实检查而补写免责段落/);
    assert.match(skill.rules, /不能通过删除必要限定/);
  }
  assert.equal(loadCopywritingSkill({ platform: 'unknown' }), null);
  assert.equal(loadCopywritingSkill({ platform: 'wechat', output_type: 'image' }), null);
  assert.equal(loadCopywritingSkill({ platform: 'wechat', goal: '写一篇官方通稿' }), null);
  assert.ok(loadCopywritingSkill({ platform: 'wechat', goal: '用官方资料写门店软文' }));
  assert.equal(loadCopywritingSkill({ platform: 'xiaohongshu', history: [{ role: 'user', content: '按普通用户分享口吻写，参考这篇' }] }).voice_mode, 'creator_style');
  assert.equal(loadCopywritingSkill({ platform: 'xiaohongshu' }).voice_mode, 'store_advisor');
});

test('planning, writing, rewriting and review repair retain skill; conversation does not load it', async () => {
  const task = { platform: 'xiaohongshu', requirements: ['提供续航实测'], history: [] };
  const copywriting_skill = loadCopywritingSkill(task);
  const ctx = { task, platform: {}, evidence: [], assets: [], strategy: {}, images: [], analysis: {}, copywriting_skill };
  const sent = [];
  const requests = [];
  const provider = value => ({ fetch: async (_url, request) => {
    const body = JSON.parse(request.body);
    sent.push(body.messages[0].content);
    requests.push(body);
    return { ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify(value) } }] }) };
  } });
  await planContent(ctx, provider({ angle: '出差选购', reader_tension: '移动办公', platform_reason: '笔记分享', asset_gap: '', outline: ['选购任务'], evidence_ids: [], fact_points: [], conflicts: [], image_plan: [], requirement_issues: [{ kind: 'unsupported', requirement: '提供续航实测', reason: '没有实测证据', references: [] }] }));
  const content = { title: '出差电脑怎么选', lead: '经常出门办公，先想想每天带什么。', body: '到店时可以带上常用文档试试。', hashtags: [], cta: '说说你的办公任务吧。' };
  await generateCopy(ctx, provider(content));
  await generateCopy({ ...ctx, feedback: ['缩短'], previous_content: content }, provider(content));
  // Invalid review schema triggers its real schema-repair path.
  let calls = 0;
  await reviewCopy({ ...ctx, content }, { fetch: async (_url, request) => {
    sent.push(JSON.parse(request.body).messages[0].content);
    const value = ++calls === 1 ? {} : { passed: true, platform_fit: '符合', issues: [], revision_instructions: [] };
    return { ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify(value) } }] }) };
  } });
  assert.equal(calls, 2);
  for (const system of sent) {
    assert.ok(system.includes(`${copywriting_skill.name}@${copywriting_skill.version}`));
    assert.match(system, /小红书人感规则/);
    assert.doesNotMatch(system, /公众号人感规则/);
    assert.match(system, /不能豁免/);
    assert.match(system, /事实约束由后台执行，不把审核说明写进软文/);
    assert.match(system, /不能通过删除必要限定把有条件事实写成普遍承诺/);
    assert.match(system, /不为满足事实检查而补写免责段落/);
  }
  assert.match(sent[0], /场景→使用习惯→选择标准→产品事实→推荐理由/);
  assert.match(sent[1], /scenario_breakdown理解目标人群的工作习惯/);
  assert.match(sent[1], /HR\+自媒体双职场人/);
  assert.match(sent[1], /开箱即心动/);
  assert.match(sent[1], /只学表达，不学事实/);
  assert.equal(requests[0].temperature, 0.3);
  assert.equal(requests[1].temperature, 0.6);
  await generateReply(ctx, provider({ reply: '你主要面向哪类出差办公人群？', options: [] }));
  assert.doesNotMatch(sent.at(-1), /<copywriting-skill>|成稿语言禁令/);
});

test('distinct editorial decisions reach the planner, writer and reviewer for both platforms', async () => {
  const profiles = require('../services/api/src/agent/platformStrategies.cjs');
  assert.notEqual(profiles.xiaohongshu.editorial.purpose, profiles.wechat.editorial.purpose);
  for (const platform of ['xiaohongshu', 'wechat']) {
    const task = { platform, requirements: [], history: [] };
    const ctx = { task, platform: profiles[platform], analysis: {}, evidence: [], assets: [], strategy: {}, images: [], history: [], copywriting_skill: loadCopywritingSkill(task) };
    const sent = [];
    const provider = value => ({ fetch: async (_url, request) => {
      const body = JSON.parse(request.body);
      sent.push(body);
      return { ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify(value) } }] }) };
    } });
    await planContent(ctx, provider({ angle: '角度', reader_tension: '需求', platform_reason: '平台决策', outline: ['展开观点'], evidence_ids: [], fact_points: [], conflicts: [], requirement_issues: [], image_plan: [], asset_gap: '' }));
    const content = { title: '标题', lead: '开头', body: '正文', hashtags: [], cta: '结尾' };
    await generateCopy(ctx, provider(content));
    await reviewCopy({ ...ctx, content }, provider({ passed: true, platform_fit: '具体风格', issues: [], revision_instructions: [] }));
    for (const request of sent) {
      const payload = JSON.parse(request.messages[1].content.slice(request.messages[1].content.indexOf("\n") + 1));
      assert.deepEqual(payload.platform.editorial, profiles[platform].editorial);
      assert.doesNotMatch(request.messages[0].content, /默认先写一个具体场景或动作|成稿没有形成“场景\/使用习惯→产品事实→推荐理由”的可读链条/);
    }
    assert.match(sent[0].messages[0].content, /内部事实适配分析，不是成稿提纲/);
    assert.match(sent[2].messages[0].content, /platform\.editorial\.review/);
  }
});
