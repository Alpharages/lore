import { FastifyRequest, FastifyReply } from "fastify";
import { incrementOccurrence } from "../../services/lessons.service.js";

// Body shape after Fastify schema validation — lesson_id is guaranteed present.
interface IncrementOccurrenceBody {
  lesson_id: string;
  user_handle?: string;
}

export const incrementOccurrenceHandler = async (request: FastifyRequest, reply: FastifyReply) => {
  const txDb = request.txDb!;
  const { lesson_id, user_handle } = request.body as IncrementOccurrenceBody;

  const result = await incrementOccurrence(
    txDb,
    lesson_id,
    request.project!.id,
    user_handle ?? null
  );

  reply.status(200);
  return {
    lesson_id: result.lessonId,
    new_count: result.newCount,
  };
};
