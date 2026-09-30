# Lark/Feishu quickstart

Use an enterprise self-built app with a Bot capability, not a group webhook-only custom bot.

## 1. Install and select the region

Install Codex CLI 0.145.0+ separately, sign in yourself, and check `codex --version` on the trusted machine that will run relay.

One command installs a persistent copy from npm and opens the English configuration wizard; no source checkout is needed:

```bash
npx @asuka1127/agent-relay install
```

For a local build, use the [equivalent tarball command](../../README.md#install-a-local-checkout-or-release-tarball). npm/npx includes Bun. `install` is the only installation/configuration entry point. The installer asks before installation and continues directly into configuration. Use its printed absolute executable commands, or follow its optional manual `PATH` instructions to use `agent-relay` as shown below.

Choose Feishu China for [open.feishu.cn/app](https://open.feishu.cn/app), or Lark international for [open.larksuite.com/app](https://open.larksuite.com/app). Credentials and region must match. Sign into the console and create/configure the app yourself; the installer never logs in, creates the app, grants permissions, or publishes it. Run `agent-relay install` from the installed executable to reconfigure later; it reuses that installation's prefix, including a custom or conventional global prefix.

Source users need Bun 1.3+ and can run `bun install`, then follow the [source install workflow](../../README.md#run-from-source-existing-workflow): pack a local tarball and pass it to `bun run cli install --package /absolute/path/asuka1127-agent-relay-0.2.0.tgz`, then run `bun run cli start`. This setup command persists an npm installation and requires Node.js 20+ and npm. `.env` + `bun run start` remains available.

## 2. Create the app, collect credentials and IDs

1. Create a self-built/internal app, enable **Bot** in its capabilities, and copy App ID and App Secret from Credentials & Basic Info into the local wizard. Secret input is masked
2. Request application/tenant-identity permissions for text and interactive cards: `im:message.p2p_msg:readonly` (DMs), `im:message:send_as_bot` (send as bot), and `im:message.group_at_msg:readonly` if groups are needed. These do not require sending as a human or broad contact-directory lookup
3. Enter allowed operator **open_id** values (`ou_...`) from this exact app. A person's open_id is different between apps; `user_id`/`union_id` are not interchangeable. The official [Open ID guide](https://open.feishu.cn/document/faq/trouble-shooting/how-to-obtain-openid) describes API Explorer → select this app → Send message → open_id → Quick copy open_id → select yourself; copying does not require sending a message. Optional conversation restrictions use `chat_id` (`oc_...`)
4. Complete workspace/state/Codex settings. Optional credential validation sends App ID/Secret only to the selected official origin's [`tenant_access_token/internal`](https://open.feishu.cn/document/server-docs/authentication-management/access-token/tenant_access_token_internal) endpoint; the temporary token is discarded. Success verifies credentials only, not Bot capability, events, permissions, release or availability
5. Save the private configuration. Keep the file out of Git. Do not collect OAuth credentials, encryption keys or verification tokens for this long-connection flow

Additional feature permissions:

- Upload/send images and files: `im:resource`
- Download inbound image/file resources: `im:message:readonly`, a broader read-message permission; enable only if you need inbound attachments
- Task status reactions: `im:message.reactions:write_only`

The minimum text/card scopes alone do not cover all attachment/reaction features. See official [message resources](https://open.feishu.cn/document/server-docs/im-v1/message/get-2) and [Lark IM permission table](https://github.com/larksuite/cli/blob/main/skills/lark-im/SKILL.md).

## 3. Start the connection, then finish console setup

**Keep a local client online before saving long-connection settings.** The console requires an active connection; don't wait for subscriptions to be complete before first starting relay.

```bash
agent-relay doctor
agent-relay start
```

If bot-identity lookup prevents the first connection, publish an initial version with Bot capability and required permissions, then start relay. Leave it running while completing these separate console sections:

1. Developer Configuration → Events & Callbacks → **Event Configuration**: choose long-connection event delivery; add Receive message v2.0 / `im.message.receive_v1`
2. **Callback Configuration** separately: choose long-connection callback delivery; add Card action / `card.action.trigger`
3. Version Management & Release: create/publish a version and complete administrator approval if required. Set availability to the intended operators, not automatically everyone. Republish after scope/feature/subscription changes
4. Find the bot in Feishu/Lark, send `/relay` in a private chat, then test both a text prompt and a card button. App availability and relay's operator allowlist are separate requirements

There is no public callback URL or tunnel. `doctor` performs local checks only. If text works but buttons do not, check the **callback** section first. If the app cannot be found or cannot message you, check release/approval/availability. Use one relay instance during setup; multiple long connections can load-balance events rather than broadcast them.

Official references: [interactive-card bot setup](https://open.feishu.cn/document/uAjLw4CM/uMzNwEjLzcDMx4yM3ATM/develop-a-card-interactive-bot/faqs), [long-connection configuration](https://open.feishu.cn/document/server-docs/event-subscription-guide/event-subscription-configure-/request-url-configuration-case), [message event](https://open.feishu.cn/document/server-docs/im-v1/message/events/receive).

## 4. Optional group chat setup

For group chats:

1. Add the bot to the group.
2. Use sender `open_id` values in `ALLOWED_USER_IDS`.
3. Use the group `chat_id` in `ALLOWED_CONVERSATION_IDS`.
4. Mention the bot in text, image/file captions, and slash commands. Keep the bot mention separated by spaces, for example `/relay @RelayBot` or `@RelayBot inspect this`.

Unmentioned group messages are ignored before authorization checks, so normal group traffic will not trigger the relay.

## 5. Start and use

```bash
agent-relay start
```

Then in Lark or Feishu:

1. Send `/relay` to the bot.
2. Select or create a workspace.
3. Send a normal message to Codex.
4. Use card buttons to answer questions or approve actions.

In groups, mention the bot when sending text, image/file captions, or slash commands. Keep `@BotName` as a separate token with spaces around it.

## 6. Thread and multi-workspace usage

In Lark or Feishu groups, each message thread is an independent relay scope. `ALLOWED_CONVERSATION_IDS` still uses the group `chat_id`, not the thread ID.

To run multiple workspaces in parallel:

1. Start a separate thread for each workspace or workstream.
2. Mention the bot in the thread and send `/relay`.
3. Select a workspace from Relay Home in that thread.
4. Send prompts in each thread. Replies, card buttons, tasks, and Codex output stay in the same thread.

Stopping a session from Relay Home stops only that thread's session and clears that thread's current workspace binding. Other threads in the same group keep their own sessions.

## Useful commands

- `/help`: show commands.
- `/review`: review workspace changes.
- `/plan`: toggle Plan mode for the current Codex thread.
- `/plan --on` / `/plan --off`: select Plan or Default mode explicitly.
- `/plan <prompt>`: enter Plan mode and ask Codex to plan first.
- `Interrupt` on the latest activity card: stop the active turn. Goal cards also provide `Pause`, `Resume`, `Edit`, and `Clear` when applicable.
- `/resume`: continue a previous thread.

If setup fails, see [Troubleshooting](troubleshooting.md).
