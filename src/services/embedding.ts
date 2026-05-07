import { Pool } from "pg";
import OpenAI from "openai";
import { logger } from "../utils/logger.js";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export const generateAndStoreEmbedding = async (
  pool: Pool,
  lessonId: string,
  projectId: string,
  text: string
): Promise<void> => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.current_project_id', $1, true)", [projectId]);

    const res = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: text,
    });

    const vec = res.data[0]?.embedding;
    if (!vec) {
      throw new Error("OpenAI returned empty embedding data");
    }

    await client.query(
      "UPDATE lessons SET embedding = $1::vector, embedding_status = 'complete' WHERE id = $2",
      [`[${vec.join(",")}]`, lessonId]
    );

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});

    const failClient = await pool.connect();
    try {
      await failClient.query("BEGIN");
      await failClient.query("SELECT set_config('app.current_project_id', $1, true)", [projectId]);
      await failClient.query("UPDATE lessons SET embedding_status = 'failed' WHERE id = $1", [
        lessonId,
      ]);
      await failClient.query("COMMIT");
    } finally {
      failClient.release();
    }

    logger.error({
      tool: "save_lesson:embedding",
      lesson_id: lessonId,
      success: false,
      error: String(err),
    });
  } finally {
    client.release();
  }
};
