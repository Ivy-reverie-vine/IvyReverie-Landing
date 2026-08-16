# ---------- build stage ----------
FROM node:22-alpine AS build
WORKDIR /app

# 先装依赖，充分利用 Docker layer cache
COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

# ---------- runtime stage ----------
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3001 \
    UPSTREAM=http://api-enhanced:3000 \
    DATA_DIR=/data

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build /app/dist ./dist
COPY server ./server

# SQLite 数据卷（每个用户绑定的网易云 cookie 也存这里）
VOLUME ["/data"]
EXPOSE 3001

CMD ["node", "--disable-warning=ExperimentalWarning", "server/index.js"]
