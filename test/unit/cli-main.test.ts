import { describe, expect, test } from "bun:test";
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
  test("redacts known credentials and token-shaped strings from errors", () => {
    expect(redactCliError(new Error("url/123456:abcdefghijklmnopqrst?secret=supersecret app=cli_private"), { LARK_APP_SECRET: "supersecret", LARK_APP_ID: "cli_private" })).toBe("url/[redacted]?secret=[redacted] app=[redacted]");
  });
});
