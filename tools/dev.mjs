#!/usr/bin/env node
// `pnpm dev` entry point — finds this machine's LAN IPv4 address so a phone
// on the same Wi-Fi can reach the dev stack over HTTPS (docs/adr/0009's
// LAN-dev addendum), then passes it to `docker compose` as `LAN_IP`: nginx's
// self-signed dev cert SAN, LiveKit's `node_ip` (ICE candidates), and the
// "open this on your phone" URL printed below all key off it.
//
// Picks the first non-internal IPv4 address on a real network adapter,
// skipping virtual/container adapters (Hyper-V's `vEthernet`, WSL, Docker's
// own default bridge range 172.16.0.0/12, VirtualBox) that Windows/Docker
// Desktop also report — none of those are reachable from a phone on the LAN.
// Falls back to 127.0.0.1 (today's behavior — dev only reachable from this
// machine) if no such adapter is found. Override with `LAN_IP` in `.env`.

import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { networkInterfaces } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const SKIP_ADAPTER = /vEthernet|WSL|Loopback|VirtualBox|Docker|veth|br-/i;

function isDockerDefaultBridgeRange(ip) {
  const [a, b] = ip.split(".").map(Number);
  return a === 172 && b >= 16 && b <= 31;
}

function detectLanIp() {
  for (const [name, addrs] of Object.entries(networkInterfaces())) {
    if (SKIP_ADAPTER.test(name)) continue;
    for (const addr of addrs ?? []) {
      if (addr.family !== "IPv4" || addr.internal) continue;
      if (isDockerDefaultBridgeRange(addr.address)) continue;
      return addr.address;
    }
  }
  return "127.0.0.1";
}

function readEnvOverride() {
  const envPath = path.join(REPO_ROOT, ".env");
  if (!existsSync(envPath)) return undefined;
  const match = readFileSync(envPath, "utf8").match(/^LAN_IP=(.+)$/m);
  return match?.[1]?.trim() || undefined;
}

const lanIp = readEnvOverride() ?? detectLanIp();
console.log(`[dev] LAN_IP=${lanIp}`);
if (lanIp !== "127.0.0.1") {
  console.log(`[dev] Открой на телефоне: https://${lanIp} (в той же Wi-Fi сети)`);
}

const child = spawn("docker", ["compose", "-f", "compose.dev.yaml", "up", "--watch"], {
  cwd: REPO_ROOT,
  stdio: "inherit",
  env: { ...process.env, LAN_IP: lanIp },
});

child.on("exit", (code) => {
  process.exit(code ?? 0);
});
