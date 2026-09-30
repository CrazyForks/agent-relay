import { describe, expect, test } from "bun:test";
import { approvalCopy, applySessionMetadata, applyThreadMetadata, applyThreadSettings, collaborationModePayload } from "../../src/providers/agents/codex/protocol.ts";
import type { AgentSessionStatus } from "../../src/ports/agent.ts";
import { approvalChoices, approvalResponse } from "../../src/relay/ui/prompt-state.ts";

describe("Codex approval decisions", () => {
  test("only renders command decisions advertised by app-server", () => {
    const execAmendment = { command: ["bun", "test"] };
    expect(approvalChoices("command", {
      availableDecisions: ["accept", { acceptWithExecpolicyAmendment: { execpolicy_amendment: execAmendment } }, "decline"],
      proposedExecpolicyAmendment: execAmendment,
    })).toEqual([
      { action: "once", label: "Approve once" },
      { action: "exec", label: "Approve command rule" },
      { action: "decline", label: "Deny" },
    ]);
  });

  test("preserves exact exec and network amendment wire shapes", () => {
    const execAmendment = { command: ["bun", "test"] };
    const networkAmendment = { host: "registry.npmjs.org", action: "allow" };
    const params = {
      proposedExecpolicyAmendment: execAmendment,
      proposedNetworkPolicyAmendments: [networkAmendment],
    };

    expect(approvalResponse("command", "exec", params)).toEqual({
      decision: { acceptWithExecpolicyAmendment: { execpolicy_amendment: execAmendment } },
    });
    expect(approvalResponse("command", "net0", params)).toEqual({
      decision: { applyNetworkPolicyAmendment: { network_policy_amendment: networkAmendment } },
    });
  });

  test("permission approval returns the requested profile with turn or session scope", () => {
    const permissions = { network: { enabled: true }, fileSystem: null };
    expect(approvalResponse("permissions", "turn", { permissions })).toEqual({ permissions, scope: "turn" });
    expect(approvalResponse("permissions", "session", { permissions })).toEqual({ permissions, scope: "session" });
  });
});


describe("Codex native settings and approval presentation", () => {
  const status = (): AgentSessionStatus => ({
    sessionKey: "test", conversationId: 1, workspaceName: "demo", workspacePath: "/workspace", running: true, startedAt: 1,
    model: "native-model", reasoningEffort: "high",
  });

  test("distinguishes terminal input and preserves supplied native context", () => {
    const copy = approvalCopy("command", { kind: "writeStdin", command: "print(1)", cwd: "/workspace", environmentId: "env-a", reason: "Continue the REPL", networkApprovalContext: { host: "example.test" } });
    expect(copy.title).toBe("Approve terminal input?");
    expect(copy.body).toContain("Send input to an existing terminal.");
    for (const text of ["print(1)", "/workspace", "env-a", "Continue the REPL", "example.test"]) expect(copy.body).toContain(text);
    expect(approvalCopy("command", {}).title).toBe("Approve command?");
    expect(approvalCopy("command", { kind: "writeStdin" }).body).toContain("command unavailable");
  });

  test("explicit null clears effort, omission preserves it, and Plan retains the clear", () => {
    const current = status();
    applyThreadSettings(current, { modelProvider: "custom" });
    expect(current.reasoningEffort).toBe("high");
    applyThreadSettings(current, { effort: null });
    expect(current.reasoningEffort).toBeNull();
    expect(collaborationModePayload(current, "plan")).toEqual({ mode: "plan", settings: { model: "native-model", reasoning_effort: null, developer_instructions: null } });
  });

  test("hydrates current native snapshot settings without guessing from unavailable metadata", () => {
    const current = status();
    applyThreadMetadata(current, { model: "external-model", reasoningEffort: null });
    expect(current.model).toBe("external-model");
    expect(current.reasoningEffort).toBeNull();
    applyThreadSettings(current, { effort: "xhigh" });
    applyThreadMetadata(current, { model: null, reasoningEffort: null });
    expect(current.model).toBe("external-model");
    expect(current.reasoningEffort).toBe("xhigh");
    applyThreadMetadata(current, { name: "Sparse" });
    expect(current.reasoningEffort).toBe("xhigh");
    current.model = undefined;
    expect(() => collaborationModePayload(current, "default")).toThrow("current thread model");
  });

  test("effective resume and fork response values take precedence over snapshot metadata", () => {
    const current = status();
    applySessionMetadata(current, { thread: { model: "persisted-model", reasoningEffort: "low" }, model: "effective-model", reasoningEffort: null });
    expect(current.model).toBe("effective-model");
    expect(current.reasoningEffort).toBeNull();
    applySessionMetadata(current, { thread: { id: "fork" } });
    expect(current.reasoningEffort).toBeNull();
  });
});
