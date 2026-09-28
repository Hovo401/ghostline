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

const result = spawnSync(
  "pnpm",
  ["exec", "turbo", "run", "lint", "typecheck", "test", "build", "--filter=...[HEAD]"],
  { cwd: REPO_ROOT, stdio: "inherit" },
);

if (result.status !== 0) {
  process.stderr.write(
    "\ncheck:changed failed — fix the issues above (or explain to the user why not) before finishing.\n",
  );
  process.exit(2);
}
