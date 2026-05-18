import { FastifyReply, FastifyRequest } from "fastify";
import {
  getStatsService,
  getPropagationMetadataService,
  getAdminPendingPropagationsService,
} from "../../services/stats.service.js";
import {
  adminAcceptPropagationService,
  adminRejectPropagationService,
} from "../../services/admin-propagation.service.js";
import { DrizzleClient } from "../../repositories/projects.repository.js";

interface ProjectQuery {
  project?: string;
}

const readProject = (q: ProjectQuery): string | undefined => {
  const v = q.project?.trim();
  return v && v.length > 0 ? v : undefined;
};

export const getStats = (db: DrizzleClient) => {
  return async (
    request: FastifyRequest<{ Querystring: ProjectQuery }>,
    reply: FastifyReply
  ): Promise<unknown> => {
    const stats = await getStatsService(db, readProject(request.query));
    reply.status(200);
    return stats;
  };
};

export const getPropagationMetadata = (db: DrizzleClient) => {
  return async (
    request: FastifyRequest<{ Querystring: ProjectQuery }>,
    reply: FastifyReply
  ): Promise<unknown> => {
    const meta = await getPropagationMetadataService(db, readProject(request.query));
    reply.status(200);
    return meta;
  };
};

export const getPendingPropagationsAdmin = (db: DrizzleClient) => {
  return async (
    request: FastifyRequest<{ Querystring: ProjectQuery }>,
    reply: FastifyReply
  ): Promise<unknown> => {
    const suggestions = await getAdminPendingPropagationsService(db, readProject(request.query));
    reply.status(200);
    return { suggestions };
  };
};

export const acceptPropagationAdmin = async (
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
): Promise<unknown> => {
  const result = await adminAcceptPropagationService(request.params.id);
  reply.status(200);
  return { new_lesson_id: result.newLessonId, action: "accepted" };
};

export const rejectPropagationAdmin = async (
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
): Promise<unknown> => {
  await adminRejectPropagationService(request.params.id);
  reply.status(200);
  return { action: "rejected" };
};
