import { FastifyRequest } from "fastify";

export const whoami = async (request: FastifyRequest) => {
  return {
    project_id: request.project!.id,
    slug: request.project!.slug,
  };
};

export const testLessonCount = async (request: FastifyRequest) => {
  const result = await request.tx!.query<{ count: string }>(
    "SELECT COUNT(*)::text AS count FROM lessons"
  );
  return { count: parseInt(result.rows[0].count, 10) };
};
