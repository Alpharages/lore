import { FastifyRequest, FastifyReply } from "fastify";
import { startSession } from "../../services/sessions.service.js";

interface StartSessionBody {
  repo_slug: string;
  branch: string;
  task_summary?: string;
  user_handle?: string;
}

export const startSessionHandler = async (request: FastifyRequest, reply: FastifyReply) => {
  const txDb = request.txDb!;
  const { repo_slug, branch, task_summary, user_handle } = request.body as StartSessionBody;

  const result = await startSession(txDb, {
    projectId: request.project!.id,
    repoSlug: repo_slug.trim(),
    branch: branch.trim(),
    taskSummary: task_summary?.trim() ?? null,
    userHandle: user_handle?.trim() ?? null,
  });

  reply.status(201);
  return {
    session_id: result.sessionId,
    started_at: result.startedAt,
  };
};
