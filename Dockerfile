# Сборка сайта и запуск сервера (Node 22, встроенный node:sqlite, без внешних зависимостей в рантайме).
FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
ENV VITE_BASE=/
RUN npx vite build

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000 BASE_PATH=/ STATIC_DIR=/app/dist DB_PATH=/data/tz-praktik.db
COPY --from=build /app/dist ./dist
COPY server ./server
COPY src/shared ./src/shared
COPY src/data/fixtures ./src/data/fixtures
COPY package.json ./
RUN mkdir -p /data && chown -R node:node /data
USER node
VOLUME /data
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s CMD node -e "fetch('http://127.0.0.1:3000/api/public/scenario').then(r=>process.exit(r.status<500?0:1)).catch(()=>process.exit(1))"
CMD ["node", "--experimental-strip-types", "--disable-warning=ExperimentalWarning", "server/index.ts"]
