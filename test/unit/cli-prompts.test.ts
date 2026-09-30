import { describe, expect, test } from "bun:test";
import { PassThrough } from "node:stream";
import type { ReadStream, WriteStream } from "node:tty";
import { TerminalWizardUI, WizardCancelledError, terminalText } from "../../src/cli/prompts.ts";

function terminal() {
  const input = new PassThrough() as PassThrough & { isTTY: boolean; isRaw: boolean; setRawMode: (raw: boolean) => void };
  input.isTTY = true;
  input.isRaw = false;
  input.setRawMode = (raw) => { input.isRaw = raw; };
  const output = new PassThrough() as PassThrough & { isTTY: boolean };
  output.isTTY = true;
  let written = "";
  output.on("data", (chunk) => { written += chunk.toString(); });
  const ui = new TerminalWizardUI(input as unknown as ReadStream, output as unknown as WriteStream);
  return { ui, input, output, written: () => written };
}

const tick = () => new Promise<void>((resolve) => setImmediate(resolve));

describe("setup terminal prompts", () => {
  test("masks typed secrets, handles backspace, and restores raw mode", async () => {
    const { ui, input, written } = terminal();
    const answer = ui.text("Token", { secret: true });
    expect(input.isRaw).toBe(true);
    input.write("secretX\x7f\r");
    expect(await answer).toBe("secret");
    expect(written()).not.toContain("secret");
    expect(written()).toContain("*******");
    expect(input.isRaw).toBe(false);
    expect(input.listenerCount("keypress")).toBe(0);
    ui.close();
    expect(input.isPaused()).toBe(true);
  });

  test("retains an existing credential without displaying its default", async () => {
    const { ui, input, written } = terminal();
    const answer = ui.text("Token", { secret: true, defaultValue: "saved-private-token" });
    input.write("\r");
    expect(await answer).toBe("saved-private-token");
    expect(written()).not.toContain("saved-private-token");
    expect(written()).toContain("saved value; Enter to keep");
    ui.close();
  });

  test("Ctrl+C and Ctrl+D cancel without echoing a partial secret", async () => {
    for (const key of ["\x03", "\x04"]) {
      const { ui, input, written } = terminal();
      const answer = ui.text("Secret", { secret: true });
      const rejection = answer.catch((error: unknown) => error);
      input.write(`private${key}`);
      expect(await rejection).toBeInstanceOf(WizardCancelledError);
      expect(written()).not.toContain("private");
      expect(input.isRaw).toBe(false);
      expect(input.listenerCount("keypress")).toBe(0);
      ui.close();
    }
  });

  test("closing a prompt cancels and preserves previously active raw mode", async () => {
    const { ui, input } = terminal();
    input.isRaw = true;
    const answer = ui.text("Prompt");
    const rejection = answer.catch((error: unknown) => error);
    ui.close();
    expect(await rejection).toBeInstanceOf(WizardCancelledError);
    expect(input.isRaw).toBe(true);
    await expect(ui.text("Again")).rejects.toBeInstanceOf(WizardCancelledError);
  });

  test("non-TTY input is rejected rather than exposing unmasked secrets", async () => {
    const { ui, input, written } = terminal();
    input.isTTY = false;
    await expect(ui.text("Token", { secret: true, defaultValue: "never-display" })).rejects.toThrow("requires a terminal");
    expect(written()).toBe("");
    ui.close();
  });

  test("confirmation defaults to no and invalid answers are retried", async () => {
    const { ui, input, written } = terminal();
    const answer = ui.confirm("Send credentials?");
    input.write("perhaps\r");
    await tick();
    expect(written()).toContain("Please answer yes or no");
    input.write("\r");
    expect(await answer).toBe(false);
    ui.close();
  });

  test("choice accepts only offered numeric selections and uses its default", async () => {
    const { ui, input, written } = terminal();
    const answer = ui.choose("Region", [{ value: "feishu", label: "Feishu" }, { value: "lark", label: "Lark" }], "lark");
    input.write("99\r");
    await tick();
    expect(written()).toContain("Choose a number from 1 to 2");
    input.write("\r");
    expect(await answer).toBe("lark");
    ui.close();
  });

  test("strips terminal control characters from defaults and output", async () => {
    const { ui, input, written } = terminal();
    ui.write("A\x1b[2JB");
    const answer = ui.text("Path", { defaultValue: "\x1b[31mred" });
    input.write("ok\r");
    expect(await answer).toBe("ok");
    expect(written()).not.toContain("\x1b");
    expect(terminalText("a\0b\r\nc")).toBe("abc");
    ui.close();
  });
});
