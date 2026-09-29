# 0009. 1:1 calls run on a self-hosted LiveKit SFU, not raw WebRTC P2P + coturn

Status: accepted

## Context

FR-CALL (1:1 audio/video calling) needs media to actually connect and stay connected across the
network conditions real users sit behind: corporate NATs, carrier-grade NAT on mobile, and
networks that block everything but TCP/443. Two shapes were on the table: signal-only (this
backend just relays SDP/ICE over the existing Socket.IO gateway, with `RTCPeerConnection`
talking directly browser-to-browser once it's connected) plus a bare coturn TURN server for the
NAT-traversal fallback; or a full SFU that owns the media path.

Raw P2P + coturn is less infrastructure for the 1:1 case, but every piece of the "hard network"
requirement in the plan (adaptive bitrate under packet loss, an automatic TCP/443 fallback, ICE
restart on a network change, connection-quality signals to show the user) would have to be
hand-built on top of `RTCPeerConnection` and a TURN server we operate ourselves. None of that is
Ghostline-specific — it is exactly what an SFU already does, tested against real bad networks by
someone else.

## Decision

1:1 calls run their media through a self-hosted **LiveKit** SFU (`docker/livekit/livekit.yaml`,
proxied at `rtc.${DOMAIN}`), with LiveKit's built-in TURN server providing the UDP/TCP/TLS-443
fallback chain. The backend's `calls` module only handles lifecycle (ringing/active/ended/...)
over REST + the existing WS gateway (per docs/adr/0002) and mints short-lived LiveKit access
tokens; it never touches media.

## Alternatives considered

- **Raw WebRTC P2P + a bare coturn TURN server** — smaller footprint, but pushes adaptive
  bitrate, simulcast, ICE-restart-on-network-change, and TURN-over-TLS-443 fallback onto this
  codebase to build and maintain by hand. Also doesn't extend to a group call without a rewrite.
- **LiveKit Cloud (managed)** — zero infra to run, but calls (and their bandwidth) leave the
  self-hosted deployment this project is built around (docs/ARCHITECTURE.md's single-VPS
  topology), and it's a recurring per-minute cost instead of the project's existing
  self-host-everything posture. Self-hosting LiveKit is a drop-in swap later if that trade-off
  ever flips (same client SDK, same token format).
- **mediasoup / Janus (self-hosted, lower-level SFU toolkits)** — more control, but no batteries:
  building even 1:1-call-quality adaptive streaming and reconnection on top of either is
  substantially more code than adopting LiveKit's client SDK and its `adaptiveStream`/`dynacast`/
  reconnect handling.

## Consequences

A new stateful service to run and keep patched (`docker/livekit/livekit.yaml`, its own
prod-compose entry) with `network_mode: host` so its ~10k-port UDP RTC range doesn't need
individual Docker port mappings — the one prod service that isn't proxied through Docker's
default bridge network. Two new DNS records + TLS SANs (`rtc.${DOMAIN}`, `turn.${DOMAIN}`) and a
firewall opening for UDP 3478 + TCP/UDP 50000-60000 alongside the existing `80`/`443`/`8333`
(docs/adr/0008's precedent). In exchange, group calls later are a config change (LiveKit rooms
already support N participants) rather than a second migration off P2P.

Dev runs LiveKit off `docker/livekit/livekit.dev.yaml` (via the same `entrypoint.sh` template
substitution as prod, parameterized by `CONFIG_SRC`) instead of the bare `--dev` CLI flag, purely
so the LiveKit→backend webhook can be registered there too — otherwise a closed/crashed tab in
dev never told the backend a call ended until `departure_timeout` caught up, which was
indistinguishable from a stuck call during local testing.

**Client connects while still ringing, not after being answered.** `POST /calls` mints the
caller's LiveKit join token immediately (before the callee has responded), so the caller's
`Room` is already connected to the (empty) room for the whole ring — by the time the callee
answers, only the callee needs to join, cutting one full round-trip off perceived answer latency.
This means "I'm connected to the LiveKit room" is **not** the same signal as "the call is
active": the frontend only flips to the active UI once the room actually has the remote
participant in it (`RoomEvent.ParticipantConnected`, or already present on connect) *and* the
server-side call status is `active`. Conflating those two was the original bug this ADR's
addendum exists to record — a caller's own pre-join to an unanswered room was misread as the call
having started.

Every lifecycle mutation (`accept`/`decline`/`cancel`/`hangup`) is idempotent server-side
(`updateMany` guarded by the expected current status, per `calls.service.ts`), which is what lets
the frontend apply the user's action to local UI state *before* the request resolves — hangup
must feel instant, not wait on a network round trip — and retry safely on failure without a second
confirmation dialog or a duplicate side effect.

## Addendum: calling from a phone on the LAN in dev

Dev's original setup only worked between two browsers on the same PC: the backend hands out
`LIVEKIT_URL=ws://localhost:7880`, LiveKit's ports were published on `127.0.0.1` only, and
`node_ip: 127.0.0.1` told LiveKit to advertise `127.0.0.1` as its own ICE candidate address — none
of which a phone on the same Wi-Fi can dereference (to a phone, "localhost" means itself). Worse,
even with the network fixed, mobile Chrome/Safari refuse `getUserMedia` (mic/camera) on plain HTTP
for any host other than `localhost` — a secure context is mandatory, so `http://<LAN_IP>` was a
dead end regardless.

Three changes, all dev-only (prod already has a real domain + TLS + TURN via
`docker/livekit/livekit.yaml`'s `rtc.`/`turn.` subdomains):

1. **A self-signed HTTPS origin on the LAN.** A new one-shot `devcert` compose service generates
   a cert (SAN: `localhost`, `127.0.0.1`, the current `LAN_IP`) into a shared volume; nginx
   (`docker/nginx/dev.conf`) serves it on `:443` alongside the existing plain `:80`. A phone opens
   `https://<LAN_IP>`, accepts the one-time certificate warning, and gets a secure context.
2. **Signaling through the same origin.** nginx proxies `/rtc` (the path LiveKit's client SDK
   always appends) to the `livekit` service, so the frontend never needs a second host/port for
   signaling — `resolveLivekitUrl` (`apps/frontend/src/entities/call/room-options.ts`) rewrites
   the backend's loopback `LIVEKIT_URL` to whatever origin the page itself was loaded from.
3. **ICE candidates that resolve on the LAN.** `node_ip` in `livekit.dev.yaml` is now `${LAN_IP}`
   instead of `127.0.0.1`, and LiveKit's TURN/TCP (`7881`) and RTC media (`7882/udp`) ports are
   published on all interfaces, not just loopback — a phone's ICE checks can actually reach them.

`LAN_IP` is detected automatically by `tools/dev.mjs` (the new `pnpm dev` entry point) from the
host's network interfaces, skipping virtual/container adapters (Hyper-V, WSL, Docker's own bridge
range, VirtualBox); it falls back to `127.0.0.1` — today's PC-only behavior — if none is found, and
can be overridden by setting `LAN_IP` in `.env`. A closed firewall port (`443`/`7881`/`7882`) on
the dev machine is the most common remaining failure mode on Windows; see README.md's
`New-NetFirewallRule` snippet.

Web Push doesn't work over this self-signed LAN origin (browsers require a trusted cert for the
Push API) — that's expected and only affects local testing; prod has a real certificate.
