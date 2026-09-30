import { describe, expect, test } from "bun:test";
import { handleGatewayRequest, type ConnectedClient, type GatewayClientData } from "../../src/gateway/main.ts";
import { isAllowedGatewayRequest } from "../../src/gateway/request-boundary.ts";

const port = 18765;
const endpoint = `http://127.0.0.1:${port}`;

describe("Gateway loopback request boundary", () => {
  test.each(["http://127.0.0.1:18765", "http://localhost:18765", "http://[::1]:18765"])("allows originless native requests to %s", (url) => {
    expect(isAllowedGatewayRequest(new Request(url), port)).toBe(true);
  });

  test.each(["https://unrelated.example", "http://localhost:8080", "http://127.0.0.1:18765", "null", ""])("rejects supplied Origin %s on every public route", (origin) => {
    for (const path of ["/", "/v1/clients", "/healthz", "/readyz"]) {
      const request = new Request(`${endpoint}${path}`, { headers: { Origin: origin } });
      let upgraded = false;
      const response = handleGatewayRequest(request, { upgrade: () => { upgraded = true; return true; } }, port, new Map());
      expect(response?.status).toBe(403);
      expect(upgraded).toBe(false);
    }
  });

  test.each(["evil.example:18765", "127.0.0.1.evil.example:18765", "127.0.0.1:9999", "127.0.0.1:18765,evil.example"])("rejects untrusted Host %s for originless enumeration and upgrades", (host) => {
    for (const path of ["/", "/v1/clients"]) {
      const request = new Request(`${endpoint}${path}`, { headers: { Host: host } });
      expect(handleGatewayRequest(request, { upgrade: () => { throw new Error("must not upgrade"); } }, port, new Map())?.status).toBe(403);
    }
  });

  test("rejects non-loopback absolute request URLs even with a forged loopback Host", () => {
    expect(isAllowedGatewayRequest(new Request("http://evil.example:18765/", { headers: { Host: "127.0.0.1:18765" } }), port)).toBe(false);
  });

  test("keeps native client enumeration and health checks working", async () => {
    const client = { data: { id: "native", name: "codex", connectedAt: 1, threads: new Set(["thread-1"]) } } as unknown as ConnectedClient;
    const clients = new Map([["native", client]]);
    const response = handleGatewayRequest(new Request(`${endpoint}/v1/clients`), { upgrade: () => false }, port, clients);
    expect(await response?.json()).toEqual({ clients: [{ id: "native", name: "codex", connectedAt: 1, threads: ["thread-1"] }] });
    expect(handleGatewayRequest(new Request(`${endpoint}/readyz`), { upgrade: () => false }, port, clients)?.status).toBe(200);
  });

  test("accepts originless native WebSocket upgrades and rejects browser upgrades over a real loopback socket", async () => {
    const server = Bun.serve<GatewayClientData>({
      hostname: "127.0.0.1",
      port: 0,
      fetch: (request, server) => handleGatewayRequest(request, server, server.port!, new Map()),
      websocket: { message: () => undefined },
    });
    const url = `http://127.0.0.1:${server.port}`;
    try {
      const native = new WebSocket(url.replace("http:", "ws:"));
      await new Promise<void>((resolve, reject) => {
        native.addEventListener("open", () => resolve(), { once: true });
        native.addEventListener("error", () => reject(new Error("native WebSocket rejected")), { once: true });
      });
      native.close();
      const denied = await fetch(url, { headers: {
        Upgrade: "websocket", Connection: "Upgrade", "Sec-WebSocket-Version": "13",
        "Sec-WebSocket-Key": "dGhlIHNhbXBsZSBub25jZQ==", Origin: "https://unrelated.example",
      } });
      expect(denied.status).toBe(403);
      expect((await fetch(`${url}/v1/clients`, { headers: { Origin: "https://unrelated.example" } })).status).toBe(403);
      expect((await fetch(`${url}/v1/clients`)).status).toBe(200);
    } finally {
      server.stop(true);
    }
  });
});
