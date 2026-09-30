import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

describe("installed CLI process boundaries", () => {
  test("Gateway runtime ignores a malformed cwd .env when launched by installed CLI", () => {
    const root = mkdtempSync(join(tmpdir(), "relay-gateway-env-"));
    try {
      writeFileSync(join(root, ".env"), "private-malformed-dotenv-content");
      const result = spawnSync(process.execPath, ["--no-env-file", resolve("src/gateway/main.ts")], {
        cwd: root, encoding: "utf8", timeout: 5_000,
        env: { ...process.env, HOME: root, USERPROFILE: root, AGENT_RELAY_DISABLE_DOTENV: "1", EXPERIMENTAL_RELAY_WORK_ENABLED: "false", EXPERIMENTAL_RELAY_GATEWAY_STATE_PATH: join(root, "gateway-state.json") },
      });
      expect(result.status).toBe(1);
      expect(result.stderr).toContain("Experimental relay work is disabled");
      expect(result.stderr).not.toContain("KEY=value");
      expect(result.stderr).not.toContain("private-malformed");
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
});
