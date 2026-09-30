import { execFile } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, resolve, sep } from "node:path";
import { promisify } from "node:util";
import type { Env } from "../runtime/config-types.ts";
import { codexVersionSpawnCommand, isCodexVersionSupported, parseCodexVersion } from "../providers/agents/codex/spawn.ts";
import { TerminalWizardUI, WizardCancelledError, terminalText, type WizardUI } from "./prompts.ts";
import { LARK_API_ORIGINS, validateProvider, validLarkAppId, validLarkSecret, validTelegramToken, type ProviderValidationResult } from "./validate-provider.ts";

export type { WizardUI } from "./prompts.ts";

export interface CodexDetection {
  found: boolean;
  path?: string;
  version?: string;
  compatible?: boolean;
}

export interface WizardOptions {
  ui?: WizardUI;
  initial?: Env;
  configPath: string;
  cwd?: string;
  validateProvider?: (env: Env, options: { approved: boolean }) => Promise<ProviderValidationResult>;
  detectCodex?: (binary: string, cwd: string) => Promise<CodexDetection>;
}

const executeFile = promisify(execFile);

export async function detectCodex(binary: string, cwd: string): Promise<CodexDetection> {
  const path = typeof Bun !== "undefined" ? Bun.which(binary, { cwd }) ?? undefined : undefined;
  try {
    const command = codexVersionSpawnCommand(path ?? binary);
    const { stdout } = await executeFile(command.command, command.args, {
      cwd, timeout: 5_000, maxBuffer: 8192, windowsHide: true,
      ...(command.windowsVerbatimArguments ? { windowsVerbatimArguments: true } : {}),
    });
    const version = parseCodexVersion(stdout);
    return {
      found: true,
      ...(isAbsolute(command.resolvedCodexBin) ? { path: command.resolvedCodexBin } : {}),
      ...(version ? { version, compatible: isCodexVersionSupported(version) } : {}),
    };
  } catch {
    return { found: false };
  }
}

type AllowlistKind = "telegram-user" | "telegram-chat" | "lark-user" | "lark-chat";

/** IDs remain strings, avoiding precision loss and normalizing pasted CSV lists. */
export function normalizeAllowlist(value: string, kind: AllowlistKind, optional = false): string | undefined {
  if (!value.trim() || optional && value.trim() === "-") return optional ? "" : undefined;
  const parts = value.split(",").map((part) => part.trim());
  const valid = (part: string): boolean => {
    if (kind === "telegram-user") return /^[1-9]\d*$/.test(part) && Number.isSafeInteger(Number(part));
    if (kind === "telegram-chat") return /^-?[1-9]\d*$/.test(part) && Number.isSafeInteger(Number(part));
    return (kind === "lark-user" ? /^ou_[A-Za-z0-9_-]+$/ : /^oc_[A-Za-z0-9_-]+$/).test(part);
  };
  return parts.every(valid) ? [...new Set(parts)].join(",") : undefined;
}

function absolutePath(value: string, cwd: string): string | undefined {
  if (!value.trim() || /[\u0000-\u001f\u007f]/.test(value)) return undefined;
  const path = value.trim();
  const expanded = path === "~" ? homedir() : path.startsWith(`~${sep}`) || path.startsWith("~/") ? join(homedir(), path.slice(2)) : path;
  return resolve(cwd, expanded);
}

async function askValid(ui: WizardUI, message: string, defaultValue: string | undefined, validator: (value: string) => string | undefined, error: string, secret = false): Promise<string> {
  for (;;) {
    const value = (await ui.text(message, { ...(defaultValue ? { defaultValue } : {}), secret })).trim();
    const parsed = validator(value);
    if (parsed !== undefined) return parsed;
    ui.write(error);
  }
}

function count(value: string | undefined): number {
  return value ? value.split(",").length : 0;
}

/** Gather settings only. The caller persists the returned Env after approval. */
export async function runWizard(options: WizardOptions): Promise<Env | undefined> {
  const ui = options.ui ?? new TerminalWizardUI();
  const initial = options.initial ?? {};
  const env: Env = { ...initial };
  const cwd = resolve(options.cwd ?? process.cwd());
  const configPath = resolve(cwd, options.configPath);
  try {
    ui.write("agent-relay setup\nThis grants allowlisted chat users access to a local Codex agent. Use a trusted machine and only allow people you trust.\nSecrets are masked. Do not share credentials, configuration files, private IDs, or raw debug logs. Ctrl+C cancels without saving.");
    const provider = await ui.choose("Messaging provider", [
      { value: "telegram", label: "Telegram" },
      { value: "lark", label: "Feishu / Lark" },
    ] as const, initial.IM_PROVIDER === "lark" ? "lark" : "telegram");
    const sameProvider = provider === (initial.IM_PROVIDER ?? "telegram");
    env.IM_PROVIDER = provider;
    env.AGENT_PROVIDER = "codex";
    delete env.MESSAGING_PROVIDER;

    if (provider === "telegram") {
      delete env.LARK_APP_ID;
      delete env.LARK_APP_SECRET;
      delete env.LARK_DOMAIN;
      ui.write("Open the official BotFather: https://t.me/BotFather\nSend /newbot, choose a name and username, then copy its token. Keep the token private.\nEnter your numeric Telegram user ID manually from a trusted source. Usernames are not IDs; do not send your token to an ID-lookup bot.\nFor groups, add the bot and supply the numeric group chat ID (not a forum topic ID). The allowlist must contain each permitted person's user ID. Keep privacy mode enabled for the first private-chat test.\nIn a group, /relay@bot_username works with privacy enabled. Arbitrary @mentions and media captions may not arrive. If you need that workflow, deliberately choose BotFather /setprivacy -> Disable and re-add the bot: Telegram will then deliver all group messages to the bot, although Relay ignores unmentioned group traffic. Setup does not change this setting.");
      env.TELEGRAM_BOT_TOKEN = await askValid(ui, "Telegram bot token", initial.TELEGRAM_BOT_TOKEN,
        (value) => validTelegramToken(value) ? value : undefined, "Enter the bot token from BotFather (numeric ID, colon, secret).", true);
      if (env.TELEGRAM_BOT_TOKEN !== initial.TELEGRAM_BOT_TOKEN) delete env.TELEGRAM_BOT_USERNAME;
      env.ALLOWED_USER_IDS = await askValid(ui, "Allowed Telegram user IDs (comma-separated)", sameProvider ? initial.ALLOWED_USER_IDS : undefined,
        (value) => normalizeAllowlist(value, "telegram-user"), "Enter at least one positive numeric Telegram user ID; usernames and wildcard access are not supported.");
      env.ALLOWED_CONVERSATION_IDS = await askValid(ui, "Allowed Telegram chat IDs (optional, comma-separated; - clears restrictions; blank keeps saved IDs)", sameProvider ? initial.ALLOWED_CONVERSATION_IDS : undefined,
        (value) => normalizeAllowlist(value, "telegram-chat", true), "Use comma-separated numeric chat IDs, including a leading minus for groups, or leave blank.");
    } else {
      delete env.TELEGRAM_BOT_TOKEN;
      delete env.TELEGRAM_BOT_USERNAME;
      const region = await ui.choose("App region (must match the app's developer console)", [
        { value: "feishu", label: "Feishu (China): open.feishu.cn" },
        { value: "lark", label: "Lark (international): open.larksuite.com" },
      ] as const, initial.LARK_DOMAIN === "lark" ? "lark" : "feishu");
      env.LARK_DOMAIN = region;
      ui.write(`Open the official developer console: ${LARK_API_ORIGINS[region]}/app\nCreate a self-built app, enable its Bot capability, and copy the App ID and App Secret.\nGrant im:message.p2p_msg:readonly (direct messages), im:message.group_at_msg:readonly (group mentions), and im:message:send_as_bot. For attachments, add im:resource (uploads) and im:message:readonly (incoming attachments); for status reactions add im:message.reactions:write_only.\nFirst save this configuration and start agent-relay so a long-lived connection is online. If the bot cannot connect before its first publication, publish the initial bot capability/permissions version first. Then configure BOTH Event subscriptions and Callback subscriptions to use long connections in the console; no public callback URL is needed. Add im.message.receive_v1 and card.action.trigger. The console may require the running connection before it can save.\nPublish or republish the app version and add intended users to its availability scope. Bot capability takes effect after publication. Add the bot to groups and mention it when sending messages.\nUser allowlists use sender open_id (ou_...) from THIS app, not employee/user_id or union_id; the same person's open_id differs across apps. Conversation allowlists use chat_id (oc_...).\nFor your open_id, open ${LARK_API_ORIGINS[region]}/api-explorer, select THIS app, choose Send message, select open_id and Quick copy open_id, then select yourself and copy the member ID. You do not need to send a message. Enter IDs manually; setup does not read your contacts or chat history.`);
      env.LARK_APP_ID = await askValid(ui, "App ID", initial.LARK_APP_ID,
        (value) => validLarkAppId(value) ? value : undefined, "Enter the self-built app ID beginning with cli_.");
      env.LARK_APP_SECRET = await askValid(ui, "App Secret", initial.LARK_APP_SECRET,
        (value) => validLarkSecret(value) ? value : undefined, "Enter the app secret without spaces or control characters.", true);
      env.ALLOWED_USER_IDS = await askValid(ui, "Allowed user open_ids (comma-separated)", sameProvider ? initial.ALLOWED_USER_IDS : undefined,
        (value) => normalizeAllowlist(value, "lark-user"), "Enter at least one sender open_id beginning with ou_.");
      env.ALLOWED_CONVERSATION_IDS = await askValid(ui, "Allowed chat_ids (optional, comma-separated; - clears restrictions; blank keeps saved IDs)", sameProvider ? initial.ALLOWED_CONVERSATION_IDS : undefined,
        (value) => normalizeAllowlist(value, "lark-chat", true), "Use comma-separated chat_ids beginning with oc_, or leave blank.");
    }

    env.WORKSPACE_ROOT = await askValid(ui, "Workspace root (absolute directory)", absolutePath(initial.WORKSPACE_ROOT ?? join(homedir(), "workspaces"), cwd),
      (value) => {
        const path = absolutePath(value, cwd);
        if (!path) return undefined;
        return !existsSync(path) || statSync(path).isDirectory() ? path : undefined;
      }, "Choose a directory path. Relative paths are resolved from the setup directory.");
    env.SQLITE_PATH = await askValid(ui, "SQLite state file (absolute path)", absolutePath(initial.SQLITE_PATH ?? join(dirname(configPath), "state", "agent-relay.sqlite"), cwd),
      (value) => {
        const path = absolutePath(value, cwd);
        if (!path || existsSync(path) && !statSync(path).isFile()) return undefined;
        return path;
      }, "Choose a file path for SQLite state, not a directory.");
    const binary = await askValid(ui, "Codex binary (PATH command or executable path)", initial.CODEX_BIN ?? "codex",
      (value) => value && !/[\u0000-\u001f\u007f]/.test(value) ? value : undefined, "Enter the Codex executable name or path, without command-line arguments.");
    env.CODEX_BIN = isAbsolute(binary) || binary.includes("/") || binary.includes("\\") ? absolutePath(binary, cwd)! : binary;
    const codex = await (options.detectCodex ?? detectCodex)(env.CODEX_BIN, cwd);
    if (codex.found) {
      if (codex.path) env.CODEX_BIN = codex.path;
      ui.write(codex.compatible === false
        ? "The installed Codex CLI is older than 0.145.0. Upgrade it before starting relay."
        : codex.version ? `Codex CLI detected (${terminalText(codex.version)}).` : "Codex CLI detected; its version could not be verified. Require 0.145.0 or newer.");
    } else {
      ui.write("Codex CLI was not found or could not run --version. Install Codex CLI 0.145.0 or newer and sign in on this machine before starting relay. Setup will not install or sign in for you.");
    }
    ui.write("Local Codex uses its own sign-in. Keep approval prompts enabled; review chat requests before approving them.");
    env.CODEX_SANDBOX = await ui.choose("Codex sandbox", [
      { value: "workspace-write", label: "Workspace write (recommended)" },
      { value: "read-only", label: "Read only" },
    ] as const, initial.CODEX_SANDBOX === "read-only" ? "read-only" : "workspace-write");
    env.CODEX_APPROVAL = await ui.choose("Codex approval policy", [
      { value: "on-request", label: "On request (recommended)" },
      { value: "untrusted", label: "Untrusted commands require approval" },
    ] as const, initial.CODEX_APPROVAL === "untrusted" ? "untrusted" : "on-request");
    env.LOG_LEVEL = "info";
    ui.write("Logging is set to info. Debug logs can expose messages, agent input, and output.");
    env.RELAY_CONTROL_ENABLED = String(await ui.confirm("Enable the optional localhost helper so Codex can send files/images and use relay capabilities?", false));
    env.RELAY_CONTROL_PORT = initial.RELAY_CONTROL_PORT ?? "0";
    ui.write("Experimental Gateway sharing is optional and disabled by default. It shares Codex threads with native clients and uses the Gateway's Codex settings. Enabling this flag requires separate manual Gateway setup/start; this wizard does not install proxies, start Gateway, or change Codex configuration.");
    env.EXPERIMENTAL_RELAY_WORK_ENABLED = String(await ui.confirm("Enable the experimental Gateway sharing flag?", false));
    // Preserve an existing Gateway state override independently of launch cwd.
    if (env.EXPERIMENTAL_RELAY_GATEWAY_STATE_PATH) {
      env.EXPERIMENTAL_RELAY_GATEWAY_STATE_PATH = absolutePath(env.EXPERIMENTAL_RELAY_GATEWAY_STATE_PATH, cwd);
    }

    const consent = provider === "telegram"
      ? "Verify now? This sends your bot token only to https://api.telegram.org for read-only getMe and getWebhookInfo checks. No user/chat IDs are sent; updates are not consumed and webhooks are not changed."
      : `Verify now? This sends your App ID and App Secret only to ${LARK_API_ORIGINS[env.LARK_DOMAIN as "feishu" | "lark"]}/open-apis/auth/v3/tenant_access_token/internal to check the credentials. The temporary tenant token is discarded; user/chat IDs are not sent.`;
    let verified = false;
    let attempted = false;
    if (await ui.confirm(consent, false)) {
      attempted = true;
      try {
        const check = await (options.validateProvider ?? validateProvider)({ ...env }, { approved: true });
        verified = check.ok;
        // Defense in depth for caller-supplied checkers: redact known secrets.
        const redacted = (message: string): string => [env.TELEGRAM_BOT_TOKEN, env.LARK_APP_SECRET]
          .filter((secret): secret is string => Boolean(secret))
          .reduce((text, secret) => text.split(secret).join("[redacted]"), message);
        ui.write(redacted(check.message));
        check.warnings.forEach((warning) => ui.write(redacted(warning)));
      } catch {
        ui.write("Credential verification failed. No remote error details are shown because they may contain secrets.");
      }
    } else {
      ui.write("Credential verification skipped. No credentials were sent.");
    }

    ui.write(`\nReview configuration\nProvider: ${provider}${provider === "lark" ? ` (${env.LARK_DOMAIN})` : ""}\nCredentials: [hidden]\nAllowed users: ${count(env.ALLOWED_USER_IDS)}\nAllowed chats: ${env.ALLOWED_CONVERSATION_IDS ? count(env.ALLOWED_CONVERSATION_IDS) : "any chat for allowed users"}\nWorkspace root: ${terminalText(env.WORKSPACE_ROOT)}\nSQLite state: ${terminalText(env.SQLITE_PATH)}\nCodex: ${terminalText(env.CODEX_BIN)}\nSandbox: ${env.CODEX_SANDBOX}; approvals: ${env.CODEX_APPROVAL}; logging: info\nLocal helper: ${env.RELAY_CONTROL_ENABLED}; experimental Gateway: ${env.EXPERIMENTAL_RELAY_WORK_ENABLED}\nCredential check: ${verified ? "passed (not an end-to-end setup test)" : attempted ? "did not pass" : "skipped"}\nSave destination: ${terminalText(configPath)}\nThe file contains credentials in plain text. Keep it private and out of source control.`);
    if (!(await ui.confirm(attempted && !verified ? "Save this configuration despite the failed credential check?" : "Save this configuration?", false))) {
      ui.write("Setup cancelled. No configuration was saved.");
      return undefined;
    }
    return env;
  } catch (error) {
    if (error instanceof WizardCancelledError) {
      ui.write("Setup cancelled. No configuration was saved.");
      return undefined;
    }
    throw error;
  } finally {
    ui.close?.();
  }
}
