import { describe, expect, test } from "bun:test";
import {
  deliverLiveEvent,
  handleServerRequestResolved,
  isShareableServerRequest,
  routeServerRequestResponse,
  rebindPendingRequestParticipant,
  shareServerRequest,
  updateClientFromBackend,
  updateClientFromRequest,
  type ConnectedClient,
  type PendingServerRequest,
} from "../../src/gateway/main.ts";

describe("experimental relay work Gateway approval arbitration", () => {
  test("routes the first response to the originating app-server and drops later responses", () => {
    const backendMessages: string[] = [];
    const originMessages: string[] = [];
    const peerMessages: string[] = [];
    const backend = {
      readyState: WebSocket.OPEN,
      send: (raw: string) => {
        backendMessages.push(raw);
      },
    } as unknown as WebSocket;
    const origin = {
      data: { id: "desktop", connectedAt: 1, backend, queued: [], threads: new Set(["thread-1"]), deliveredSeq: new Map() },
      socket: { send: (raw: string) => originMessages.push(raw) },
    } as unknown as ConnectedClient;
    const peer = {
      data: { id: "relay", connectedAt: 2, relayInstanceId: "relay-instance", queued: [], threads: new Set(["thread-1"]), deliveredSeq: new Map() },
      socket: { send: (raw: string) => peerMessages.push(raw) },
    } as unknown as ConnectedClient;
    const clients = new Map([[origin.data.id, origin], [peer.data.id, peer]]);
    const pending = new Map<string, PendingServerRequest>();
    const relayed = new Map<string, string>();

    shareServerRequest(origin, {
      id: 7,
      method: "item/commandExecution/requestApproval",
      params: { threadId: "thread-1" },
    }, backend, clients, pending, relayed);
    const shared = JSON.parse(peerMessages[0]!) as { id: string };

    expect(routeServerRequestResponse(peer.data, { id: shared.id, result: { decision: "accept" } }, "", clients, pending, relayed)).toBe(true);
    expect(JSON.parse(backendMessages[0]!)).toEqual({ id: 7, result: { decision: "accept" } });
    expect(routeServerRequestResponse(origin.data, { id: 7, result: { decision: "decline" } }, JSON.stringify({ id: 7, result: { decision: "decline" } }), clients, pending, relayed)).toBe(true);
    expect(backendMessages).toHaveLength(1);
    expect(JSON.parse(originMessages[0]!)).toEqual({ method: "serverRequest/resolved", params: { threadId: "thread-1", requestId: 7 } });
    expect(JSON.parse(peerMessages[1]!)).toEqual({
      method: "serverRequest/resolved",
      params: { threadId: "thread-1", requestId: shared.id, result: { decision: "accept" } },
    });
  });

  test("coalesces the same logical approval from multiple app-server connections", () => {
    const desktopBackendMessages: string[] = [];
    const relayBackendMessages: string[] = [];
    const desktopMessages: string[] = [];
    const relayMessages: string[] = [];
    const desktopBackend = { readyState: WebSocket.OPEN, send: (raw: string) => desktopBackendMessages.push(raw) } as unknown as WebSocket;
    const relayBackend = { readyState: WebSocket.OPEN, send: (raw: string) => relayBackendMessages.push(raw) } as unknown as WebSocket;
    const desktop = {
      data: { id: "desktop", connectedAt: 1, backend: desktopBackend, queued: [], threads: new Set(["thread-1"]), deliveredSeq: new Map() },
      socket: { send: (raw: string) => desktopMessages.push(raw) },
    } as unknown as ConnectedClient;
    const relay = {
      data: { id: "relay", connectedAt: 2, relayInstanceId: "relay-instance", backend: relayBackend, queued: [], threads: new Set(["thread-1"]), deliveredSeq: new Map() },
      socket: { send: (raw: string) => relayMessages.push(raw) },
    } as unknown as ConnectedClient;
    const clients = new Map([[desktop.data.id, desktop], [relay.data.id, relay]]);
    const pending = new Map<string, PendingServerRequest>();
    const relayed = new Map<string, string>();
    const first = {
      id: 7,
      method: "item/commandExecution/requestApproval",
      params: { threadId: "thread-1", turnId: "turn-1", itemId: "command-1", approvalId: "approval-1", command: "bun test" },
    };

    expect(shareServerRequest(desktop, first, desktopBackend, clients, pending, relayed)).toEqual({
      kind: "created",
      deliverToOrigin: true,
      conflict: false,
    });
    const relayRequest = JSON.parse(relayMessages[0]!) as { id: string; params: { command: string } };
    expect(relayRequest.params.command).toBe("bun test");

    expect(shareServerRequest(relay, {
      ...first,
      id: 19,
    }, relayBackend, clients, pending, relayed)).toEqual({
      kind: "coalesced",
      deliverToOrigin: false,
      conflict: false,
    });
    expect(relayMessages).toHaveLength(1);

    expect(routeServerRequestResponse(relay.data, { id: relayRequest.id, result: { decision: "accept" } }, "", clients, pending, relayed)).toBe(true);
    expect(JSON.parse(desktopBackendMessages[0]!)).toEqual({ id: 7, result: { decision: "accept" } });
    expect(JSON.parse(relayBackendMessages[0]!)).toEqual({ id: 19, result: { decision: "accept" } });
    expect(JSON.parse(desktopMessages[0]!)).toEqual({ method: "serverRequest/resolved", params: { threadId: "thread-1", requestId: 7 } });
    expect(JSON.parse(relayMessages[1]!)).toEqual({
      method: "serverRequest/resolved",
      params: { threadId: "thread-1", requestId: relayRequest.id, result: { decision: "accept" } },
    });

    expect(shareServerRequest(relay, { ...first, id: 19 }, relayBackend, clients, pending, relayed)).toEqual({
      kind: "duplicate",
      deliverToOrigin: false,
      conflict: false,
    });
    expect(JSON.parse(relayBackendMessages[1]!)).toEqual({ id: 19, result: { decision: "accept" } });
    expect(relayMessages).toHaveLength(2);
  });

  test("shares only approval and user-input server request methods", () => {
    expect(isShareableServerRequest("item/fileChange/requestApproval")).toBe(true);
    expect(isShareableServerRequest("item/tool/requestUserInput")).toBe(true);
    expect(isShareableServerRequest("mcpServer/elicitation/request", { mode: "form" })).toBe(true);
    expect(isShareableServerRequest("mcpServer/elicitation/request", { mode: "url" })).toBe(true);
    for (const mode of ["openai/form", "openaiForm", "openai/userVerification", "futureMode", undefined]) {
      expect(isShareableServerRequest("mcpServer/elicitation/request", { mode })).toBe(false);
    }
    expect(isShareableServerRequest("account/login/completed")).toBe(false);
  });

  test("suppresses an upstream resolved notification after notifying every participant", () => {
    const backend = { readyState: WebSocket.OPEN, send: () => undefined } as unknown as WebSocket;
    const originMessages: string[] = [];
    const peerMessages: string[] = [];
    const origin = {
      data: { id: "desktop", connectedAt: 1, backend, queued: [], threads: new Set(["thread-1"]), deliveredSeq: new Map() },
      socket: { send: (raw: string) => originMessages.push(raw) },
    } as unknown as ConnectedClient;
    const peer = {
      data: { id: "relay", connectedAt: 2, queued: [], threads: new Set(["thread-1"]), deliveredSeq: new Map() },
      socket: { send: (raw: string) => peerMessages.push(raw) },
    } as unknown as ConnectedClient;
    const clients = new Map([[origin.data.id, origin], [peer.data.id, peer]]);
    const pending = new Map<string, PendingServerRequest>();
    const relayed = new Map<string, string>();
    shareServerRequest(origin, { id: 8, method: "item/tool/requestUserInput", params: { threadId: "thread-1" } }, backend, clients, pending, relayed);
    const peerRequestId = (JSON.parse(peerMessages[0]!) as { id: string }).id;

    expect(handleServerRequestResolved(origin.data, {
      method: "serverRequest/resolved",
      params: { threadId: "thread-1", requestId: 8 },
    }, clients, pending)).toBe(true);
    expect(JSON.parse(originMessages[0]!)).toEqual({ method: "serverRequest/resolved", params: { threadId: "thread-1", requestId: 8 } });
    expect(JSON.parse(peerMessages[1]!)).toEqual({ method: "serverRequest/resolved", params: { threadId: "thread-1", requestId: peerRequestId } });
  });

  test("replays a resolved request to the same Relay instance after reconnect", () => {
    const backendMessages: string[] = [];
    const backend = { readyState: WebSocket.OPEN, send: (raw: string) => backendMessages.push(raw) } as unknown as WebSocket;
    const origin = {
      data: { id: "desktop", connectedAt: 1, backend, queued: [], threads: new Set(["thread-1"]), deliveredSeq: new Map() },
      socket: { send: () => undefined },
    } as unknown as ConnectedClient;
    const oldMessages: string[] = [];
    const oldRelay = {
      data: { id: "relay-old", connectedAt: 2, relayInstanceId: "relay-instance", queued: [], threads: new Set(["thread-1"]), deliveredSeq: new Map() },
      socket: { send: (raw: string) => oldMessages.push(raw) },
    } as unknown as ConnectedClient;
    const clients = new Map([[origin.data.id, origin], [oldRelay.data.id, oldRelay]]);
    const pending = new Map<string, PendingServerRequest>();
    const relayed = new Map<string, string>();
    shareServerRequest(origin, { id: 9, method: "item/tool/requestUserInput", params: { threadId: "thread-1" } }, backend, clients, pending, relayed);
    const visibleRequestId = (JSON.parse(oldMessages[0]!) as { id: string }).id;
    clients.delete(oldRelay.data.id);
    routeServerRequestResponse(origin.data, { id: 9, result: { answers: {} } }, JSON.stringify({ id: 9, result: { answers: {} } }), clients, pending, relayed);

    const newMessages: string[] = [];
    const newRelay = {
      data: { id: "relay-new", connectedAt: 3, relayInstanceId: "relay-instance", queued: [], threads: new Set(["thread-1"]), deliveredSeq: new Map() },
      socket: { send: (raw: string) => newMessages.push(raw) },
    } as unknown as ConnectedClient;
    clients.set(newRelay.data.id, newRelay);
    rebindPendingRequestParticipant(newRelay, pending);

    expect(JSON.parse(newMessages[0]!)).toEqual({
      method: "serverRequest/resolved",
      params: { threadId: "thread-1", requestId: visibleRequestId, result: { answers: {} } },
    });
  });

  test("fans out each sequenced thread event once to currently connected clients", () => {
    const desktopMessages: string[] = [];
    const relayMessages: string[] = [];
    const otherMessages: string[] = [];
    const makeClient = (id: string, name: string, threads: string[], output: string[]): ConnectedClient => ({
      data: { id, name, connectedAt: 1, queued: [], threads: new Set(threads), deliveredSeq: new Map() },
      socket: { send: (raw: string) => output.push(raw) },
    } as unknown as ConnectedClient);
    const desktop = makeClient("desktop", "codex-desktop", ["thread-1"], desktopMessages);
    const relay = makeClient("relay", "agent-relay", ["thread-1"], relayMessages);
    const other = makeClient("other", "codex-cli", ["thread-2"], otherMessages);
    const clients = new Map([[desktop.data.id, desktop], [relay.data.id, relay], [other.data.id, other]]);
    const message = { method: "turn/started", params: { threadId: "thread-1", turn: { id: "turn-1" } } };
    const event = { seq: 3, threadId: "thread-1", method: "turn/started" };
    const raw = JSON.stringify(message);

    deliverLiveEvent(event, raw, desktop, clients);
    deliverLiveEvent(event, raw, relay, clients);

    expect(desktopMessages).toEqual([raw]);
    expect(otherMessages).toEqual([]);
    expect(relayMessages).toEqual([raw]);
  });

  test("keeps ephemeral fork events on the originating Gateway connection", () => {
    const originMessages: string[] = [];
    const peerMessages: string[] = [];
    const makeClient = (id: string, output: string[]): ConnectedClient => ({
      data: { id, connectedAt: 1, queued: [], threads: new Set(["parent"]), deliveredSeq: new Map() },
      socket: { send: (raw: string) => output.push(raw) },
    } as unknown as ConnectedClient);
    const origin = makeClient("relay-origin", originMessages);
    const peer = makeClient("codex-cli", peerMessages);
    const clients = new Map([[origin.data.id, origin], [peer.data.id, peer]]);

    updateClientFromRequest(origin.data, {
      id: 20,
      method: "thread/fork",
      params: { threadId: "parent", ephemeral: true, excludeTurns: true },
    });
    updateClientFromBackend(origin.data, { id: 20, result: { thread: { id: "btw-child" } } });

    expect(origin.data.threads.has("btw-child")).toBe(true);
    expect(peer.data.threads.has("btw-child")).toBe(false);

    const raw = JSON.stringify({
      method: "item/agentMessage/delta",
      params: { threadId: "btw-child", turnId: "btw-turn", delta: "private answer" },
    });
    deliverLiveEvent({ seq: 1, threadId: "btw-child", method: "item/agentMessage/delta" }, raw, origin, clients);

    expect(originMessages).toEqual([raw]);
    expect(peerMessages).toEqual([]);
  });

  test("tracks resume and unsubscribe only after their RPC outcomes", () => {
    const client = { id: "relay", connectedAt: 1, queued: [], threads: new Set<string>(), deliveredSeq: new Map() };
    updateClientFromRequest(client, { id: 1, method: "thread/resume", params: { threadId: "thread-1" } });
    expect(client.threads.has("thread-1")).toBe(true);
    updateClientFromBackend(client, { id: 1, error: { code: -1, message: "missing" } });
    expect(client.threads.has("thread-1")).toBe(false);

    updateClientFromRequest(client, { id: 2, method: "thread/resume", params: { threadId: "thread-1" } });
    updateClientFromBackend(client, { id: 2, result: { thread: { id: "thread-1" } } });
    expect(client.threads.has("thread-1")).toBe(true);
    updateClientFromRequest(client, { id: 3, method: "thread/unsubscribe", params: { threadId: "thread-1" } });
    expect(client.threads.has("thread-1")).toBe(true);
    updateClientFromBackend(client, { id: 3, result: { status: "unsubscribed" } });
    expect(client.threads.has("thread-1")).toBe(false);
  });
});

function callbackFixture() {
  const makeClient = (id: string) => {
    const sent: Record<string, unknown>[] = [];
    const replies: Record<string, unknown>[] = [];
    const backend = { readyState: WebSocket.OPEN as number, send: (raw: string) => replies.push(JSON.parse(raw)) };
    const client = {
      data: { id, connectedAt: 1, backend, relayInstanceId: `instance-${id}`, queued: [], threads: new Set(["thread-1"]), deliveredSeq: new Map() },
      socket: { send: (raw: string) => sent.push(JSON.parse(raw)) },
    } as unknown as ConnectedClient;
    return { client, backend, sent, replies };
  };
  const origin = makeClient("native");
  const peer = makeClient("relay");
  const clients = new Map([[origin.client.data.id, origin.client], [peer.client.data.id, peer.client]]);
  const pending = new Map<string, PendingServerRequest>();
  const relayed = new Map<string, string>();
  const share = (message: { id: string | number; method: string; params: Record<string, unknown> }, target = origin) =>
    shareServerRequest(target.client, message, target.backend as unknown as WebSocket, clients, pending, relayed);
  const answer = (id: string | number, result: unknown = { decision: "accept" }, target = peer) =>
    routeServerRequestResponse(target.client.data, { id, result }, "", clients, pending, relayed);
  return { origin, peer, clients, pending, relayed, share, answer };
}

function approval(id: string | number, approvalId: string | null = "approval-a", kind = "command") {
  return {
    id,
    method: "item/commandExecution/requestApproval",
    params: { threadId: "thread-1", turnId: "turn-1", itemId: "shared-item", approvalId, kind, command: "bun test" },
  };
}

describe("Codex 0.159.2 Gateway callback identity", () => {
  test.each([false, true])("keeps a different approvalId unanswered when first resolved=%s", (resolved) => {
    const f = callbackFixture();
    f.share(approval(10));
    const firstAlias = f.peer.sent[0]!.id as string;
    if (resolved) f.answer(firstAlias);
    expect(f.share(approval(11, "approval-b"))).toMatchObject({ kind: "created", conflict: false, deliverToOrigin: true });
    const secondAlias = f.peer.sent.find((message) => message.method === "item/commandExecution/requestApproval" && message.id !== firstAlias)!.id as string;
    if (!resolved) f.answer(firstAlias);
    expect(f.origin.replies).toEqual([{ id: 10, result: { decision: "accept" } }]);
    expect([...f.pending.values()].find((pending) => pending.origins.has("native:number:11"))?.resolved).toBe(false);
    f.answer(secondAlias, { decision: "decline" });
    expect(f.origin.replies.at(-1)).toEqual({ id: 11, result: { decision: "decline" } });
  });

  test("separates command, writeStdin, and unknown callback kinds", () => {
    const f = callbackFixture();
    f.share(approval(1));
    f.share(approval(2, "approval-a", "writeStdin"));
    f.share(approval(3, "approval-a", "futureKind"));
    expect(f.pending.size).toBe(3);
    f.answer(f.peer.sent[0]!.id as string);
    expect(f.origin.replies.map((response) => response.id)).toEqual([1]);
    expect([...f.pending.values()].filter((request) => !request.resolved)).toHaveLength(2);
  });

  test.each([false, true])("fails closed on changed native callback payload when first resolved=%s", (resolved) => {
    const f = callbackFixture();
    const first = approval(1);
    f.share(first);
    const original = [...f.pending.values()][0]!;
    if (resolved) f.answer(f.peer.sent[0]!.id as string);
    const changed = { ...first, id: 2, params: { ...first.params, command: "rm -rf important" } };
    expect(f.share(changed, f.peer)).toMatchObject({ conflict: true, deliverToOrigin: false });
    expect(f.pending.size).toBe(1);
    expect(original.origins.size).toBe(1);
    expect(f.peer.replies).toEqual([{ id: 2, error: expect.objectContaining({ code: -32602 }) }]);
    if (!resolved) f.answer(f.peer.sent[0]!.id as string);
    expect(f.origin.replies).toEqual([{ id: 1, result: { decision: "accept" } }]);
    expect(f.share({ ...first, id: 3 }, f.peer).conflict).toBe(false);
    expect(f.peer.replies.at(-1)).toEqual({ id: 3, result: { decision: "accept" } });
    expect([...f.pending.values()][0]).toBe(original);
  });

  test.each([false, true])("does not replay a changed exact transport callback when first resolved=%s", (resolved) => {
    const f = callbackFixture();
    const first = approval(1);
    f.share(first);
    if (resolved) f.answer(f.peer.sent[0]!.id as string);
    expect(f.share({ ...first, params: { ...first.params, command: "changed" } })).toMatchObject({ kind: "duplicate", conflict: true });
    expect(f.origin.replies.at(-1)).toMatchObject({ id: 1, error: { code: -32602 } });
    f.answer(f.peer.sent[0]!.id as string);
    expect(f.origin.replies.filter((reply) => "result" in reply)).toHaveLength(resolved ? 1 : 0);
    expect([...f.pending.values()][0]!.response).toEqual(resolved ? { result: { decision: "accept" } } : undefined);
    if (!resolved) {
      expect([...f.pending.values()][0]!.resolved).toBe(false);
      expect([...f.pending.values()][0]!.conflicted).toBe(true);
      expect(f.peer.sent.filter((message) => message.method === "serverRequest/resolved")).toEqual([]);
      handleServerRequestResolved(f.origin.client.data, { method: "serverRequest/resolved", params: { threadId: "thread-1", requestId: 1 } }, f.clients, f.pending, f.relayed);
      expect([...f.pending.values()][0]!.resolved).toBe(true);
    }
  });

  test("disambiguates legacy missing/null IDs with typed native RPC IDs", () => {
    const f = callbackFixture();
    const missing = approval(1, null);
    const { approvalId: _unused, ...params } = missing.params;
    f.share({ ...missing, params });
    f.share(approval(2, null));
    f.share(approval("2", null));
    expect(f.pending.size).toBe(3);
    f.answer(f.peer.sent[0]!.id as string);
    expect(f.origin.replies).toEqual([{ id: 1, result: { decision: "accept" } }]);
    // The SAME legacy RPC callback on another native connection still coalesces.
    expect(f.share({ ...missing, params }, f.peer)).toMatchObject({ kind: "coalesced", conflict: false });
    expect(f.peer.replies).toEqual([{ id: 1, result: { decision: "accept" } }]);
  });

  test.each([false, true])("quarantines the same global legacy RPC ID with changed payload across connections when resolved=%s", (resolved) => {
    const f = callbackFixture();
    const first = approval(1, null);
    f.share(first);
    if (resolved) f.answer(f.peer.sent[0]!.id as string);
    expect(f.share({ ...first, params: { ...first.params, command: "changed" } }, f.peer).conflict).toBe(true);
    expect(f.pending.size).toBe(1);
    expect(f.peer.replies).toEqual([{ id: 1, error: expect.objectContaining({ code: -32602 }) }]);
    f.answer(f.peer.sent[0]!.id as string);
    expect(f.origin.replies).toHaveLength(resolved ? 1 : 0);
    expect([...f.pending.values()][0]!.response).toEqual(resolved ? { result: { decision: "accept" } } : undefined);
    if (!resolved) expect([...f.pending.values()][0]!.conflicted).toBe(true);
  });

  test("does not let another client use a participant's relayed callback ID", () => {
    const f = callbackFixture();
    f.share(approval(1));
    const alias = f.peer.sent[0]!.id as string;
    f.answer(alias, { decision: "accept" }, f.origin);
    expect(f.origin.replies).toEqual([]);
    expect([...f.pending.values()][0]!.resolved).toBe(false);
    f.answer(alias, { decision: "decline" });
    expect(f.origin.replies).toEqual([{ id: 1, result: { decision: "decline" } }]);
  });

  test("does not let malformed answers win before a valid decision", () => {
    const f = callbackFixture();
    f.share(approval(1));
    const alias = f.peer.sent[0]!.id as string;
    for (const result of [null, {}, { decision: "garbage" }, { decision: { acceptWithExecpolicyAmendment: {} } }]) f.answer(alias, result);
    expect(f.origin.replies).toEqual([]);
    expect([...f.pending.values()][0]!.resolved).toBe(false);
    f.answer(alias, { decision: "accept" });
    expect(f.origin.replies).toHaveLength(1);
  });
});

describe("Gateway native callback lifetime", () => {


  test("keeps unanswered controls when no backend can accept a reply, then routes a native replay", () => {
    const f = callbackFixture();
    const first = approval(1);
    f.share(first);
    f.origin.backend.readyState = WebSocket.CLOSED;
    const alias = f.peer.sent[0]!.id as string;
    f.answer(alias);
    expect([...f.pending.values()][0]!.resolved).toBe(false);
    expect(f.peer.sent.filter((message) => message.method === "serverRequest/resolved")).toEqual([]);
    f.share({ ...first, id: 2 }, f.peer);
    f.answer(alias);
    expect(f.peer.replies).toEqual([{ id: 2, result: { decision: "accept" } }]);
  });

  test("uses an authoritative observer resolution after the original frontend disconnects", () => {
    const f = callbackFixture();
    f.share(approval(1));
    f.clients.delete(f.origin.client.data.id);
    f.origin.backend.readyState = WebSocket.CLOSED;
    expect(handleServerRequestResolved({ id: "gateway-observer" }, {
      method: "serverRequest/resolved", params: { threadId: "thread-1", requestId: 1 },
    }, f.clients, f.pending, f.relayed)).toBe(true);
    expect([...f.pending.values()][0]!.resolved).toBe(true);
    expect(f.peer.sent.at(-1)!.method).toBe("serverRequest/resolved");
  });
});

describe("Gateway shared nonblocking answers", () => {
  test("keeps nonblocking input visible and mirrors its answer without resolving concurrent blocking input", () => {
    const f = callbackFixture();
    const input = (id: number, isBlocking: boolean) => ({
      id, method: "item/tool/requestUserInput", params: { threadId: "thread-1", turnId: "turn-1", itemId: `input-${id}`, isBlocking, questions: [] },
    });
    f.share(input(1, false));
    f.share(input(2, true));
    expect(f.peer.sent.map((message) => (message.params as Record<string, unknown>).isBlocking)).toEqual([false, true]);
    const result = { answers: { q: { answers: ["shared reply"] } } };
    f.answer(f.peer.sent[0]!.id as string, result);
    expect(f.origin.replies).toEqual([{ id: 1, result }]);
    expect(f.peer.sent.at(-1)).toMatchObject({ method: "serverRequest/resolved", params: { result } });
    expect([...f.pending.values()].find((pending) => pending.origins.has("native:number:2"))?.resolved).toBe(false);
  });

  test("enforces native advertised approval decisions without losing the original callback", () => {
    const f = callbackFixture();
    const request = approval(1);
    const amendment = { acceptWithExecpolicyAmendment: { execpolicy_amendment: ["bun", "test"] } };
    f.share({ ...request, params: { ...request.params, availableDecisions: ["decline", amendment] } });
    const alias = f.peer.sent[0]!.id as string;
    f.answer(alias, { decision: "accept" });
    f.answer(alias, { decision: { acceptWithExecpolicyAmendment: { execpolicy_amendment: ["sh"] } } });
    expect(f.origin.replies).toEqual([]);
    expect([...f.pending.values()][0]!.resolved).toBe(false);
    f.answer(alias, { decision: amendment });
    expect(f.origin.replies).toEqual([{ id: 1, result: { decision: amendment } }]);
  });
});

describe("Gateway global native request-ID conflict quarantine", () => {
  test.each([
    { approvalId: "different-approval" }, { kind: "writeStdin" }, { threadId: "different-thread" },
  ])("quarantines changed callback identity across origins before logical lookup", (change) => {
    const f = callbackFixture();
    const first = approval(7);
    f.share(first);
    const pending = [...f.pending.values()][0]!;
    expect(f.share({ ...first, params: { ...first.params, ...change } }, f.peer)).toMatchObject({ conflict: true, deliverToOrigin: false });
    expect(f.pending.size).toBe(1);
    expect(pending.conflicted).toBe(true);
    expect(pending.response).toBeUndefined();
    expect(f.peer.replies).toEqual([{ id: 7, error: expect.objectContaining({ code: -32602 }) }]);
    f.answer(f.peer.sent[0]!.id as string);
    expect(f.origin.replies).toEqual([]);
    expect(pending.resolved).toBe(false);
    expect(f.peer.sent.filter((message) => message.method === "serverRequest/resolved")).toEqual([]);
  });
});
