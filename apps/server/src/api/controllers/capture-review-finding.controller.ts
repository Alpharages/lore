import { FastifyRequest, FastifyReply } from "fastify";
import { captureReviewFinding } from "../../services/capture-review-finding.service.js";

interface CaptureReviewFindingBody {
  external_task_id: string;
  external_tracker_type: "clickup" | "jira" | "asana";
  external_task_ref?: string;
  severity: "critical" | "high" | "medium" | "low";
  finding: {
    title: string;
    problem: string;
    root_cause?: string;
    fix: string;
    prevention_rule: string;
    stack_tags?: string[];
    category?: string;
    code_pointer?: {
      file: string;
      line_start: number;
      line_end: number;
    };
  };
  reviewer?: string;
  workflow?: string;
}

export const captureReviewFindingHandler = async (request: FastifyRequest, reply: FastifyReply) => {
  const txDb = request.txDb!;
  const {
    external_task_id,
    external_tracker_type,
    external_task_ref,
    severity,
    finding,
    reviewer,
    workflow,
  } = request.body as CaptureReviewFindingBody;

  if (finding.code_pointer && finding.code_pointer.line_end < finding.code_pointer.line_start) {
    return reply
      .code(400)
      .send({ error: "validation_error", message: "code_pointer.line_end must be >= line_start" });
  }

  const result = await captureReviewFinding(txDb, {
    externalTaskId: external_task_id.trim(),
    externalTrackerType: external_tracker_type,
    externalTaskRef: external_task_ref ?? null,
    severity,
    finding: {
      title: finding.title.trim(),
      problem: finding.problem.trim(),
      rootCause: finding.root_cause ?? null,
      fix: finding.fix.trim(),
      preventionRule: finding.prevention_rule.trim(),
      stackTags: finding.stack_tags ?? [],
      category: finding.category ?? null,
      codePointer: finding.code_pointer
        ? {
            file: finding.code_pointer.file,
            lineStart: finding.code_pointer.line_start,
            lineEnd: finding.code_pointer.line_end,
          }
        : null,
    },
    reviewer: reviewer ?? null,
    workflow: workflow ?? null,
    projectId: request.project!.id,
  });

  reply.status(201);
  return {
    lesson_id: result.lessonId,
    embedding_status: result.embeddingStatus,
    action: result.action,
  };
};
