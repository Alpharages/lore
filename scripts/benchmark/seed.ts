import { readFileSync, writeFileSync, existsSync, unlinkSync } from "fs";
import { resolve } from "path";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "../../src/db/schema.js";
import { defaultConfig } from "./benchmark.config.js";

/* ------------------------------------------------------------------
 * State helpers
 * ------------------------------------------------------------------ */
interface BenchState {
  projectId: string;
  apiKey: string;
  slug: string;
}

const loadState = (path: string): BenchState | null => {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf-8")) as BenchState;
  } catch {
    return null;
  }
};

const saveState = (path: string, state: BenchState): void => {
  writeFileSync(path, JSON.stringify(state, null, 2));
};

const removeState = (path: string): void => {
  if (existsSync(path)) unlinkSync(path);
};

/* ------------------------------------------------------------------
 * API helpers
 * ------------------------------------------------------------------ */
const registerProject = async (
  baseUrl: string,
  adminSecret: string,
  slug: string
): Promise<BenchState> => {
  const res = await fetch(`${baseUrl}/api/projects/register`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Admin-Secret": adminSecret,
    },
    body: JSON.stringify({
      name: "Benchmark Test Project",
      slug,
      stack_tags: ["typescript", "postgres", "fastify"],
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Project registration failed: ${res.status} ${body}`);
  }

  const data = (await res.json()) as { project_id: string; api_key: string };
  return { projectId: data.project_id, apiKey: data.api_key, slug };
};

const deleteProject = async (baseUrl: string, adminSecret: string, slug: string): Promise<void> => {
  const res = await fetch(`${baseUrl}/api/projects/${slug}`, {
    method: "DELETE",
    headers: { "X-Admin-Secret": adminSecret },
  });
  if (!res.ok && res.status !== 404) {
    const body = await res.text();
    throw new Error(`Project deletion failed: ${res.status} ${body}`);
  }
};

/* ------------------------------------------------------------------
 * Embedding generator — random unit vectors
 * ------------------------------------------------------------------ */
const generateUnitVector = (dimensions: number): number[] => {
  const vec = Array.from({ length: dimensions }, () => Math.random() * 2 - 1);
  const norm = Math.sqrt(vec.reduce((sum, v) => sum + v * v, 0));
  return vec.map((v) => v / norm);
};

/* ------------------------------------------------------------------
 * Seed logic — direct DB insertion for speed
 * ------------------------------------------------------------------ */
const seedLessons = async (state: BenchState, seedSize: number): Promise<number> => {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL environment variable is required");
  }

  const pool = new Pool({ connectionString: databaseUrl });
  const db = drizzle(pool, { schema });

  try {
    // Bypass RLS by not setting app.current_project_id — seeding runs as DB owner
    const batchSize = 500;
    const categories = ["performance", "security", "maintainability", "correctness", "api-design"];
    const severities = ["critical", "high", "medium", "low"];
    const dimensions = 1536;

    for (let batch = 0; batch < seedSize / batchSize; batch++) {
      const values = Array.from({ length: batchSize }, (_, i) => {
        const idx = batch * batchSize + i;
        const embedding = generateUnitVector(dimensions);
        return {
          projectId: state.projectId,
          title: `Lesson ${idx + 1}: ${categories[idx % categories.length]} issue`,
          problem: `Problem description for lesson ${idx + 1}`,
          rootCause: `Root cause for lesson ${idx + 1}`,
          fix: `Fix applied for lesson ${idx + 1}`,
          preventionRule: `Prevention rule for lesson ${idx + 1}`,
          stackTags: ["typescript", "postgres", "fastify"],
          category: categories[idx % categories.length],
          severity: severities[idx % severities.length],
          occurrenceCount: Math.floor(Math.random() * 10) + 1,
          embedding,
          embeddingStatus: "complete" as const,
          provenance: { source: "benchmark", trust_tier: "manual" },
        };
      });

      await db.insert(schema.lessons).values(values);
      process.stdout.write(
        `\r  Seeded ${Math.min((batch + 1) * batchSize, seedSize)} / ${seedSize} lessons`
      );
    }

    console.log(); // newline after progress
    return seedSize;
  } finally {
    await pool.end();
  }
};

/* ------------------------------------------------------------------
 * CLI
 * ------------------------------------------------------------------ */
const args = process.argv.slice(2);
const shouldTeardown = args.includes("--teardown");
const shouldForce = args.includes("--force");

const run = async (): Promise<void> => {
  const config = defaultConfig;
  const statePath = resolve(config.stateFile);
  const existingState = loadState(statePath);
  const adminSecret = process.env.ADMIN_SECRET;

  if (!adminSecret) {
    console.error("❌ ADMIN_SECRET environment variable is required");
    process.exit(1);
  }

  if (shouldTeardown) {
    if (existingState) {
      console.log(`🗑️  Tearing down project '${existingState.slug}'...`);
      await deleteProject(config.baseUrl, adminSecret, existingState.slug);
      removeState(statePath);
      console.log("✅ Teardown complete.");
    } else {
      console.log("ℹ️  No existing benchmark state found — nothing to tear down.");
    }
    return;
  }

  if (existingState && !shouldForce) {
    console.log(
      `ℹ️  Existing benchmark project found (${existingState.slug}). Use --force to re-seed.`
    );
    return;
  }

  if (existingState && shouldForce) {
    console.log(`🗑️  Forcing re-seed: removing existing project '${existingState.slug}'...`);
    await deleteProject(config.baseUrl, adminSecret, existingState.slug);
    removeState(statePath);
  }

  console.log(`🚀 Registering benchmark project...`);
  const state = await registerProject(config.baseUrl, adminSecret, config.projectSlug);
  saveState(statePath, state);
  console.log(`✅ Project registered: ${state.projectId}`);

  console.log(`🌱 Seeding ${config.seedSize.toLocaleString()} lessons...`);
  const start = Date.now();
  const seeded = await seedLessons(state, config.seedSize);
  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`✅ Seeded ${seeded.toLocaleString()} lessons in ${elapsed}s`);
};

run().catch((err) => {
  console.error("❌ Seed failed:", err.message);
  process.exit(1);
});
