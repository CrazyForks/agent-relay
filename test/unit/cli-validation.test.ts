import { describe, expect, test } from "bun:test";
import { validateProvider, type ValidationFetch } from "../../src/cli/validate-provider.ts";

const telegram = { IM_PROVIDER: "telegram", TELEGRAM_BOT_TOKEN: "123456:abcdefghijklmnopqrstuvwxyz123456789" };
const lark = { IM_PROVIDER: "lark", LARK_DOMAIN: "feishu", LARK_APP_ID: "cli_example", LARK_APP_SECRET: "very-private-app-secret" };
const json = (body: unknown): Response => Response.json(body);

describe("setup provider verification", () => {
  test("never sends credentials without explicit approval", async () => {
    let calls = 0;
    const fetch: ValidationFetch = async () => { calls++; throw new Error("Unexpected network request"); };
    const result = await validateProvider(telegram, { approved: false, fetch });
    expect(result.ok).toBe(false);
    expect(calls).toBe(0);
  });

  test("only uses Telegram getMe and getWebhookInfo with no redirects", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const fetch: ValidationFetch = async (url, init) => {
      calls.push({ url, init });
      return url.endsWith("/getMe") ? json({ ok: true, result: { id: 123456, is_bot: true } }) : json({ ok: true, result: { url: "" } });
    };
    const result = await validateProvider(telegram, { approved: true, fetch });
    expect(result.ok).toBe(true);
    expect(calls.map((call) => call.url)).toEqual([
      `https://api.telegram.org/bot${telegram.TELEGRAM_BOT_TOKEN}/getMe`,
      `https://api.telegram.org/bot${telegram.TELEGRAM_BOT_TOKEN}/getWebhookInfo`,
    ]);
    expect(calls.every(({ init }) => init.method === "POST" && init.redirect === "error" && !init.body && init.signal instanceof AbortSignal)).toBe(true);
    expect(JSON.stringify(result)).not.toContain(telegram.TELEGRAM_BOT_TOKEN);
  });

  test("reports a webhook conflict without exposing its secret URL or changing it", async () => {
    const calls: string[] = [];
    const fetch: ValidationFetch = async (url) => {
      calls.push(url);
      return url.endsWith("/getMe") ? json({ ok: true, result: { id: 1, is_bot: true } }) : json({ ok: true, result: { url: "https://private.example/secret-webhook-token" } });
    };
    const result = await validateProvider(telegram, { approved: true, fetch });
    expect(result.ok).toBe(false);
    expect(result.message).toContain("active webhook");
    expect(JSON.stringify(result)).not.toContain("secret-webhook-token");
    expect(calls).toHaveLength(2);
    expect(calls.some((url) => /getUpdates|setWebhook|deleteWebhook/.test(url))).toBe(false);
  });

  test("validates Telegram HTTP, API status, and bot identity", async () => {
    for (const response of [
      new Response("private remote error", { status: 401 }),
      json({ ok: false, description: telegram.TELEGRAM_BOT_TOKEN }),
      json({ ok: true, result: { id: 1, is_bot: false } }),
      json({ ok: true, result: { is_bot: true } }),
    ]) {
      let calls = 0;
      const result = await validateProvider(telegram, { approved: true, fetch: async () => { calls++; return response; } });
      expect(result.ok).toBe(false);
      expect(calls).toBe(1);
      expect(JSON.stringify(result)).not.toContain("private remote error");
      expect(JSON.stringify(result)).not.toContain(telegram.TELEGRAM_BOT_TOKEN);
    }
  });

  test("routes Lark and Feishu credentials only to the selected official region", async () => {
    for (const [region, host] of [["feishu", "open.feishu.cn"], ["lark", "open.larksuite.com"]] as const) {
      const calls: { url: string; init: RequestInit }[] = [];
      const result = await validateProvider({ ...lark, LARK_DOMAIN: region }, {
        approved: true,
        fetch: async (url, init) => {
          calls.push({ url, init });
          return json({ code: 0, tenant_access_token: "temporary-token-do-not-persist" });
        },
      });
      expect(result.ok).toBe(true);
      expect(calls).toHaveLength(1);
      expect(calls[0]?.url).toBe(`https://${host}/open-apis/auth/v3/tenant_access_token/internal`);
      expect(calls[0]?.init).toMatchObject({ method: "POST", redirect: "error", headers: { "Content-Type": "application/json" } });
      expect(JSON.parse(String(calls[0]?.init.body))).toEqual({ app_id: lark.LARK_APP_ID, app_secret: lark.LARK_APP_SECRET });
      expect(JSON.stringify(result)).not.toContain("temporary-token-do-not-persist");
      expect(result.warnings.join(" ")).toContain("permissions");
    }
  });

  test("rejects custom domains and malformed credentials before any fetch", async () => {
    let calls = 0;
    const fetch: ValidationFetch = async () => { calls++; throw new Error("Unexpected fetch"); };
    for (const env of [
      { ...lark, LARK_DOMAIN: "https://open.feishu.cn.evil.example" },
      { ...lark, LARK_DOMAIN: "https://open.feishu.cn" },
      { ...lark, LARK_APP_ID: "wrong" },
      { ...lark, LARK_APP_SECRET: "secret\nvalue" },
      { ...telegram, TELEGRAM_BOT_TOKEN: "123:bad/../../getUpdates" },
      { ...telegram, TELEGRAM_BOT_TOKEN: "" },
      { IM_PROVIDER: "unknown" },
    ]) expect((await validateProvider(env, { approved: true, fetch })).ok).toBe(false);
    expect(calls).toBe(0);
  });

  test("does not return remote response bodies or credential-bearing exceptions", async () => {
    for (const fetch of [
      async () => json({ code: 999, msg: lark.LARK_APP_SECRET }),
      async () => { throw new Error(`Request failed ${telegram.TELEGRAM_BOT_TOKEN} ${lark.LARK_APP_SECRET}`); },
      async () => new Response(lark.LARK_APP_SECRET),
    ]) {
      const result = await validateProvider(lark, { approved: true, fetch });
      expect(result.ok).toBe(false);
      expect(JSON.stringify(result)).not.toContain(lark.LARK_APP_SECRET);
      expect(JSON.stringify(result)).not.toContain(telegram.TELEGRAM_BOT_TOKEN);
    }
  });

  test("fails closed if fetch reports a redirect or changed URL", async () => {
    for (const property of ["redirected", "url"] as const) {
      const response = json({ code: 0, tenant_access_token: "secret" });
      Object.defineProperty(response, property, { value: property === "redirected" ? true : "https://evil.example" });
      const result = await validateProvider(lark, { approved: true, fetch: async () => response });
      expect(result.ok).toBe(false);
      expect(result.message).toContain("redirects are not allowed");
    }
  });

  test("times out even when an injected fetch ignores the abort signal", async () => {
    let signal: AbortSignal | undefined;
    const result = await validateProvider(lark, {
      approved: true, timeoutMs: 10,
      fetch: async (_url, init) => { signal = init.signal ?? undefined; return await new Promise<Response>(() => {}); },
    });
    expect(result.ok).toBe(false);
    expect(result.message).toContain("timed out");
    expect(signal?.aborted).toBe(true);
  });

  test("does not issue a second request after timing out", async () => {
    let calls = 0;
    let release!: (response: Response) => void;
    const result = await validateProvider(telegram, {
      approved: true, timeoutMs: 10,
      fetch: async () => { calls++; return await new Promise<Response>((resolve) => { release = resolve; }); },
    });
    expect(result.ok).toBe(false);
    release(json({ ok: true, result: { id: 1, is_bot: true } }));
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(calls).toBe(1);
  });
});
