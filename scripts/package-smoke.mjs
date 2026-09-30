import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const metadata = JSON.parse(readFileSync(join(repo, "package.json"), "utf8"));
const root = mkdtempSync(join(tmpdir(), "agent-relay-package-"));
const home = join(root, "home");
const cwd = join(root, "unrelated-cwd");
const prefix = join(root, "prefix");
mkdirSync(home); mkdirSync(cwd);
// Deliberately omit a globally available Bun; npm-installed runtime must suffice.
const cleanPath = (process.env.PATH || "").split(delimiter).filter((entry) => !existsSync(join(entry, process.platform === "win32" ? "bun.exe" : "bun"))).join(delimiter);
const env = { ...process.env, PATH: cleanPath, HOME: home, USERPROFILE: home, APPDATA: join(home, "AppData"), XDG_CONFIG_HOME: join(home, ".config"), npm_config_cache: join(root, "cache"), AGENT_RELAY_CONFIG: "", AGENT_RELAY_BUN_PATH: "" };
for (const key of Object.keys(env)) if (/^(TELEGRAM_|LARK_|CODEX_|IM_PROVIDER$|AGENT_PROVIDER$|ALLOWED_|WORKSPACE_ROOT$|SQLITE_PATH$|RELAY_|EXPERIMENTAL_RELAY_)/.test(key)) delete env[key];
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const npx = process.platform === "win32" ? "npx.cmd" : "npx";
function run(command, args, expected = 0, overrides = {}) {
  const result = spawnSync(command, args, { cwd, env, encoding: "utf8", timeout: 180_000, ...(process.platform === "win32" && command.endsWith(".cmd") ? { shell: true } : {}), ...overrides });
  assert.equal(result.error, undefined, `${command} failed: ${result.error?.message}`);
  assert.equal(result.status, expected, `${command} ${args[0]} exited ${result.status}: ${result.stdout}\n${result.stderr}`);
  return result.stdout || result.stderr;
}
try {
  const packed = JSON.parse(run(npm, ["pack", "--json", "--pack-destination", root], 0, { cwd: repo }).replace(/^.*?(?=\[)/s, ""));
  const tarball = join(root, packed[0].filename);
  const files = packed[0].files.map((file) => file.path);
  for (const file of files) assert(!/(^|\/)(\.env(?:\.|$)|\.data|logs|node_modules|\.git)(\/|$)|\.(?:sqlite|sqlite-wal|sqlite-shm|tgz)$/.test(file), `Forbidden packaged file: ${file}`);
  for (const file of ["bin/agent-relay.mjs", "bin/agent-relay-helper", "bin/agent-relay-helper.cmd", "src/cli/main.ts", "src/cli/helper.ts", "src/runtime/bootstrap.ts", "src/gateway/main.ts", "src/gateway/codex-launcher.ts"]) assert(files.includes(file), `Missing ${file}`);
  run(npm, ["install", "--global", "--prefix", prefix, "--no-audit", "--no-fund", tarball]);
  const executable = join(prefix, process.platform === "win32" ? "agent-relay.cmd" : "bin/agent-relay");
  assert(run(executable, ["--help"]).includes("Interactive private configuration"));
  assert(run(executable, ["--version"]).includes(metadata.version));
  assert(run(executable, ["config", "path"]).includes(join("agent-relay", "config.json")));
  assert(run(executable, ["init"], 1).includes("TTY"));
  assert(run(executable, ["start"], 1).includes("TTY"));
  assert(!existsSync(join(home, ".config/agent-relay/config.json")), "Non-TTY setup wrote config");
  writeFileSync(join(cwd, ".env"), "TELEGRAM_BOT_TOKEN=SHOULD_NOT_LOAD\nALLOWED_USER_IDS=SHOULD_NOT_LOAD\n");
  assert(run(executable, ["start"], 1).includes("TTY"), "Implicit cwd .env was loaded");
  const workspace = join(root, "workspace"); mkdirSync(workspace);
  const codex = join(root, "codex-stub");
  if (process.platform !== "win32") { writeFileSync(codex, '#!/bin/sh\nprintf "codex-cli 0.159.2\\n"\n'); chmodSync(codex, 0o755); }
  const configDir = join(home, "private"); mkdirSync(configDir, { mode: 0o700 });
  const config = join(configDir, "config.json");
  writeFileSync(config, JSON.stringify({ version: 1, env: { IM_PROVIDER: "telegram", TELEGRAM_BOT_TOKEN: "123456:fake-package-smoke-token", ALLOWED_USER_IDS: "123456", WORKSPACE_ROOT: workspace, SQLITE_PATH: join(root, "state/relay.sqlite"), CODEX_BIN: codex } }), { mode: 0o600 });
  if (process.platform !== "win32") {
    const report = run(executable, ["doctor", "--config", config]);
    assert(report.includes("0.159.2")); assert(!report.includes("fake-package-smoke-token"));
  }
  run(executable, ["gateway", "status", "--config", config]);
  // Load actual packaged native SQLite + runtime imports, without starting a bot/network connection.
  const installed = process.platform === "win32" ? join(prefix, "node_modules", metadata.name) : join(prefix, "lib/node_modules", metadata.name);
  const launcher = realpathSync(join(installed, "bin/agent-relay.mjs"));
  const runtime = join(installed, "node_modules/bun/bin/bun.exe");
  assert(existsSync(runtime), "Official npm Bun runtime missing");
  run(runtime, ["--no-env-file", "--no-install", "-e", `await import(${JSON.stringify(join(installed, "src/runtime/bootstrap.ts"))}); const {SQLiteStore}=await import(${JSON.stringify(join(installed, "src/storage/sqlite-store.ts"))}); const s=new SQLiteStore(':memory:');s.close();console.log('packaged runtime loaded');`]);
  assert(existsSync(launcher));
  const helper = join(installed, "bin", process.platform === "win32" ? "agent-relay-helper.cmd" : "agent-relay-helper");
  const helperOutput = run(helper, ["send-file", "placeholder.txt"], 1, { env: { ...env, AGENT_RELAY_BUN_PATH: runtime } });
  assert(helperOutput.includes("AGENT_RELAY_CONTROL_URL is not set"), "Installed helper could not run with bundled Bun");
  // A fresh npx cache, outside the source tree and global prefix, exercises real tarball execution.
  const npxHelp = run(npx, ["--yes", `--package=${tarball}`, "agent-relay", "--help"], 0, { env: { ...env, npm_config_cache: join(root, "npx-cache") } });
  assert(npxHelp.includes("Interactive private configuration"));
  const npxInit = run(npx, ["--yes", `--package=${tarball}`, "agent-relay", "init", "--config", join(configDir, "npx.json")], 1, { env: { ...env, npm_config_cache: join(root, "npx-cache") } });
  assert(npxInit.includes("TTY"));
  assert(!existsSync(join(configDir, "npx.json")));
  if (process.platform !== "win32") {
    assert(run(npx, ["--yes", `--package=${tarball}`, "agent-relay", "doctor", "--config", config], 0, { env: { ...env, npm_config_cache: join(root, "npx-cache") } }).includes("0.159.2"));
    assert(JSON.parse(readFileSync(config, "utf8")).env.TELEGRAM_BOT_TOKEN === "123456:fake-package-smoke-token");
  }
  console.log(`Package smoke passed: ${metadata.name}@${metadata.version}, ${files.length} allowlisted files, npm global and npx tarball outside checkout without global Bun. Config and source secrets excluded.`);
} finally { rmSync(root, { recursive: true, force: true }); }
