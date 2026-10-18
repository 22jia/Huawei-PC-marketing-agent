# 魔搭创空间部署

本项目使用 Docker 类型创空间。容器内构建 Vite 前端，Nginx 在 `7860` 提供页面并代理 `/api` 和 `/health` 到 Node API 的 `3000` 端口。本地 `华为PC全板块深度知识库_v7` 会一同打包。

## 创建创空间

在魔搭新建创空间，部署 SDK 选择 `docker`，云资源选免费 CPU。Docker 创空间如要求账号开通，请按魔搭页面完成阿里云账号绑定与实名认证。仓库根目录必须有 `Dockerfile`。

将项目文件同步到创空间 Git 仓库的默认分支后，触发部署。不要对创空间远端使用 force push。

## 配置运行变量

- Secret：`LLM_API_KEY`
- 普通变量：`LLM_BASE_URL`、`LLM_MODEL`
- 普通变量：`LOCAL_KNOWLEDGE_BASE_PATH=/app/华为PC全板块深度知识库_v7`
- 普通变量：`PORT=3000`

无需配置 ima Key。不要将任何密钥写进 Dockerfile、前端代码或公开仓库。

## 部署验收

先检查 Docker build 日志，再检查 run 日志。应用启动后访问创空间页面，确认首页可加载，并验证 `/health`、图文生成、图片展示和客户辅助接口。若需保留客户跟进数据，需另外将存储目录迁移到创空间持久化目录或外部数据库；当前本地 JSON 文件会随实例重建而丢失。
