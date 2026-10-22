# 生图 Agent 合并说明

这份文档是生图分支交接入口。公共请求和响应字段以仓库根目录的 [`接口约束.md`](../接口约束.md) 为准；本文只说明图片模块的边界、接入方式和合并验收。

## 目标

用户在 5173 工作台选择知识库中的产品型号和生图风格后，点击“开始创作”，服务端完成以下流程：

1. 按精确型号检索产品事实和官方图片索引。
2. 只选择本次型号对应、来源可追溯且满足透明度要求的官方主体图。
3. 让图片模型生成不含产品的背景。
4. 服务端使用 `sharp` 将官方主体与背景确定性合成，保证产品外观不由模型重绘。
5. 通过本地受限资源路由返回图片，并在结果中标记 AI 背景与官方主体来源。

当前支持两类风格：商业宣传海报、日常生活照。没有精确匹配素材时必须停止生图并返回核验提示，不能借用相似型号或普通白底图。

## 调用链

```text
5173 工作台
  -> POST /api/v1/generate
  -> taskAgent.generate
  -> integrateImages
  -> generateCreativeImages
  -> provider + sharp 合成
  -> /api/v1/generated-assets/<safe-file>
```

图片模块的入口是 `services/api/src/agent/imageAgent/integration.cjs`。它接收已确认的 `task / evidence / assets / platform / strategy`，不自行联网检索产品、不猜测型号、不读取前端凭据。

## 多图行为

图片模式使用 `image_count` 控制生成数量，当前支持 1–3 张；前端下拉框和服务端上限必须同时满足。图片模式允许多个计划复用同一个精确型号主体，但每张结果仍必须带有真实的 `source_product_image`。

根目录 `.env` 使用：

```text
IMAGE_MAX_IMAGES=3
```

该变量是服务端硬上限。修改后只需重启 API；不要同时启动多个 3000 端口进程。未配置图片 Key 或设置 `IMAGE_PROVIDER=none` 时，服务端安全失败，不把官方原图伪装成 AI 成功结果。

## 输出和安全边界

每张生成图必须满足：

- `generated: true`、`generation_mode: ai_background_composition`。
- `model` 与请求中的精确型号一致。
- `source_product_image` 来自本次传入的 `assets`。
- `url` 只能是 `/api/v1/generated-assets/<安全文件名>.(png|jpg|jpeg|webp)`。
- 保留官方 `source_url`、`source_path`、配图位置和图注。

图片模型只接收背景提示词，不接收官方主体、产品事实、来源链接、磁盘路径或 Key。模型生成的背景文字、参数和功能界面不能作为事实；海报文字由本地合成层按已核验数据处理。任何型号、来源、数量、URL 或结构校验失败，都回退到本次已核验官方图并返回脱敏警告。

## 合并文件

应随生图分支合并：

- `services/api/src/agent/imageAgent/`
- `services/api/src/services/generatedAssets.cjs`（如分支包含）
- `services/api/src/server.cjs` 的受限生成资源路由
- `services/api/src/agent/taskAgent.cjs` 的图片入口接入
- `services/api/package.json` 及对应锁文件
- `apps/web/src/components/MarkdownContent.jsx`、`apps/web/src/lib/creativeArticle.js`、状态展示相关改动
- `assets-huawei-icon.png`（若海报合成使用）
- `tests/image-agent*.test.cjs`
- `.env.example`、本文件及 `docs/image-agent-integration.md`

不得提交：`.env`、`.env.image-playground`、任何 API Key、Cookie、客户数据、`tmp/generated-assets`、`node_modules`、`dist` 或真实生成图片。

## 本地验收

在仓库根目录执行：

```sh
npm ci --prefix services/api
node --test tests/image-agent.test.cjs tests/image-agent-integration.test.cjs
npm run build --prefix apps/web
```

手动验收时只需两个服务：

```sh
node --env-file=.env services/api/src/server.cjs
npm run dev --prefix apps/web
```

打开 `http://127.0.0.1:5173/`，选择“仅生成图片”、产品型号、商业宣传海报或日常生活照，设置 1–3 张并点击一次“开始创作”。验收标准是：生成阶段为 success、页面显示对应数量的 AI 合成图、每张图片可加载、结果标明官方主体来源。失败回退官方图不算 AI 生图成功。

## 当前限制

- 图片模型只生成背景，不能保证复杂场景中完全没有额外物体；需要人工检查。
- 视角改变、人物手持、双主体对比图、数据图表和真实图像编辑暂不属于本模块能力。
- 取消请求会停止本地等待和文件写入，但无法保证第三方服务已开始的远程任务停止计费。
- 真实供应商联调属于手动验收，不应放进常规 CI。
