FROM node:24-bookworm-slim AS build
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN npm ci --ignore-scripts
COPY tsconfig.base.json ./
COPY apps/api apps/api
COPY packages/shared packages/shared
COPY prisma prisma
COPY scripts scripts
RUN node node_modules/@prisma/engines/scripts/postinstall.js && npm run db:generate && npm run build -w @waypoint/shared && npm run build -w @waypoint/api

FROM node:24-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=build --chown=node:node /app /app
USER node
EXPOSE 3001
CMD ["sh", "-c", "node apps/api/dist/production-preflight.js && npm run db:migrate && npm run db:seed && npm run seed:public-judge && node apps/api/dist/server.js"]
