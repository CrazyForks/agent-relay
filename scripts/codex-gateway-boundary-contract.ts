import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

// A no-turn, no-login real-wire check. Run with the same pinned CODEX_BIN as the
// app-server protocol contract; neither the operator's home nor sessions are used.
const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const workDir = mkdtempSync(join(tmpdir(), "agent-relay-gateway-contract-"));
const codexHome = join(workDir, "home");
const runtimeDir = join(workDir, "runtime");
const statePath = join(workDir, "gateway-state.json");
mkdirSync(codexHome, { mode: 0o700 });
mkdirSync(runtimeDir, { mode: 0o700 });

async function main(): Promise<void> {
  const port = reservePortPair();
  const env = {
    ...process.env,
    CODEX_BIN: process.env.CODEX_BIN?.trim() || "codex",
    CODEX_HOME: codexHome,
    XDG_RUNTIME_DIR: runtimeDir,
    // Empty values override any repository .env values loaded by Gateway.
    OPENAI_API_KEY: "",
    CODEX_API_KEY: "",
    OPENAI_ACCESS_TOKEN: "",
    OPENAI_BASE_URL: "",
    EXPERIMENTAL_RELAY_WORK_ENABLED: "true",
    EXPERIMENTAL_RELAY_GATEWAY_PORT: String(port),
    EXPERIMENTAL_RELAY_GATEWAY_STATE_PATH: statePath,
  };
  const child = Bun.spawn([process.execPath, join(repoRoot, "src/gateway/main.ts")], {
    cwd: repoRoot, env, stdout: "ignore", stderr: "pipe",
  });
  const stderr = new Response(child.stderr).text();
  try {
    const deadline = Date.now() + 20_000;
    while (!existsSync(statePath) && child.exitCode === null && Date.now() < deadline) await Bun.sleep(100);
    if (!existsSync(statePath)) {
      const detail = child.exitCode !== null ? (await stderr).trim() : "startup timed out";
      throw new Error(`Isolated Gateway did not become ready: ${detail}`);
    }
    const state = JSON.parse(readFileSync(statePath, "utf8")) as { url?: string };
    assert.equal(state.url, `ws://127.0.0.1:${port}`);
    for (const [label, testPort] of [["frontend", port], ["backend", port + 1]] as const) {
      const base = `http://127.0.0.1:${testPort}`;
      assert.equal((await fetch(`${base}/readyz`)).status, 200, `${label}: native health`);
      assert.equal((await fetch(`${base}/readyz`, { headers: { Origin: "null" } })).status, 403, `${label}: null Origin`);
      assert.equal((await fetch(base, { headers: {
        Upgrade: "websocket", Connection: "Upgrade", "Sec-WebSocket-Version": "13",
        "Sec-WebSocket-Key": "dGhlIHNhbXBsZSBub25jZQ==", Origin: "https://unrelated.example",
      } })).status, 403, `${label}: browser WebSocket`);
      const userAgent = await nativeInitialize(`ws://127.0.0.1:${testPort}`, `agent-relay-${label}-contract`);
      const expected = process.env.CODEX_CONTRACT_EXPECT_VERSION?.trim();
      if (expected) assert.ok(userAgent.includes(`/${expected} `), `${label}: expected native Codex ${expected}`);
    }
    const frontend = `http://127.0.0.1:${port}`;
    assert.equal((await fetch(`${frontend}/v1/clients`, { headers: { Origin: "https://unrelated.example" } })).status, 403, "browser enumeration");
    assert.equal((await fetch(`${frontend}/v1/clients`)).status, 200, "native enumeration");
    assert.equal((await fetch(`${frontend}/v1/clients`, { headers: { Host: `attacker.example:${port}` } })).status, 403, "rebound Host enumeration");
    process.stdout.write("codex Gateway boundary contract passed (frontend/backend Origin rejection; native WebSocket initialize; protected client enumeration)\n");
  } finally {
    child.kill("SIGTERM");
    const forcedExit = setTimeout(() => child.kill("SIGKILL"), 5_000);
    try {
      await child.exited;
      await stderr;
    } finally {
      clearTimeout(forcedExit);
    }
  }
}

function reservePortPair(): number {
  for (let attempt = 0; attempt < 20; attempt++) {
    const first = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: () => new Response() });
    let second: ReturnType<typeof Bun.serve> | undefined;
    try {
      const port = first.port!;
      if (port >= 65535) continue;
      second = Bun.serve({ hostname: "127.0.0.1", port: port + 1, fetch: () => new Response() });
      return port;
    } catch {
      // A neighboring ephemeral port may already be occupied.
    } finally {
      first.stop(true);
      second?.stop(true);
    }
  }
  throw new Error("Unable to reserve two neighboring loopback ports for Gateway contract.");
}

async function nativeInitialize(url: string, name: string): Promise<string> {
  const socket = new WebSocket(url);
  return await new Promise<string>((resolve, reject) => {
    const timeout = setTimeout(() => { socket.close(); reject(new Error("Native WebSocket initialize timed out.")); }, 5_000);
    socket.addEventListener("open", () => socket.send(JSON.stringify({
      id: 1, method: "initialize", params: {
        clientInfo: { name, version: "0.0.0" },
        capabilities: { experimentalApi: true, requestAttestation: false, mcpServerOpenaiFormElicitation: false },
      },
    })));
    socket.addEventListener("error", () => { clearTimeout(timeout); reject(new Error("Native WebSocket connection failed.")); });
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data)) as { id?: unknown; result?: { userAgent?: unknown }; error?: unknown };
      if (message.id !== 1) return;
      clearTimeout(timeout);
      socket.close();
      if (message.error !== undefined || typeof message.result?.userAgent !== "string") {
        reject(new Error("Native WebSocket initialize returned an invalid response."));
      } else resolve(message.result.userAgent);
    });
  });
}

try {
  await main();
} finally {
  rmSync(workDir, { recursive: true, force: true });
}
