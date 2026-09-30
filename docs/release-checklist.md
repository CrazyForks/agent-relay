# Release checklist

Use this checklist for the first public release and later release candidates.

## Repository metadata

Suggested GitHub topics:

```text
codex
codex-cli
telegram-bot
lark
feishu
cli-agent
remote-control
automation
typescript
bun
sqlite
```

Suggested short description:

```text
Remote-control local Codex CLI sessions from Telegram or Lark.
```

## Pre-release checks

```bash
bun install
bun run check
```

Review:

- `README.md`, `README.zh-CN.md`, and quickstart guides still match the CLI wizard, config options, and source `.env.example`.
- Documentation and CLI/UI text are English, except `README.zh-CN.md`; legacy `docs/zh-CN/` URLs remain English redirects.
- `CHANGELOG.md` has a release entry.
- `SECURITY.md` reflects the current security model.
- No local runtime files are staged.

## Codex compatibility gates

Keep three distinct checks: the 0.145.0 compatibility floor, fixed 0.159.2
release gate, and scheduled latest-release drift detection. The pinned job
asserts the actual binary version; it does not update the user's Codex install.

```bash
CODEX_CONTRACT_EXPECT_VERSION=0.159.2 bun run test:codex-contract
CODEX_CONTRACT_EXPECT_VERSION=0.159.2 bun run test:codex-gateway-boundary
# Optional deeper native test in an environment supporting Codex's sandbox:
CODEX_CONTRACT_EXPECT_VERSION=0.159.2 bun run test:codex-contract --threads
```

The contract creates a temporary Codex home and working directory, generates the
experimental schema, and checks initialize/model/collaboration-mode discovery.
`--threads` additionally creates only an empty ephemeral thread to check
high-to-null effort, Plan settings, and `initialTurnsPage` resume. It never starts
a model turn or loads existing user threads. A sandbox/environment failure in
this optional check is an unverified native-thread integration, not a pass.

Before claiming end-to-end release support, also verify authorized test accounts
with native CLI/Desktop, Telegram, Lark, BTW, and disconnect/reconnect. Cover:

- Different approval IDs on one item, command versus terminal input, conflicting
  duplicate payloads, malformed/unsupported decisions, and stale clicks
- Nonblocking questions while output/Steer continues; simultaneous real blockers
- Explicit nullable effort and external native model changes before Plan
- Pending Gateway requests beyond five minutes and after frontend reconnect
- Originless native connections and rejected browser Origins on both local ports

Do not infer those live results from unit tests or publish credentials, prompts,
thread IDs, or machine paths with test logs.

## Create a local tag

```bash
git tag -a v0.1.0 -m "agent-relay v0.1.0"
git push origin v0.1.0
```

## Suggested v0.1.0 release notes

~~~markdown
## agent-relay v0.1.0

Initial open-source baseline for remote-controlling local Codex CLI sessions from Telegram or Lark/Feishu.

### Highlights

- Telegram and Lark/Feishu IM providers.
- Local Codex app-server integration.
- Workspace selection, creation, deletion, and `.gitignore`-aware file browsing.
- Codex thread operations: review, compact, init, new, resume, fork, rename, Plan mode, goals, side conversations, interrupt, and background terminal cleanup.
- Inline handling for Codex questions, approvals, Plan mode choices, paged output, and stale callback recovery.
- Image input/output and optional local relay capabilities.

### Install

```bash
git clone https://github.com/zwx1127/agent-relay.git
cd agent-relay
bun install
cp .env.example .env
bun run start
```

See the README for Telegram and Lark/Feishu setup.
~~~

## npm scoped distribution

- [ ] Obtain explicit approval to publish under the verified npm account/scope; this change alone is not publication authorization
- [ ] Confirm `@asuka1127/agent-relay` ownership and version availability; never publish/use the unrelated unscoped `agent-relay`
- [ ] Keep `private: true` until release is approved, then remove it deliberately and publish with the appropriate public scoped access
- [ ] Run `bun run check` and `npm run test:package` against the final tree
- [ ] Inspect `npm pack --dry-run --json`: include CLI, helper, all relative runtime/Gateway assets and docs; exclude credentials, .env, SQLite/state, logs, caches, tests and toolchain artifacts
- [ ] Verify the local tarball `npx ... agent-relay install --package <local.tgz>` flow in a clean directory without global Bun: explicit installation confirmation, persistent prefix, installed-copy wizard, retry/cancellation, no PATH changes, and private config persistence outside package/cache
- [ ] Verify custom `--prefix`, configuration/migration forwarding, repeated installation, and the exact printed Unix/Windows executable commands
- [ ] Run the installed executable's `install` command from both a custom prefix and a conventional npm global prefix; confirm reconfiguration reuses its own installation without creating a second copy
- [ ] Confirm `install` is the only public setup command in help and argument validation, and its handoff runs private installed setup without a public configuration alias
- [ ] Verify default launch and `start` with missing configuration exit with instructions to run `install`, in both interactive and non-interactive terminals, without opening setup
- [ ] Verify the source `npm pack` + `bun run cli install --package <local.tgz>` workflow and ensure npm dependency installation remains non-interactive, with no setup lifecycle script
- [ ] After authorized publication, independently verify `npx @asuka1127/agent-relay install` against the registry before describing the public one-command path as available
- [ ] Verify Linux/macOS/Windows runtime compatibility on supported x64/arm64 targets before advertising them as tested
- [ ] Confirm both README files label unpublished examples accurately; only remove the release-status warning after registry publication has been independently verified
- [ ] Keep npm credentials/OTP entry in the user's trusted login flow; never put registry tokens in Git or chat
