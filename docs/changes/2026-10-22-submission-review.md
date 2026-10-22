# 成交助手 Demo 最终变更说明

日期：2026-10-22
基线：`4643ece053ed0eaa40af0129c31e0115df580bb7`
用途：门店销售演示。真实上线前必须替换为真实门店报价、库存、活动资格和人工确认流程。

## 1. 当前实际链路

```mermaid
flowchart LR
  A[店员输入客户描述/预算/可选意向型号] --> B[成交 Agent]
  B --> C{是否有明确型号}
  C -- 否 --> D[学生/职场初步分类]
  D --> E[本地产品证据+预算内候选最多3个]
  C -- 是 --> F[型号/系统版本核对]
  F --> G[本地 VMall 价格快照与预算档位]
  E --> H[推荐卡片：配置/参考价/适配点/官网]
  G --> H
  H --> I[店员选择候选或进入价格方案]
  I --> J[门店报价、VMall价、教育价、官方优惠候选]
  J --> K[店员确认资格/叠加/有效期/库存]
  K --> L[整数分确定性计算，输出最低可执行方案]
  B --> M[精简客户话术与1/3/7天审核草稿]
```

## 2. 纳入提交的修改

### Skill 与交互规则

- `skills/customer-conversion/SKILL.md`：规定先理解用途和预算，再给最多三个候选；客户选定后才进入价格比较；客户话术不展示内部证据、政策适用范围、模型思考或未确认金额。学生和职场是当前可用的初步分类。
- `skills/customer-conversion/references/theory-to-dialogue.md`：保存精细化可能性模型、选择过载研究和前景理论的培训映射。它不在运行时注入，不构成成交保证。
- `services/api/src/clients/llmClient.cjs`：运行时加载 Skill，并禁止模型在话术字段输出价格、预算、折扣或补贴金额；金额由确定性价格模块渲染。对 `o4-mini` 省略不兼容的 `temperature` 参数。

### 推荐、预算与价格参考

- `services/api/src/agent/customerAgent.cjs`：无型号时按场景推荐；有预算时只保留预算内已知价格并标出最高价档；意向型号超预算时给出最低参考价、差额和替代候选；模型话术不合规时降级为有来源的产品卡和安全文本；跟进日期只允许 1/3/7 天。
- `services/api/src/services/scenarioProductSearch.cjs`：增加学生、论文、便携、办公、设备协同匹配和学生/职场分类；没有游戏演示入口，自由输入游戏需求时仅保留明确有适配证据的产品；保留现有营销任务对该共享搜索服务的调用，因此推荐排序可能变化。
- `services/api/src/services/priceSolutionService.cjs`：读取实际知识库价格卡，不再虚构“四档”；处理华为/HUAWEI和系统版本名称；没有价格记录时明确不可用；支持最低价、预算内最高档、差额和配置状态。
- `apps/web/src/components/ProductRecommendations.jsx`、`apps/web/src/App.jsx`、`apps/web/src/styles.css`：以横向推荐卡呈现产品、配置、参考价、适配点、图片和官网链接；内部运行记录和证据收进折叠面板。

### 门店/线上价格与优惠演示

- `apps/web/src/components/StorePricePlanner.jsx`：真实门店录入入口，要求配置、报价来源、有效期、库存和店员确认；不自动连接 POS。
- `apps/web/src/components/DemoStorePricePlanner.jsx`：演示入口读取知识库基准，比较华为商城价格、VMall 教育价和官方国补规则；演示值保留在当前页面，不写数据库。
- `apps/web/src/components/OfferRuleLookup.jsx`：查询官方优惠候选，逐项确认适用范围和叠加关系；未确认不进入最终价格。
- `apps/web/src/lib/storePricePlan.mjs`、`apps/web/src/lib/demoStorePlan.mjs`：使用整数分计算，处理门槛、封顶、互斥、有效期、线上/门店渠道和旧机回收单列。
- `services/api/src/services/channelPriceService.cjs`、`services/api/src/services/storeOfferRules.cjs`、`services/api/src/server.cjs`：新增渠道价格和官方优惠查询接口，仅允许 HTTPS 官方域名，联网失败不编造价格。
- `shared/pcSubsidy2026.json`：记录已核验的 2026 家电国补规则：符合条件的一级能效电脑按实际销售价 15% 补贴、每件最高 1500 元；资格、能效、当地实施、SKU和叠加关系默认待人工确认。它不是固定 500 元演示规则。
- `Dockerfile`：复制 `shared/` 到前端构建阶段及运行镜像，复制 `skills/` 到运行镜像，确保容器与本地运行读取同一政策和 Skill 文件。

## 3. 为什么不能只添加 Skill

Skill 只能约束模型表达，不能可靠完成预算过滤、同型号版本消歧、价格快照读取、官方域名限制、优惠叠加计算、异常降级、前端隐藏内部证据或容器资源打包。因此上述后端、前端和确定性计算改动是完成 Demo 所需的代码范围；没有新增依赖、数据库表或自动发送能力。

## 4. 明确排除的内容

本分支不提交 `research/`、`docs/testing/`、`docs/superpowers/`、`tests/fixtures/`、`docs/仓库代码解读_2026-10-19.md` 等研究、生成素材和其他任务资料；不提交仅换行变化的 `tests/product-spotlight.test.cjs`、`接口约束.md`；不提交旧的中间变更说明。旧的固定 500 元演示计算、强制四档价格和长篇配送/积分主界面文案不纳入本次功能。

## 5. 风险与上线边界

- VMall 价格是官方页面快照或人工核验结果，不是门店成交价、库存承诺或自动报价。
- 联网检索可能受页面结构、网络和活动有效期影响；检索不到不等于没有活动。
- 国补、教育优惠、门店优惠能否叠加，必须按门店、地区、SKU和顾客资格确认；计算器不会替代结算审核。
- 真实部署必须接入真实门店报价和库存，并保留店员确认记录。
- 共享场景搜索的排序发生变化，其他营销任务应按现有回归测试复核。
- `o4-mini` 参数兼容处理位于共享 LLM 客户端，影响该型号的全部调用；其他型号仍使用原有温度。
- 前端生产构建仍有主 JS 包体积提示，本轮未做拆包。

## 6. 验证与接口

- `POST /api/v1/store/channel-prices`：本地配置报价与可选 VMall 联网核价；型号歧义返回版本选项。
- `POST /api/v1/store/offer-rules`：官方来源优惠候选，默认待店员确认。
- Node 回归覆盖推荐、预算冲突、价格无记录、渠道价格、官方规则解析、优惠叠加、演示规则、话术降级和跟进日期。
- PowerShell 全量回归：`$testFiles = @(Get-ChildItem tests -Filter '*.test.cjs' | ForEach-Object { $_.FullName }); node --test @testFiles`。本次 102 项通过，无失败或跳过。
- 前端目录运行 `npm run build` 通过；主 JS 约 1.99 MB / gzip 615.53 kB，有包体积提示；提交前运行 `git diff --cached --check`。
- 本机无 Docker 命令，容器仅完成资源路径检查，未实际构建镜像。外网实时价格和真实模型调用不属于离线回归的覆盖范围。
