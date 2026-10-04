FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN npm ci --ignore-scripts
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/web apps/web
COPY scripts/build-web.mjs scripts/build-web.mjs
RUN npm run build -w @waypoint/shared && npm run build -w @waypoint/web

FROM nginx:1.28-alpine
COPY apps/web/nginx.conf /etc/nginx/templates/default.conf.template
COPY --chmod=0755 apps/web/docker-entrypoint/19-waypoint.envsh /docker-entrypoint.d/19-waypoint.envsh
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 80
