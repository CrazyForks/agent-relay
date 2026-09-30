import type { Env } from "../runtime/config-types.ts";

export interface ProviderValidationResult {
  ok: boolean;
  message: string;
  warnings: string[];
}

export type ValidationFetch = (input: string, init: RequestInit) => Promise<Response>;

export interface ProviderValidationOptions {
  /** A caller must obtain informed consent before transmitting credentials. */
  approved: boolean;
  fetch?: ValidationFetch;
  timeoutMs?: number;
}

export const TELEGRAM_API_ORIGIN = "https://api.telegram.org";
export const LARK_API_ORIGINS = {
  feishu: "https://open.feishu.cn",
  lark: "https://open.larksuite.com",
} as const;

export function validTelegramToken(value: string): boolean {
  return /^[1-9]\d*:[A-Za-z0-9_-]{20,}$/.test(value) && value.length <= 512;
}

export function validLarkAppId(value: string): boolean {
  return /^cli_[A-Za-z0-9]+$/.test(value) && value.length <= 256;
}

export function validLarkSecret(value: string): boolean {
  return value.length > 0 && value.length <= 4096 && !/[\s\u0000-\u001f\u007f]/.test(value);
}

function result(ok: boolean, message: string, warnings: string[] = []): ProviderValidationResult {
  return { ok, message, warnings };
}

function object(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

/** Read only. Never polls updates, changes webhooks, or logs remote error data. */
export async function validateProvider(env: Env, options: ProviderValidationOptions): Promise<ProviderValidationResult> {
  if (options.approved !== true) {
    return result(false, "Credential verification skipped; no credentials were sent.");
  }
  const fetcher = options.fetch ?? globalThis.fetch;
  const requestedTimeout = options.timeoutMs ?? 10_000;
  const timeoutMs = Number.isFinite(requestedTimeout) && requestedTimeout > 0 ? Math.min(requestedTimeout, 30_000) : 10_000;
  const controller = new AbortController();
  let timedOut = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const request = async (url: string, init: RequestInit = {}): Promise<Record<string, unknown> | undefined> => {
    if (controller.signal.aborted) throw new Error("Verification cancelled");
    const response = await fetcher(url, { ...init, redirect: "error", signal: controller.signal });
    if (controller.signal.aborted) throw new Error("Verification cancelled");
    // Also fail closed for injected/custom fetch implementations that follow redirects.
    if (response.redirected || (response.url && response.url !== url)) throw new Error("Unexpected response origin");
    if (!response.ok) return undefined;
    return object(await response.json());
  };

  const verify = async (): Promise<ProviderValidationResult> => {
    if (env.IM_PROVIDER === "telegram") {
      const token = env.TELEGRAM_BOT_TOKEN ?? "";
      if (!validTelegramToken(token)) return result(false, "The Telegram bot token format is invalid.");
      const bot = await request(`${TELEGRAM_API_ORIGIN}/bot${token}/getMe`, { method: "POST" });
      const identity = object(bot?.result);
      if (bot?.ok !== true || identity?.is_bot !== true || typeof identity.id !== "number") {
        return result(false, "Telegram could not verify this bot token. Check it in BotFather and try again.");
      }
      const webhook = await request(`${TELEGRAM_API_ORIGIN}/bot${token}/getWebhookInfo`, { method: "POST" });
      const details = object(webhook?.result);
      if (webhook?.ok !== true || typeof details?.url !== "string") {
        return result(false, "Telegram credentials are valid, but the webhook status could not be checked.");
      }
      if (details.url.length > 0) {
        return result(false, "This Telegram bot has an active webhook and cannot use relay polling. Use a separate bot or review the existing integration before changing its webhook.", ["No webhook was changed. Do not start polling with this bot until the conflict is resolved."]);
      }
      return result(true, "Telegram credentials verified; no active webhook.", ["This does not verify your user/chat allowlists or whether another process is polling this bot."]);
    }

    if (env.IM_PROVIDER === "lark") {
      const domain = env.LARK_DOMAIN;
      if (domain !== "feishu" && domain !== "lark") {
        return result(false, "Verification only supports the official Feishu or Lark region. No credentials were sent.");
      }
      const appId = env.LARK_APP_ID ?? "";
      const secret = env.LARK_APP_SECRET ?? "";
      if (!validLarkAppId(appId) || !validLarkSecret(secret)) {
        return result(false, "The Lark/Feishu app ID or app secret format is invalid.");
      }
      const body = await request(`${LARK_API_ORIGINS[domain]}/open-apis/auth/v3/tenant_access_token/internal`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ app_id: appId, app_secret: secret }),
      });
      if (body?.code !== 0 || typeof body.tenant_access_token !== "string" || !body.tenant_access_token) {
        return result(false, "Lark/Feishu could not verify these app credentials. Check the app and selected region.");
      }
      // The issued tenant token is intentionally discarded and never persisted.
      return result(true, "Lark/Feishu app credentials verified.", ["Credentials alone do not verify bot capability, permissions, message/card subscriptions, publication, or app availability."]);
    }
    return result(false, "Select Telegram or Lark/Feishu before verifying credentials.");
  };

  try {
    return await Promise.race([
      verify(),
      new Promise<ProviderValidationResult>((resolve) => {
        timer = setTimeout(() => {
          timedOut = true;
          controller.abort();
          resolve(result(false, "Credential verification timed out. Check your network and try again."));
        }, timeoutMs);
      }),
    ]);
  } catch {
    // Fetch errors can contain the Telegram token URL or a reflected secret.
    // Never surface the exception, HTTP body, headers, or URL to the terminal.
    return result(false, timedOut
      ? "Credential verification timed out. Check your network and try again."
      : "Credential verification failed. Check your network and credentials; redirects are not allowed.");
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
