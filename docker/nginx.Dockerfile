# syntax=docker/dockerfile:1.7
#
# Prod-only. Builds the frontend SPA and serves it from the same nginx
# that terminates TLS and reverse-proxies /api and /socket.io to the
# backend (docker/nginx/prod.conf) — see compose.prod.yaml. Build context
# is the repo root.

FROM node:24-slim AS base
RUN corepack enable
WORKDIR /repo

FROM base AS pruner
RUN npm i -g turbo@^2
COPY . .
RUN turbo prune @ghostline/frontend --docker

FROM base AS build
COPY --from=pruner /repo/out/json/ .
RUN --mount=type=cache,id=pnpm-frontend,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile
COPY --from=pruner /repo/out/full/ .
RUN pnpm exec turbo run build --filter=@ghostline/frontend

FROM nginx:1.27-alpine AS prod
RUN rm -f /etc/nginx/conf.d/default.conf
# nginx's stock entrypoint envsubst's *.template -> conf.d/*.conf using
# $DOMAIN from the container environment on every start.
COPY docker/nginx/prod.conf.template /etc/nginx/templates/ghostline.conf.template
COPY --from=build /repo/apps/frontend/dist /usr/share/nginx/html
EXPOSE 80 443
