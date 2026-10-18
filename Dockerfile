FROM node:22-bookworm-slim AS web-build
WORKDIR /build/apps/web
COPY apps/web/package.json apps/web/package-lock.json ./
RUN npm ci
COPY apps/web/ ./
RUN npm run build

FROM node:22-bookworm-slim
ENV NODE_ENV=production \
    PORT=3000 \
    LOCAL_KNOWLEDGE_BASE_PATH=/app/华为PC全板块深度知识库_v7
RUN apt-get update \
    && apt-get install -y --no-install-recommends nginx \
    && rm -rf /var/lib/apt/lists/* /etc/nginx/sites-enabled/default
WORKDIR /app
COPY services/api/ /app/services/api/
COPY scripts/start-api.cjs /app/scripts/start-api.cjs
COPY 华为PC全板块深度知识库_v7/ /app/华为PC全板块深度知识库_v7/
COPY 素材总清单_2026-10-18.md /app/素材总清单_2026-10-18.md
COPY --from=web-build /build/apps/web/dist/ /usr/share/nginx/html/
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY deploy/entrypoint.sh /app/deploy/entrypoint.sh
EXPOSE 7860
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:7860/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["sh", "/app/deploy/entrypoint.sh"]
