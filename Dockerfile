# syntax=docker/dockerfile:1

# 安装依赖，利用锁文件缓存构建层
FROM node:22-slim AS deps
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN npm install -g pnpm@10 && pnpm install --frozen-lockfile

# 构建 SvelteKit 并移除开发依赖
FROM deps AS builder
COPY . .
RUN pnpm run build && pnpm prune --prod

# 运行阶段与构建阶段使用相同系统，避免原生依赖不兼容
FROM node:22-slim AS runner
WORKDIR /app
ENV PORT=5050 \
  NODE_ENV=production \
  ADDON=false

COPY --from=builder --chown=node:node /app/build ./build
COPY --from=builder --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/server.js .
COPY --from=builder --chown=node:node /app/package.json .

# 新命名卷继承目录权限，允许非 root 用户保存仪表盘配置
RUN mkdir -p /app/data && chown node:node /app/data
USER node

EXPOSE 5050
CMD ["node", "server.js"]
