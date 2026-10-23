# 生图独立测试页

在正式仓库根目录运行：

```sh
node --watch-path=scripts --watch-path=services/api/src/agent/imageAgent scripts/image-playground.cjs
```

然后打开 http://127.0.0.1:4318 。源代码改动会自动重启服务，页面刷新即可；生成中不要编辑后端代码。按 Ctrl+C 停止。默认端口占用时不会杀死其他服务；使用 `IMAGE_PLAYGROUND_PORT=4319 node --watch-path=scripts --watch-path=services/api/src/agent/imageAgent scripts/image-playground.cjs` 换端口。

三种模式：

- **离线演示**：固定的代码绘制示意 PNG，不需要 Key、网络或 sharp，也不消耗额度，不验证 API。
- **直接生图**：调用真实媒体 API，检查提示词、模型与响应是否可用。不经过产品合成，也不能作为型号保真的官方产品图交付。
- **官方产品图合成**：先选择具体型号，再优先选择已检测透明像素的完整外观 PNG；不只凭扩展名判断透明。根据受众、场景、目标、平台和图片类型自动填写背景描述，可再手动调整。需要安装 sharp；透明图不需要背景移除 Key，不透明图仍需单独抠图服务。画幅由合成布局决定。

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
