import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { spawn, ChildProcess } from "child_process";

vi.mock("child_process", () => ({
  spawn: vi.fn(),
}));

import { runGitnexusAnalyze, analyzeAllRepos } from "./gitnexus.js";

const mockedSpawn = vi.mocked(spawn);

const createMockStream = () => {
  const listeners: Record<string, ((data: Buffer) => void)[]> = {};
  return {
    on: (event: string, fn: (data: Buffer) => void) => {
      if (!listeners[event]) listeners[event] = [];
      listeners[event].push(fn);
      return this;
    },
    emit: (event: string, data?: Buffer) => {
      listeners[event]?.forEach((fn) => fn(data!));
    },
  };
};

const createMockChild = (): ChildProcess => {
  const stdout = createMockStream();
  const stderr = createMockStream();
  const listeners: Record<string, ((...args: any[]) => void)[]> = {};

  const child = {
    stdout,
    stderr,
    on: (event: string, fn: (...args: any[]) => void) => {
      if (!listeners[event]) listeners[event] = [];
      listeners[event].push(fn);
      return child;
    },
    emit: (event: string, ...args: any[]) => {
      listeners[event]?.forEach((fn) => fn(...args));
    },
  } as unknown as ChildProcess;

  return child;
};

describe("runGitnexusAnalyze", () => {
  let stdoutSpy: ReturnType<typeof vi.spyOn>;
  let stderrSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockedSpawn.mockReset();
    stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  });

  afterEach(() => {
    stdoutSpy.mockRestore();
    stderrSpy.mockRestore();
  });

  it("returns success with analyzedAt on exit code 0", async () => {
    const child = createMockChild();
    mockedSpawn.mockReturnValueOnce(child);

    const promise = runGitnexusAnalyze("/repos/myapp");

    child.emit("close", 0);

    const result = await promise;
    expect(result.success).toBe(true);
    expect(result.repoPath).toBe("/repos/myapp");
    expect(result.analyzedAt).toBeDefined();
    expect(result.error).toBeUndefined();
  });

  it("returns failure with stderr on non-zero exit", async () => {
    const child = createMockChild();
    mockedSpawn.mockReturnValueOnce(child);

    const promise = runGitnexusAnalyze("/repos/myapp");

    child.stderr!.emit("data", Buffer.from("gitnexus not found"));
    child.emit("close", 1);

    const result = await promise;
    expect(result.success).toBe(false);
    expect(result.error).toBe("gitnexus not found");
    expect(result.analyzedAt).toBeUndefined();
  });

  it("returns failure with exit code when stderr is empty", async () => {
    const child = createMockChild();
    mockedSpawn.mockReturnValueOnce(child);

    const promise = runGitnexusAnalyze("/repos/myapp");

    child.emit("close", 127);

    const result = await promise;
    expect(result.success).toBe(false);
    expect(result.error).toBe("Process exited with code 127");
  });

  it("returns failure on spawn error", async () => {
    const child = createMockChild();
    mockedSpawn.mockReturnValueOnce(child);

    const promise = runGitnexusAnalyze("/repos/myapp");

    child.emit("error", new Error("ENOENT: npx not found"));

    const result = await promise;
    expect(result.success).toBe(false);
    expect(result.error).toBe("ENOENT: npx not found");
  });

  it("prefixes stdout with repo slug", async () => {
    const child = createMockChild();
    mockedSpawn.mockReturnValueOnce(child);

    const promise = runGitnexusAnalyze("/repos/myapp");

    child.stdout!.emit("data", Buffer.from("indexing…\n"));
    child.emit("close", 0);

    await promise;
    expect(stdoutSpy).toHaveBeenCalledWith("[myapp] indexing…\n");
  });

  it("prefixes stderr with repo slug", async () => {
    const child = createMockChild();
    mockedSpawn.mockReturnValueOnce(child);

    const promise = runGitnexusAnalyze("/repos/myapp");

    child.stderr!.emit("data", Buffer.from("warning: large file\n"));
    child.emit("close", 0);

    await promise;
    expect(stderrSpy).toHaveBeenCalledWith("[myapp] warning: large file\n");
  });

  it("spawns with correct cwd", async () => {
    const child = createMockChild();
    mockedSpawn.mockReturnValueOnce(child);

    const promise = runGitnexusAnalyze("/repos/myapp");
    child.emit("close", 0);

    await promise;
    expect(mockedSpawn).toHaveBeenCalledWith("npx", ["gitnexus", "analyze"], {
      cwd: "/repos/myapp",
      shell: false,
    });
  });
});

describe("analyzeAllRepos", () => {
  let stdoutSpy: ReturnType<typeof vi.spyOn>;
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockedSpawn.mockReset();
    stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    stdoutSpy.mockRestore();
    consoleWarnSpy.mockRestore();
  });

  it("runs sequentially and returns all results", async () => {
    const children = [createMockChild(), createMockChild()];
    mockedSpawn.mockReturnValueOnce(children[0]).mockReturnValueOnce(children[1]);

    const promise = analyzeAllRepos(["/repos/a", "/repos/b"]);

    children[0].emit("close", 0);
    await new Promise((r) => setImmediate(r));
    children[1].emit("close", 0);

    const results = await promise;
    expect(results).toHaveLength(2);
    expect(results[0].success).toBe(true);
    expect(results[1].success).toBe(true);
  });

  it("prints progress indicator for each repo", async () => {
    const children = [createMockChild(), createMockChild()];
    mockedSpawn.mockReturnValueOnce(children[0]).mockReturnValueOnce(children[1]);

    const promise = analyzeAllRepos(["/repos/a", "/repos/b"]);

    children[0].emit("close", 0);
    await new Promise((r) => setImmediate(r));
    children[1].emit("close", 0);

    await promise;
    expect(stdoutSpy).toHaveBeenCalledWith("Analyzing a… ");
    expect(stdoutSpy).toHaveBeenCalledWith("Analyzing b… ");
    expect(stdoutSpy).toHaveBeenCalledWith("✓\n");
  });

  it("warns but continues when one repo fails", async () => {
    const children = [createMockChild(), createMockChild(), createMockChild()];
    mockedSpawn
      .mockReturnValueOnce(children[0])
      .mockReturnValueOnce(children[1])
      .mockReturnValueOnce(children[2]);

    const promise = analyzeAllRepos(["/repos/a", "/repos/b", "/repos/c"]);

    children[0].emit("close", 0);
    await new Promise((r) => setImmediate(r));
    children[1].stderr!.emit("data", Buffer.from("error"));
    children[1].emit("close", 1);
    await new Promise((r) => setImmediate(r));
    children[2].emit("close", 0);

    const results = await promise;
    expect(results[0].success).toBe(true);
    expect(results[1].success).toBe(false);
    expect(results[2].success).toBe(true);
    expect(consoleWarnSpy).toHaveBeenCalledWith("  ⚠ error");
    expect(stdoutSpy).toHaveBeenCalledWith("✗\n");
  });

  it("handles absolute paths gracefully", async () => {
    const child = createMockChild();
    mockedSpawn.mockReturnValueOnce(child);

    const promise = analyzeAllRepos(["/absolute/path/to/repo"]);
    child.emit("close", 0);

    await promise;
    expect(mockedSpawn).toHaveBeenCalledWith("npx", ["gitnexus", "analyze"], {
      cwd: "/absolute/path/to/repo",
      shell: false,
    });
  });
});
