# Changelog

All notable changes to agent-relay will be documented in this file.

The project is pre-1.0; npm distribution is being prepared and remains unpublished.

## 0.2.0 (unreleased)

- Add the `@asuka1127/agent-relay` npm package/Node executable and official pinned Bun runtime dependency, with global installation and npx tarball support without global Bun
- Add masked interactive `init`, first-run setup, local `doctor`, explicit config/migration paths, and installed Gateway commands
- Guide Telegram BotFather and Feishu/Lark self-built app setup with consent-based official-host credential checks, no webhook/queue changes, and clear manual publication/event requirements
- Store private versioned configuration and state outside package caches/workspaces; preserve the source `.env` workflow and native Codex authority
- Add focused setup/security tests and a clean packed-artifact npm/npx smoke check; update both README languages and provider guides

## Unreleased

### Fixed

- Keep Codex approval callbacks distinct by native callback ID/action, reject ambiguous or conflicting security payloads, and honor the exact advertised decisions.
- Preserve nonblocking question behavior, concurrent blocking requests, and explicit nullable native reasoning settings when selecting Plan/Default.
- Keep pending Gateway requests alive until native resolution and reject browser-origin/non-loopback-host access to the local Gateway.

### Added

- Pinned Codex 0.159.2 experimental schema fixtures and CI contract alongside the 0.145.0 floor and scheduled latest check.

### Changed

- Split user-facing README and docs into separate English and Chinese versions.
- Simplified user docs around features, quick start, daily usage, troubleshooting, and extension workflow.
- Documented group chat setup, allowed conversations, and multi-agent group workflows.

## 0.1.0 - 2026-05-28

Initial open-source baseline.

### Added

- Telegram and Lark/Feishu IM providers.
- Local Codex app-server integration.
- Workspace selection, creation, deletion, and `.gitignore`-aware file browsing.
- Codex thread operations including review, compact, init, new, resume, fork, rename, Plan mode, goals, side conversations, interrupt, and background terminal cleanup.
- Inline handling for Codex questions, approvals, Plan mode choices, paged output, and stale callback recovery.
- IM image input, album batching, Codex image output, and workspace-local media storage.
- Optional local capability API with `send_image` and `mention_agent`.
- SQLite persistence for relay state.
- Unit and integration test coverage for adapters, routing, storage, and Codex protocol behavior.

### Known limitations

- Codex is the only implemented agent provider.
- Telegram and Lark/Feishu are the only implemented IM providers.
- File/document attachments are not supported.
- npm publication is not configured.
