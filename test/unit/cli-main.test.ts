import { describe, expect, test } from "bun:test";
import { resolve } from "node:path";
import { parseArgs, redactCliError } from "../../src/cli/main.ts";

describe("CLI arguments", () => {
  test("defaults to foreground start and accepts explicit paths anywhere", () => {
    expect(parseArgs([], { AGENT_RELAY_CONFIG: "/private/config.json" })).toEqual({ command: "start", configPath: "/private/config.json", subcommand: undefined, envFile: undefined });
    expect(parseArgs(["--config", "/one/config.json", "init", "--env-file", "/project/.env"]).envFile).toBe("/project/.env");
    expect(parseArgs(["gateway", "status"]).subcommand).toBe("status");
    expect(parseArgs(["config", "path"]).command).toBe("config");
  });
  test("rejects typo/secret arguments without printing them", () => {
    expect(() => parseArgs(["--config"])).toThrow("requires a path");
    expect(() => parseArgs(["--token=my-secret"])).toThrow("Unknown option");
    expect(() => parseArgs(["init", "my-secret"])).toThrow("Too many");
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
  test("install-only options reject missing paths and use with other commands", () => {
    for (const option of ["--prefix", "--package"]) {
      expect(() => parseArgs(["install", option])).toThrow(`${option} requires a path`);
      expect(() => parseArgs(["install", option, "--config", "/private/config.json"])).toThrow(`${option} requires a path`);
      for (const args of [["start"], ["init"], ["doctor"], ["gateway", "status"], ["config", "path"], []]) {
        expect(() => parseArgs([...args, option, "local-path"])).toThrow("only valid with install");
      }
    }
    expect(() => parseArgs(["install", "init"])).toThrow("Too many arguments");
  });
  test("redacts known credentials and token-shaped strings from errors", () => {
    expect(redactCliError(new Error("url/123456:abcdefghijklmnopqrst?secret=supersecret app=cli_private"), { LARK_APP_SECRET: "supersecret", LARK_APP_ID: "cli_private" })).toBe("url/[redacted]?secret=[redacted] app=[redacted]");
  });
});
