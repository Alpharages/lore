import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@inquirer/checkbox", () => ({
  default: vi.fn(),
}));

import checkbox from "@inquirer/checkbox";
import { promptIdeSelection } from "./install-prompts.js";
import { IDE_PROFILES } from "../core/ide-config.js";

const mockedCheckbox = vi.mocked(checkbox);

describe("promptIdeSelection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns empty array when no profiles provided", async () => {
    const result = await promptIdeSelection([], []);
    expect(result).toEqual([]);
    expect(mockedCheckbox).not.toHaveBeenCalled();
  });

  it("calls checkbox with correct choices and pre-checks detected profiles", async () => {
    mockedCheckbox.mockResolvedValue(["cursor", "claude-code"]);

    const detected = ["cursor"];
    const result = await promptIdeSelection(IDE_PROFILES, detected);

    expect(mockedCheckbox).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "Select IDEs/agents to configure MCP servers for (press Enter to skip):",
        shortcuts: { all: "a", invert: "i" },
      })
    );

    const calls = mockedCheckbox.mock.calls[0][0] as unknown as {
      choices: Array<{ name: string; value: string; checked: boolean }>;
    };
    const cursorChoice = calls.choices.find((c) => c.value === "cursor");
    const claudeCodeChoice = calls.choices.find((c) => c.value === "claude-code");

    expect(cursorChoice?.checked).toBe(true);
    expect(claudeCodeChoice?.checked).toBe(false);
    expect(result).toEqual(["cursor", "claude-code"]);
  });

  it("shows [detected] label on detected profiles", async () => {
    mockedCheckbox.mockResolvedValue(["cursor"]);

    await promptIdeSelection(IDE_PROFILES, ["cursor"]);

    const calls = mockedCheckbox.mock.calls[0][0] as unknown as {
      choices: Array<{ name: string }>;
    };
    const cursorChoice = calls.choices.find((c) => c.name.includes("Cursor"));
    expect(cursorChoice?.name).toContain("[detected]");
  });

  it("exits with code 130 on Ctrl-C (ExitPromptError)", async () => {
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("process.exit");
    });

    mockedCheckbox.mockRejectedValue({ name: "ExitPromptError" });

    await expect(promptIdeSelection(IDE_PROFILES, [])).rejects.toThrow("process.exit");
    expect(exitSpy).toHaveBeenCalledWith(130);

    exitSpy.mockRestore();
  });

  it("exits with code 130 on legacy CancelPromptError", async () => {
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("process.exit");
    });

    mockedCheckbox.mockRejectedValue({ name: "CancelPromptError" });

    await expect(promptIdeSelection(IDE_PROFILES, [])).rejects.toThrow("process.exit");
    expect(exitSpy).toHaveBeenCalledWith(130);

    exitSpy.mockRestore();
  });

  it("re-throws non-cancellation errors", async () => {
    mockedCheckbox.mockRejectedValue(new Error("Unexpected failure"));

    await expect(promptIdeSelection(IDE_PROFILES, [])).rejects.toThrow("Unexpected failure");
  });
});
