# Codex 0.159.2 experimental protocol fixtures

These nine unedited TypeScript text snapshots were generated with the official
`@openai/codex@0.159.2` binary using the command in `manifest.json`. The manifest
records the immutable release commit and each file's SHA-256. They are `.ts.txt`
so they do not pretend to be a standalone generated TypeScript dependency tree.

The structural validator parses the declarations, not comments. It checks the
callback ID/action kind, advertised decisions, nonblocking input, nullable
settings/current metadata, and experimental latest-turn resume bootstrap.
`initialTurnsPage` is supported in this release and is intentionally retained.

The normal fake app-server harness still identifies as 0.145.0 to exercise the
compatibility floor. Behavioral fixtures include both old and new wire shapes;
passing mocks does not establish live CLI/Desktop/IM interoperability.
