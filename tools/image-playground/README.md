# 生图独立测试页

在正式仓库根目录运行：

```sh
node scripts/image-playground.cjs
```

然后打开 http://127.0.0.1:4318 。按 Ctrl+C 停止。默认端口占用时不会杀死其他服务；使用 `IMAGE_PLAYGROUND_PORT=4319 node scripts/image-playground.cjs` 换端口。

三种模式：

- **离线演示**：固定的代码绘制示意 PNG，不需要 Key、网络或 sharp，也不消耗额度，不验证 API。
- **直接生图**：调用真实媒体 API，检查提示词、模型与响应是否可用。不经过产品合成，也不能作为型号保真的官方产品图交付。
- **官方产品图合成**：选择知识库中的官方图，通过 `generateCreativeImages` 测试素材处理、背景生成、合成、保存和返回。需要安装 sharp；不透明素材保持完整卡片，不做自动抠图。固定正方形，暂不测试平台画幅和文案策划。

真实 API 的 Key 只在本机仓库根目录的 `.env.image-playground` 配置（已被现有 `.gitignore` 的 `.env.*` 排除），不要提交此文件，不要在聊天中发送 Key：

```env
CREDIT_MEDIA_API_KEY=你的黑客松Key
IMAGE_TIMEOUT_MS=120000
```

保存配置后重启测试服务。可用 `IMAGE_BASE_URL` 配置已有 provider 支持的 HTTPS 地址；若响应返回其他 CDN 的 URL，需要核验后在 `IMAGE_DOWNLOAD_HOSTS` 添加精确域名。

产品合成依赖：

```sh
npm install --prefix services/api
```

隔离说明：测试页仅监听 `127.0.0.1`，默认使用 4318 端口，只加载 `.env.image-playground`（不加载团队 `.env`），不启动或修改 `services/api/src/server.cjs`、`taskAgent` 或 `apps/web`。复用现有 provider、图片模块与只读素材服务。每次最多一张，一次只运行一项任务；真实生成由点击触发并消耗额度。测试图片存到忽略目录 `tmp/image-playground/`，不会进入 Git，不与正式输出目录共用。Key 不下发页面。停止等待会取消本地 HTTP 请求，无法保证供应商远程任务停止计费。

测试页跑通后，仍需主流程负责人完成正式前端接入、图片进度事件、输出校验和官方图回退，才能证明团队产品端到端跑通。
