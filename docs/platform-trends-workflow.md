# 平台热点选题工作流

## 2026-10-25：热梗与表达玩法

「创作灵感」默认进入「热梗与玩法」，原有相关热榜保留在「平台话题」。热梗发现不再要求来源直接涉及电脑，而是判断表达含义能否自然转译到当前人群和使用场景。

工作流：检索公开网页 → 解析搜索标题和摘要 → 合并来源 → 模型解释含义并筛选适配玩法 → 校验话题在引用来源中确实存在 → 展示含义、适合原因、切入方向、原创例句和来源 → 用户选择 → 服务端保存当前会话选择 → 正常创作与事实审查。

- `POST /api/v1/inspirations`：请求 `{platform, session_id?, task?, query?}`。指定会话时以服务端已保存需求为准；query 可输入梗、句式或参考链接。
- `POST /api/v1/inspirations/select`：请求 `{session_id, discovery_id, item_id}`。服务端验证候选有效期与需求一致性后保存 pending 选择，随后对话中的「围绕话题创作：…」或「自然融入话题：…」完成确认。
- 来源使用搜狗公开搜索页面与 Bing RSS，查询指定词含义或当前月份的表达玩法。无需新增搜索密钥。参考链接目前作为搜索关键词，尚不直接读取链接原文。
- 搜索与发现结果缓存 30 分钟，并发请求合并。缓存及候选在进程内保存，重启后须重新搜索；搜索无结果短暂缓存 60 秒。验证页、空结果、超时或模型失败均不编造候选。
- 这些结果依据搜索摘要，只标「表达参考」；原文发布时间及平台传播规模未核实，不宣称实时爆款或保证推流。来源链接可供人工查看。
- 玩法可以跨场景改写，但不得机械套用食品台词、虚构产品体验，或将热点来源当作产品事实证据。
- 实现位于 `services/api/src/services/creativeInspiration.cjs`；日志记录 inspiration_search、inspiration_recommendation 及模型调用，接口返回 request_id 和 log_url。

已通过相关 13 项自动测试和前端构建；真实检索曾返回「不烧心文学」等带来源的表达，公开搜索存在验证页和结果波动，失败时可以重试或跳过。

状态：2026-10-25 已实现本地热点查询、对话选题卡片与创作接入，以及基于产品、人群、使用场景的模型相关性筛选。尚未实现后台定时调度。不得将现有静态风格参考标为实时热点。

## 本地已实现的接口

本地服务运行于 3000：

- GET http://127.0.0.1:3000/api/v1/trends?platform=weibo
- GET http://127.0.0.1:3000/api/v1/trends?platform=xiaohongshu
- POST http://127.0.0.1:3000/api/v1/trends/recommendations，JSON 请求体为 `{platform, task: {model, audience, scenario, goal, requirements}}`。

GET 保留原始榜单供查询；对话自动推荐与手动热点入口均使用相关性筛选结果。筛选读取完整榜单，最多返回 5 项，保留原话题、排名和来源，附 reason、angle。模型只能选择原始条目 ID，不能编造热点。无匹配返回 no_match；模型筛选失败返回 filter_failed，不回退为原始榜单。旧版未筛选的待选列表重新筛选；需求改变后未确认的候选失效。模型请求及筛选数量/结果 ID 记录于运行日志。

实现：services/api/src/services/platformTrends.cjs；路由：services/api/src/server.cjs。

微博发送 User-Agent 和 Referer 后，此次官方接口返回正常榜单；使用官方源为主、60s 微博接口为后备。小红书使用 https://60s.viki.moe/v2/rednote，明确标记聚合源。两者均未提供可靠的榜单更新时间，source_updated_at 为 null，freshness 为 source_time_unknown；available 表示取得有效条目，不保证源数据实时。

已实现按需采集、30 分钟文件缓存、同平台并发请求合并、每源 10 秒超时、失败后 60 秒冷却、24 小时旧快照退出、返回 request_id 和日志地址。条目含 topic、rank、heat_value、source_url；响应包含 provider、provider_url、list_type、fetched_at 和 snapshot_id。缓存位于 Git 忽略目录 data/platform-trends/。

已通过 3 项自动测试，覆盖并发缓存及磁盘恢复、官方源失败后的后备源、空响应/HTML/过期快照及非法平台。两个真实 HTTP 接口和日志读取也已通过。以下定时采集等内容仍为后续目标。

## 1. 数据源现状与验收

2026-10-25 本地 Node fetch 未登录访问结果，仅代表本次网络环境：

| 平台 | 候选入口 | 结果 |
| --- | --- | --- |
| 微博 | https://weibo.com/ajax/side/hotSearch | HTTP 403 |
| 微博 | https://weibo.com/ajax/statuses/hot_band | HTTP 403 |
| 微博 | https://s.weibo.com/top/summary?cate=realtimehot | HTTP 200，但内容是 Sina Visitor System 访客验证页 |
| 小红书 | https://edith.xiaohongshu.com/api/sns/v1/search/hot_list | HTTP 406，空 data |
| 小红书 | https://www.xiaohongshu.com/explore | 跳转登录页，不能作为已取得热榜的证据 |

以上记录是最初不带正常 Referer 的探测结果；后续加 Referer 后微博官方接口已通过。它仍是网页内部接口，不是已获得支持保证的官方开放 API。不绕过验证或签名限制，不把登录页 HTTP 200 判为成功。

优先验证有明确数据来源和授权范围的数据服务商；若平台确实提供可申请的官方接口，则优先使用。尚未选定或验证任何服务商，不能承诺已经可用。分别确认是否提供微博热搜、小红书搜索热词或话题榜，它们不是同一指标。

接入验收必须在魔搭实际部署环境完成：返回真实条目、来源 URL、榜单类型、提供方采集时间；核对若干条与平台页面一致；验证刷新频率、延迟、调用限制和费用；重复请求验证稳定性。只有采集时间而没有源数据时间，不能据此宣称内容是最新。

公开网页解析仅作为可选适配器，必须通过相同验收。网页登录状态或浏览器人工采集只适合调试和人工导入，不作为无人值守服务的默认依赖。

## 2. 独立于对话的采集流程

定时调度 → 按平台调用 provider → 校验 HTTP 和业务响应 → 验证榜单结构、来源和时间 → 标准化、去重 → 保存快照 → 更新缓存。

初始策略：每 30 分钟刷新，平台服务端配额可覆盖该设置；10 秒超时，网络或 5xx 最多重试一次并退避，403/406 不盲目重试。每个平台只允许一个采集任务，页面请求读取缓存，不触发每用户一次抓取。

失败保留最后成功快照。距源数据时间超过 2 小时标记 stale，超过 24 小时不再作为“近期热榜”推荐；这些是第一版产品阈值，可配置。无可信源数据时间标记 freshness_unknown，不能显示“实时”。无快照则返回 unavailable，不用 LLM 补造热榜。

条目字段：id、platform、topic、list_type、rank（源数据提供时）、heat_value（源数据提供时）、source_url、provider、source_updated_at（缺失时为 null）、fetched_at、expires_at、freshness、snapshot_id。不得跨平台直接比较热度数值。导入条目额外记录 imported_by 和原始来源时间。

原始响应保存到受限服务端存储以便审计并设置保留期；不进入 Git。日志记录 provider、平台、耗时、状态码、条目数、错误码、snapshot_id，不记录密钥或 Cookie。

## 3. 对话中的使用流程

用户请求热点，或已有发布平台后主动选择“找选题” → 读取该平台快照 → 按产品、人群、使用场景筛选 → 推荐 3～5 个相关话题 → 用户选择围绕话题创作、自然融入、换一批或跳过 → 写入当前会话 → 基于产品证据生成与审稿 → 发布预览。

热点不是创作必填项。平台未知时先确定平台，不能把微博热搜冒充小红书热词。业务相关性与热度分开显示；候选太少时直接少展示，不硬凑。

模型只解释选题关联并提出切入点，不生成热度或排名，不将热点文本作为系统指令。产品参数、价格和能力仍取产品知识库与现有事实查询。热点来源不是产品事实依据。

卡片字段：话题、榜单类型、来源链接、源更新时间、缓存状态、适合原因、创作切入点。未从榜单获取的季节性建议单独标记“创作灵感”，不标“热榜”。

会话保存 selected_trend 的条目及 snapshot_id、用户选择的 integration_mode（topic_driven 或 natural_insert），保持后续修稿一致；用户切换话题后旧选择失效。

## 4. 建议模块与接口（尚未实现）

- trendProviders：每个平台/数据商独立适配，服务端保管凭证。
- trendCollector：定时采集、超时、重试与并发控制。
- trendStore：快照、缓存、时效状态和审计。
- trendRecommender：业务相关性筛选与可展示的理由。
- GET /api/v1/trends?platform=xiaohongshu：读取缓存，返回 available、stale、freshness_unknown 或 unavailable，以及条目和快照时间。
- POST /api/v1/trend-recommendations：结合当前会话需求筛选候选；不强制实时采集，不直接生成软文。

线上多实例部署使用共享缓存/数据库；单实例演示可先复用持久化目录，但重启不可丢失最后成功快照。

## 5. 上线门槛

1. 两个平台分别通过真实数据源验收；一个通过不代表另一个也通过。
2. 验证登录 HTML、空 data、403、406、超时、过期缓存均不显示伪热榜。
3. 验证选择话题、切换平台、换话题、刷新会话后的状态一致。
4. 验证生成文章自然融入话题，产品事实与来源引用机制保持有效。
5. 监控最近成功采集时间、失败率、过期占比；采集故障不阻断普通软文创作。

下一步是选择并实测数据 provider。工作流完成不等于已经拥有小红书/微博实时热榜服务。


## 6. 本地创作灵感实现

当前入口为“创作灵感”，包含“热梗与玩法”和“平台话题”。平台话题调用 GET /api/v1/trends 和 POST /api/v1/trends/recommendations；表达参考调用 POST /api/v1/inspirations，传入 platform、session_id、query。搜索搜狗公开页面和 Bing RSS 的标题与摘要，模型据此解释原语境、匹配创作需求，提供原创改编方向。它不要求梗本身提到电脑。

条目必须带搜索来源，标题或摘要需直接包含对应表达。仅有摘要，不能声称读过原帖、确认平台热度或确定发布时间。搜索验证页、失败或无适配表达时返回空结果，可跳过；没有来源不凭模型记忆编热点。搜索与筛选使用进程内30分钟缓存，重启会清空；榜单缓存沿用独立的文件缓存。

选中表达调用 POST /api/v1/inspirations/select，按服务端保存的 discovery_id、item_id 和当前创作上下文验证，写入当前会话后沿现有 topic_driven / natural_insert 流程继续。选择记录保存在会话，临时发现记录30分钟后过期。产品事实仍来自知识库。公开搜索并不稳定，本次烧心梗实测能获取搜索摘要，但筛选可能返回 no_match；这不等于已确认近期热度。
