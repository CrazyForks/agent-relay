# Troubleshooting

This page covers the most common setup problems. Do not share bot tokens, app secrets, private paths, prompts, or assistant output in public issues.

## Installation or the setup wizard fails

Use the scoped package `@asuka1127/agent-relay`. The unscoped `agent-relay` package belongs to another project. This version is not published yet; use the [local tarball workflow](../../README.md#try-this-checkout-now-no-registry-release-needed) until publication has been verified.

`install` needs Node.js 20+, npm, network access for dependencies, and an interactive terminal for its English configuration wizard. It installs into a persistent user-owned npm prefix, then opens the wizard. Plain `npm install -g` only installs the package; use `agent-relay init` afterward if you choose that alternative.

- If `agent-relay` is not found, use the exact executable path printed by `install`, or add its printed binary directory to your shell's `PATH`. Installation does not edit shell startup files
- If setup was cancelled or could not save, the package may already be installed. Run its printed `init` command to retry configuration
- If Bun is missing after installation with `--ignore-scripts` or `--omit=optional`, reinstall normally or point `AGENT_RELAY_BUN_PATH` at an existing compatible Bun executable
- A non-interactive terminal cannot run the wizard. Configure in an interactive terminal first, then provide `--config` or `--env-file` for automated runs
- If saving reports an unsafe config directory, choose a private directory you own. Do not weaken the permissions check or put credentials in a shared directory

The wizard never creates Telegram bots or Feishu/Lark apps, signs you into accounts, or finishes provider-console configuration. Those steps remain manual; see the [Telegram](quickstart-telegram.md) and [Feishu/Lark](quickstart-lark.md) guides.

## The relay does not start

For an installed package, run these commands using `agent-relay` on `PATH` or the executable path printed by `install`:

```bash
agent-relay config path
agent-relay doctor
agent-relay start
```

Check:

- The selected private config exists and contains the intended provider credentials and `ALLOWED_USER_IDS`
- `WORKSPACE_ROOT` and the SQLite state path are absolute, and their locations are usable
- `codex --version` works, and you have signed into Codex separately on this machine
- If you configured with `--config` or `--env-file`, you pass the same option when starting
- Shell environment variables are not unexpectedly overriding saved settings

The installed CLI does not implicitly read `.env` from the launch directory. Use `agent-relay start --env-file /absolute/path/.env` for an explicit legacy file. `doctor` checks local configuration and tools, not authentication or bot delivery.

For the original source workflow, ensure the checkout's `.env` exists, then run:

```bash
bun run typecheck
bun test
bun run start
```

## Codex is not found

If `codex` is not on `PATH`, set a full path:

```dotenv
CODEX_BIN=/absolute/path/to/codex
```

On Windows, `codex.cmd` and `codex.exe` are supported. Use the full path if automatic lookup fails.

## Telegram messages are ignored

Check:

- The sender user ID is in `ALLOWED_USER_IDS`.
- If `ALLOWED_CONVERSATION_IDS` is set, the chat ID is included.
- In groups, the message mentions the bot.
- In groups, `TELEGRAM_BOT_USERNAME` is set if automatic username discovery failed.
- The token belongs to the bot you are messaging.

Messages sent while the relay was offline are skipped on startup.

## Lark or Feishu messages are ignored

Check:

- `LARK_DOMAIN` matches your app: `feishu` or `lark`.
- `ALLOWED_USER_IDS` uses sender `open_id` values.
- `ALLOWED_CONVERSATION_IDS` uses chat `chat_id` values.
- Bot messaging, message receive events, and card action events are enabled.
- In groups, the message mentions the bot. Keep `@BotName` separated by spaces, such as `/relay @RelayBot` or `@RelayBot /relay`.

## Group chat messages are ignored

Check:

- The bot is actually a member of the group.
- The message mentions the bot directly. Keep normal mentions separated by spaces, such as `/relay @relay_bot` or `@relay_bot /relay`; Telegram's native `/relay@relay_bot` command form is also accepted.
- Both the user and the group are allowed when `ALLOWED_CONVERSATION_IDS` is set.
- Slash commands, image/file captions, and normal text all include the bot mention.
- If there is no `router.message_received` or `router.group_message_ignored` log entry after sending a group message, Telegram did not deliver that update to the bot. Check the command format, bot privacy mode, and group permissions.
- For multi-agent groups, each bot has its own relay process and its own credentials.

Telegram Privacy Mode is a server-side filter. With Privacy Mode enabled, Telegram only sends a bot messages that it considers relevant, so a normal group message or a mention-first message such as `@relay_bot /relay` may never reach agent-relay. Use Telegram's native bot command form `/relay@relay_bot` when you need the command to target one bot reliably. The relay also accepts `/relay @relay_bot` if Telegram delivers the update. If you need normal group text and media mentions, deliberately disable Privacy Mode in BotFather and re-add the bot. Telegram will then deliver all group messages to the bot, although relay ignores unmentioned traffic. Do not grant group administrator privileges merely to bypass this filter. See [Telegram Privacy Mode](https://core.telegram.org/bots/features#privacy-mode).

## Topic or thread routing looks wrong

Telegram forum topics and Lark/Feishu threads are scoped separately from the parent group. `ALLOWED_CONVERSATION_IDS` should contain the parent group chat ID only.

Check:

- Logs for messages from different topics or threads show different `scope_key` values, such as `-100123|telegram|15|` for Telegram or `oc_xxx|lark|thread_xxx|root_xxx` for Lark/Feishu.
- The message was sent inside the topic or thread, not in the parent group timeline.
- Relay Home was opened and a workspace was selected inside that same topic or thread.
- If a stopped topic or thread no longer shows a workspace, open `/relay` in that topic or thread and select the workspace again.

## Buttons stop working

Open a fresh Relay Home with `/relay`.

If Codex is waiting on an old question or approval, answer from the newest card or use `Interrupt` on the latest activity card.

## Workspace actions fail

Check:

- `WORKSPACE_ROOT` exists.
- Workspace names are simple directory names.
- Workspaces are real first-level directories under `WORKSPACE_ROOT`.

## Images fail

Check:

- A workspace is selected.
- The image is under `MEDIA_MAX_BYTES`.
- For Lark/Feishu inbound images, the app can access message resources and the bot is in the same chat as the message.

## Lark or Feishu reaction errors

If logs show `Access denied` for `im:message.reactions:write_only` or `im:message`, enable one of those app permissions and republish or reinstall the app. This only affects task status reactions; it is separate from image and file downloads.

## Files fail

Check:

- A workspace is selected.
- The file is under `MEDIA_MAX_BYTES`.
- The upload is a regular file attachment, not a folder.
- Outbound files sent through `send-file` are inside the selected workspace.

## Opening an issue

Include:

- OS and shell.
- Node.js/npm versions for npm installations, or Bun version for source installations.
- Installation method and relay version.
- Codex CLI version.
- IM provider: Telegram or Lark/Feishu.
- Configuration variable names only, with values removed; do not attach the config or `.env` file.
- Redacted logs around the failure.
