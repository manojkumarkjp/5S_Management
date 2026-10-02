# 5S Management System - API + web app
FROM node:20-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev || npm install --omit=dev

FROM node:20-bookworm-slim
ENV NODE_ENV=production PORT=3000 UPLOAD_DIR=/data/uploads
RUN apt-get update && apt-get install -y --no-install-recommends postgresql-client curl && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY src ./src
COPY db ./db
COPY scripts ./scripts
COPY public ./public
RUN mkdir -p /data/uploads && chown -R node:node /data /app
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s CMD curl -fsS http://localhost:3000/api/health || exit 1
ENTRYPOINT ["sh", "scripts/docker-entrypoint.sh"]
CMD ["node", "src/index.js"]
