import { describe, it, expect, vi, beforeEach } from "vitest";
import { warnIfInsecureUrl } from "./init-prompts.js";

describe("warnIfInsecureUrl", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  it("warns when server URL uses HTTP for non-localhost", () => {
    warnIfInsecureUrl("http://prod.example.com");
    expect(console.warn).toHaveBeenCalledTimes(1);
    expect(console.warn).toHaveBeenCalledWith(
      "⚠️  Warning: The provided MCP server URL uses HTTP, not HTTPS.\n" +
        "   API keys and lesson content will be transmitted in the clear.\n" +
        "   Consider using HTTPS for your Lore server."
    );
  });

  it("warns when server URL uses HTTP for non-localhost with port", () => {
    warnIfInsecureUrl("http://my-server.com:3100");
    expect(console.warn).toHaveBeenCalledTimes(1);
  });

  it("does not warn when server URL uses HTTPS", () => {
    warnIfInsecureUrl("https://prod.example.com");
    expect(console.warn).not.toHaveBeenCalled();
  });

  it("does not warn for localhost HTTP", () => {
    warnIfInsecureUrl("http://localhost:3100");
    expect(console.warn).not.toHaveBeenCalled();
  });

  it("does not warn for localhost HTTP without port", () => {
    warnIfInsecureUrl("http://localhost");
    expect(console.warn).not.toHaveBeenCalled();
  });

  it("does not warn for 127.0.0.1 HTTP", () => {
    warnIfInsecureUrl("http://127.0.0.1:3100");
    expect(console.warn).not.toHaveBeenCalled();
  });

  it("does not warn for localhost HTTPS", () => {
    warnIfInsecureUrl("https://localhost:3100");
    expect(console.warn).not.toHaveBeenCalled();
  });
});
