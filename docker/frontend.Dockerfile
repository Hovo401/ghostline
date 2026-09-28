# syntax=docker/dockerfile:1.7
#
# `dev` stage backs compose.dev.yaml's `frontend` service (Vite dev
# server + HMR, watched by `docker compose watch`). The prod SPA is built
# and served by `docker/nginx.Dockerfile` instead of a stage here — in
# production there is one nginx container doing both TLS/reverse-proxy and
# static serving (see docs/REQUIREMENTS.md §7.2), not a separate frontend
# container. Build context is the repo root.

FROM node:24-slim AS base
RUN corepack enable
WORKDIR /repo

FROM base AS pruner
RUN npm i -g turbo@^2
COPY . .
RUN turbo prune @ghostline/frontend --docker

FROM base AS dev
ENV NODE_ENV=development
COPY --from=pruner /repo/out/json/ .
RUN --mount=type=cache,id=pnpm-frontend,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile
COPY --from=pruner /repo/out/full/ .
# Built once here, rebuilt on change by a `sync+exec` watch rule in
# compose.dev.yaml — see the matching comment in backend.Dockerfile.
RUN pnpm --filter @ghostline/contracts run build
WORKDIR /repo/apps/frontend
EXPOSE 5173
CMD ["pnpm", "run", "dev"]
