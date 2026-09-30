import { emitKeypressEvents } from "node:readline";
import type { ReadStream, WriteStream } from "node:tty";

export interface TextPromptOptions {
  defaultValue?: string;
  secret?: boolean;
}

export interface Choice<T extends string = string> {
  value: T;
  label: string;
}

export interface WizardUI {
  write(message: string): void;
  text(message: string, options?: TextPromptOptions): Promise<string>;
  confirm(message: string, defaultValue?: boolean): Promise<boolean>;
  choose<T extends string>(message: string, choices: readonly Choice<T>[], defaultValue?: T): Promise<T>;
  close?(): void;
}

export class WizardCancelledError extends Error {
  constructor() {
    super("Setup cancelled. No configuration was saved.");
    this.name = "WizardCancelledError";
  }
}

/** Prevent control characters from turning config defaults into terminal commands. */
export function terminalText(value: string): string {
  return value.replace(/[\u0000-\u001f\u007f-\u009f]/g, "");
}

/** A small terminal UI. Secrets are read in raw mode and never echoed. */
export class TerminalWizardUI implements WizardUI {
  private pendingCancel?: () => void;
  private closed = false;

  constructor(
    private readonly input: ReadStream = process.stdin,
    private readonly output: WriteStream = process.stdout,
  ) {}

  write(message: string): void {
    this.output.write(`${message.split("\n").map(terminalText).join("\n")}\n`);
  }

  async text(message: string, options: TextPromptOptions = {}): Promise<string> {
    if (this.closed) throw new WizardCancelledError();
    if (!this.input.isTTY || !this.output.isTTY || typeof this.input.setRawMode !== "function") {
      throw new Error("Interactive setup requires a terminal (TTY). Run agent-relay install in a terminal.");
    }
    if (this.pendingCancel) throw new Error("A setup prompt is already active.");

    const suffix = options.defaultValue
      ? options.secret ? " [saved value; Enter to keep]" : ` [${terminalText(options.defaultValue)}]`
      : "";
    this.output.write(`${terminalText(message)}${suffix}: `);
    const wasRaw = this.input.isRaw;
    const wasPaused = this.input.isPaused();
    emitKeypressEvents(this.input);
    this.input.setRawMode(true);
    this.input.resume();

    return new Promise<string>((resolve, reject) => {
      let value = "";
      const cleanup = (): void => {
        this.input.removeListener("keypress", onKey);
        this.input.removeListener("end", onCancel);
        this.input.removeListener("error", onCancel);
        this.input.removeListener("close", onCancel);
        this.pendingCancel = undefined;
        this.input.setRawMode(wasRaw);
        if (wasPaused) this.input.pause();
      };
      const finish = (): void => {
        cleanup();
        this.output.write("\n");
        resolve(value || options.defaultValue || "");
      };
      const onCancel = (): void => {
        cleanup();
        this.output.write("\n");
        reject(new WizardCancelledError());
      };
      const onKey = (text: string | undefined, key: { name?: string; ctrl?: boolean; meta?: boolean } = {}): void => {
        if (key.ctrl && (key.name === "c" || key.name === "d")) {
          onCancel();
          return;
        }
        if (key.name === "return" || key.name === "enter") {
          finish();
          return;
        }
        if (key.name === "backspace") {
          if (value.length > 0) {
            value = Array.from(value).slice(0, -1).join("");
            this.output.write("\b \b");
          }
          return;
        }
        // Ignore navigation/escape sequences, including their printable tails.
        if (key.ctrl || key.meta || !text || text.includes("\u001b")) return;
        const addition = terminalText(text).slice(0, Math.max(0, 4096 - value.length));
        value += addition;
        this.output.write(options.secret ? "*".repeat(Array.from(addition).length) : addition);
      };
      this.pendingCancel = onCancel;
      this.input.on("keypress", onKey);
      this.input.once("end", onCancel);
      this.input.once("error", onCancel);
      this.input.once("close", onCancel);
    });
  }

  async confirm(message: string, defaultValue = false): Promise<boolean> {
    for (;;) {
      const answer = (await this.text(`${message} ${defaultValue ? "[Y/n]" : "[y/N]"}`)).trim().toLowerCase();
      if (!answer) return defaultValue;
      if (answer === "y" || answer === "yes") return true;
      if (answer === "n" || answer === "no") return false;
      this.write("Please answer yes or no.");
    }
  }

  async choose<T extends string>(message: string, choices: readonly Choice<T>[], defaultValue?: T): Promise<T> {
    if (choices.length === 0) throw new Error("A setup choice needs at least one option.");
    this.write(message);
    choices.forEach((choice, index) => this.write(`  ${index + 1}. ${choice.label}`));
    const defaultIndex = choices.findIndex((choice) => choice.value === defaultValue);
    for (;;) {
      const answer = (await this.text("Select a number", {
        defaultValue: String(defaultIndex < 0 ? 1 : defaultIndex + 1),
      })).trim();
      const selected = /^\d+$/.test(answer) ? choices[Number(answer) - 1] : undefined;
      if (selected) return selected.value;
      this.write(`Choose a number from 1 to ${choices.length}.`);
    }
  }

  close(): void {
    this.closed = true;
    this.pendingCancel?.();
    // emitKeypressEvents resumes stdin. Release its event-loop reference after
    // the wizard, otherwise a successful save leaves the CLI waiting forever.
    this.input.pause();
  }
}
