import { describe, it, expect, vi, beforeEach } from "vitest";
import { LoreClient } from "./client.js";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

describe("LoreClient", () => {
  const baseUrl = "http://localhost:3100";
  const apiKey = "lore_testproject_abcdefghijklmnopqrstuvwx";
  let client: LoreClient;

  beforeEach(() => {
    vi.clearAllMocks();
    client = new LoreClient(baseUrl, apiKey);
  });

  describe("getInbox", () => {
    it("calls GET /api/projects/:slug/inbox with auth header", async () => {
      const suggestions = [
        {
          id: "prop-1",
          title: "Test Lesson",
          problem: "Some problem",
          severity: "high",
          stack_tags: ["ts"],
          occurrence_count: 2,
        },
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => suggestions,
      });

      const result = await client.getInbox("testproject");

      expect(mockFetch).toHaveBeenCalledWith(`${baseUrl}/api/projects/testproject/inbox`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        signal: expect.any(AbortSignal),
      });
      expect(result).toEqual(suggestions);
    });

    it("throws on non-ok response", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        text: async () => "Unauthorized",
      });

      await expect(client.getInbox("testproject")).rejects.toThrow("401");
    });
  });

  describe("acceptPropagation", () => {
    it("calls POST /api/propagations/:id/accept with auth header", async () => {
      const response = { action: "accepted", new_lesson_id: "lesson-uuid" };
      mockFetch.mockResolvedValueOnce({ ok: true, json: async () => response });

      const result = await client.acceptPropagation("prop-uuid-123");

      expect(mockFetch).toHaveBeenCalledWith(`${baseUrl}/api/propagations/prop-uuid-123/accept`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        signal: expect.any(AbortSignal),
      });
      expect(result).toEqual(response);
    });

    it("throws on non-ok response", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        text: async () => "Not Found",
      });

      await expect(client.acceptPropagation("bad-id")).rejects.toThrow("404");
    });
  });

  describe("rejectPropagation", () => {
    it("calls POST /api/propagations/:id/reject with auth header", async () => {
      const response = { action: "rejected" };
      mockFetch.mockResolvedValueOnce({ ok: true, json: async () => response });

      const result = await client.rejectPropagation("prop-uuid-456");

      expect(mockFetch).toHaveBeenCalledWith(`${baseUrl}/api/propagations/prop-uuid-456/reject`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        signal: expect.any(AbortSignal),
      });
      expect(result).toEqual(response);
    });

    it("throws on non-ok response", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: async () => "Server Error",
      });

      await expect(client.rejectPropagation("bad-id")).rejects.toThrow("500");
    });
  });
});
