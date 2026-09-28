# 0005. nginx + certbot for TLS/reverse-proxy, not Caddy

Status: accepted

## Context

Prod needs a reverse proxy in front of the backend and the built SPA, with automatic
Let's Encrypt certificates (REQUIREMENTS.md §6.3 — HTTPS is required for mic/camera access, not
optional polish). Caddy gets automatic HTTPS with near-zero config and was the initial choice.

## Decision

nginx, serving the built SPA directly and reverse-proxying `/api` and `/socket.io` to the
backend, with a separate `certbot` container handling issuance/renewal via the webroot method
against a shared volume (`compose.prod.yaml`, `docker/nginx/prod.conf.template`).

## Alternatives considered

- **Caddy** — genuinely simpler for the common case (its automatic-HTTPS story has no
  certbot-sidecar step). Moved away from it because nginx's WebSocket proxying, config
  templating, and general behavior are better documented and more broadly battle-tested for
  this exact shape (SPA + API + WS behind one proxy) — lower risk for a project meant to be
  self-hosted by people who aren't necessarily infrastructure experts and will be debugging it
  themselves.
- **Traefik** — label-based config fits container orchestrators with frequent service churn;
  this is a fixed handful of services defined once in compose, where explicit config files are
  easier to read and modify than compose-label DSL.

## Consequences

Two extra moving parts nginx alone wouldn't need: the `certbot` container and the shared
`letsencrypt`/`certbot-webroot` volumes. Trade-off accepted for the "well-documented, easy to
debug" property. Known gap: nginx doesn't auto-reload after `certbot renew` issues a new cert —
see the comment in `compose.prod.yaml` and REQUIREMENTS.md's open questions.
