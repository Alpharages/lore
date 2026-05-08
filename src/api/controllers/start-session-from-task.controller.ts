import { FastifyRequest, FastifyReply } from "fastify";
import { startSessionFromTask } from "../../services/sessions.service.js";
import { validationError } from "../../utils/errors.js";

interface StartSessionFromTaskBody {
  external_task_id: string;
  external_tracker_type: "clickup" | "jira" | "asana";
  external_task_ref?: string;
  task_summary?: string;
  branch?: string;
  user_handle?: string;
  bmad_skill?: string;
  bmad_workflow?: string;
  repo_slug?: string;
}

export const startSessionFromTaskHandler = async (request: FastifyRequest, reply: FastifyReply) => {
  const txDb = request.txDb!;
  const body = request.body as StartSessionFromTaskBody;

  const externalTaskId = body.external_task_id.trim();
  if (externalTaskId.length === 0) {
    throw validationError("external_task_id cannot be empty");
  }

  const result = await startSessionFromTask(txDb, {
    projectId: request.project!.id,
    externalTaskId,
    externalTrackerType: body.external_tracker_type,
    externalTaskRef: body.external_task_ref?.trim() ?? null,
    taskSummary: body.task_summary?.trim() ?? null,
    branch: body.branch?.trim() ?? null,
    userHandle: body.user_handle?.trim() ?? null,
    bmadSkill: body.bmad_skill?.trim() ?? null,
    bmadWorkflow: body.bmad_workflow?.trim() ?? null,
    repoSlug: body.repo_slug?.trim() ?? null,
  });

  reply.status(200);
  return {
    session_id: result.sessionId,
    resumed: result.resumed,
    prior_session_summary: result.priorSessionSummary
      ? {
          branch: result.priorSessionSummary.branch,
          decisions: result.priorSessionSummary.decisions,
          files_touched: result.priorSessionSummary.filesTouched,
          started_at: result.priorSessionSummary.startedAt?.toISOString() ?? null,
          ended_at: result.priorSessionSummary.endedAt?.toISOString() ?? null,
        }
      : undefined,
  };
};
