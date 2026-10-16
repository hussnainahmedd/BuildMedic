FROM node:22.22.3-bookworm-slim AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts --no-audit --no-fund

COPY . .
RUN npm run build

FROM node:22.22.3-bookworm-slim AS runtime

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=4173

WORKDIR /app

RUN groupadd --system --gid 10001 buildmedic \
  && useradd --system --uid 10001 --gid 10001 --home-dir /app --no-create-home buildmedic

COPY --from=build --chown=buildmedic:buildmedic /app/dist ./dist
COPY --from=build --chown=buildmedic:buildmedic /app/server.mjs ./server.mjs

USER buildmedic

EXPOSE 4173

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node --input-type=module -e "fetch('http://127.0.0.1:' + process.env.PORT + '/health').then((response) => { if (!response.ok) process.exit(1); }).catch(() => process.exit(1))"

CMD ["node", "server.mjs"]
