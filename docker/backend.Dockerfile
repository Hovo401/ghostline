# syntax=docker/dockerfile:1.7
#
# Builds the `backend` (HTTP + WebSocket) and `worker` (BullMQ) services —
# both run this same image, only the container `command:` differs
# (see compose.dev.yaml / compose.prod.yaml). Build context is the repo
# root (needed for the pnpm workspace + turbo).

FROM node:24-slim AS base
RUN corepack enable
WORKDIR /repo

# ---- pruner: isolate @ghostline/backend + the workspace deps it needs ----
FROM base AS pruner
RUN npm i -g turbo@^2
COPY . .
RUN turbo prune @ghostline/backend --docker

# ---- dev: full dev deps; source is kept in sync by `docker compose watch`.
#      Also backs the `worker` service — same image, `command:` differs.
#      Builds @ghostline/contracts once here because it's consumed as its
#      compiled dist (see packages/contracts/package.json `exports`);
#      compose.dev.yaml re-runs that build via a `sync+exec` watch rule
#      whenever contracts/src changes. ----
FROM base AS dev
ENV NODE_ENV=development
COPY --from=pruner /repo/out/json/ .
RUN --mount=type=cache,id=pnpm-backend,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile
COPY --from=pruner /repo/out/full/ .
RUN pnpm --filter @ghostline/contracts run build
RUN pnpm --filter @ghostline/backend run db:generate
WORKDIR /repo/apps/backend
EXPOSE 3000
CMD ["pnpm", "run", "dev"]

# ---- build: full install (incl. devDeps + prisma CLI), compile, then
#      snapshot a self-contained prod-only output with `pnpm deploy`.
#      compose.prod's one-off `migrate` service also targets THIS stage
#      (not `prod`) because `prisma migrate deploy` needs the prisma CLI,
#      which `--prod deploy` deliberately drops. ----
FROM base AS build
COPY --from=pruner /repo/out/json/ .
RUN --mount=type=cache,id=pnpm-backend,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile
COPY --from=pruner /repo/out/full/ .
RUN pnpm --filter @ghostline/backend run db:generate
RUN pnpm exec turbo run build --filter=@ghostline/backend
# --legacy: pnpm v10's default deploy requires inject-workspace-packages,
# which rewrites workspace deps as `file:` in the lockfile and breaks
# `turbo prune` (it then drops packages/config from the pruned context).
RUN pnpm --filter=@ghostline/backend --prod deploy --legacy /deploy
WORKDIR /repo/apps/backend
# deploy reinstalls node_modules, so the client generated above isn't in /deploy
RUN pnpm exec prisma generate --schema=/deploy/prisma/schema.prisma

# ---- prod: minimal runtime. ffmpeg/sharp are here (not only in a
#      hypothetical worker-only image) because backend and worker share
#      this image — see compose.prod.yaml. ----
FROM node:24-slim AS prod
RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg \
    && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /deploy ./
USER node
EXPOSE 3000
# nest's SWC builder keeps the `src/` segment in its output path
CMD ["node", "dist/src/main.js"]
