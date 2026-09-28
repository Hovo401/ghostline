#!/usr/bin/env node
// PostToolUse hook (Edit|Write) — see .claude/settings.json.
// Formats the file that was just written and, for TS/TSX, lints it with
// that file's own package's eslint config (ESLint's flat config resolves
// eslint.config.mjs by walking up from the process cwd, not from the
// target file — so this has to `pnpm --filter <pkg> exec` into the right
// package directory, not just run `eslint <path>` from the repo root).
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

const REPO_ROOT = path.resolve(import.meta.dirname, "..", "..");

const PACKAGE_DIRS = [
  ["apps/backend", "@ghostline/backend"],
  ["apps/frontend", "@ghostline/frontend"],
  ["packages/contracts", "@ghostline/contracts"],
  ["packages/config", "@ghostline/config"],
];

function readStdinJson() {
  const raw = readFileSync(0, "utf8");
  return raw.trim() ? JSON.parse(raw) : {};
}

function main() {
  const input = readStdinJson();
  const filePath = input?.tool_input?.file_path;
  if (typeof filePath !== "string" || filePath.length === 0) return;

  const absPath = path.isAbsolute(filePath) ? filePath : path.resolve(REPO_ROOT, filePath);
  const relPath = path.relative(REPO_ROOT, absPath);
  if (relPath.startsWith("..")) return; // outside the repo — not ours to format

  if (!/\.(ts|tsx|mjs|cjs|js|json|css|md)$/.test(relPath)) return;
  if (
    relPath.includes("node_modules") ||
    relPath.includes("dist/") ||
    relPath.endsWith(".gen.ts")
  ) {
    return;
  }

  runBestEffort(["exec", "prettier", "--write", relPath]);

  if (!/\.(ts|tsx)$/.test(relPath)) return;

  const pkg = PACKAGE_DIRS.find(([dir]) => relPath.startsWith(dir + "/"));
  if (!pkg) return;
  const [dir, pkgName] = pkg;
  const pathInPkg = relPath.slice(dir.length + 1);

  try {
    execFileSync("pnpm", ["--filter", pkgName, "exec", "eslint", "--fix", pathInPkg], {
      cwd: REPO_ROOT,
      stdio: "pipe",
      encoding: "utf8",
    });
  } catch (error) {
    // Non-zero exit = eslint found (or couldn't auto-fix) a problem.
    // Print it so the agent sees it as tool feedback and fixes it now,
    // instead of it silently surfacing later in `pnpm check:changed`.
    process.stderr.write(error.stdout ?? "");
    process.stderr.write(error.stderr ?? "");
    process.exit(2);
  }
}

function runBestEffort(args) {
  try {
    execFileSync("pnpm", args, { cwd: REPO_ROOT, stdio: "pipe" });
  } catch {
    // formatting failures (e.g. a file prettier can't parse yet, mid-edit)
    // shouldn't block the agent — eslint below is the hard gate.
  }
}

main();
