/** Check wire shapes before caching a winner; Codex still owns decision semantics. */
export function isValidServerRequestResponse(
  method: string,
  message: Record<string, unknown>,
  params?: Record<string, unknown>,
): boolean {
  const hasResult = Object.prototype.hasOwnProperty.call(message, "result");
  const hasError = Object.prototype.hasOwnProperty.call(message, "error");
  if (hasResult === hasError || "method" in message) return false;
  if (hasError) {
    const error = record(message.error);
    return Number.isInteger(error?.code) && typeof error?.message === "string";
  }
  const result = record(message.result);
  switch (method) {
    case "item/commandExecution/requestApproval": {
      const kind = params?.kind;
      if (kind !== undefined && kind !== "command" && kind !== "writeStdin") return false;
      if (!commandDecision(result?.decision)) return false;
      const available = params?.availableDecisions;
      return available === undefined || available === null
        || (Array.isArray(available) && available.some((decision) => canonicalJson(decision) === canonicalJson(result?.decision)));
    }
    case "item/fileChange/requestApproval":
      return simpleDecision(result?.decision);
    case "item/tool/requestUserInput": {
      const answers = record(result?.answers);
      return answers !== undefined && Object.values(answers).every((value) => strings(record(value)?.answers));
    }
    case "mcpServer/elicitation/request":
      return result !== undefined && typeof result.action === "string" && ["accept", "decline", "cancel"].includes(result.action)
        && Object.prototype.hasOwnProperty.call(result, "content")
        && Object.prototype.hasOwnProperty.call(result, "_meta");
    case "item/permissions/requestApproval":
      return grantedPermissions(result?.permissions) && (result?.scope === "turn" || result?.scope === "session")
        && (result.strictAutoReview === undefined || typeof result.strictAutoReview === "boolean");
    default:
      return true;
  }
}

function grantedPermissions(value: unknown): boolean {
  const permissions = record(value);
  if (!permissions) return false;
  if (permissions.network != null) {
    const network = record(permissions.network);
    if (!network || (network.enabled != null && typeof network.enabled !== "boolean")) return false;
  }
  if (permissions.fileSystem != null) {
    const fileSystem = record(permissions.fileSystem);
    if (!fileSystem) return false;
    for (const paths of [fileSystem.read, fileSystem.write]) if (paths != null && !strings(paths)) return false;
    if (fileSystem.globScanMaxDepth != null && (!Number.isInteger(fileSystem.globScanMaxDepth) || Number(fileSystem.globScanMaxDepth) < 0)) return false;
    if (fileSystem.entries != null && (!Array.isArray(fileSystem.entries) || !fileSystem.entries.every(fileSystemEntry))) return false;
  }
  return true;
}

function fileSystemEntry(value: unknown): boolean {
  const entry = record(value);
  if (!entry || (entry.access !== "read" && entry.access !== "write" && entry.access !== "deny")) return false;
  const path = record(entry.path);
  if (!path) return false;
  if (path.type === "path") return typeof path.path === "string";
  if (path.type === "glob_pattern") return typeof path.pattern === "string";
  if (path.type !== "special") return false;
  const special = record(path.value);
  if (!special) return false;
  if (typeof special.kind !== "string") return false;
  if (["root", "minimal", "tmpdir", "slash_tmp"].includes(special.kind)) return true;
  if (special.kind !== "project_roots" && special.kind !== "unknown") return false;
  return (special.kind !== "unknown" || typeof special.path === "string")
    && (special.subpath == null || typeof special.subpath === "string");
}

function commandDecision(value: unknown): boolean {
  if (simpleDecision(value)) return true;
  const decision = record(value);
  if (!decision || Object.keys(decision).length !== 1) return false;
  if ("acceptWithExecpolicyAmendment" in decision) {
    return strings(record(decision.acceptWithExecpolicyAmendment)?.execpolicy_amendment);
  }
  const amendment = record(record(decision.applyNetworkPolicyAmendment)?.network_policy_amendment);
  return typeof amendment?.host === "string" && (amendment.action === "allow" || amendment.action === "deny");
}

function simpleDecision(value: unknown): boolean {
  return typeof value === "string" && ["accept", "acceptForSession", "decline", "cancel"].includes(value);
}

function strings(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "undefined";
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(object[key])}`).join(",")}}`;
}
