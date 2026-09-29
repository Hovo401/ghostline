# deploy/ — Ghostline on the shared dev server

Ansible for running Ghostline natively on `diotek.pp.ua`, next to the apps
`homelab-infra` already runs there. Why this exists instead of
`compose.prod.yaml`: [docs/adr/0014](../docs/adr/0014-native-ansible-deploy-to-shared-dev-server.md).

## What it adds — and what it never touches

| Adds                                                                 | Uses (must already exist, from homelab-infra) |
| -------------------------------------------------------------------- | --------------------------------------------- |
| Postgres role + database `ghostline`, one `pg_hba` line              | PostgreSQL 18                                 |
| MinIO bucket `ghostline-media` (private) + user `ghostline` + policy | MinIO, `mc` alias `local`                     |
| Redis instance `ghostline-redis` on `127.0.0.1:6380`                 | —                                             |
| `/opt/ghostline` (releases, `shared/.env`, pm2 ecosystem)            | Node 24, pm2                                  |
| `/var/www/ghostline` (built SPA)                                     | —                                             |
| `/etc/nginx/conf.d/ghostline.diotek.pp.ua.conf` + Let's Encrypt cert | nginx.org, certbot, `/var/www/certbot`        |

It never edits `nginx.conf`, other `conf.d` files, `postgresql.conf`, ufw,
another app's database/bucket/user, or the default Redis on `:6379` (unless
this playbook is what installed it, in which case it's switched off).
`preflight` fails fast if anything from the right-hand column is missing.

Runtime shape: `ghostline-backend` (`:8002`) and `ghostline-worker` under the
existing pm2, heap-capped for the ~560 MiB box. Browser uploads/downloads go
to `https://minio.diotek.pp.ua` via presigned URLs.

## One-time setup

1. **DNS**: `ghostline.diotek.pp.ua` → the server's IP (certbot needs it).
2. **Secrets**:
   ```powershell
   cd deploy
   copy group_vars\vault.example.yml group_vars\vault.yml
   # fill it in, then:
   .\run.ps1 vault encrypt group_vars/vault.yml
   ```
3. **Deploy key for GitHub Actions** (a dedicated key, not your own):
   ```powershell
   ssh-keygen -t ed25519 -N '""' -C ghostline-deploy -f $env:USERPROFILE\.ssh\ghostline_deploy
   ```
   Put the `.pub` content into `deploy_ssh_public_key` in `group_vars/all.yml`.
4. **Provision** (dry run first — it shows every change before making it):
   ```powershell
   .\run.ps1 site.yml --check --diff
   .\run.ps1
   ```
   A first `--check` on a host without `redis-server` stops at the Redis
   directories (the `redis` group doesn't exist until the package is
   installed); that's expected — the real run creates it.
5. **GitHub repository secrets** (Settings → Secrets and variables → Actions):
   - `DEPLOY_SSH_KEY` — the private key from step 3
   - `DEPLOY_KNOWN_HOSTS` — output of `ssh-keyscan diotek.pp.ua`
6. **First release**: push to `dev`, or run the _Deploy (dev server)_ workflow
   manually from the Actions tab.
7. **LiveKit Cloud webhook** (so ended calls get finalized): project settings →
   Webhooks → `https://ghostline.diotek.pp.ua/api/v1/calls/livekit-webhook`.

## Day to day

- **Ship code**: push to `dev`. The workflow builds, uploads a release to
  `/opt/ghostline/releases/<sha>`, runs `prisma migrate deploy`, flips
  `current`, restarts pm2, then syncs the SPA. Last 3 releases are kept.
- **Change config/secrets**: edit `group_vars/`, run `.\run.ps1`. The env file
  is re-rendered and pm2 restarts.
- **A new backend env var**: add it to `roles/app/templates/env.j2` too —
  otherwise the backend fails its env validation on boot.
- **Rollback**: on the server,
  `ln -sfn /opt/ghostline/releases/<older-sha> /opt/ghostline/current && pm2 restart ghostline-backend ghostline-worker`
  (database migrations are not rolled back).
- **Logs**: `pm2 logs ghostline-backend` / `pm2 logs ghostline-worker`.

## Limits of this box

Postgres allows 20 connections host-wide, so `DATABASE_URL` carries
`connection_limit=2` per process. RAM is short: pm2 restarts a process that
crosses `*_max_memory`, and the host leans on swap — fine for a dev server,
not for real load.
