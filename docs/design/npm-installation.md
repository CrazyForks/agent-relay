# npm distribution and first-run setup

## Decision

Keep the relay architecture and native Codex authority unchanged. Package the existing TypeScript runtime and its relative assets, with a small Node.js executable forwarding to the official pinned npm `bun` dependency. Existing `bun:sqlite`, `Bun.serve`, and process APIs are retained. There is no runtime rewriting or opaque runtime download. The explicit `install` command delegates persistent package installation to npm; normal launch does not install anything. Bun's own non-interactive npm installer selects official platform packages. Node 20+ is needed for the npm shim; source users retain Bun 1.3+.

The scoped package is `@asuka1127/agent-relay`. The unscoped name is unrelated. `private: true` is retained until a separately authorized registry release. This implementation is not a publication.

## Combined install and configure

After publication, `npx @asuka1127/agent-relay install` is the primary entry point. It previews the running package's pinned name/version and destination, requires confirmation in a TTY, invokes npm into a persistent user-owned prefix, verifies the installed package identity, and runs that copy's `init`. npm lifecycle hooks remain non-interactive; the wizard is part of the explicit CLI command.

The default prefix is `$XDG_DATA_HOME/agent-relay/npm` or `~/.local/share/agent-relay/npm` on Unix, and `%LOCALAPPDATA%\agent-relay\npm` or `~\AppData\Local\agent-relay\npm` on Windows. `install --prefix <directory>` selects another destination. The installed executable is `<prefix>/bin/agent-relay` on Unix or `<prefix>\agent-relay.cmd` on Windows. Print usable absolute commands and optional manual PATH instructions; do not edit shell profiles or the user's PATH.

`install --package <local.tgz>` installs a matching local tarball for unpublished testing. Both npx's package source and the installer's package source must select that tarball. `--config` and `--env-file` are forwarded to `init`. Repeating installation reuses a matching healthy version unless an explicit tarball was supplied; an unhealthy copy is offered a confirmed reinstall. Cancelling or failing configuration after npm succeeds leaves the package installed, while configuration changes remain subject to the wizard's save confirmation.

A persistent installation keeps long-lived helpers and explicit Gateway setup independent of an evictable npx cache. It does not install Codex, sign into accounts, start relay or Gateway, or modify native Codex authority.

## Setup boundary

The English-language wizard, launched by `install`, `init`, or interactive first run without configuration, collects settings, explicitly offers official-host credential validation, shows a redacted review, and asks to save. No interactive npm lifecycle scripts. No bot creation, contact discovery, webhook mutation, automatic account login or Gateway setup. Saving does not start a bot. Non-TTY execution fails with instructions rather than hanging.

Telegram validation calls `getMe` and `getWebhookInfo` only. Feishu/Lark validation exchanges app credentials only with the selected official region's tenant-token endpoint, discards the response token, and explains that permissions/publication/event subscriptions remain unverified. HTTP redirects and unbounded waits are rejected; network exception text and response bodies are never printed.

## Configuration and compatibility

The installed CLI explicitly opts out of Bun's automatic `.env` loading. `--config`, `AGENT_RELAY_CONFIG`, or the per-user default chooses one schema-versioned JSON file. Shell environment overrides it. `--env-file` selects an explicit legacy source instead; `init --env-file` is migration. Paths are normalized to stable absolute paths relative to the selected file. Only known relay keys are persisted.

POSIX config directories are created 0700; atomic temporary and final files are 0600. Existing shared directories and symlink files are rejected. Windows requires a user-profile directory protected by its ACL; POSIX modes are not claimed to establish Windows ACLs. Credentials stay outside the package, npm/npx cache, workspace, Git and logs. Installed state defaults alongside private config, independent of launch cwd. Source `bun run start` retains its existing `.env` semantics.

The runtime accepts explicit configuration at bootstrap. Gateway remains opt-in and independently managed; the new CLI forwards configuration without loading unrelated cwd `.env`. Its source assets remain in the package. The local capability helper runs with the relay's exact Bun path, including an npm-local runtime.

## Verification

Focused tests cover installer arguments, prefix selection, explicit installation confirmation, persistent package verification, setup handoff, config arguments, precedence, migrations, strict file modes, redaction, cancellation, invalid IDs, secret masking and provider host/redirect/timeout behavior. Existing aggregate typecheck/tests remain required. `npm run test:package` packs an allowlisted artifact, installs it into a temporary global prefix, and executes it through an independent npx cache from outside the checkout with global Bun removed from PATH. It exercises local doctor, non-TTY failure, implicit `.env` isolation, Gateway status, native SQLite/runtime import and the helper without contacting bot services. On Linux/macOS it also uses a real PTY to run a fresh npx tarball through persistent installation and the installed English wizard, then verifies repeat/cancel behavior, private configuration, secret masking, and paths with spaces.

Live Telegram/Feishu end-to-end tests require owner-supplied bot credentials and manually configured platform apps; mocked credential validation does not substitute for those tests. Platform runtime selection is provided by Bun; local execution evidence is Linux x64 unless explicitly recorded otherwise.

Sources: [npm bin/files](https://docs.npmjs.com/cli/v11/configuring-npm/package-json/), [npx](https://docs.npmjs.com/cli/v11/commands/npx/), [official Bun installation](https://bun.com/docs/installation), [Telegram Bot API](https://core.telegram.org/bots/api), [Feishu long connection](https://open.feishu.cn/document/server-docs/event-subscription-guide/event-subscription-configure-/request-url-configuration-case).
