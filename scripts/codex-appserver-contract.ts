import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";
import packageJson from "../package.json" with { type: "json" };
import { codexSpawnCommand, isCodexVersionSupported, MINIMUM_CODEX_VERSION, parseCodexVersion } from "../src/providers/agents/codex/spawn.ts";

import { assertCodexUpgradeProtocol, requiresCodexUpgradeContract } from "./codex-upgrade-contract.ts";

const verifyThreads = process.argv.includes("--threads");
const codexBin = process.env.CODEX_BIN?.trim() || "codex";
const workDir = mkdtempSync(join(tmpdir(), "agent-relay-codex-contract-"));

// Never load the operator's credentials, threads, or repository-scoped configuration.
const codexHome = join(workDir, "home");
const runtimeDir = join(workDir, "runtime");
const codexEnv: NodeJS.ProcessEnv = { ...process.env, CODEX_HOME: codexHome, XDG_RUNTIME_DIR: runtimeDir };
for (const key of ["OPENAI_API_KEY", "CODEX_API_KEY", "OPENAI_BASE_URL"]) delete codexEnv[key];
mkdirSync(codexHome, { recursive: true, mode: 0o700 });
mkdirSync(runtimeDir, { recursive: true, mode: 0o700 });

async function main(): Promise<void> {
  try {
    const versionOutput = await runCodex(["--version"]);
    const version = parseCodexVersion(versionOutput);
    if (!version || !isCodexVersionSupported(version)) {
      throw new Error(`Contract requires codex-cli ${MINIMUM_CODEX_VERSION} or newer; received ${JSON.stringify(versionOutput.trim())}.`);
    }

    const expectedVersion = process.env.CODEX_CONTRACT_EXPECT_VERSION?.trim();
    if (expectedVersion && version !== expectedVersion) throw new Error(`Expected codex-cli ${expectedVersion}; received ${version}.`);

    const schemaDir = join(workDir, "schema");
    await runCodex(["app-server", "generate-ts", "--out", schemaDir, "--experimental"], 60_000);
    assertGeneratedProtocol(schemaDir);
    if (requiresCodexUpgradeContract(version)) {
      assertCodexUpgradeProtocol((path) => readFileSync(join(schemaDir, path), "utf8"));
    }

    const rpc = new ContractRpc(codexBin);
    try {
      const initialized = asRecord(await rpc.request("initialize", {
        clientInfo: { name: "agent-relay-contract", title: "Agent Relay Contract", version: packageJson.version },
        capabilities: {
          experimentalApi: true,
          requestAttestation: false,
          mcpServerOpenaiFormElicitation: false,
        },
      }));
      if (typeof initialized?.userAgent !== "string") throw new Error("initialize did not return userAgent.");
      rpc.notify("initialized");

      const models = asRecord(await rpc.request("model/list", { includeHidden: false }));
      if (!Array.isArray(models?.data) || models.data.length === 0) throw new Error("model/list returned no models.");
      const collaborationModes = asRecord(await rpc.request("collaborationMode/list", {}));
      if (!Array.isArray(collaborationModes?.data)) throw new Error("collaborationMode/list returned an invalid payload.");
      const modeNames = collaborationModes.data.map((value) => asRecord(value)?.mode).filter((mode): mode is string => typeof mode === "string");
      if (!modeNames.includes("default") || !modeNames.includes("plan")) throw new Error("collaborationMode/list did not advertise default and plan modes.");

      if (verifyThreads && requiresCodexUpgradeContract(version)) await assertIsolatedThreadSettings(rpc);

      process.stdout.write(`codex app-server contract passed (${version}; ${models.data.length} models; ${collaborationModes.data.length} collaboration modes${verifyThreads && requiresCodexUpgradeContract(version) ? "; isolated settings/resume verified" : ""})\n`);
    } finally {
      await rpc.close();
    }
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
}

/** Empty ephemeral thread only: no turn/start, model call, user thread, or credentials. */
async function assertIsolatedThreadSettings(rpc: ContractRpc): Promise<void> {
  const started = asRecord(await rpc.request("thread/start", { cwd: workDir, ephemeral: true }));
  const threadId = asRecord(started?.thread)?.id;
  const model = started?.model;
  if (typeof threadId !== "string" || typeof model !== "string") throw new Error("Isolated thread/start did not return its native thread and model.");
  try {
    for (const effort of ["high", null]) {
      const updated = asRecord(await rpc.request("thread/settings/update", {
        threadId,
        collaborationMode: { mode: "plan", settings: { model, reasoning_effort: effort, developer_instructions: null } },
      }));
      const settings = asRecord(updated?.threadSettings);
      if (settings?.model !== model || settings?.effort !== effort) throw new Error("thread/settings/update did not preserve model and nullable effort.");
    }
    const resumed = asRecord(await rpc.request("thread/resume", {
      threadId, excludeTurns: true, initialTurnsPage: { limit: 1, sortDirection: "desc", itemsView: "full" },
    }));
    if (!Array.isArray(asRecord(resumed?.initialTurnsPage)?.data)) throw new Error("Experimental initialTurnsPage was not returned for the isolated thread.");
    if (resumed?.model !== model || resumed?.reasoningEffort !== null) throw new Error("thread/resume changed the isolated thread's native model or cleared effort.");
  } finally {
    await rpc.request("thread/unsubscribe", { threadId });
  }
}

function assertGeneratedProtocol(schemaDir: string): void {
  const clientRequestPath = join(schemaDir, "ClientRequest.ts");
  const capabilitiesPath = join(schemaDir, "InitializeCapabilities.ts");
  const userInputPath = join(schemaDir, "v2", "UserInput.ts");
  const notificationsPath = join(schemaDir, "ServerNotification.ts");
  const threadResumePath = join(schemaDir, "v2", "ThreadResumeParams.ts");
  const threadReadPath = join(schemaDir, "v2", "ThreadReadParams.ts");
  const threadPath = join(schemaDir, "v2", "Thread.ts");
  const threadStatusPath = join(schemaDir, "v2", "ThreadStatus.ts");
  const threadActiveFlagPath = join(schemaDir, "v2", "ThreadActiveFlag.ts");
  const threadSettingsUpdatePath = join(schemaDir, "v2", "ThreadSettingsUpdateParams.ts");
  const threadItemPath = join(schemaDir, "v2", "ThreadItem.ts");
  const turnPath = join(schemaDir, "v2", "Turn.ts");
  const turnStartPath = join(schemaDir, "v2", "TurnStartParams.ts");
  const turnSteerPath = join(schemaDir, "v2", "TurnSteerParams.ts");
  const turnInterruptPath = join(schemaDir, "v2", "TurnInterruptParams.ts");
  if (![clientRequestPath, capabilitiesPath, userInputPath, notificationsPath, threadResumePath, threadReadPath, threadPath, threadStatusPath, threadActiveFlagPath, threadSettingsUpdatePath, threadItemPath, turnPath, turnStartPath, turnSteerPath, turnInterruptPath].every(existsSync)) throw new Error("Experimental TypeScript schema was not generated.");
  const requests = readFileSync(clientRequestPath, "utf8");
  const capabilities = readFileSync(capabilitiesPath, "utf8");
  const userInput = readFileSync(userInputPath, "utf8");
  const notifications = readFileSync(notificationsPath, "utf8");
  const threadResume = readFileSync(threadResumePath, "utf8");
  const threadRead = readFileSync(threadReadPath, "utf8");
  const thread = readFileSync(threadPath, "utf8");
  const threadStatus = readFileSync(threadStatusPath, "utf8");
  const threadActiveFlag = readFileSync(threadActiveFlagPath, "utf8");
  const threadSettingsUpdate = readFileSync(threadSettingsUpdatePath, "utf8");
  const threadItem = readFileSync(threadItemPath, "utf8");
  const turn = readFileSync(turnPath, "utf8");
  const turnStart = readFileSync(turnStartPath, "utf8");
  const turnSteer = readFileSync(turnSteerPath, "utf8");
  const turnInterrupt = readFileSync(turnInterruptPath, "utf8");
  for (const method of [
    "model/list",
    "collaborationMode/list",
    "review/start",
    "thread/compact/start",
    "thread/read",
    "thread/settings/update",
    "thread/name/set",
    "thread/goal/set",
    "thread/goal/clear",
    "thread/archive",
    "thread/delete",
    "thread/fork",
    "thread/backgroundTerminals/list",
    "thread/backgroundTerminals/clean",
    "thread/backgroundTerminals/terminate",
    "skills/list",
    "fuzzyFileSearch",
    "turn/start",
    "turn/interrupt",
  ]) {
    if (!requests.includes(`\"method\": \"${method}\"`)) throw new Error(`Generated schema is missing ${method}.`);
  }
  for (const capability of ["experimentalApi", "requestAttestation", "mcpServerOpenaiFormElicitation"]) {
    if (!capabilities.includes(capability)) throw new Error(`Generated schema is missing initialize capability ${capability}.`);
  }
  for (const variant of ["text", "image", "localImage", "audio", "localAudio", "skill", "mention"]) {
    if (!userInput.includes(`\"type\": \"${variant}\"`)) throw new Error(`Generated UserInput is missing ${variant}.`);
  }
  for (const method of [
    "item/reasoning/summaryTextDelta",
    "turn/plan/updated",
    "turn/diff/updated",
    "thread/compacted",
    "thread/name/updated",
    "thread/goal/updated",
    "thread/goal/cleared",
    "thread/status/changed",
    "thread/settings/updated",
    "turn/started",
    "turn/completed",
    "thread/archived",
    "thread/deleted",
    "hook/started",
    "guardianWarning",
    "configWarning",
  ]) {
    if (!notifications.includes(`\"method\": \"${method}\"`)) throw new Error(`Generated notifications are missing ${method}.`);
  }
  if (!threadResume.includes("initialTurnsPage") || !threadResume.includes("excludeTurns")) throw new Error("Generated thread/resume schema is missing latest-turn bootstrap fields.");
  if (!threadRead.includes("includeTurns")) throw new Error("Generated thread/read schema is missing includeTurns.");
  if (!thread.includes("status") || !thread.includes("turns")) throw new Error("Generated Thread is missing status or turns.");
  for (const status of ["notLoaded", "idle", "systemError", "active", "activeFlags"]) {
    if (!threadStatus.includes(status)) throw new Error(`Generated ThreadStatus is missing ${status}.`);
  }
  for (const flag of ["waitingOnApproval", "waitingOnUserInput"]) {
    if (!threadActiveFlag.includes(flag)) throw new Error(`Generated ThreadActiveFlag is missing ${flag}.`);
  }
  if (!threadSettingsUpdate.includes("collaborationMode")) throw new Error("Generated thread/settings/update schema is missing collaborationMode.");
  if (!threadItem.includes('"type": "userMessage"') || !threadItem.includes("clientId") || !threadItem.includes("content")) {
    throw new Error("Generated ThreadItem is missing shared user-message fields.");
  }
  if (!turnStart.includes("clientUserMessageId") || !turnSteer.includes("clientUserMessageId")) {
    throw new Error("Generated turn input schemas are missing clientUserMessageId.");
  }
  if (!turnStart.includes("collaborationMode")) throw new Error("Generated turn/start schema is missing collaborationMode.");
  if (!turnInterrupt.includes("threadId") || !turnInterrupt.includes("turnId")) throw new Error("Generated turn/interrupt schema is missing threadId or turnId.");
  for (const field of ["items", "status", "error", "startedAt", "completedAt", "durationMs"]) {
    if (!turn.includes(field)) throw new Error(`Generated Turn is missing ${field}.`);
  }
}

async function runCodex(args: string[], timeoutMs = 30_000): Promise<string> {
  const command = codexSpawnCommand(codexBin, args);
  return await new Promise<string>((resolve, reject) => {
    const child = spawn(command.command, command.args, {
      env: codexEnv,
      cwd: workDir,
      windowsHide: true,
      windowsVerbatimArguments: command.windowsVerbatimArguments,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`Codex command timed out: ${args.join(" ")}`));
    }, timeoutMs);
    child.stdout.on("data", (chunk) => { stdout += chunk.toString(); });
    child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("exit", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(`${stdout}\n${stderr}`);
      else reject(new Error(`Codex command failed (${code ?? "unknown"}): ${stderr || stdout}`));
    });
  });
}

class ContractRpc {
  private readonly proc: ChildProcessWithoutNullStreams;
  private readonly pending = new Map<number, { resolve(value: unknown): void; reject(error: Error): void }>();
  private nextId = 1;
  private stderr = "";

  constructor(bin: string) {
    const command = codexSpawnCommand(bin, ["app-server", "--listen", "stdio://"]);
    this.proc = spawn(command.command, command.args, {
      env: codexEnv,
      cwd: workDir,
      windowsHide: true,
      windowsVerbatimArguments: command.windowsVerbatimArguments,
      stdio: ["pipe", "pipe", "pipe"],
    });
    createInterface({ input: this.proc.stdout }).on("line", (line) => this.handleLine(line));
    this.proc.stderr.on("data", (chunk) => { this.stderr = `${this.stderr}${chunk.toString()}`.slice(-8_000); });
    this.proc.on("exit", (code) => {
      const error = new Error(`Codex app-server exited (${code ?? "unknown"}): ${this.stderr}`);
      for (const pending of this.pending.values()) pending.reject(error);
      this.pending.clear();
    });
  }

  async request(method: string, params: unknown): Promise<unknown> {
    const id = this.nextId++;
    return await new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Timed out waiting for ${method}.`));
      }, 30_000);
      this.pending.set(id, {
        resolve: (value) => { clearTimeout(timer); resolve(value); },
        reject: (error) => { clearTimeout(timer); reject(error); },
      });
      this.write({ id, method, params });
    });
  }

  notify(method: string): void {
    this.write({ method });
  }

  async close(): Promise<void> {
    if (this.proc.exitCode !== null) return;
    this.proc.kill();
    await new Promise<void>((resolve) => this.proc.once("exit", () => resolve()));
  }

  private handleLine(line: string): void {
    let message: Record<string, unknown>;
    try {
      message = JSON.parse(line) as Record<string, unknown>;
    } catch {
      throw new Error(`Invalid app-server JSON: ${line}`);
    }
    if (typeof message.id === "number" && typeof message.method === "string") {
      this.write({ id: message.id, error: { code: -32601, message: `Unexpected server request: ${message.method}` } });
      return;
    }
    if (typeof message.id !== "number") return;
    const pending = this.pending.get(message.id);
    if (!pending) return;
    this.pending.delete(message.id);
    const error = asRecord(message.error);
    if (error) pending.reject(new Error(String(error.message ?? JSON.stringify(error))));
    else pending.resolve(message.result);
  }

  private write(message: unknown): void {
    this.proc.stdin.write(`${JSON.stringify(message)}\n`);
  }
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" ? value as Record<string, unknown> : undefined;
}

await main();
