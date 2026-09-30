import { describe, expect, test } from "bun:test";
import { approvalChoices, approvalResponse } from "../../src/relay/ui/prompt-state.ts";

describe("Relay native approval boundaries", () => {
  test("explicitly empty or unknown decisions never invent a denial button", () => {
    expect(approvalChoices("command", { kind: "writeStdin", availableDecisions: [] })).toEqual([]);
    expect(approvalChoices("command", { availableDecisions: ["unknown"] })).toEqual([]);
    expect(() => approvalResponse("command", "decline", { availableDecisions: [] })).toThrow("not offered by Codex");
  });

  test("terminal input does not gain session or amendment decisions", () => {
    const params = {
      kind: "writeStdin",
      availableDecisions: ["accept", "cancel"],
      proposedExecpolicyAmendment: ["bun", "test"],
      proposedNetworkPolicyAmendments: [{ host: "registry.example", action: "allow" }],
    };
    expect(approvalChoices("command", params)).toEqual([
      { action: "once", label: "Approve once" },
      { action: "cancel", label: "Cancel" },
    ]);
    for (const action of ["session", "exec", "net0", "decline"]) {
      expect(() => approvalResponse("command", action, params)).toThrow("not offered by Codex");
    }
    expect(approvalResponse("command", "cancel", params)).toEqual({ decision: "cancel" });
  });

  test("each policy amendment must match the precise advertised decision", () => {
    const permitted = { host: "allowed.example", action: "allow" };
    const notPermitted = { host: "other.example", action: "allow" };
    const params = {
      availableDecisions: [
        { acceptWithExecpolicyAmendment: { execpolicy_amendment: ["bun", "test"] } },
        { applyNetworkPolicyAmendment: { network_policy_amendment: permitted } },
      ],
      proposedExecpolicyAmendment: ["bun", "run"],
      proposedNetworkPolicyAmendments: [notPermitted, permitted],
    };
    expect(approvalChoices("command", params)).toEqual([{ action: "net1", label: "Approve network rule 2" }]);
    expect(() => approvalResponse("command", "exec", params)).toThrow("not offered by Codex");
    expect(() => approvalResponse("command", "net0", params)).toThrow("not offered by Codex");
    expect(approvalResponse("command", "net1", params)).toEqual({
      decision: { applyNetworkPolicyAmendment: { network_policy_amendment: permitted } },
    });
  });
});
