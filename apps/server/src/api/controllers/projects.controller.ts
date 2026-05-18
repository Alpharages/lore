import { FastifyRequest, FastifyReply } from "fastify";
import { DrizzleClient } from "../../repositories/projects.repository.js";
import {
  registerProject,
  listProjects,
  deleteProjectBySlug,
  getProjectKeyReference,
  revokeProjectKey,
  regenerateProjectKey,
} from "../../services/projects.service.js";
import { validationError, conflictError, notFoundError } from "../../utils/errors.js";

const slugRegex = /^[a-z0-9-]{2,40}$/;
const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface RouteConfig {
  db: DrizzleClient;
}

interface RegisterBody {
  name: string;
  slug: string;
  stack_tags?: string[];
  repos?: Array<{ slug: string; stack_tags?: string[] }>;
}

const getDb = (request: FastifyRequest): DrizzleClient =>
  (request.routeOptions.config as unknown as RouteConfig).db;

export const register = async (
  request: FastifyRequest<{ Body: RegisterBody }>,
  reply: FastifyReply
) => {
  const db = getDb(request);
  const { name, slug, stack_tags, repos } = request.body;

  if (!slugRegex.test(slug)) {
    throw validationError("Invalid slug format");
  }

  if (repos) {
    for (const repo of repos) {
      if (!slugRegex.test(repo.slug)) {
        throw validationError(`Invalid repo slug: ${repo.slug}`);
      }
    }
  }

  try {
    const result = await registerProject(db, {
      name,
      slug,
      stackTags: stack_tags,
      repos: repos?.map((r) => ({
        slug: r.slug,
        stackTags: r.stack_tags,
      })),
    });

    reply.status(201);
    return {
      project_id: result.projectId,
      api_key: result.apiKey,
      message: "Project registered. Store API key securely.",
    };
  } catch (err: any) {
    // drizzle 0.45+ wraps the driver error in DrizzleQueryError; the original
    // pg error (with `.code === "23505"` for unique_violation) lives at `.cause`.
    const code = err?.code ?? err?.cause?.code;
    const message = err?.message ?? err?.cause?.message ?? "";
    if (code === "23505" || message.includes("unique constraint")) {
      throw conflictError(`Slug '${slug}' is already registered`);
    }
    throw err;
  }
};

export const list = async (request: FastifyRequest, reply: FastifyReply) => {
  const db = getDb(request);
  const projects = await listProjects(db);
  return {
    projects: projects.map((p) => ({
      id: p.id,
      slug: p.slug,
      name: p.name,
      stackTags: p.stackTags ?? [],
      createdAt: p.createdAt,
      lessonCount: p.lessonCount ?? 0,
      keyId: p.keyId ?? null,
    })),
  };
};

export const remove = async (
  request: FastifyRequest<{ Params: { slug: string } }>,
  reply: FastifyReply
) => {
  const db = getDb(request);
  const deleted = await deleteProjectBySlug(db, request.params.slug);
  if (!deleted) {
    reply.status(404);
    return { error: "not_found" };
  }
  reply.status(204);
  return;
};

export const getKey = async (
  request: FastifyRequest<{ Params: { slug: string } }>,
  reply: FastifyReply
) => {
  const db = getDb(request);
  const { slug } = request.params;
  if (!slugRegex.test(slug)) {
    throw validationError("Invalid slug format");
  }

  const reference = await getProjectKeyReference(db, slug);
  if (!reference) {
    throw notFoundError(`Project '${slug}' not found`);
  }

  return reference;
};

export const revokeKey = async (
  request: FastifyRequest<{ Params: { slug: string; keyId: string } }>,
  reply: FastifyReply
) => {
  const db = getDb(request);
  const { slug, keyId } = request.params;
  if (!slugRegex.test(slug)) {
    throw validationError("Invalid slug format");
  }
  if (!uuidRegex.test(keyId)) {
    throw validationError("Invalid keyId format");
  }

  const revoked = await revokeProjectKey(db, slug, keyId);
  if (!revoked) {
    reply.status(404);
    return { error: "not_found" };
  }

  reply.status(204);
  return;
};

export const regenerateKey = async (
  request: FastifyRequest<{ Params: { slug: string } }>,
  reply: FastifyReply
) => {
  const db = getDb(request);
  const { slug } = request.params;
  if (!slugRegex.test(slug)) {
    throw validationError("Invalid slug format");
  }

  const result = await regenerateProjectKey(db, slug);
  if (!result) {
    throw notFoundError(`Project '${slug}' not found`);
  }

  return { key: result.key, keyId: result.keyId };
};
