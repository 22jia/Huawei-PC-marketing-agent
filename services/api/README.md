# API Service

Owns the `/api/v1` contract, local v7 knowledge retrieval, optional official VMall dynamic checks, Agent orchestration, evidence extraction, and validation. Public fields must match the root `接口约束.md`.

Customer conversion assistance is exposed at `POST /api/v1/customer/assist`. It returns a customer insight, clarification questions, evidence-backed solution candidates, a store talk track, objection responses, and staff-reviewed 1/3/7-day follow-up drafts. It does not send customer messages automatically.

## 严格模型执行约定

会话执行器由模型判断生成、改稿或问答意图，程序据此执行检索、生成或直接回答。营销前端将当前任务、最近12条对话和当前成稿作为状态传入；问答不覆盖成稿，后续改稿继续引用它。切换工作空间不会卸载创作会话；点击“新建创作”开始新会话。当前状态保存在页面内存中，刷新页面不会恢复历史，不宣称持久记忆。

运行 `node scripts/smoke-agent-conversation.cjs` 可通过本地 API 验证“版本澄清 → 初稿 → 模型身份问答 → 原稿修改”，会实际调用已配置模型并消耗用量。

营销创作与成交辅助均执行：LLM 需求分析与检索规划 → 本地 v7 知识检索（必要时 VMall 动态补充）→ LLM 基于证据生成 → 程序基础规则检查。每个会话会持久化最多 100 条消息及结构化任务状态（已确认的人群、场景、平台、型号、待确认事项和成稿）；模型分析时读取最近 12 条消息，并以结构化任务状态承接较早轮次已确认的信息。场景选型会先根据本地产品资料筛候选、展示依据并等待用户确认，确认型号后再继续收集软文信息。必需信息缺失或产品版本不明确时先澄清。

服务端必须配置 `LLM_API_KEY`、`LLM_BASE_URL`、`LLM_MODEL`。密钥仅在服务端使用。成功结果包含 `generation_mode: llm` 和 `llm.stages`，记录分析、生成各阶段的模型、耗时和服务商返回的 token 用量。检索由程序执行，查询词由模型规划。

模型未配置、连接失败、HTTP 错误、非法 JSON 或结构错误都直接失败；禁止返回模板或伪装成成功。错误响应包含 `status: error`、`generation_mode: failed`、`code` 与安全的错误说明。主要错误码为 `LLM_NOT_CONFIGURED`、`LLM_CONNECTION_FAILED`、`LLM_HTTP_ERROR`、`LLM_INVALID_JSON`、`LLM_INVALID_SCHEMA`。

基础规则会拦截部分缺少证据的数值参数、绝对承诺和无官方商城依据的价格（`UNSUPPORTED_CLAIM`、`UNVERIFIED_PRICE`）。该检查不是完整的语义事实审计，发布与门店使用前仍需核对 SKU、系统版本和适用条件。检索无证据时模型只能提供场景建议或追问，不能编造产品事实。
