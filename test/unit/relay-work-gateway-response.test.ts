import { describe, expect, test } from "bun:test";
import { isValidServerRequestResponse as valid } from "../../src/gateway/server-request-response.ts";

const command = "item/commandExecution/requestApproval";

describe("Gateway callback response wire validation", () => {
  test.each(["accept", "acceptForSession", "decline", "cancel"])("accepts native simple decision %s", (decision) => {
    expect(valid(command, { result: { decision } })).toBe(true);
    expect(valid("item/fileChange/requestApproval", { result: { decision } })).toBe(true);
  });

  test.each([
    { acceptWithExecpolicyAmendment: { execpolicy_amendment: ["bun", "test"] } },
    { applyNetworkPolicyAmendment: { network_policy_amendment: { host: "example.com", action: "allow" } } },
    { applyNetworkPolicyAmendment: { network_policy_amendment: { host: "example.com", action: "deny" } } },
  ])("accepts native structured command decisions unchanged", (decision) => {
    expect(valid(command, { result: { decision } })).toBe(true);
    expect(valid("item/fileChange/requestApproval", { result: { decision } })).toBe(false);
  });

  test.each([
    {}, { error: null }, { error: { code: "1", message: "bad" } },
    { result: {}, error: { code: -1, message: "conflicting envelope" } },
    { method: command, result: { decision: "accept" } },
    { result: { decision: true } },
    { result: { decision: { acceptWithExecpolicyAmendment: { execpolicy_amendment: [1] } } } },
    { result: { decision: { applyNetworkPolicyAmendment: { network_policy_amendment: { host: "example.com", action: "other" } } } } },
  ])("rejects malformed command responses", (message) => {
    expect(valid(command, message)).toBe(false);
  });

  test("permits a native JSON-RPC error without fabricating an approval", () => {
    expect(valid(command, { error: { code: -32602, message: "unsupported kind" } }, { kind: "futureKind" })).toBe(true);
    for (const kind of [null, "futureKind", {}]) expect(valid(command, { result: { decision: "accept" } }, { kind })).toBe(false);
    expect(valid(command, { result: { decision: "accept" } }, { kind: "writeStdin" })).toBe(true);
  });

  test("respects empty or restricted advertised decisions and legacy absence", () => {
    expect(valid(command, { result: { decision: "accept" } }, { availableDecisions: [] })).toBe(false);
    expect(valid(command, { result: { decision: "acceptForSession" } }, { availableDecisions: ["accept"] })).toBe(false);
    expect(valid(command, { result: { decision: "accept" } }, { availableDecisions: "accept" })).toBe(false);
    expect(valid(command, { result: { decision: "accept" } }, { availableDecisions: null })).toBe(true);
  });

  test("validates input, elicitation, and permission response shapes", () => {
    expect(valid("item/tool/requestUserInput", { result: { answers: {} } })).toBe(true);
    expect(valid("item/tool/requestUserInput", { result: { answers: { q: { answers: ["one", "two"] } } } })).toBe(true);
    expect(valid("item/tool/requestUserInput", { result: { answers: { q: { answers: [1] } } } })).toBe(false);
    expect(valid("item/tool/requestUserInput", { result: { answers: [] } })).toBe(false);
    expect(valid("mcpServer/elicitation/request", { result: { action: "cancel", content: null, _meta: null } })).toBe(true);
    expect(valid("mcpServer/elicitation/request", { result: { action: "accept", content: {} } })).toBe(false);
    expect(valid("mcpServer/elicitation/request", { result: { action: "unknown", content: null, _meta: null } })).toBe(false);
    expect(valid("item/permissions/requestApproval", { result: { permissions: {}, scope: "turn", strictAutoReview: true } })).toBe(true);
    expect(valid("item/permissions/requestApproval", { result: { permissions: {}, scope: "session" } })).toBe(true);
    expect(valid("item/permissions/requestApproval", { result: { permissions: {}, scope: "permanent" } })).toBe(false);
    expect(valid("item/permissions/requestApproval", { result: { permissions: {}, scope: "turn", strictAutoReview: "yes" } })).toBe(false);
  });
});

describe("Gateway permission grant wire validation", () => {
  const permission = (permissions: unknown) => valid("item/permissions/requestApproval", { result: { permissions, scope: "turn" } });
  test("preserves nullable native fields and unknown future fields", () => {
    expect(permission({ network: null, fileSystem: null, futureField: { anything: true } })).toBe(true);
    expect(permission({ network: { enabled: null }, fileSystem: { read: null, write: ["/workspace"], futureField: true } })).toBe(true);
    expect(permission({ fileSystem: { read: [], write: [], globScanMaxDepth: 3, entries: [
      { path: { type: "path", path: "/workspace" }, access: "read" },
      { path: { type: "glob_pattern", pattern: "**/*.log" }, access: "deny" },
      { path: { type: "special", value: { kind: "project_roots", subpath: null } }, access: "write" },
      { path: { type: "special", value: { kind: "unknown", path: "future", subpath: "subdir" } }, access: "read" },
    ] } })).toBe(true);
  });
  test.each([
    { network: { enabled: "no" } }, { network: [] }, { fileSystem: { read: 123 } },
    { fileSystem: { write: [false] } }, { fileSystem: { globScanMaxDepth: -1 } },
    { fileSystem: { entries: {} } }, { fileSystem: { entries: [{ access: "execute", path: { type: "path", path: "/" } }] } },
    { fileSystem: { entries: [{ access: "read", path: { type: "path", path: false } }] } },
    { fileSystem: { entries: [{ access: "read", path: { type: "special", value: { kind: ["root"] } } }] } },
    { fileSystem: { entries: [{ access: "read", path: { type: "special", value: { kind: "project_roots", subpath: 3 } } }] } },
  ])("rejects malformed known nested permission fields", (permissions) => {
    expect(permission(permissions)).toBe(false);
  });
});
