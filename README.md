# agent-relay

[![CI](https://github.com/zwx1127/agent-relay/actions/workflows/ci.yml/badge.svg)](https://github.com/zwx1127/agent-relay/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

English | [中文](README.zh-CN.md)

`agent-relay` lets you control a local Codex CLI agent from Telegram or Lark/Feishu. You keep Codex running on a trusted machine, then use chat to choose a workspace, send prompts, answer questions, approve actions, review code, manage threads, and exchange screenshots, images, or files.

The goal is simple: keep the agent close to your code, while letting you operate it from the chat app you already use.

## Community Group

Scan the Telegram QR code below to join the project community group.

<img src="docs/assets/telegram-group-qr.jpg" alt="Telegram group QR code" width="240">

## Showcase

<table>
  <tr>
    <th>Telegram direct chat</th>
    <th>Telegram group topic mode</th>
  </tr>
  <tr>
    <td width="50%" valign="top">
      <video src="https://github.com/user-attachments/assets/2109bbbf-35d5-4f10-b712-409d318fdde6" width="360" controls></video>
    </td>
    <td width="50%" valign="top">
      <video src="https://github.com/user-attachments/assets/48aca05e-20f4-47f8-ac80-d93c6a4ecf60" width="360" controls></video>
    </td>
  </tr>
  <tr>
    <th>Feishu direct chat</th>
    <th>Feishu group topic mode</th>
  </tr>
  <tr>
    <td width="50%" valign="top">
      <video src="https://github.com/user-attachments/assets/b3bda23d-0eb0-402b-996c-b134562e4772" width="360" controls></video>
    </td>
    <td width="50%" valign="top">
      <video src="https://github.com/user-attachments/assets/13889a04-a32b-4ef4-beae-2df48f2a674d" width="360" controls></video>
    </td>
  </tr>
</table>

## What you can do

- Remote-control local Codex sessions from Telegram or Lark/Feishu.
- Select, create, browse, and delete workspaces from chat.
- Send normal prompts, images, voice/audio, file mentions, skills, and follow-up steering messages.
- Follow reasoning summaries, plan progress, tools, file changes, warnings, and diffs in one editable activity card; long details remain available for 24 hours.
- Answer Codex questions and approve actions inline.
- Use direct chats or allowed group chats; group messages are handled only when they mention the bot.
- Use common Codex workflows such as review, Plan mode, goals, resume, fork, side conversations, interrupt, and background terminal cleanup.
- Send screenshots, generated images, or files back to chat with the optional local relay capability API.
- Put multiple agent-relay bots in one group and let agents mention configured peers for related work.
- Extend the relay to support more IM providers or agent backends.

## Experimental: relay work

> **Experimental, disabled by default, and opt-in only.** This feature may change incompatibly before it is stable. It does not start a Gateway, install a client proxy, or change existing Relay, Codex CLI, or Codex Desktop behavior unless you enable it manually.

Experimental relay work lets you begin in the native Codex CLI or the Windows/macOS Codex Desktop app, leave the computer, and continue the same Codex thread through Telegram or Lark/Feishu. Relay, interactive Codex CLI processes, and Codex Desktop all connect to one independent local Gateway and its single authoritative app-server; users run Codex normally and do not choose remote endpoints.

![Experimental relay work architecture: Codex and IM exchange live progress and control bidirectionally through one shared thread](docs/assets/relay-work-overview.png)

Run `scripts/gateway.* setup` once, then start Gateway manually whenever relay work is needed. Gateway and Relay have separate scripts and lifecycles, while Gateway and its one app-server form a single failure domain. Use `/resume` to join an existing thread. Multiple native Codex clients and IM scopes can share a thread without ownership restrictions; new user messages, agent progress, and Relay-supported thread command state are mirrored to the other attached scopes, ordinary input during an active turn uses Steer semantics, and the first client to answer an approval or input request wins. BTW mode is the exception: its ephemeral child, input, output, and status stay local to the originating IM scope and never enter shared Gateway state or the parent transcript. Gateway mode inherits Codex configuration from the shared app-server; Relay requests do not override it, except for a one-shot mode switch after the user explicitly selects Default or Plan. A bounded command snapshot exists only in Gateway memory and survives Relay restart/cleanup, but not Gateway/app-server restart; native restart semantics then apply, including Plan returning to Default. There is no Queue action, semantic state journal, offline output replay, or catch-up. See [Experimental relay work](docs/en/experimental-relay-work.md) for the Windows, macOS, and Linux setup, lifecycle semantics, and complete removal instructions.

## Install with npm / npx

> **Release status:** this checkout implements `@asuka1127/agent-relay`, but this version has not been published to npm yet. The unscoped `agent-relay` package belongs to another project: do **not** use `npx agent-relay` or `npm install -g agent-relay` for this repository. Use the tarball workflow below until an authorized scoped release is available.

### Try this checkout now (no registry release needed)

From a checkout containing the npm CLI changes:

```bash
npm install
npm pack
# Use the tarball name printed by npm pack:
npm install -g ./asuka1127-agent-relay-0.2.0.tgz
agent-relay init
agent-relay doctor
agent-relay start
```

Or run the packed package without a global install. Replace the tarball path with its actual absolute path; repeat `--package` for each invocation:

```bash
npx --package=/absolute/path/asuka1127-agent-relay-0.2.0.tgz agent-relay init
npx --package=/absolute/path/asuka1127-agent-relay-0.2.0.tgz agent-relay doctor
npx --package=/absolute/path/asuka1127-agent-relay-0.2.0.tgz agent-relay start
```

### After this scoped package is published

These registry commands are for the future published release, not a claim that it is available now:

```bash
npm install -g @asuka1127/agent-relay
agent-relay init
agent-relay start

# Alternatively, no global package installation:
npx @asuka1127/agent-relay init
npx @asuka1127/agent-relay start
```

The npm path requires Node.js 20+ and npm. It installs the official [`bun@1.3.11`](https://www.npmjs.com/package/bun/v/1.3.11) runtime dependency, including its platform binary and non-interactive installer, so **a global Bun install is not required**. Linux/macOS/Windows on x64/arm64 are supported by that runtime; see [Bun system requirements](https://bun.com/docs/installation). The binary download adds roughly 100 MB of installed runtime storage. The relay launcher never downloads software itself. With `--ignore-scripts` or `--omit=optional`, Bun may be missing; reinstall normally or explicitly set `AGENT_RELAY_BUN_PATH` to an existing compatible Bun executable. Codex is installed and signed into separately; the wizard never creates accounts or signs you in.

### Configuration wizard and everyday commands

`init` guides you through Telegram or Feishu/Lark bot setup, credentials, operator/chat allowlists, workspace root, SQLite state, Codex discovery, sandbox/approval defaults, and optional local helpers or experimental Gateway flags. It uses masked secret input and asks before sending credentials to the selected provider's official API. Checks are read-only and cannot prove end-to-end delivery, permissions or publication. It never creates bots, changes webhooks, installs a Gateway proxy, or starts the relay. Finish with `doctor`, then `start` and send `/relay` to your bot.

- Telegram: create a bot with [BotFather](https://t.me/BotFather), enter its token and your numeric user ID. Optional validation uses only `getMe` and `getWebhookInfo`; it never consumes `getUpdates` or deletes an existing webhook
- Feishu/Lark: create a self-built app in the matching developer console, enable Bot capability, and supply App ID/Secret and app-specific `open_id` allowlists. Save and start relay **before** saving long-connection subscriptions in the console. Then configure message events and card callbacks, permissions, publication and app availability using the [detailed guide](docs/en/quickstart-lark.md). Credential validation cannot verify these console steps
- `agent-relay` or `agent-relay start`: foreground process; with no configuration, an interactive terminal offers the wizard and exits after saving. Run `start` again to connect
- `agent-relay init`: configure or reconfigure; Ctrl+C/declining save leaves the existing file unchanged
- `agent-relay doctor`: local configuration, path and Codex version checks; it does not contact a bot API
- `agent-relay config path`: show the selected file location without displaying secrets
- `agent-relay gateway <setup|start|stop|status|remove>`: explicit experimental Gateway lifecycle. Prefer a persistent global install over an evictable npx cache for long-lived Gateway use; rerun setup after relocating/upgrading its installation, following the [Gateway guide](docs/en/experimental-relay-work.md)

Configuration lives outside the package and outside the selected workspace: `$XDG_CONFIG_HOME/agent-relay/config.json` or `~/.config/agent-relay/config.json` on Linux/macOS; `%APPDATA%\agent-relay\config.json` on Windows. Override it with `--config /absolute/path/config.json` or `AGENT_RELAY_CONFIG`. `init` creates a private directory (0700) and atomically writes a private file (0600) on POSIX. It refuses shared directories rather than changing their permissions. On Windows, store it in your private profile and protect it with user-only ACLs. The file contains plaintext credentials: never commit or share it.

Workspace and SQLite paths saved by `init` are absolute, independent of the launch directory. State defaults to `state/agent-relay.sqlite` beside the config file; the workspace root is your code/projects directory, not the package directory. Shell environment overrides saved settings. The installed CLI does not implicitly load `.env` from the launch directory.

To migrate a source-checkout configuration (the original `.env` is left unchanged):

```bash
agent-relay init --env-file /absolute/path/to/agent-relay/.env
# Or use that file for one run without creating a saved config:
agent-relay start --env-file /absolute/path/to/agent-relay/.env
```

Only recognized relay settings are imported. Relative file paths are resolved relative to the explicit `.env` file. `--env-file` replaces the saved configuration source for that invocation; shell environment still wins. Non-interactive/CI runs never prompt: provision a private config or explicit `.env` first and pass its path. Never pass bot secrets as CLI arguments.

### Run from source (existing workflow)

```bash
git clone https://github.com/zwx1127/agent-relay.git
cd agent-relay
bun install
bun run init
bun run cli start
```

The original `.env` workflow also remains supported: copy `.env.example` to `.env`, edit it, and run `bun run start`. Source `bun run start` continues to read the checkout's `.env`; `bun run cli start` uses the new per-user CLI configuration. The source lifecycle scripts `scripts/relay.*` remain checkout-specific and are not installed with the npm package; use the foreground CLI with your preferred process supervisor for an npm installation.

## Setup guides

- [Telegram quickstart](docs/en/quickstart-telegram.md)
- [Lark/Feishu quickstart](docs/en/quickstart-lark.md)
- [Troubleshooting](docs/en/troubleshooting.md)
- [Extending agent-relay](docs/en/extending-agent-relay.md)
- [Experimental relay work](docs/en/experimental-relay-work.md) (disabled by default)

## Minimum requirements

- Node.js 20+ and npm for npm/npx; Bun 1.3+ for the source workflow (npm includes a pinned Bun runtime).
- Git for Codex workspace/version-control operations (not required just to install a tarball).
- A local `codex` CLI on `PATH`, or a full path set with `CODEX_BIN`.
- Codex CLI 0.145.0 or newer with `codex app-server --listen stdio://`; the experimental launcher uses the CLI's WebSocket transport internally, so users do not select a separate remote mode.
- A Telegram bot token, or a Lark/Feishu self-built app.

## Daily usage

Start from `/relay`. The home view shows the selected workspace, Codex status, waiting state, recent errors, and available actions.

Common commands:

| Command | Use |
| --- | --- |
| `/help` | Show supported commands. |
| `/relay` | Open Relay Home. |
| `/review` | Review current workspace changes. |
| `/plan` | Toggle Plan mode for the current Codex thread. |
| `/plan --on` / `/plan --off` | Select Plan or Default mode explicitly. |
| `/plan <prompt>` | Enter Plan mode and run a prompt. |
| `/goal <objective>` | Set a goal for the current Codex thread. |
| `/resume` | Pick a recent Codex thread and immediately show its latest turn state. |
| `/side [prompt]`, `/btw [prompt]` | Enter or continue a multi-turn ephemeral side conversation; use **Return to main** to exit. |
| Activity/Goal card buttons | Interrupt the active turn or manage the goal. Button labels stay in English. |
| `/ps` | List Codex background terminals. |
| `/skills [search]` | Select a Codex skill, then reply with the task. |
| `/mention [search]` | Select a workspace file or directory, then reply with the task. |
| `/stop` | Ask Codex to clean background terminals. |

In group chats, mention the bot when sending text, images, files, or slash commands. Keep normal bot mentions as separate tokens, such as `/relay @relay_bot` or `@relay_bot review this change`. Telegram's native `/relay@relay_bot` command form is also accepted. Use `ALLOWED_CONVERSATION_IDS` when a bot should only respond in specific groups.

## Group chats and agent teams

agent-relay works in private chats and group chats. Group chats are useful when you want a shared operator room for one or more local agents.

- Add the bot to the group and allow the group with `ALLOWED_CONVERSATION_IDS`.
- Mention the bot in text, image/file captions, and slash commands, with spaces around `@bot` or `@BotName` when it is a normal mention.
- Unmentioned group messages are ignored before authorization checks.
- Telegram forum topics and Lark/Feishu threads are treated as separate scopes, so each topic or thread can select its own workspace and run its own Codex session in parallel.
- Run one agent-relay process per agent bot when you want several agents in the same group.
- Configure peer agents and enable the local relay capability API when you want Codex to mention another agent bot.

See the Telegram and Lark/Feishu quickstarts for group setup details.

## Extend it with itself

agent-relay is designed so you can use the running relay to improve agent-relay.

1. Start agent-relay in this repository as the selected workspace.
2. Ask Codex from Telegram or Lark/Feishu to add a new IM provider or agent backend.
3. Point Codex at the provider contracts and existing implementations.
4. Ask it to update config, factories, docs, and tests.
5. Run `bun run typecheck` and `bun test` from chat.

The main extension points are:

- IM providers: `src/ports/im.ts` and `src/providers/im/`.
- Agent providers: `src/ports/agent.ts` and `src/providers/agents/`.
- Local agent-visible capabilities: `src/relay/capabilities/`.

See [Extending agent-relay](docs/en/extending-agent-relay.md) for the suggested workflow.

## Project status

Current providers:

- IM: Telegram, Lark/Feishu.
- Agent: Codex CLI app-server.
- Storage: SQLite.

Known limitations:

- Folder attachments and automatic archive extraction are not supported.
- npm publication is not configured; install from source with `git clone`.
- Codex is currently the only implemented agent backend.

## Contributing and support

- Read [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request.
- Read [SECURITY.md](SECURITY.md) before reporting sensitive issues.
- Check [Troubleshooting](docs/en/troubleshooting.md) before opening a setup issue.
- See [CHANGELOG.md](CHANGELOG.md) for release notes.

## License

`agent-relay` is licensed under the [MIT License](LICENSE).
