# Telegram quickstart

Use this guide when you want to control local Codex from Telegram.

## 1. Install and prepare local tools

Install Codex CLI 0.145.0+ separately and sign in yourself on this trusted machine. Git is needed for normal code/version-control work. Check `codex --version` before starting relay.

One command installs a persistent copy from npm and opens the English configuration wizard; no source checkout is needed:

```bash
npx @asuka1127/agent-relay install
```

For a local build, use the [equivalent tarball command](../../README.md#install-a-local-checkout-or-release-tarball). npm/npx includes the official Bun runtime. `install` is the only installation/configuration entry point. The installer asks before installing, then continues directly into the wizard.

Use the absolute executable commands printed at the end, or follow its optional manual `PATH` instructions to use `agent-relay` as shown below. To reconfigure an existing installation, run `agent-relay install` from its executable; it reuses that installation's prefix, including a custom or conventional global prefix. The installer does not create the bot or sign you into Telegram or Codex.

For a source checkout, install Bun 1.3+, run `bun install`, and follow the [source install workflow](../../README.md#run-from-source-existing-workflow): pack a local tarball and pass it to `bun run cli install --package /absolute/path/asuka1127-agent-relay-0.2.0.tgz`, then run `bun run cli start`. This setup command persists an npm installation and requires Node.js 20+ and npm. The original `.env` + `bun run start` flow is also supported.

## 2. Create a bot and configure the wizard

1. Open the official [BotFather](https://t.me/BotFather), send `/newbot`, choose a display name and unique username
2. Copy the bot token into the wizard's **masked local prompt**. Do not paste it into URLs, command arguments, support tickets, or another bot
3. Choose Telegram, enter your numeric operator user ID and optionally allowed chat IDs. Usernames and the bot's own ID are not your operator ID. Use a trusted source for your ID; never send an ID-lookup service your token
4. Select your workspace root, separate state file and Codex executable. Keep workspace-write/on-request or stricter settings
5. If you opt into validation, the token goes only to `api.telegram.org` for [`getMe`](https://core.telegram.org/bots/api#getme) and [`getWebhookInfo`](https://core.telegram.org/bots/api#getwebhookinfo). These do not consume queued updates or change the bot's webhook
6. If an existing webhook is detected, use another bot or deliberately review/retire the previous integration yourself. The wizard will not delete it. One polling process should use a token at a time
7. Review the redacted summary and approve saving the private configuration. A skipped/failed check can be saved for later correction; that is not a readiness claim

## 3. Start and verify

```bash
agent-relay doctor
agent-relay start
```

`doctor` is local-only; it does not test bot authentication, Codex sign-in or delivery. Start the relay, open a private chat with the bot, and send `/relay`. Select a workspace, send a normal prompt, and test a button. **Starting the existing Telegram runtime skips stale queued updates**; use a fresh message after start. Setup validation does not perform this backlog skip.

The config is outside the package/cache, with absolute workspace/state paths; see [configuration location and migration](../../README.md#configuration-wizard-and-everyday-commands). To keep an existing source `.env` for one run, use `agent-relay start --env-file /absolute/path/.env`.

## 4. Optional group chat setup

For group chats:

1. Add the bot to the group.
2. Set `ALLOWED_CONVERSATION_IDS` to the group chat ID.
3. Keep [privacy mode](https://core.telegram.org/bots/features#privacy-mode) enabled for the initial test. Explicitly addressed `/relay@bot_username` commands work with it. Plain text mentions and media captions are not guaranteed to be delivered merely because relay recognizes them. If that full group workflow is needed, use BotFather `/setprivacy` → Disable and re-add the bot: **Telegram will then deliver all group messages to the bot**, although relay ignores unmentioned traffic. Do not grant group administrator privileges just for this workaround.
4. Set `TELEGRAM_BOT_USERNAME` if automatic username discovery is not reliable in your environment.
5. Mention the bot in text, image/file captions, and slash commands. Keep normal mentions separated by spaces, for example `/relay @relay_bot` or `@relay_bot inspect this`.

Unmentioned group messages are ignored before authorization checks, so normal group traffic will not trigger the relay.

## 5. Start and use

```bash
agent-relay start
```

Then in Telegram:

1. Send `/relay` to the bot.
2. Select or create a workspace.
3. Send a normal message to Codex.
4. Use buttons to answer questions or approve actions.

In groups, mention the bot when sending text, images, files, or slash commands. Use spaces around a normal `@bot` mention; Telegram's native `/relay@relay_bot` command form is also accepted for compatibility.

## 6. Topic and multi-workspace usage

In Telegram forum groups, each topic is an independent relay scope. `ALLOWED_CONVERSATION_IDS` still uses the group chat ID, not the topic ID.

To run multiple workspaces in parallel:

1. Enable Topics in the Telegram group.
2. Create one topic per workspace or workstream.
3. In each topic, send `/relay@relay_bot` or another bot-targeted command that Telegram delivers to the bot.
4. Select a workspace from Relay Home in that topic.
5. Send prompts in each topic. Replies, buttons, tasks, and Codex output stay in the same topic.

Stopping a session from Relay Home stops only that topic's session and clears that topic's current workspace binding. Other topics in the same group keep their own sessions.

## Useful commands

- `/help`: show commands.
- `/review`: review workspace changes.
- `/plan`: toggle Plan mode for the current Codex thread.
- `/plan --on` / `/plan --off`: select Plan or Default mode explicitly.
- `/plan <prompt>`: enter Plan mode and ask Codex to plan first.
- `Interrupt` on the latest activity card: stop the active turn. Goal cards also provide `Pause`, `Resume`, `Edit`, and `Clear` when applicable.
- `/resume`: continue a previous thread.

If setup fails, see [Troubleshooting](troubleshooting.md).
