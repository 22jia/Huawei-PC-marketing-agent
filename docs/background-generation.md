# 多会话后台任务

Studio 通过 `POST /api/v1/generate` 的 `background: true` 提交任务，立即返回 HTTP 202 和运行编号。页面通过 `GET /api/v1/generation-jobs/:request_id` 查询阶段和结果；明确点击停止时调用 `POST /api/v1/generation-jobs/:request_id/cancel`。

- 默认同一后端进程最多并行 4 个会话，可用 `AGENT_MAX_CONCURRENT` 调整。上游模型服务仍可能有独立限流。
- 同一会话按提交顺序执行，真正开始执行时读取最新持久化上下文，避免排队请求使用过期聊天记录。
- 切换会话、刷新、关闭页面只断开进度订阅，不取消后台任务。历史列表和会话详情包含 `generation_job` 状态，返回会话后自动恢复结果。
- 进度查询临时失败会自动重连，不重新提交生成请求。提交本身未收到响应时不自动重试，以免重复付费生成。
- 状态与结果存入 `data/generation-jobs/`，已加入 Git 忽略。可通过 `GENERATION_JOBS_DIR` 覆盖位置。
- 进程重启保留已完成结果；正在执行或排队的任务标记为 `RUN_INTERRUPTED`，需用户重新发送。当前不支持重启后续跑，也不支持多个后端进程共享调度队列。
- 运行日志继续按运行编号在 `/api/v1/runs/:request_id` 查看。任务状态文件与运行日志是两份不同用途的记录。

验证：`node --test tests/background-generation.test.cjs tests/generation-jobs.test.cjs tests/studio-adapter.test.cjs tests/progress-stream.test.cjs`。接口测试使用模拟模型，不调用收费服务。
