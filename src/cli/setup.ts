// Private installed-wizard entry point. The public CLI exposes setup only through install.
import { importEnvFile, mergeConfigEnv, readConfigFile, requireAbsoluteState, writeConfigFile } from "./config-file.ts";
import { launchCommand, shellQuote } from "./install.ts";
import { parseArgs, redactCliError } from "./main.ts";
import { runWizard } from "./wizard.ts";
import type { Env } from "../runtime/config-types.ts";

export async function configure(options: { configPath: string; envFile?: string }, env: Env = process.env): Promise<number> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) throw new Error("Setup requires an interactive terminal (TTY). Run agent-relay install in a terminal.");
  const saved = options.envFile ? importEnvFile(options.envFile) : readConfigFile(options.configPath);
  const initial = requireAbsoluteState(mergeConfigEnv(saved ?? {}, env), options.configPath);
  try {
    const result = await runWizard({ initial, configPath: options.configPath });
    if (!result) { console.log("Setup cancelled; configuration was not changed."); return 130; }
    writeConfigFile(options.configPath, result);
    console.log(`Saved private configuration: ${options.configPath}`);
    if (process.platform === "win32") console.log("Keep this file in your private Windows profile; POSIX chmod does not enforce Windows ACLs.");
    const command = env.AGENT_RELAY_INSTALLED_EXECUTABLE ? launchCommand(env.AGENT_RELAY_INSTALLED_EXECUTABLE) : "agent-relay";
    console.log(`Run ${command} doctor --config ${shellQuote(options.configPath)}, then ${command} start --config ${shellQuote(options.configPath)}. Setup does not start a bot or a Gateway.`);
    return 0;
  } catch (error) { throw new Error(redactCliError(error, initial)); }
}

if (import.meta.main) {
  try {
    const options = parseArgs(["install", ...process.argv.slice(2)]);
    if (options.command !== "install" || options.prefix || options.packageFile) throw new Error("Run agent-relay install to configure this installation.");
    process.exitCode = await configure(options);
  } catch (error) { console.error(redactCliError(error, process.env)); process.exitCode = 1; }
}
