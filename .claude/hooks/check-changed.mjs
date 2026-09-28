#!/usr/bin/env node
// Stop hook — see .claude/settings.json. Runs lint+typecheck+test+build
// for whatever changed since HEAD (turbo's `...[HEAD]` filter — includes
// uncommitted changes, not just commits). Exits 0 fast when nothing
// changed. A non-zero exit here is fed back to the agent as feedback, so
// it fixes the problem before actually stopping, instead of leaving the
// repo in a red state — see CLAUDE.md's Definition of Done.
import { spawnSync } from "node:child_process";
import path from "node:path";

const REPO_ROOT = path.resolve(import.meta.dirname, "..", "..");

// On Windows, pnpm is a .cmd shim: spawning it needs a shell (spawning
// the .cmd file directly throws EINVAL on this Node/Windows combo, and
// the bare "pnpm" name throws ENOENT without one). With shell: true,
// Node wants the whole command as one string, not a separate args array
// (passing both throws a deprecation warning — args aren't shell-escaped
// in that mode), so build one string here; every token is a static
// literal, nothing user-controlled is interpolated into it.
const command = "pnpm exec turbo run lint typecheck test build --filter=...[HEAD]";

const result = spawnSync(command, { cwd: REPO_ROOT, stdio: "inherit", shell: true });

if (result.error) {
  process.stderr.write(`\ncheck-changed hook couldn't run pnpm: ${result.error.message}\n`);
  process.exit(2);
}

if (result.status !== 0) {
  process.stderr.write(
    "\ncheck:changed failed — fix the issues above (or explain to the user why not) before finishing.\n",
  );
  process.exit(2);
}
