# Security Policy

## Supported versions

agent-relay is pre-1.0. Security fixes are handled on the `main` branch until release branches exist.

## Reporting a vulnerability

Please do not open a public issue for a vulnerability that exposes credentials, private prompts, workspace paths, or local machine access.

Report privately through GitHub Security Advisories when available. If advisories are not available for this repository, contact the maintainer through a private channel and include only the minimum redacted details needed to reproduce the issue.

## Security model

- The relay is intended to run on a trusted machine.
- IM access is restricted with `ALLOWED_USER_IDS`; `ALLOWED_CONVERSATION_IDS` is recommended for group or shared bot deployments.
- The optional relay control API binds to `127.0.0.1` and uses a startup-scoped bearer token passed only through the child agent environment.
- The experimental shared Gateway binds loopback and accepts originless native CLI/Desktop/Relay clients only. It rejects every supplied browser `Origin` and non-loopback `Host`, including health and client-enumeration routes. The Codex 0.159.2 backend independently rejects browser Origins. This is not authentication against other processes on the trusted machine; do not expose either port through a reverse proxy or tunnel.
- Runtime logs at `debug` level can include raw IM messages, prompts, and agent output chunks.
- SQLite state can contain workspace names, bindings, thread IDs, transcript events, prompt state, approvals, and paged output.

## Sensitive data

Do not publish:

- `.env`
- `.data/agent-relay.sqlite`
- `logs/`
- IM credentials
- allowlisted user or conversation IDs
- private workspace paths
- prompt text or assistant output that should not be public
- relay media under `.agent-relay/media`

## Installed CLI configuration

`agent-relay install` is the only public installation/configuration entry point. It explicitly asks before invoking npm to install its scoped version into a persistent user-owned prefix, then runs the installed copy's English configuration wizard. Rerunning it from a healthy persistent installation reuses that installation's own prefix, including conventional global and custom-prefix installs. Default launch and `start` never open the wizard; missing configuration directs the user to `install`. An explicit local tarball must be trusted: npm dependency installation can execute package scripts. Installation does not edit PATH, create bots, grant provider permissions, or sign into accounts. A cancelled wizard can leave the package installed but does not save configuration without approval.

The `install` wizard saves plaintext bot credentials in a private per-user JSON file outside the package and workspace. Keep it out of Git and backups shared with others. On POSIX, new directories/files use 0700/0600; shared target directories and symlink files are rejected. On Windows, use a private user-profile directory with user-only ACLs. The wizard masks secrets and never prints API error bodies. Optional checks transmit credentials only after informed approval to the selected official Telegram or Feishu/Lark API, reject redirects, and do not alter bot settings. Saved allowlists still require an end-to-end delivery test. npm installation includes the official pinned Bun runtime installer; normal relay launch does not download software; the explicit `install` command delegates installation to npm.
