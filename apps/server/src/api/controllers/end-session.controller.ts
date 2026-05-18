import { FastifyRequest, FastifyReply } from "fastify";
import { endSession } from "../../services/sessions.service.js";

interface EndSessionBody {
  session_id: string;
  decisions?: Array<{ what: string; why: string }>;
  lessons_applied?: string[];
  files_touched?: string[];
}

export const endSessionHandler = async (request: FastifyRequest, reply: FastifyReply) => {
  const txDb = request.txDb!;
  const { session_id, decisions, lessons_applied, files_touched } = request.body as EndSessionBody;

  const result = await endSession(txDb, {
    projectId: request.project!.id,
    sessionId: session_id,
    decisions,
    lessonsApplied: lessons_applied,
    filesTouched: files_touched,
  });

  reply.status(200);
  return {
    session_id: result.sessionId,
    ended: result.ended,
    duration_minutes: result.durationMinutes,
  };
};
