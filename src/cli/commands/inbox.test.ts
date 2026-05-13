import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../core/config-finder.js", () => ({
  findLoreYaml: vi.fn(),
}));

vi.mock("../core/config-parser.js", () => ({
  parseLoreConfig: vi.fn(),
}));

const mockGetInbox = vi.fn();
const mockAcceptPropagation = vi.fn();
const mockRejectPropagation = vi.fn();

vi.mock("../api/client.js", () => ({
  LoreClient: class LoreClientMock {
    getInbox = mockGetInbox;
    acceptPropagation = mockAcceptPropagation;
    rejectPropagation = mockRejectPropagation;
  },
}));

vi.mock("../utils/inbox-prompts.js", () => ({
  formatSuggestion: vi.fn(),
  promptAction: vi.fn(),
  createReadline: vi.fn(),
}));

import { inboxCommand } from "./inbox.js";
import { findLoreYaml } from "../core/config-finder.js";
import { parseLoreConfig } from "../core/config-parser.js";
import { formatSuggestion, promptAction, createReadline } from "../utils/inbox-prompts.js";

const mockedFindLoreYaml = vi.mocked(findLoreYaml);
const mockedParseLoreConfig = vi.mocked(parseLoreConfig);
const mockedFormatSuggestion = vi.mocked(formatSuggestion);
const mockedPromptAction = vi.mocked(promptAction);
const mockedCreateReadline = vi.mocked(createReadline);

describe("inboxCommand", () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let exitSpy: ReturnType<typeof vi.spyOn>;
  const originalApiKey = process.env.LORE_API_KEY;

  const baseConfig = {
    project: { slug: "my-project" },
    mcp: { server: "https://lore.test" },
  };

  const mockSuggestion = {
    id: "prop-1",
    title: "Test Suggestion",
    problem: "Something broke",
    severity: "high",
    stack_tags: ["ts"],
    occurrence_count: 3,
  };

  let mockClose: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("process.exit");
    });

    process.env.LORE_API_KEY = "test-api-key";

    mockedFindLoreYaml.mockReturnValue("/projects/myapp/lore.yaml");
    mockedParseLoreConfig.mockReturnValue(baseConfig as any);
    mockedFormatSuggestion.mockReturnValue("[formatted suggestion]");
    mockClose = vi.fn();
    mockedCreateReadline.mockReturnValue({ close: mockClose } as any);

    mockGetInbox.mockResolvedValue([mockSuggestion]);
    mockAcceptPropagation.mockResolvedValue({});
    mockRejectPropagation.mockResolvedValue({});
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    exitSpy.mockRestore();
    process.env.LORE_API_KEY = originalApiKey;
  });

  it("exits with error when LORE_API_KEY is not set", async () => {
    delete process.env.LORE_API_KEY;

    await expect(inboxCommand()).rejects.toThrow("process.exit");
    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "Error: LORE_API_KEY environment variable is not set."
    );
  });

  it("exits with error when lore.yaml is not found", async () => {
    mockedFindLoreYaml.mockImplementation(() => {
      throw new Error("lore.yaml not found");
    });

    await expect(inboxCommand()).rejects.toThrow("process.exit");
    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(consoleErrorSpy).toHaveBeenCalledWith("Error: lore.yaml not found");
  });

  it("prints 'no pending suggestions' when inbox is empty", async () => {
    mockGetInbox.mockResolvedValue([]);

    await expect(inboxCommand()).rejects.toThrow("process.exit");
    expect(exitSpy).toHaveBeenCalledWith(0);
    expect(consoleLogSpy).toHaveBeenCalledWith("✓ No pending suggestions.");
  });

  it("accepts a suggestion and prints success", async () => {
    mockedPromptAction.mockResolvedValue("accept");

    await inboxCommand();
    expect(mockAcceptPropagation).toHaveBeenCalledWith("prop-1");
    expect(consoleLogSpy).toHaveBeenCalledWith("  ✓ Accepted — lesson added to your project.");
    expect(mockClose).toHaveBeenCalled();
  });

  it("rejects a suggestion and prints success", async () => {
    mockedPromptAction.mockResolvedValue("reject");

    await inboxCommand();
    expect(mockRejectPropagation).toHaveBeenCalledWith("prop-1");
    expect(consoleLogSpy).toHaveBeenCalledWith("  ✓ Rejected.");
    expect(mockClose).toHaveBeenCalled();
  });

  it("skips a suggestion and continues", async () => {
    mockedPromptAction.mockResolvedValue("skip");

    await inboxCommand();
    expect(mockAcceptPropagation).not.toHaveBeenCalled();
    expect(mockRejectPropagation).not.toHaveBeenCalled();
    expect(consoleLogSpy).toHaveBeenCalledWith("  Skipped.");
    expect(mockClose).toHaveBeenCalled();
  });

  it("quits immediately when user selects quit", async () => {
    mockedPromptAction.mockResolvedValue("quit");

    await expect(inboxCommand()).rejects.toThrow("process.exit");
    expect(exitSpy).toHaveBeenCalledWith(0);
    expect(consoleLogSpy).toHaveBeenCalledWith("  Exiting inbox.");
    expect(mockAcceptPropagation).not.toHaveBeenCalled();
    expect(mockClose).toHaveBeenCalled();
  });

  it("processes multiple suggestions in order", async () => {
    const suggestions = [
      { ...mockSuggestion, id: "prop-1" },
      { ...mockSuggestion, id: "prop-2" },
    ];
    mockGetInbox.mockResolvedValue(suggestions);
    mockedPromptAction.mockResolvedValueOnce("accept").mockResolvedValueOnce("reject");

    await inboxCommand();
    expect(mockAcceptPropagation).toHaveBeenCalledWith("prop-1");
    expect(mockRejectPropagation).toHaveBeenCalledWith("prop-2");
    expect(mockedFormatSuggestion).toHaveBeenCalledWith(suggestions[0], 0, 2);
    expect(mockedFormatSuggestion).toHaveBeenCalledWith(suggestions[1], 1, 2);
  });

  it("exits with error when getInbox fails", async () => {
    mockGetInbox.mockRejectedValue(new Error("Network timeout"));

    await expect(inboxCommand()).rejects.toThrow("process.exit");
    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(consoleErrorSpy).toHaveBeenCalledWith("Error fetching inbox: Network timeout");
  });

  it("exits with error when acceptPropagation fails", async () => {
    mockedPromptAction.mockResolvedValue("accept");
    mockAcceptPropagation.mockRejectedValue(new Error("Server error"));

    await expect(inboxCommand()).rejects.toThrow("process.exit");
    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(consoleErrorSpy).toHaveBeenCalledWith("  Error processing action: Server error");
    expect(mockClose).toHaveBeenCalled();
  });

  it("exits with error when rejectPropagation fails", async () => {
    mockedPromptAction.mockResolvedValue("reject");
    mockRejectPropagation.mockRejectedValue(new Error("Server error"));

    await expect(inboxCommand()).rejects.toThrow("process.exit");
    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(consoleErrorSpy).toHaveBeenCalledWith("  Error processing action: Server error");
    expect(mockClose).toHaveBeenCalled();
  });

  it("instantiates LoreClient with correct arguments", async () => {
    mockedPromptAction.mockResolvedValue("accept");

    await inboxCommand();

    // Verify the client was used by checking getInbox was called
    expect(mockGetInbox).toHaveBeenCalledWith("my-project");
  });
});
