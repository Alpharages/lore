import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import { spawn } from "child_process";
import {
  dockerPull,
  dockerComposeRunMigrations,
  dockerComposeRestart,
  findDockerComposeDir,
} from "./docker.js";

vi.mock("child_process", () => ({
  spawn: vi.fn(),
}));

vi.mock("fs", () => ({
  existsSync: vi.fn(),
}));

const mockedSpawn = vi.mocked(spawn);
const mockedExistsSync = vi.mocked(fs.existsSync);

describe("docker helpers", () => {
  let mockChild: {
    on: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockChild = {
      on: vi.fn(),
    };
    mockedSpawn.mockReturnValue(mockChild as any);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const simulateExit = (code: number | null) => {
    const closeHandler = mockChild.on.mock.calls.find((call) => call[0] === "close")?.[1];
    if (closeHandler) closeHandler(code);
  };

  const simulateError = (message: string) => {
    const errorHandler = mockChild.on.mock.calls.find((call) => call[0] === "error")?.[1];
    if (errorHandler) errorHandler(new Error(message));
  };

  it("dockerPull calls spawn with correct args", async () => {
    const promise = dockerPull("ghcr.io/alpharages/lore-memory-mcp", "1.0.0");
    simulateExit(0);
    const result = await promise;

    expect(mockedSpawn).toHaveBeenCalledWith(
      "docker",
      ["pull", "ghcr.io/alpharages/lore-memory-mcp:1.0.0"],
      {
        cwd: undefined,
        shell: false,
        stdio: "inherit",
      }
    );
    expect(result.success).toBe(true);
    expect(result.exitCode).toBe(0);
  });

  it("dockerPull returns error on non-zero exit", async () => {
    const promise = dockerPull("ghcr.io/alpharages/lore-memory-mcp", "1.0.0");
    simulateExit(1);
    const result = await promise;

    expect(result.success).toBe(false);
    expect(result.exitCode).toBe(1);
    expect(result.error).toContain("failed with exit code 1");
  });

  it("dockerPull returns error on spawn error", async () => {
    const promise = dockerPull("ghcr.io/alpharages/lore-memory-mcp", "1.0.0");
    simulateError("ENOENT");
    const result = await promise;

    expect(result.success).toBe(false);
    expect(result.exitCode).toBeNull();
    expect(result.error).toContain("ENOENT");
  });

  it("dockerComposeRunMigrations calls spawn with correct args and cwd", async () => {
    const promise = dockerComposeRunMigrations("/projects/test");
    simulateExit(0);
    const result = await promise;

    expect(mockedSpawn).toHaveBeenCalledWith(
      "docker",
      ["compose", "run", "--rm", "mcp-server", "npm", "run", "db:migrate"],
      {
        cwd: "/projects/test",
        shell: false,
        stdio: "inherit",
      }
    );
    expect(result.success).toBe(true);
  });

  it("dockerComposeRestart calls spawn with correct args and cwd", async () => {
    const promise = dockerComposeRestart("/projects/test");
    simulateExit(0);
    const result = await promise;

    expect(mockedSpawn).toHaveBeenCalledWith("docker", ["compose", "up", "-d", "mcp-server"], {
      cwd: "/projects/test",
      shell: false,
      stdio: "inherit",
    });
    expect(result.success).toBe(true);
  });
});

describe("findDockerComposeDir", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedExistsSync.mockReturnValue(false);
  });

  it("returns the dir when docker-compose.yml exists there", () => {
    mockedExistsSync.mockImplementation((p) => p === "/projects/test/docker-compose.yml");
    expect(findDockerComposeDir("/projects/test")).toBe("/projects/test");
  });

  it("walks up directories to find docker-compose.yml in parent", () => {
    mockedExistsSync.mockImplementation((p) => p === "/projects/docker-compose.yml");
    expect(findDockerComposeDir("/projects/test")).toBe("/projects");
  });

  it("finds docker-compose.yaml variant", () => {
    mockedExistsSync.mockImplementation((p) => p === "/projects/test/docker-compose.yaml");
    expect(findDockerComposeDir("/projects/test")).toBe("/projects/test");
  });

  it("throws when not found in any parent directory", () => {
    mockedExistsSync.mockReturnValue(false);
    expect(() => findDockerComposeDir("/projects/test")).toThrow(
      "docker-compose.yml not found in /projects/test or any parent directory."
    );
  });
});
