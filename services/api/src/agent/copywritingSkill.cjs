const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');

const SKILL_PATH = path.resolve(__dirname, '../../../../SKILL.md');
const SECTIONS = { wechat: '3.1', weibo: '3.2', xiaohongshu: '3.3', wechat_moments: '3.4', douyin: '3.5', bilibili: '3.6' };

// Examples illustrate rhythm, never product evidence. Keep them out of model context.
function withoutExamples(text) {
  return text
    .replace(/^#### 正例 vs 温度低反例[^\n]*\n[\s\S]*?(?=^#### |$(?![\s\S]))/gm, '')
    .replace(/^\*\*温度低的反例\*\*[^\n]*\n?/gm, '')
    .trim();
}

function loadCopywritingSkill(task) {
  if (task.output_type === 'image' || !SECTIONS[task.platform]) return null;
  const latest = (task.history || []).filter(m => m.role === 'user').at(-1)?.content || '';
  const voiceSource = [task.goal, ...(task.requirements || []), latest].join('\n');
  const creatorVoice = /普通人|消费者口吻|素人口吻|达人口吻|像用户分享|像真实用户|种草分享型|个人分享口吻|生活化种草|个人种草|小红书达人|按这个风格|参考这篇/.test(voiceSource);
  const officialVoice = /门店工作人员|门店员工|销售顾问口吻|门店账号|官方账号|官方文章|品牌账号|企业账号/.test(voiceSource);
  const brief = [task.goal, ...(task.requirements || []), latest].join('\n');
  // Only explicit official-copy requests bypass this retail expression skill.
  if (/(?:写|生成|改成|采用|使用|需要).{0,12}(?:官方通稿|新闻稿|品牌通稿)|(?:官方账号|华为终端官方号).{0,12}(?:通稿|新闻稿|发布)/s.test(brief)) return null;
  const source = fs.readFileSync(SKILL_PATH, 'utf8').replace(/\r\n/g, '\n');
  const common = source.match(/^## 二、[^\n]*\n([\s\S]*?)(?=^## 三、)/m)?.[1];
  const section = SECTIONS[task.platform];
  const platform = source.match(new RegExp(`^### ${section.replace('.', '\\.')} [^\\n]*\\n([\\s\\S]*?)(?=^### 3\\.|^## 四、)`, 'm'))?.[1];
  if (!common || !platform) throw Object.assign(new Error('软文 Skill 缺少通用规则或当前平台分则，请检查 SKILL.md。'), { code: 'COPYWRITING_SKILL_INVALID' });
  return {
    name: 'platform-copywriting-skill',
    version: createHash('sha256').update(source).digest('hex').slice(0, 12),
    source: 'SKILL.md',
    platform: task.platform,
    voice_mode: creatorVoice && !officialVoice ? 'creator_style' : 'store_advisor',
    rules: [withoutExamples(common), withoutExamples(platform)].join('\n\n'),
  };
}

function skillInstructions(skill) {
  if (!skill) return '';
  const voiceGuidance = skill.voice_mode === 'creator_style'
    ? '本篇采用个人创作者分享式表达：更口语、更有情绪和个人判断，可以自然地使用第一人称表达写作者的取舍，并把产品事实放进具体生活场景。购买、拆箱、长期使用、他人询问、真实用户反馈、价格、优惠、赠品、销量和效果等具体经历或事实，只能使用task/history明确提供的内容；未提供时改用假设场景或读者自我判断，不伪造亲历或消费者身份。'
    : '本篇采用门店工作人员/品牌内容表达：像会替顾客着想的真人作者，有偏好、有温度，门店身份不等于品牌通稿。以目标人群的具体动作串起参数和产品特点，避免分节逐条报规格；不把门店人员伪装成普通消费者。';
  return `\n当前主Agent已加载写作技能 ${skill.name}@${skill.version}，只用于本次软文策划、写作、修改与审稿，不改变当前阶段JSON协议。
写作身份模式：${skill.voice_mode || 'store_advisor'}。${voiceGuidance}
规则优先级为事实与合规、用户明确要求、阶段协议、platform形式与默认篇幅建议、以下表达建议。表达风格不能创造事实；“我觉得”“朋友说”不能豁免对具体经历、口碑或收益的依据。没有亲历材料时，可以直接描写可想象的读者生活场景，表达作者的偏好和选购取舍，不必句句加如果、可能、建议，不要退回参数说明书口吻。
事实约束由后台执行，不把审核说明写进软文。不为满足事实检查而补写免责段落；不能通过删除必要限定把有条件事实写成普遍承诺。必要配置条件紧贴事实，未获证据的可选卖点直接舍弃。产品来源使用事实句后的引用标记，不写“资料指出、还需综合判断”等导购尾巴。
例如来源写重量1.31千克及制造/测量误差时，成稿只写“机身重量约1.31千克”并加引用，通用误差说明留在来源中；不要补写“实际重量因配置、制造工艺和测量方法有所差异”或“结合整包物品与销售配置判断”。具体SKU才适用的参数仍须保留SKU限定。不得由电池容量推导使用时长；缺少续航时长就不写续航承诺，也不补“不能判断能否撑满一天”等免责解释。
分则优先于通用建议，例如朋友圈可用自然到店邀请，不强制延后产品登场；标题长度按platform执行。CTA只在cta字段出现。图片仅用于展示外观或场景示意，不证明续航、性能或真实使用。缺少实拍和场景图不构成退稿理由。
策划先落实platform.editorial的阅读目的、角度和段落节奏，不能所有平台共用同一条场景流水线。通用场景建议只用于理解需求，不规定成稿结构；小红书侧重共鸣与偏好，公众号侧重观点及解释，参数不能成为每一节的主题。职场、差旅等硬场景也可以使用轻叙事和分享语气，不强制写成教程或核验清单；只有用户明确要求教程/攻略时才采用步骤清单。写稿与修稿落实同一规则。审稿按platform.editorial.review检查阅读体验，语气符合写作身份；不得只因结构完整和事实合规就判为有种草感。读者情境与作者取舍不能误判为虚构亲测；不按固定表情数量、标点或第一人称打分；小红书默认自然使用emoji，用户未要求纯文字而整篇完全没有emoji时，应按平台规则补入；公众号仍保持克制。可就具体套话、重复免责和明确语言禁令退稿并提出具体修改，但不得要求模型补造亲测和用户口碑。
<copywriting-skill>\n${skill.rules}\n</copywriting-skill>\n`;
}

module.exports = { loadCopywritingSkill, skillInstructions };
