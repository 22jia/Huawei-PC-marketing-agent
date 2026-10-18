// Platform rules describe editorial decisions, not interchangeable copy templates.
module.exports = {
  xiaohongshu: { label: '小红书', format: '图文笔记', length: '正文约300–550字，用户要求优先', voice: '像认真做功课的选购朋友，短句、留白、克制表情；禁止虚构亲测、购买经历和用户口碑', structure: '问题型短标题（尽量20字内）→一个具体任务的困扰→2–3条选择建议（任务/有证据的能力/边界）→收藏或评论问题→轻量到店邀请', visual: '3:4封面建议；每图一个信息点，封面提出问题、内页承接建议；比例为排版建议，不能宣称已裁切', avoid: ['新闻通稿腔', '参数堆砌', '无来源的亲测', '长篇品牌口号'], cta: '邀请读者说出自己的软件或任务，再带资料到店体验', hashtags: ['#笔记本选购', '#学习办公'] },
  wechat: { label: '微信公众号', format: '图文文章', length: '正文约700–1100字，用户要求优先', voice: '有观点、有推理的编辑表达，完整段落与清楚小标题，少用表情和话题标签', structure: '有判断的标题→场景切入并提出核心问题→3个有递进关系的小节（问题/选择标准/产品适用及边界）→体验清单→自然收束', visual: '16:9封面建议；段间图片解释本节观点，图注说明意义，不能用图替代参数证据', avoid: ['小红书式碎片清单', '满屏表情', '反复喊到店', '无论证的品牌赞美'], cta: '用一份具体体验清单引导到店验证', hashtags: [] },
  wechat_moments: { label: '微信朋友圈', format: '单图或少量图社交短文', length: '正文约80–160字，用户要求优先', voice: '门店顾问与熟人交流，真诚克制，不伪装消费者', structure: '一个日常任务→一句有依据的选购提醒→一个低压力的私聊/体验邀请；不做公众号分节', visual: '一张重点产品图优先，最多三张，图注简短', avoid: ['营销长文', '密集话题', '假装亲测'], cta: '欢迎私聊具体软件和用途', hashtags: [] },
  douyin: { label: '抖音', format: '图文轮播文案（不是视频脚本）', length: '正文约180–350字，用户要求优先', voice: '开头直入冲突，每张卡片一句重点，节奏明快，不能夸张承诺', structure: '封面问题→按顺序的图卡（场景/选择标准/适用限制/体验动作）→评论区问题；body用小标题标出每卡文案，不写镜头、口播、时长', visual: '3:4竖版图卡建议；图片与卡片一一对应，卡面文字短', avoid: ['视频分镜', '长论述', '不实震惊标题'], cta: '评论具体需求或带任务到店验证', hashtags: ['#电脑选购', '#数码图文'] },
  weibo: { label: '微博', format: '话题图文短帖', length: '正文约140–260字，用户要求优先', voice: '围绕一个可讨论的问题发表明确观点，简洁自然', structure: '一个话题/问题→一个观点→有依据的理由与限制→具体讨论问题', visual: '一张主视觉和少量补充图，避免长图文教程', avoid: ['长文章', '虚构热搜', '空泛投票'], cta: '邀请分享使用场景，补充到店核对建议', hashtags: ['#笔记本选购#'] },
  bilibili: { label: '哔哩哔哩', format: '专栏图文', length: '正文约650–1000字，用户要求优先', voice: '理性、有解释欲的数码作者，讲清判断依据和适用边界；没有实测不能写评测结论', structure: '问题与范围→拆解需求→逐项说明选择标准与证据→适合/不适合谁→可执行的体验清单；用Markdown小标题', visual: '16:9封面建议，正文图片服务于论证，标注官方来源', avoid: ['视频简介与提纲', '无数据的性能排名', '编造跑分', '只讲优点'], cta: '留言补充工作流，并按清单现场验证', hashtags: ['笔记本选购', '数码'] },
};
const imageTargets = { xiaohongshu: 4, wechat: 3, wechat_moments: 1, douyin: 5, weibo: 2, bilibili: 4 };
for (const [id, profile] of Object.entries(module.exports)) profile.image_target = imageTargets[id];
