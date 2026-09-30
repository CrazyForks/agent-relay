#!/usr/bin/env node
import { createRequire } from "node:module";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const candidate = process.env.AGENT_RELAY_BUN_PATH?.trim();
let runtime = candidate;
if (!runtime) {
  try { runtime = require.resolve("bun/bin/bun.exe"); } catch { runtime = "bun"; }
}
const check = spawnSync(runtime, ["--version"], { encoding: "utf8", timeout: 5_000, windowsHide: true });
const version = check.stdout?.trim().match(/^(\d+)\.(\d+)\.(\d+)/);
if (check.error || check.status !== 0 || !version || Number(version[1]) < 1 || (Number(version[1]) === 1 && Number(version[2]) < 3)) {
  console.error("agent-relay needs Bun 1.3+. The official bun npm dependency may not have installed (for example --ignore-scripts/--omit=optional). Reinstall normally, or install Bun from https://bun.com/docs/installation and set AGENT_RELAY_BUN_PATH to its executable. No runtime is downloaded by this launcher.");
  process.exitCode = 1;
} else {
  const entry = fileURLToPath(new URL("../src/cli/main.ts", import.meta.url));
  const child = spawn(runtime, ["--no-env-file", "--no-install", entry, ...process.argv.slice(2)], {
    stdio: "inherit", windowsHide: false,
    env: { ...process.env, AGENT_RELAY_BUN_PATH: runtime, AGENT_RELAY_NODE_PATH: process.execPath },
  });
  const interrupt = () => { if (!child.killed) child.kill("SIGINT"); };
  const terminate = () => { if (!child.killed) child.kill("SIGTERM"); };
  process.on("SIGINT", interrupt);
  process.on("SIGTERM", terminate);
  child.on("error", () => { console.error("Could not start the agent-relay runtime. Check AGENT_RELAY_BUN_PATH or reinstall the package."); process.exitCode = 1; });
  child.on("exit", (code, signal) => {
    process.removeListener("SIGINT", interrupt);
    process.removeListener("SIGTERM", terminate);
    process.exitCode = code ?? (signal === "SIGINT" ? 130 : signal === "SIGTERM" ? 143 : 1);
  });
}
