import type { RoomOptions } from "livekit-client";

/**
 * Bad-network resilience settings for the LiveKit `Room` (calls plan §Фаза 4):
 * `adaptiveStream`/`dynacast` only ship the resolution actually rendered,
 * simulcast + `vp8` gives every viewer a compatible fallback layer, and
 * `red`/`dtx` on audio survives packet loss (audio is prioritized over
 * video by LiveKit's bandwidth allocator whenever both must degrade).
 * `reconnectPolicy` is left to the client's default (`DefaultReconnectPolicy`,
 * exponential backoff up to its internal cap) — the installed
 * `livekit-client` version already does this, so there's nothing this app
 * needs to override.
 *
 * A pure function (not inlined where `new Room()` is called) so the
 * settings are unit-testable without constructing a real `Room`/`RTCPeerConnection`.
 */
export function buildRoomOptions(): RoomOptions {
  return {
    adaptiveStream: true,
    dynacast: true,
    publishDefaults: {
      videoCodec: "vp8",
      simulcast: true,
      red: true,
      dtx: true,
    },
  };
}

/**
 * Dev-only URL rewrite (docs/adr/0009's LAN-dev addendum). The backend's
 * `LIVEKIT_URL` (`.env.example`) is a loopback address in dev because there's
 * no per-deployment domain to bake in the way prod's `wss://rtc.<domain>` is.
 * A phone reading "localhost" means the phone itself, not the dev machine, so
 * when the server's URL is loopback, connect to wherever *this page* was
 * loaded from instead — nginx proxies `/rtc` to LiveKit on that same origin
 * (docker/nginx/dev.conf), so the page's own origin is always a valid
 * LiveKit signaling address in dev, whether that's `http://localhost` on the
 * PC or `https://<LAN_IP>` on a phone. Prod's real domain is never loopback
 * and passes through unchanged.
 */
export function resolveLivekitUrl(serverUrl: string, pageOrigin = window.location.origin): string {
  const url = new URL(serverUrl);
  if (url.hostname !== "localhost" && url.hostname !== "127.0.0.1") return serverUrl;

  const page = new URL(pageOrigin);
  const protocol = page.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${page.host}`;
}
