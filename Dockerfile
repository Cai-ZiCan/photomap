# syntax=docker/dockerfile:1
# 构建阶段：安装依赖并构建前端
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY server/package.json server/
COPY web/package.json web/
RUN npm ci --no-audit --no-fund
COPY web web
RUN npm run build -w web

# 运行阶段：仅生产依赖 + 构建产物 + 源码(server)
FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
COPY server/package.json server/
RUN npm ci --omit=dev --no-audit --no-fund --workspace server
COPY server server
COPY --from=build /app/web/dist web/dist

# 数据（SQLite 数据库 + 照片）挂载到卷，升级不丢数据
VOLUME /app/data
EXPOSE 8787
CMD ["npm", "start"]
