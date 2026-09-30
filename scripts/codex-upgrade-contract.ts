import ts from "typescript";

/** Structural checks for the release features Relay uses, shared by live and pinned-fixture tests. */
export const CODEX_UPGRADE_SCHEMA_FILES = [
  "v2/CommandExecutionRequestApprovalParams.ts",
  "v2/CommandExecutionApprovalKind.ts",
  "v2/ToolRequestUserInputParams.ts",
  "v2/ThreadSettings.ts",
  "v2/Thread.ts",
  "v2/ThreadResumeParams.ts",
  "v2/ThreadResumeResponse.ts",
  "v2/ThreadForkResponse.ts",
  "Settings.ts",
] as const;

export function requiresCodexUpgradeContract(version: string): boolean {
  const parts = version.split(/[.-]/).slice(0, 3).map(Number);
  return (parts[0] ?? 0) > 0 || (parts[1] ?? 0) > 159 || ((parts[1] ?? 0) === 159 && (parts[2] ?? 0) >= 2);
}

export function assertCodexUpgradeProtocol(read: (path: string) => string): void {
  const types = new Map<string, ts.TypeNode>();
  for (const path of CODEX_UPGRADE_SCHEMA_FILES) {
    const name = path.split("/").at(-1)!.replace(/\.ts$/, "");
    const source = ts.createSourceFile(path, read(path), ts.ScriptTarget.Latest, true);
    const alias = source.statements.find((node): node is ts.TypeAliasDeclaration => ts.isTypeAliasDeclaration(node) && node.name.text === name);
    if (!alias) throw new Error(`Generated schema is missing type ${name}.`);
    types.set(name, alias.type);
  }

  const property = (typeName: string, name: string, expected: string[]): void => {
    const type = types.get(typeName)!;
    const member = ts.isTypeLiteralNode(type) ? type.members.find((node): node is ts.PropertySignature =>
      ts.isPropertySignature(node) && (ts.isIdentifier(node.name) || ts.isStringLiteral(node.name)) && node.name.text === name) : undefined;
    if (!member?.type || !expected.every((part) => unionParts(member.type!).includes(part))) {
      throw new Error(`Generated ${typeName}.${name} must include ${expected.join(" | ")}.`);
    }
  };

  property("CommandExecutionRequestApprovalParams", "approvalId", ["string", "null"]);
  property("CommandExecutionRequestApprovalParams", "kind", ["CommandExecutionApprovalKind"]);
  property("CommandExecutionRequestApprovalParams", "availableDecisions", ["Array<CommandExecutionApprovalDecision>", "null"]);
  const approvalKinds = unionParts(types.get("CommandExecutionApprovalKind")!);
  for (const kind of ['"command"', '"writeStdin"']) {
    if (!approvalKinds.includes(kind)) throw new Error(`Generated CommandExecutionApprovalKind is missing ${kind}.`);
  }
  property("ToolRequestUserInputParams", "isBlocking", ["boolean"]);
  property("ThreadSettings", "effort", ["ReasoningEffort", "null"]);
  property("ThreadSettings", "model", ["string"]);
  property("Thread", "model", ["string", "null"]);
  property("Thread", "reasoningEffort", ["ReasoningEffort", "null"]);
  property("ThreadResumeParams", "excludeTurns", ["boolean"]);
  property("ThreadResumeParams", "initialTurnsPage", ["ThreadResumeInitialTurnsPageParams", "null"]);
  property("ThreadResumeResponse", "initialTurnsPage", ["TurnsPage", "null"]);
  for (const type of ["ThreadResumeResponse", "ThreadForkResponse"]) {
    property(type, "model", ["string"]);
    property(type, "reasoningEffort", ["ReasoningEffort", "null"]);
  }
  property("Settings", "model", ["string"]);
  property("Settings", "reasoning_effort", ["ReasoningEffort", "null"]);
}

function unionParts(type: ts.TypeNode): string[] {
  return (ts.isUnionTypeNode(type) ? type.types : [type]).map((node) => node.getText().replace(/\s+/g, ""));
}
