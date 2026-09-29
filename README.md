# Ghostline

A web messenger without a phone number — chats, groups, photos, files, voice messages, video
notes, disappearing messages. Runs in the browser, self-hosted, no ads or feed.

- [docs/REQUIREMENTS.md](docs/REQUIREMENTS.md) — full product spec.
- [docs/DESIGN-BRIEF.md](docs/DESIGN-BRIEF.md) — visual design, theme system.
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — how the pieces fit together.
- [docs/adr/](docs/adr/) — why, for the non-obvious decisions.
- [docs/tasks/BACKLOG.md](docs/tasks/BACKLOG.md) — what's built, what's next.
- [CLAUDE.md](CLAUDE.md) — instructions for AI agents working in this repo.

## Stack

NestJS (REST + Socket.IO + BullMQ) · Prisma/PostgreSQL · Redis (Valkey) · S3 (SeaweedFS) ·
React 19 + Vite + TanStack Router/Query + Zustand + Tailwind v4 · Docker Compose · pnpm
workspaces + Turborepo.

## Requirements

- Docker Desktop (or Docker Engine + Compose v2.20+ — `develop.watch` needs a recent Compose).
- Node.js 24 and pnpm 10 — only needed on the host for `pnpm gen`, editor tooling, and running
  Prisma commands directly; the app itself runs entirely in containers.

## Quickstart — development

```sh
cp .env.example .env        # edit the secrets before anything but local dev
pnpm install                # host-side tooling: eslint, prisma CLI, generators
pnpm dev                    # docker compose up --watch — builds everything, starts the stack
```

Open <http://localhost>. Editing `apps/backend/src` or `apps/frontend/src` hot-reloads inside
the containers (`docker compose watch` — see [ADR-0006](docs/adr/0006-docker-compose-watch-on-windows.md)
for why watch instead of bind mounts). Editing `packages/contracts/src` rebuilds it
automatically for both containers.

`pnpm dev` also prints a `https://<LAN_IP>` address (`tools/dev.mjs` detects your machine's LAN
IP) — open that on a phone on the same Wi-Fi to test calls device-to-device, accepting the
one-time self-signed certificate warning. See [ADR-0009](docs/adr/0009-livekit-sfu-not-p2p-coturn.md)'s
LAN-dev addendum for why HTTPS is required here. If the phone can't connect, Windows Firewall is
the usual cause — from an elevated PowerShell:

```powershell
New-NetFirewallRule -DisplayName "Ghostline dev (LAN)" -Direction Inbound -Action Allow `
  -Protocol TCP -LocalPort 443,7881
New-NetFirewallRule -DisplayName "Ghostline dev (LAN, RTC media)" -Direction Inbound -Action Allow `
  -Protocol UDP -LocalPort 7882
```

Other useful commands (see [CLAUDE.md](CLAUDE.md) for the full list):

```sh
pnpm dev:logs                # follow all container logs
pnpm dev:down                # stop the stack
pnpm db:migrate              # new Prisma migration (dev DB)
pnpm db:studio               # Prisma Studio
pnpm check                   # lint + typecheck + test + build + knip + jscpd + dependency-cruiser, whole repo
pnpm check:changed           # same, only for packages changed since HEAD — fast, what agents run
pnpm gen backend-module chats   # scaffold a new backend module (also: frontend-feature, entity, contract, theme)
```

Mailpit (caught outgoing email) is at <http://localhost:8025>. Prisma Studio and psql can reach
Postgres at `localhost:5432` (credentials from `.env`).

## Quickstart — production (self-hosting)

(The shared dev server, `ghostline.diotek.pp.ua`, doesn't use this — it's deployed natively
with Ansible next to other apps; see [deploy/README.md](deploy/README.md).)

You need a domain pointed at the server before starting — nginx's prod config needs a
certificate to bind `:443`, and certbot needs the domain to issue one.

```sh
cp .env.example .env
# Fill in real secrets, DOMAIN, CERTBOT_EMAIL. S3_PUBLIC_URL should be https://<DOMAIN>/s3.
pnpm prod:build
pnpm prod:up
```

This builds and starts: Postgres, Valkey, SeaweedFS (+ one-off bucket init), a one-off Prisma
migration, the backend, the worker, and nginx (TLS via Let's Encrypt/certbot, reverse-proxying
`/api` and `/socket.io`, serving the built frontend). See
[compose.prod.yaml](compose.prod.yaml)'s header comment for the first-deploy bootstrap wrinkle
(no cert yet on a brand new domain) and [ADR-0005](docs/adr/0005-nginx-not-caddy.md) for why
nginx+certbot instead of Caddy.

```sh
pnpm prod:down                                          # stop
docker compose -f compose.prod.yaml logs -f backend      # logs for one service
docker compose -f compose.prod.yaml exec nginx nginx -s reload   # after a cert renewal — see the compose file's comment
```

## Repository layout

```
apps/backend        NestJS — REST API + WebSocket gateway (main.ts) and the BullMQ worker (main.worker.ts)
apps/frontend        React + Vite + TanStack Router
packages/contracts   zod schemas + WS event types shared by both — the only place a wire shape is defined
packages/config      shared tsconfig / eslint / prettier config
tools/generators     plop generators (pnpm gen ...)
docker/              Dockerfiles, nginx configs, SeaweedFS/certbot scripts
docs/                requirements, design, architecture, ADRs, task backlog
.claude/             agents, skills, hooks, permissions for AI-assisted development
```

## License

Not yet finalized (AGPL-3.0 vs MIT — see `docs/REQUIREMENTS.md`'s open questions). A `LICENSE`
file lands with the open-source release ([BACKLOG.md](docs/tasks/BACKLOG.md)'s M7).
