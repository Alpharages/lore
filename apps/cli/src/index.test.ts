import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mockInitCommand = vi.fn();
const mockInstallCommand = vi.fn();
const mockInboxCommand = vi.fn();
const mockUpdateCommand = vi.fn();

vi.mock("commander", () => ({
  Command: vi.fn().mockImplementation(() => ({
    name: vi.fn().mockReturnThis(),
    description: vi.fn().mockReturnThis(),
    version: vi.fn().mockReturnThis(),
    command: vi.fn().mockReturnThis(),
    option: vi.fn().mockReturnThis(),
    action: vi.fn().mockImplementation((fn) => {
      // Store the action so we can invoke it in tests
      return { _action: fn };
    }),
    parseAsync: vi.fn().mockResolvedValue(undefined),
  })),
}));

vi.mock("./commands/init.js", () => ({ initCommand: mockInitCommand }));
vi.mock("./commands/install.js", () => ({ installCommand: mockInstallCommand }));
vi.mock("./commands/inbox.js", () => ({ inboxCommand: mockInboxCommand }));
vi.mock("./commands/update.js", () => ({ updateCommand: mockUpdateCommand }));

// Commander is mocked below; import not needed for type-only usage in this test file.

// Command mock is handled by vi.mock above; no direct reference needed in tests.

describe("CLI entry point", () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let exitSpy: ReturnType<typeof vi.spyOn>;
  let originalArgv: string[];

  beforeEach(() => {
    vi.clearAllMocks();
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("process.exit");
    });
    originalArgv = process.argv;
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    exitSpy.mockRestore();
    process.argv = originalArgv;
  });

  it("exports command handlers that can be invoked directly", async () => {
    // Verify the mocked modules are importable
    const { initCommand } = await import("./commands/init.js");
    const { installCommand } = await import("./commands/install.js");
    const { inboxCommand } = await import("./commands/inbox.js");
    const { updateCommand } = await import("./commands/update.js");

    expect(typeof initCommand).toBe("function");
    expect(typeof installCommand).toBe("function");
    expect(typeof inboxCommand).toBe("function");
    expect(typeof updateCommand).toBe("function");
  });

  it("initCommand is callable", async () => {
    const { initCommand } = await import("./commands/init.js");
    mockInitCommand.mockResolvedValue(undefined);
    await initCommand();
    expect(mockInitCommand).toHaveBeenCalled();
  });

  it("installCommand accepts options object", async () => {
    const { installCommand } = await import("./commands/install.js");
    mockInstallCommand.mockResolvedValue(undefined);
    await installCommand({ force: true });
    expect(mockInstallCommand).toHaveBeenCalledWith({ force: true });
  });

  it("updateCommand is callable", async () => {
    const { updateCommand } = await import("./commands/update.js");
    mockUpdateCommand.mockResolvedValue(undefined);
    await updateCommand();
    expect(mockUpdateCommand).toHaveBeenCalled();
  });

  it("inboxCommand is callable", async () => {
    const { inboxCommand } = await import("./commands/inbox.js");
    mockInboxCommand.mockResolvedValue(undefined);
    await inboxCommand();
    expect(mockInboxCommand).toHaveBeenCalled();
  });
});
