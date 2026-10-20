# 图片生成子 Agent 接入说明

本文约定内容创作主 Agent 与图片生成模块的边界。图片模块可以使用独立的图像模型服务；它不需要也不应复用文本模型 `LLM_*` 配置。

## 当前接入状态

本分支已接入 PC 场景营销工作台现有 `/api/v1/generate`。用户沿用原有表单和“开始创作”按钮，布局不变。主流程完成事实检索、图文策划、文案生成和审核后调用图片模块。默认只生成一张策划选中的主视觉（优先封面），其他位置保留官方图；`IMAGE_MAX_IMAGES=1..6` 可调整上限。未配置图片凭据或 `IMAGE_PROVIDER=none` 时沿用官方配图，不发付费请求。

`integration.cjs` 校验成功状态、数量、型号、输入素材关联、官方来源、本地 URL 和策划位置；异常或非法输出回退本次已核验的官方图，记录 `llm.stages` 中 `imageGeneration` 的成功/失败状态。取消请求会传递到图片模块，不作为普通失败回退。当前 API 仍是一次性 JSON 响应，阶段信息在完成后显示，尚无实时进度流；文字阶段取消仍沿用原有行为。

共享文件变动由本次用户明确要求授权：`taskAgent.cjs` 接调用与回退，`server.cjs` 传断开信号，`MarkdownContent.jsx` 只额外允许严格的本地生成图片地址，`creativeArticle.js` 和 `ModelRunStatus.jsx` 展示合成来源与失败状态。未改变表单、布局、文案事实检索或审核策略。

## 输入契约

```js
generateCreativeImages({
  task,       // 已确认的 model、audience、scenario、goal、platform、image_count
  evidence,   // 主 Agent 已检索并筛选的产品事实及来源
  assets,     // 本次型号匹配的官方产品图，不能换成其他型号素材
  platform,   // 发布平台的图文格式、画幅和风格策略
  strategy,   // 内容角度、图文大纲、图片用途及官方图规划
}, { signal });
```

产品型号、描述和平台规则都来自主 Agent。图片模块不得另行猜型号、编造产品事实，亦不得使用本地目录或跨会话数据私自扩大素材范围。第三方服务的 Key 只能从 API 进程环境变量读取，禁止放进浏览器代码、请求体、日志或提交记录。

## 输出契约

返回 Promise，成功时结构如下。`images.length` 不得超过 `task.image_count`，所有输出都要关联本次输入中的 `source_product_image`。

```js
{
  status: 'success',
  provider: 'provider-id',
  images: [{
    id: 'stable-local-asset-id',
    url: '/api/v1/generated-assets/stable-local-asset-id.png',
    description: '图片内容的简短描述',
    model: '输入中的确切型号',
    source_url: '原始官方产品素材的来源 URL',
    source_product_image: '输入 assets 中的素材 ID',
    generated: true,
    placement: 'cover', // cover | inline | closing
    after_paragraph: 0,
    caption: '面向读者的图注',
    purpose: '图片在本篇内容中的作用'
  }],
  warnings: []
}
```

`generated: true` 的 `url` 必须使用 `/api/v1/generated-assets/<安全文件名>.<png|jpg|jpeg|webp>`；官方图片沿用 `/api/v1/products/image?path=...`。页面只允许渲染这两类本地 API 地址。不要返回 `data:`、任意外部 URL、模型临时下载 URL 或绝对磁盘路径。生成文件应存放在运行时资源目录，并由服务端新增受路径限制的读取路由提供；不要把图片二进制或生成结果提交到 Git。

## 产品真实度与图片处理

推荐流程是保留官方产品主体，分离或抠出主体后生成背景，再由确定性合成步骤组合。不得让生图模型自由重绘产品本体；外观、端口、键盘、屏幕边框、商标或配件发生变化时，不可作为真实产品图交付。背景中的文字、功能标签和产品参数也不得由模型生成，图中文字应由产品代码排版并使用已核验信息。

来源字段必须能追溯到输入官方图。若提供商不支持主体保持、输出不清晰或发生型号错配，应返回安全失败，由主流程回退官方图；不能把“已调用模型”当作成功。

## 超时、取消与失败

- 使用传入的 `AbortSignal` 取消供应商请求、轮询和文件写入；收到取消后抛出错误，不要吞掉取消并伪报成功。
- 为图像 API 设置有限超时，不无限轮询。可重试错误应有次数上限；不要在 adapter 和 provider 两层重复重试。
- 不要把供应商原始错误正文放进用户可见的 `warnings`。抛出带稳定 `code` 的错误，必要诊断由既有运行日志脱敏记录。
- 主 Agent 会对模块异常或非法输出回退官方图；图片生成不是事实检索的替代品，也不得阻断文本生成。
- 输出文件名使用随机或内容寻址 ID，拒绝路径穿越，限制文件类型和大小。不要将用户输入直接拼接为文件路径。

## Provider 配置

图片服务配置应独立于文本模型配置，建议使用 `IMAGE_PROVIDER`、`IMAGE_API_KEY`、`IMAGE_BASE_URL`、`IMAGE_MODEL` 和 `IMAGE_TIMEOUT_MS`。只在服务端读取；真实值留在本地 `.env` 或部署密钥管理中。新增变量名时更新仓库 `.env.example`，其中值保持空白或使用非敏感示例。即梦或其他提供商必须使用项目实际可访问的官方 API/SDK；不能假设它兼容 OpenAI Chat Completions，也不能在代码里承诺账号已获得 API 权限。

## 文件与 PR 边界

图片模块开发建议限定在：

- `services/api/src/agent/imageAgent/`：模块入口、provider adapter、图片合成和输出校验。
- `services/api/src/services/generatedAssets.cjs`（如需）：生成文件存储与安全读取。
- `tests/image-agent*.test.cjs`：provider 使用 mock，不发真实付费请求。
- `docs/image-agent-integration.md` 与 `.env.example`：必要的配置和约定更新。

主流程调用位置、图片进度事件、前端图片 URL 白名单由 Harness 维护。修改这些共享文件前，应在 PR 描述逐项列出理由和兼容影响。图片模块不得改写 `taskAgent` 的事实检索/审核策略、`llmClient` 的文本模型配置、会话存储格式或公共生成 API 响应字段；若契约确需变化，先更新本文件和 `接口约束.md` 并一起评审。

开发者在同仓库使用单独分支，不直接向主分支推送；提交 PR 时限制文件范围，避免 `.env`、模型 Key、产品知识库、客户数据、生成图片、`node_modules` 和 `dist` 进入提交。合入前运行：

```powershell
node --test tests/image-agent.test.cjs tests/llm-pipeline.test.cjs tests/progress-stream.test.cjs
```

并验证生成文件能通过本地 API 路由读取，未配置图片服务时官方图回退正常，取消请求会停止本地图片等待（供应商任务是否停止需另行确认），前端拒绝外部图片 URL。真实模型联调应作为单独的手动验证，不放进常规 CI。

## 合入清单

- [ ] Provider 独立于 `LLM_*` 文本模型配置，凭据仅在服务端。
- [ ] 输入使用调用契约，不自行检索或切换产品型号。
- [ ] 输出经过 schema、型号来源、数量、图片 URL 和路径检查。
- [ ] 生成图片对应本次传入的官方产品图；产品本体没有被模型重绘。
- [ ] 生成资源存储、读取路由、缓存策略及清理策略有实现说明。
- [ ] 超时、取消、限次重试和官方图回退均已验证。
- [ ] mock 测试通过；无密钥、个人数据或生成文件进入提交。

## 本分支实现与联调说明

### 已实现的图片处理边界

- 素材检索继续由主 Agent 的 `creativeAssets` 完成；图片模块只读取本次 `assets` 中被 `strategy.image_plan` 引用的文件，不遍历知识库、不联网寻找替代型号。
- 官方主体使用 `sharp` 解码、按比例缩放并确定性合成；绝不上传官方主体给生图服务。输入支持静态 PNG/JPEG/WebP，拒绝越界路径、符号链接逃逸、超过 12 MiB 或 2500 万像素的图片。
- 已透明的官方图保留其 alpha 蒙版。不透明官方图保持完整，作为图片卡片拼贴，并返回相应提示。本版本**没有自动分割/抠图服务**，不会用白色阈值误删白色或银色机身。真实场景融合、自动抠图、透视匹配与发布质量审查仍需后续实现/人工核验。
- 模型只接收背景提示词，不接收产品参考图、证据、来源链接、磁盘路径或 Key。背景不承担功能/应用事实证明；主体像素来自官方图。背景是否出现多余产品/文字仍需人工审图，未提供自动语义视觉审核。
- 所有选中素材先校验并准备，再开始付费请求。任意一张失败或取消时，删除本次已保存的结果，不返回半成功。

### OpenAI Next 配置

用户提供的媒体文档确认请求为 `POST https://api.openai-next.com/v1/images/generations`，JSON 只发送 `model/prompt/size`；参考图编辑参数未经确认，因此本实现不发送臆造的 `reference_image`。默认 `gpt-image-2` 只是文档示例，尚未完成实际效果或价格对比；可用 `IMAGE_MODEL` 切换文档列出的其他模型，需自行核验账号权限和尺寸支持。

服务端环境变量见根目录 `.env.example`。`CREDIT_MEDIA_API_KEY` 优先于兼容变量 `IMAGE_API_KEY`，二者均不能通过任务或函数 options 传入。`IMAGE_PROVIDER=none` 显式禁用，未配置 Key 时安全失败。模块不会自行加载 `.env`，独立调用时可使用 Node 的 `--env-file=.env`，部署时建议由平台注入环境变量。

响应适配目前支持 OpenAI 风格 `data[0].b64_json` 或 `data[0].url`，此响应假设**尚未通过真实 Key 验证**。URL 结果由服务端下载再解码合成；只允许 `IMAGE_DOWNLOAD_HOSTS` 配置的精确 HTTPS 域名，不跟随重定向，不向下载请求转发 Key。如果真实响应使用另一 CDN，应由运维核验后添加精确域名，禁止通配放开下载。无轮询、无自动重试；单次 HTTP 生成与下载共享 `IMAGE_TIMEOUT_MS`，上限 300 秒。取消会终止本地 HTTP 等待和交付，不能承诺取消供应商已开始计费的远程任务（文档未提供任务取消接口）。

### 安装与验证

API 新增独立依赖清单 `services/api/package.json`（`sharp` 固定版本）；当前开发环境网络阻止安装，**尚未生成锁文件，合成像素测试尚未运行**。恢复联网后执行：

```sh
npm install --prefix services/api
LLM_API_KEY=mock-test-key LLM_BASE_URL=https://example.invalid/v1 LLM_MODEL=mock-test-model node --test tests/image-agent.test.cjs tests/llm-pipeline.test.cjs tests/creative-assets.test.cjs
```

以上 LLM 变量均为 mock 占位，测试只用替身请求，不调用收费接口。图片测试中的真实合成项在没有 `sharp` 时显式跳过；安装后应确认其通过。缺依赖本身会在调用收费 API 之前报 `IMAGE_PROCESSOR_NOT_INSTALLED`。当前 HTTP 路由测试覆盖真实 handler 和文件流，未绑定端口；实际启动服务器并读取资源的联调仍待运行权限恢复后执行。

### 资源生命周期与共享文件变更

生成文件默认保存在进程工作目录的 `tmp/generated-assets`，可用 `GENERATED_ASSET_DIR` 指定持久目录。随机文件名只包含内部生成 ID，读取拒绝符号链接和路径穿越。读取路由设置正确 MIME、`nosniff` 和一天缓存；生成失败自动清理本次已落盘文件。`storage.cjs` 导出 `cleanupGeneratedImages({maxAgeMs})` 供运维定期调用，默认删除超过 7 天的生成文件，不碰其他文件或链接；默认不自动调度，运维应结合文章保存周期设置保留时间，清理后的旧链接返回 404。

超出原建议目录范围的共享文件修改及理由：

- `services/api/src/server.cjs`：新增契约必需的受限图片读取路由，不修改已有公开 JSON 响应字段或主流程。
- `services/api/package.json`：声明服务端确定性合成依赖，避免把图像处理放到浏览器。
- `Dockerfile`：构建阶段安装服务端依赖，使现有部署具备 `sharp`；首次成功安装并生成锁文件后应提交锁文件并将部署安装切换为 `npm ci`。

### 工作台待验收

主流程调用、回退、取消传递和前端地址放行已实现，相关 mock 检查见 `tests/image-agent-integration.test.cjs`。仍需在本机安装正式依赖并配置图片 Key，重启 API 后通过工作台实际创作验证，包括生成资源 GET。真实 API 成果存在独立样例中，不等于工作台已经端到端验证。无实时进度流，取消不能保证供应商停止计费；自动抠图与自然场景融合仍待迭代。

本机工作台的配置来自根目录 `.env`，而不是 `.env.image-playground`。配置 `CREDIT_MEDIA_API_KEY` 或 `IMAGE_API_KEY`、`IMAGE_MODEL=gpt-image-2`、`IMAGE_TIMEOUT_MS=180000`、`IMAGE_MAX_IMAGES=1`。不得自动将 `LLM_API_KEY` 当作图片 Key。改配置后重启 API；浏览器只读取同源生成资源。
