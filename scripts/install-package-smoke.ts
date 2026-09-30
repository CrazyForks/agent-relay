import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, writeFileSync, chmodSync } from "node:fs";
import { join } from "node:path";

// Run by package-smoke.mjs using the actual npm-installed Bun, never a global Bun.
// Bun's PTY support is POSIX-only; Windows gets the non-interactive/package checks.
if (process.platform === "win32") throw new Error("This PTY smoke requires Linux or macOS.");
const [tarball, root] = process.argv.slice(2);
assert(tarball && root);
const home = join(root, "interactive home");
const cwd = join(root, "interactive cwd");
const data = join(root, "persistent data with spaces");
const prefix = join(data, "agent-relay", "npm");
const config = join(home, "private config", "config.json");
const workspace = join(root, "workspaces with spaces");
for (const path of [home, cwd, workspace]) mkdirSync(path, { recursive: true });
const codex = join(root, "codex stub with spaces");
writeFileSync(codex, '#!/bin/sh\nprintf "codex-cli 0.159.2\\n"\n'); chmodSync(codex, 0o755);
const env = { ...process.env, HOME: home, USERPROFILE: home, XDG_CONFIG_HOME: join(home, ".config"), XDG_DATA_HOME: data, npm_config_cache: join(root, "interactive npx cache"), AGENT_RELAY_CONFIG: "", AGENT_RELAY_BUN_PATH: "" };
const fakeToken = "123456:fake-private-install-smoke-token";
const base = ["npx", "--yes", `--package=${tarball}`, "agent-relay", "install", "--prefix", prefix, "--config", config];

async function session(args: string[], prompts: [string, string][], expected: number): Promise<string> {
  const remaining = [...prompts];
  let output = "";
  let pending = "";
  const process = Bun.spawn(args, {
    cwd, env,
    terminal: { cols: 160, rows: 40, data(terminal, data) {
      const chunk = Buffer.from(data).toString(); output += chunk; pending += chunk;
      const next = remaining[0];
      if (next && pending.includes(next[0])) {
        remaining.shift(); pending = ""; terminal.write(next[1]);
      }
    } },
  });
  const timeout = setTimeout(() => process.kill("SIGKILL"), 180_000);
  try {
    const code = await process.exited;
    assert.equal(code, expected, `PTY command exited ${code}, expected ${expected}. Last output: ${output.slice(-6000)}`);
    assert.equal(remaining.length, 0, `Unreached prompts: ${remaining.map(([prompt]) => prompt).join(", ")}`);
    assert(!output.includes(fakeToken), "A secret was echoed into the PTY transcript");
    return output;
  } finally { clearTimeout(timeout); process.terminal?.close(); }
}

const prompts: [string, string][] = [
  ["Install this version here, then open configuration? [Y/n]:", "y\r"],
  ["Select a number [1]:", "1\r"],
  ["Telegram bot token:", `${fakeToken}\r`],
  ["Allowed Telegram user IDs (comma-separated):", "123456\r"],
  ["Allowed Telegram chat IDs (optional, comma-separated; - clears restrictions; blank keeps saved IDs):", "\r"],
  ["Workspace root (absolute directory)", `${workspace}\r`],
  ["SQLite state file (absolute path)", "\r"],
  ["Codex binary (PATH command or executable path)", `${codex}\r`],
  ["Select a number [1]:", "\r"],
  ["Select a number [1]:", "\r"],
  ["Enable the optional localhost helper", "n\r"],
  ["Enable the experimental Gateway sharing flag?", "n\r"],
  ["Verify now?", "n\r"],
  ["Save this configuration? [y/N]:", "y\r"],
];
const first = await session([...base, "--package", tarball], prompts, 0);
assert(first.includes("Verified persistent installation:"));
assert(first.includes("Installation and configuration completed."));
assert(first.includes("PATH has not been changed"));
assert(existsSync(join(prefix, "bin", "agent-relay")));
const saved = readFileSync(config, "utf8");
assert.equal(JSON.parse(saved).env.TELEGRAM_BOT_TOKEN, fakeToken);
assert.equal(JSON.parse(saved).env.WORKSPACE_ROOT, workspace);
// The second invocation uses the same pinned installer, skips npm, and cancels safely.
const second = await session(base.filter((value, index) => value !== "--prefix" && base[index - 1] !== "--prefix"), [["Select a number [1]:", "1\r"], ["Telegram bot token [saved value; Enter to keep]:", "\x03"]], 130);
assert(second.includes("This version is already installed here"));
assert(!second.includes("Installing the persistent copy"));
assert(second.includes("software remains installed"));
assert.equal(readFileSync(config, "utf8"), saved, "Canceled setup altered saved credentials");
for (const profile of [".profile", ".bashrc", ".zshrc", ".npmrc"]) assert(!existsSync(join(home, profile)), `Installer created ${profile}`);
const executable = join(prefix, "bin", "agent-relay");
const verify = Bun.spawnSync([executable, "doctor", "--config", config], { cwd, env });
assert.equal(verify.exitCode, 0, verify.stderr.toString());
assert(verify.stdout.toString().includes("0.159.2"));
assert(!verify.stdout.toString().includes(fakeToken));
console.log("Interactive package smoke passed: clean npx tarball -> persistent npm install -> English wizard -> private config; repeat/cancel preserved credentials; executable works outside checkout with no global Bun and paths with spaces.");
