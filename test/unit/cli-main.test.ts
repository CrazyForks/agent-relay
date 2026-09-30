import { afterEach, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import metadata from "../../package.json";
import { parseArgs, redactCliError } from "../../src/cli/main.ts";

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

function isolatedCli() {
  const root = mkdtempSync(join(tmpdir(), "relay-cli-test-")); roots.push(root);
  const home = join(root, "home"); mkdirSync(home);
  const config = join(home, "private", "config.json");
  const env: NodeJS.ProcessEnv = { ...process.env, HOME: home, USERPROFILE: home, APPDATA: join(home, "AppData"), XDG_CONFIG_HOME: join(home, ".config"), XDG_DATA_HOME: join(home, ".local", "share"), AGENT_RELAY_CONFIG: "" };
  for (const key of Object.keys(env)) if (/^(TELEGRAM_|LARK_|CODEX_|IM_PROVIDER$|AGENT_PROVIDER$|ALLOWED_|WORKSPACE_ROOT$|SQLITE_PATH$|RELAY_|EXPERIMENTAL_RELAY_)/.test(key)) delete env[key];
  const run = (args: string[]) => {
    const result = spawnSync(process.execPath, ["--no-env-file", "--no-install", fileURLToPath(new URL("../../src/cli/main.ts", import.meta.url)), ...args], { cwd: root, env, encoding: "utf8", timeout: 10_000 });
    expect(result.error).toBeUndefined();
    return { code: result.status, output: result.stdout + result.stderr };
  };
  return { root, home, config, run };
}

describe("CLI arguments", () => {
  test("defaults to foreground start and accepts explicit paths anywhere", () => {
    expect(parseArgs([], { AGENT_RELAY_CONFIG: "/private/config.json" })).toEqual({ command: "start", configPath: "/private/config.json", subcommand: undefined, envFile: undefined });
    expect(parseArgs(["--config", "/one/config.json", "install", "--env-file", "/project/.env"]).envFile).toBe("/project/.env");
    expect(parseArgs(["gateway", "status"]).subcommand).toBe("status");
    expect(parseArgs(["config", "path"]).command).toBe("config");
  });
  test("rejects typo/secret arguments without printing them", () => {
    expect(() => parseArgs(["--config"])).toThrow("requires a path");
    expect(() => parseArgs(["--token=my-secret"])).toThrow("Unknown option");
    expect(() => parseArgs(["install", "my-secret"])).toThrow("Too many");
    expect(() => parseArgs(["config", "show"])).toThrow("config path");
    expect(() => parseArgs(["gateway", "unknown"])).toThrow("usage");
  });
  test("install accepts explicit prefix and local package paths without splitting spaces", () => {
    expect(parseArgs(["--prefix", "persistent npm", "install", "--package", "packed release.tgz", "--config", "private config.json", "--env-file", "import settings.env"])).toEqual({
      command: "install", subcommand: undefined,
      prefix: resolve("persistent npm"), packageFile: resolve("packed release.tgz"),
      configPath: resolve("private config.json"), envFile: resolve("import settings.env"),
    });
    expect(parseArgs(["install"]).command).toBe("install");
  });
  test("init is an unknown command, including with configuration and install options", () => {
    for (const args of [["init"], ["init", "my-secret"], ["init", "--config", "/private/config.json"], ["init", "--env-file", "/private/settings.env"], ["init", "--prefix", "/private/prefix"]]) {
      expect(() => parseArgs(args)).toThrow("Unknown command");
    }
  });
  test("setup and configure do not expose replacement public aliases", () => {
    for (const command of ["setup", "configure"]) expect(() => parseArgs([command])).toThrow("Unknown command");
  });
  test("install-only options reject missing paths and use with other commands", () => {
    for (const option of ["--prefix", "--package"]) {
      expect(() => parseArgs(["install", option])).toThrow(`${option} requires a path`);
      expect(() => parseArgs(["install", option, "--config", "/private/config.json"])).toThrow(`${option} requires a path`);
      for (const args of [["start"], ["doctor"], ["gateway", "status"], ["config", "path"], []]) {
        expect(() => parseArgs([...args, option, "local-path"])).toThrow("only valid with install");
      }
    }
    expect(() => parseArgs(["install", "init"])).toThrow("Too many arguments");
  });
  test("redacts known credentials and token-shaped strings from errors", () => {
    expect(redactCliError(new Error("url/123456:abcdefghijklmnopqrst?secret=supersecret app=cli_private"), { LARK_APP_SECRET: "supersecret", LARK_APP_ID: "cli_private" })).toBe("url/[redacted]?secret=[redacted] app=[redacted]");
  });
});

describe("public CLI setup entry point", () => {
  test("help exposes install, and the package has no init script", () => {
    const { home, run } = isolatedCli();
    const result = run(["--help"]);
    expect(result.code).toBe(0);
    expect(result.output).toMatch(/^\s+install\s+/m);
    expect(result.output).not.toMatch(/\binit\b/);
    expect(result.output).not.toContain("first run offers setup");
    expect("init" in metadata.scripts).toBe(false);
    expect(readdirSync(home)).toEqual([]);
  });
  test("non-TTY init rejects before reading or changing configuration", () => {
    const { home, config, run } = isolatedCli();
    const missing = run(["init", "--config", config]);
    expect(missing.code).toBe(1);
    expect(missing.output).toContain("Unknown command");
    expect(missing.output).not.toContain("TTY");
    expect(readdirSync(home)).toEqual([]);
    mkdirSync(join(home, "private"), { mode: 0o700 });
    // Invalid private contents prove command rejection happens before any config read.
    const saved = "not-json: fake-private-cli-secret";
    writeFileSync(config, saved, { mode: 0o600 });
    const existing = run(["init", "--config", config]);
    expect(existing.code).toBe(1);
    expect(existing.output).toContain("Unknown command");
    expect(existing.output).not.toContain(saved);
    expect(readFileSync(config, "utf8")).toBe(saved);
    expect(readdirSync(join(home, "private"))).toEqual(["config.json"]);
    expect(readdirSync(home)).toEqual(["private"]);
  });
  test("start and the default command direct missing configuration to install without setup or writes", () => {
    const { home, config, run } = isolatedCli();
    for (const args of [["start"], []]) {
      const result = run([...args, "--config", config]);
      expect(result.code).toBe(1);
      expect(result.output).toContain("agent-relay install");
      expect(result.output).not.toContain("Select a number");
      expect(result.output).not.toContain("requires an interactive terminal");
      expect(result.output).not.toMatch(/\binit\b/);
      expect(existsSync(config)).toBe(false);
      expect(readdirSync(home)).toEqual([]);
    }
  });
});
