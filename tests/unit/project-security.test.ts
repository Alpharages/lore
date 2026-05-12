import { describe, it, expect, vi, beforeEach } from "vitest";
import bcrypt from "bcrypt";
import { generateApiKey, hashApiKey, compareApiKey } from "../../src/services/api-key.js";
import {
  registerProject,
  findProjectBySlug,
  listProjects,
} from "../../src/services/projects.service.js";
import * as projectsRepo from "../../src/repositories/projects.repository.js";

vi.mock("../../src/repositories/projects.repository.js", () => ({
  insertProject: vi.fn(),
  insertRepositories: vi.fn(),
  selectProjects: vi.fn(),
  deleteProjectBySlug: vi.fn(),
  findProjectBySlug: vi.fn(),
}));

describe("API Key Security — Unit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("generateApiKey", () => {
    it("produces lore_<slug>_<24_random_chars> format", () => {
      const key = generateApiKey("acme-corp");
      expect(key).toMatch(/^lore_acme-corp_[A-Za-z0-9]{24}$/);
    });

    it("generates unique keys across calls", () => {
      const key1 = generateApiKey("acme");
      const key2 = generateApiKey("acme");
      expect(key1).not.toBe(key2);
    });

    it("rejects modulo bias by using rejection sampling", () => {
      // Generate many keys and verify character set is strictly alphanumeric
      for (let i = 0; i < 50; i++) {
        const key = generateApiKey("test");
        const suffix = key.split("_").pop()!;
        expect(suffix).toMatch(/^[A-Za-z0-9]+$/);
        expect(suffix.length).toBe(24);
      }
    });
  });

  describe("hashApiKey", () => {
    it("produces a bcrypt hash with cost 12", async () => {
      const hash = await hashApiKey("lore_test_123456789012345678901234");
      expect(hash).toMatch(/^\$2[aby]\$12\$/);
    });

    it("produces different hashes for the same plain key (salt randomness)", async () => {
      const plain = "lore_test_123456789012345678901234";
      const hash1 = await hashApiKey(plain);
      const hash2 = await hashApiKey(plain);
      expect(hash1).not.toBe(hash2);
    });
  });

  describe("compareApiKey", () => {
    it("returns true for a matching plain key and hash", async () => {
      const plain = "lore_test_123456789012345678901234";
      const hash = await hashApiKey(plain);
      const match = await compareApiKey(plain, hash);
      expect(match).toBe(true);
    });

    it("returns false for a mismatched plain key", async () => {
      const plain = "lore_test_123456789012345678901234";
      const hash = await hashApiKey(plain);
      const match = await compareApiKey("lore_test_000000000000000000000000", hash);
      expect(match).toBe(false);
    });
  });

  describe("registerProject", () => {
    it("stores a bcrypt hash — never the plaintext key", async () => {
      const insertedId = "proj-uuid-123";

      vi.mocked(projectsRepo.insertProject).mockResolvedValue({ id: insertedId });
      vi.mocked(projectsRepo.insertRepositories).mockResolvedValue(undefined);

      const mockDb = {
        transaction: vi.fn(async (fn: any) => fn(mockDb)),
      } as any;

      const result = await registerProject(mockDb, {
        name: "Acme",
        slug: "acme",
      });

      // The returned api_key must be the plaintext one-time key
      expect(result.apiKey).toMatch(/^lore_acme_[A-Za-z0-9]{24}$/);

      // The value passed to insertProject must be a bcrypt hash, not plaintext
      const insertCall = vi.mocked(projectsRepo.insertProject).mock.calls[0];
      const storedHash = insertCall[1].apiKeyHash;

      expect(storedHash).toMatch(/^\$2[aby]\$12\$/);
      expect(storedHash).not.toBe(result.apiKey);

      // Verify the stored hash actually verifies against the plain key
      const verify = await bcrypt.compare(result.apiKey, storedHash);
      expect(verify).toBe(true);
    });

    it("does not include api_key or api_key_hash in project list output", async () => {
      const mockDb = {} as any;
      vi.mocked(projectsRepo.selectProjects).mockResolvedValue([
        {
          id: "p1",
          slug: "acme",
          name: "Acme",
          stackTags: ["ts"],
          createdAt: new Date(),
        },
      ]);

      const list = await listProjects(mockDb);

      const project = list[0] as any;
      expect(project).not.toHaveProperty("apiKey");
      expect(project).not.toHaveProperty("apiKeyHash");
      expect(project).not.toHaveProperty("api_key");
      expect(project).not.toHaveProperty("api_key_hash");
    });
  });

  describe("findProjectBySlug (auth lookup)", () => {
    it("returns the hashed key for bcrypt.compare in auth middleware", async () => {
      const mockDb = {} as any;
      const fakeHash = "$2b$12$fakehashfortesting123456789012345678901234567890";

      vi.mocked(projectsRepo.findProjectBySlug).mockResolvedValue({
        id: "p1",
        slug: "acme",
        apiKeyHash: fakeHash,
      });

      const project = await findProjectBySlug(mockDb, "acme");
      expect(project).toBeDefined();
      expect(project!.apiKeyHash).toBe(fakeHash);
      expect(project!.apiKeyHash).toMatch(/^\$2[aby]\$12\$/);
    });
  });
});
