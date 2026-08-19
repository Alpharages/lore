/**
 * Project Evolution — Phase 1 core service.
 * planning-artifacts/project-evolution-prd.md §9, §11, §12.1
 *
 * Three rules shape everything below:
 *
 *  1. Discussion is not a decision (§4.3). Capture always yields `proposed`;
 *     nothing in this file can accept an item on the strength of AI confidence
 *     (FR-PE-51). Acceptance is a separate, explicit, actor-attributed call.
 *  2. Canonical history is append-only (§4.4, NFR-PE-13). Versions, evidence,
 *     events, relations and links are only ever inserted or tombstoned. The
 *     mutable columns on the item row are a projection of those tables.
 *  3. Evidence, not archives (§4.5). We store the excerpt and a source
 *     reference; we never require the source system.
 */

import { createHash } from "crypto";
import {
  type ProjectEvolutionTx,
  type ItemRow,
  type EvidenceRow,
  type RelationRow,
  type RetrievedItemRow,
  insertItem,
  findItemById,
  findItemsByIds,
  findItemByStatementHash,
  applyItemRevision,
  markItemReviewed,
  markItemSuperseded,
  insertItemVersion,
  findVersionsByItemId,
  insertEvidence,
  findEvidenceByExternalSource,
  findEvidenceById,
  findEvidenceByItemIds,
  countLiveEvidence,
  markEvidenceSuperseded,
  redactEvidence,
  insertRelation,
  findLiveRelation,
  retractRelation,
  findRelationsForItems,
  findUnresolvedContradictions,
  insertLink,
  findLiveLink,
  retractLink,
  findLinksForItems,
  findSessionById,
  insertEvent,
  findEventsByItemId,
  findEvents,
  findItemsSemantic,
  findItemsFullText,
  findCurrentStateItems,
  countCurrentStateItems,
  findItems,
  countItems,
  findSemanticDuplicateCandidates,
  expandRelatedItems,
  findCurrentReplacement,
} from "../repositories/project-evolution.repository.js";
import {
  PROJECT_EVOLUTION_ITEM_TYPES,
  PROJECT_EVOLUTION_RELATION_TYPES,
  type ProjectEvolutionItemType,
  type ProjectEvolutionRelationType,
} from "../db/schema.js";
import { generateEmbedding } from "./embedding.js";
import { validationError, notFoundError, conflictError } from "../utils/errors.js";

/* ------------------------------------------------------------------
 * Tunables
 * ------------------------------------------------------------------ */

/** Above this cosine similarity an existing item is offered as a possible
 *  duplicate. Never used to merge anything (FR-PE-09). */
const SEMANTIC_DUPLICATE_THRESHOLD = 0.9;
const SEMANTIC_DUPLICATE_LIMIT = 3;

/** Retrieval floor for the semantic branch of context queries. Low enough to
 *  surface loosely-worded questions, high enough to keep the bounded result set
 *  on-topic. */
const CONTEXT_SEMANTIC_THRESHOLD = 0.55;

const DEFAULT_CONTEXT_LIMIT = 20;
const MAX_CONTEXT_LIMIT = 50;
const DEFAULT_HISTORY_LIMIT = 50;
const MAX_HISTORY_LIMIT = 200;

/** §14.6: evidence content is redacted by default outside the explicit
 *  item-detail path. List and context responses carry a bounded preview; the
 *  full excerpt is returned only by `inspect`, which is the reviewer's
 *  evidence-inspection surface (FR-PE-61). */
const EVIDENCE_PREVIEW_CHARS = 200;
const EVIDENCE_PER_ITEM_IN_CONTEXT = 3;

const EMBED_TEXT_MAX = 8000;

/* ------------------------------------------------------------------
 * Shared helpers
 * ------------------------------------------------------------------ */

const requireNonEmpty = (value: string | null | undefined, field: string): string => {
  const trimmed = (value ?? "").trim();
  if (trimmed.length === 0) {
    throw validationError(`${field} cannot be empty`);
  }
  return trimmed;
};

const optionalTrimmed = (value: string | null | undefined): string | null => {
  if (value === null || value === undefined) return null;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
};

const assertItemType = (type: string): ProjectEvolutionItemType => {
  if (!(PROJECT_EVOLUTION_ITEM_TYPES as readonly string[]).includes(type)) {
    throw validationError(
      `type must be one of ${PROJECT_EVOLUTION_ITEM_TYPES.join(", ")} (received "${type}")`
    );
  }
  return type as ProjectEvolutionItemType;
};

const assertRelationType = (relationType: string): ProjectEvolutionRelationType => {
  if (!(PROJECT_EVOLUTION_RELATION_TYPES as readonly string[]).includes(relationType)) {
    throw validationError(
      `relation_type must be one of ${PROJECT_EVOLUTION_RELATION_TYPES.join(", ")}`
    );
  }
  return relationType as ProjectEvolutionRelationType;
};

const parseDate = (value: string | null | undefined, field: string): Date | null => {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw validationError(`${field} must be a valid ISO-8601 timestamp`);
  }
  return parsed;
};

/**
 * Exact-duplicate key (FR-PE-08). Case- and whitespace-insensitive so that
 * "The API must page results" and "the api  must page results" collide, but
 * genuinely different wording does not.
 */
const statementHashOf = (type: string, statement: string): string =>
  createHash("sha256")
    .update(`${type} ${statement.toLowerCase().replace(/\s+/g, " ").trim()}`)
    .digest("hex");

const embedTextOf = (input: {
  title: string;
  statement: string;
  rationale: string | null;
}): string =>
  [input.title, input.statement, input.rationale ?? ""]
    .filter(Boolean)
    .join("\n")
    .slice(0, EMBED_TEXT_MAX);

/**
 * NFR-PE-03/NFR-PE-08: embedding is best-effort. `generateEmbedding` already
 * swallows provider failures and returns null, which leaves the row at
 * `embedding_status: 'pending'` — the captured statement and its evidence are
 * never lost because a provider was down, and lexical retrieval still works.
 */
const embedOrNull = async (text: string): Promise<number[] | null> =>
  text.trim().length === 0 ? null : generateEmbedding(text);

const previewOf = (excerpt: string | null): string | null => {
  if (!excerpt) return null;
  return excerpt.length > EVIDENCE_PREVIEW_CHARS
    ? `${excerpt.slice(0, EVIDENCE_PREVIEW_CHARS)}...`
    : excerpt;
};

const iso = (date: Date | null | undefined): string | null => date?.toISOString() ?? null;

const numeric = (value: string | null): number | null => (value === null ? null : Number(value));

/* ------------------------------------------------------------------
 * Output shapes
 * ------------------------------------------------------------------ */

export interface EvidenceOutput {
  id: string;
  source_kind: string;
  source_reference: string | null;
  external_source_id: string | null;
  source_author: string | null;
  excerpt_provided_by: string;
  captured_by: string | null;
  occurred_at: string | null;
  created_at: string | null;
  has_excerpt: boolean;
  redacted: boolean;
  redaction_reason: string | null;
  superseded_by_evidence_id: string | null;
  /** Present only on the item-detail path; bounded preview elsewhere. */
  excerpt?: string | null;
  excerpt_preview?: string | null;
}

export interface ItemOutput {
  id: string;
  type: string;
  revision: number;
  title: string;
  statement: string;
  rationale: string | null;
  status: string;
  capture_mode: string;
  proposed_by: string | null;
  approved_by: string | null;
  superseded_by_item_id: string | null;
  proposed_supersedes_item_id: string | null;
  ai_confidence: number | null;
  ai_model: string | null;
  embedding_status: string;
  occurred_at: string | null;
  created_at: string | null;
  reviewed_at: string | null;
  evidence_count: number;
  redacted_evidence_count: number;
}

export interface RelationOutput {
  id: string;
  from_item_id: string;
  to_item_id: string;
  relation_type: string;
  created_by: string | null;
  created_at: string | null;
  retracted_at: string | null;
}

export interface EventOutput {
  id: string;
  item_id: string | null;
  event_type: string;
  revision: number | null;
  actor: string | null;
  note: string | null;
  payload: unknown;
  created_at: string | null;
}

const toItemOutput = (
  row: ItemRow,
  evidenceCount: number,
  redactedEvidenceCount = 0
): ItemOutput => ({
  id: row.id,
  type: row.type,
  revision: row.revision,
  title: row.title,
  statement: row.statement,
  rationale: row.rationale,
  status: row.status,
  capture_mode: row.captureMode,
  proposed_by: row.proposedBy,
  approved_by: row.approvedBy,
  superseded_by_item_id: row.supersededByItemId,
  proposed_supersedes_item_id: row.proposedSupersedesItemId,
  ai_confidence: numeric(row.aiConfidence),
  ai_model: row.aiModel,
  embedding_status: row.embeddingStatus,
  occurred_at: iso(row.occurredAt),
  created_at: iso(row.createdAt),
  reviewed_at: iso(row.reviewedAt),
  evidence_count: evidenceCount,
  // FR-PE-27: a lawfully redacted excerpt leaves a tombstone, so an accepted
  // item can hold zero *live* evidence without being a FR-PE-18 violation.
  // Listing surfaces need to tell those two cases apart.
  redacted_evidence_count: redactedEvidenceCount,
});

/** Live vs. redacted evidence per item, for the listing surfaces. */
const tallyEvidence = (
  evidence: Array<{
    itemId: string;
    redactedAt: Date | null;
    supersededByEvidenceId: string | null;
  }>
): Map<string, { live: number; redacted: number }> => {
  const counts = new Map<string, { live: number; redacted: number }>();
  for (const row of evidence) {
    const entry = counts.get(row.itemId) ?? { live: 0, redacted: 0 };
    if (row.redactedAt !== null) entry.redacted += 1;
    else if (row.supersededByEvidenceId === null) entry.live += 1;
    counts.set(row.itemId, entry);
  }
  return counts;
};

const NO_EVIDENCE = { live: 0, redacted: 0 };

const toEvidenceOutput = (
  row: EvidenceRow,
  mode: "full" | "preview" | "metadata"
): EvidenceOutput => {
  const base: EvidenceOutput = {
    id: row.id,
    source_kind: row.sourceKind,
    source_reference: row.sourceReference,
    external_source_id: row.externalSourceId,
    source_author: row.sourceAuthor,
    excerpt_provided_by: row.excerptProvidedBy,
    captured_by: row.capturedBy,
    occurred_at: iso(row.occurredAt),
    created_at: iso(row.createdAt),
    has_excerpt: row.excerpt !== null && row.excerpt.length > 0,
    redacted: row.redactedAt !== null,
    redaction_reason: row.redactionReason,
    superseded_by_evidence_id: row.supersededByEvidenceId,
  };
  if (mode === "full") base.excerpt = row.excerpt;
  if (mode === "preview") base.excerpt_preview = previewOf(row.excerpt);
  return base;
};

const toRelationOutput = (row: RelationRow): RelationOutput => ({
  id: row.id,
  from_item_id: row.fromItemId,
  to_item_id: row.toItemId,
  relation_type: row.relationType,
  created_by: row.createdBy,
  created_at: iso(row.createdAt),
  retracted_at: iso(row.retractedAt),
});

/**
 * Loads an item and refuses to leak one that belongs to another project. RLS
 * enforces this at the database level too (NFR-PE-01); this check turns what
 * would otherwise be a confusing empty result into an explicit 404.
 */
const loadItemInProject = async (
  db: ProjectEvolutionTx,
  itemId: string,
  projectId: string
): Promise<ItemRow> => {
  const item = await findItemById(db, itemId);
  if (!item || item.projectId !== projectId) {
    throw notFoundError(`Project evolution item ${itemId} not found`);
  }
  return item;
};

/* ------------------------------------------------------------------
 * 11.1 propose_project_update — capture (FR-PE-01 … FR-PE-10)
 * ------------------------------------------------------------------ */

export interface EvidenceInput {
  sourceKind: string;
  sourceReference?: string | null;
  externalSourceId?: string | null;
  excerpt?: string | null;
  sourceAuthor?: string | null;
  providedBy?: "human" | "adapter" | "workflow" | "ai_agent" | null;
  occurredAt?: string | null;
}

export interface ProposeProjectUpdateInput {
  projectId: string;
  type: string;
  title?: string | null;
  statement?: string | null;
  rationale?: string | null;
  occurredAt?: string | null;
  proposedBy?: string | null;
  captureMode?: "manual" | "ai_assisted" | "adapter" | "workflow" | null;
  aiConfidence?: number | null;
  aiModel?: string | null;
  supersedesItemId?: string | null;
  evidence?: EvidenceInput[] | null;
}

export interface ProposeProjectUpdateOutput {
  item_id: string;
  status: string;
  revision: number;
  action: "created" | "duplicate" | "existing";
  idempotent: boolean;
  embedding_status: string;
  evidence_ids: string[];
  needs_review: boolean;
  extraction: "structured" | "deterministic_draft";
  duplicate_suggestions: Array<{ id: string; title: string; status: string; similarity: number }>;
}

/**
 * FR-PE-02 / FR-PE-54: a caller may send structured fields, or send only
 * evidence and let Lore derive a draft. Phase 1 derives that draft
 * deterministically — first sentence as title, excerpt as statement — so the
 * feature works with no generative provider configured. Phase 2 replaces this
 * function with model-backed extraction; either way the result is a *proposal*,
 * flagged `needs_review`, never accepted knowledge.
 */
const draftFromEvidence = (
  evidence: EvidenceInput[]
): { title: string; statement: string } | null => {
  const excerpt = evidence.map((e) => (e.excerpt ?? "").trim()).find((e) => e.length > 0);
  if (!excerpt) return null;
  const collapsed = excerpt.replace(/\s+/g, " ").trim();
  const firstSentence = collapsed.match(/^.+?[.!?](?=\s|$)/)?.[0]?.trim() ?? collapsed;
  const title = firstSentence.length > 120 ? `${firstSentence.slice(0, 117)}...` : firstSentence;
  return { title, statement: collapsed };
};

const normalizeEvidenceInput = (
  raw: EvidenceInput,
  index: number
): {
  sourceKind: string;
  sourceReference: string | null;
  externalSourceId: string | null;
  excerpt: string | null;
  sourceAuthor: string | null;
  excerptProvidedBy: string;
  occurredAt: Date | null;
} => ({
  sourceKind: requireNonEmpty(raw.sourceKind, `evidence[${index}].source_kind`),
  sourceReference: optionalTrimmed(raw.sourceReference),
  externalSourceId: optionalTrimmed(raw.externalSourceId),
  excerpt: optionalTrimmed(raw.excerpt),
  sourceAuthor: optionalTrimmed(raw.sourceAuthor),
  excerptProvidedBy: raw.providedBy ?? "human",
  occurredAt: parseDate(raw.occurredAt, `evidence[${index}].occurred_at`),
});

export const proposeProjectUpdate = async (
  db: ProjectEvolutionTx,
  input: ProposeProjectUpdateInput
): Promise<ProposeProjectUpdateOutput> => {
  const type = assertItemType(input.type);
  const evidenceInputs = (input.evidence ?? []).map(normalizeEvidenceInput);
  const proposedBy = optionalTrimmed(input.proposedBy);
  const capturedBy = proposedBy;
  const occurredAt = parseDate(input.occurredAt, "occurred_at");

  if (input.aiConfidence !== null && input.aiConfidence !== undefined) {
    if (input.aiConfidence < 0 || input.aiConfidence > 1) {
      throw validationError("ai_confidence must be between 0 and 1");
    }
  }

  // FR-PE-07: a repeated adapter delivery must not create a second item. The
  // probe runs before any write, so a retried webhook is a no-op rather than a
  // duplicate proposal for a reviewer to clean up.
  for (const evidence of evidenceInputs) {
    if (!evidence.externalSourceId) continue;
    const existing = await findEvidenceByExternalSource(db, {
      projectId: input.projectId,
      sourceKind: evidence.sourceKind,
      externalSourceId: evidence.externalSourceId,
    });
    if (existing) {
      const item = await findItemById(db, existing.itemId);
      return {
        item_id: existing.itemId,
        status: item?.status ?? "proposed",
        revision: item?.revision ?? 1,
        action: "existing",
        idempotent: true,
        embedding_status: item?.embeddingStatus ?? "pending",
        evidence_ids: [existing.id],
        needs_review: (item?.status ?? "proposed") === "proposed",
        extraction: "structured",
        duplicate_suggestions: [],
      };
    }
  }

  let title = optionalTrimmed(input.title);
  let statement = optionalTrimmed(input.statement);
  let extraction: "structured" | "deterministic_draft" = "structured";

  if (!title || !statement) {
    const draft = draftFromEvidence(input.evidence ?? []);
    if (!draft) {
      throw validationError(
        "title and statement are required unless at least one evidence record carries an excerpt to draft from"
      );
    }
    title = title ?? draft.title;
    statement = statement ?? draft.statement;
    extraction = "deterministic_draft";
  }

  const rationale = optionalTrimmed(input.rationale);
  const statementHash = statementHashOf(type, statement);

  // FR-PE-15/16: supersession is *declared* here and only *applied* on
  // acceptance. A proposal cannot demote accepted knowledge on its own.
  let proposedSupersedesItemId: string | null = null;
  if (input.supersedesItemId) {
    const target = await loadItemInProject(db, input.supersedesItemId, input.projectId);
    proposedSupersedesItemId = target.id;
  }

  // FR-PE-08: exact duplicates are resolved before any semantic work. New
  // evidence still lands on the existing item — more support for a statement
  // already on file is a gain, a second identical item is noise.
  const exactDuplicate = await findItemByStatementHash(db, {
    projectId: input.projectId,
    type,
    statementHash,
  });

  if (exactDuplicate) {
    const evidenceIds = await appendEvidence(db, {
      item: exactDuplicate,
      evidence: evidenceInputs,
      capturedBy,
      actor: proposedBy,
    });
    return {
      item_id: exactDuplicate.id,
      status: exactDuplicate.status,
      revision: exactDuplicate.revision,
      action: "duplicate",
      idempotent: false,
      embedding_status: exactDuplicate.embeddingStatus,
      evidence_ids: evidenceIds,
      needs_review: exactDuplicate.status === "proposed",
      extraction,
      duplicate_suggestions: [],
    };
  }

  const embedding = await embedOrNull(embedTextOf({ title, statement, rationale }));

  // FR-PE-09: suggestions only. Nothing is merged, and an accepted item is
  // never touched on the strength of a similarity score.
  const duplicateSuggestions = embedding
    ? await findSemanticDuplicateCandidates(db, {
        projectId: input.projectId,
        type,
        embedding,
        threshold: SEMANTIC_DUPLICATE_THRESHOLD,
        limit: SEMANTIC_DUPLICATE_LIMIT,
      })
    : [];

  const { id: itemId } = await insertItem(db, {
    projectId: input.projectId,
    type,
    title,
    statement,
    rationale,
    statementHash,
    captureMode: input.captureMode ?? "manual",
    proposedBy,
    proposedSupersedesItemId,
    aiConfidence: input.aiConfidence ?? null,
    aiModel: optionalTrimmed(input.aiModel),
    embedding,
    occurredAt,
  });

  await insertItemVersion(db, {
    itemId,
    projectId: input.projectId,
    revision: 1,
    title,
    statement,
    rationale,
    authoredBy: proposedBy,
    aiConfidence: input.aiConfidence ?? null,
    aiModel: optionalTrimmed(input.aiModel),
  });

  await insertEvent(db, {
    projectId: input.projectId,
    itemId,
    eventType: "proposed",
    revision: 1,
    actor: proposedBy,
    note: extraction === "deterministic_draft" ? "drafted from evidence excerpt" : null,
    payload: {
      type,
      capture_mode: input.captureMode ?? "manual",
      extraction,
      proposed_supersedes_item_id: proposedSupersedesItemId,
    },
  });

  const item = await findItemById(db, itemId);
  const evidenceIds = await appendEvidence(db, {
    item: item!,
    evidence: evidenceInputs,
    capturedBy,
    actor: proposedBy,
  });

  return {
    item_id: itemId,
    status: "proposed",
    revision: 1,
    action: "created",
    idempotent: false,
    embedding_status: embedding ? "complete" : "pending",
    evidence_ids: evidenceIds,
    needs_review: true,
    extraction,
    duplicate_suggestions: duplicateSuggestions.map((candidate) => ({
      ...candidate,
      similarity: Math.round(candidate.similarity * 1000) / 1000,
    })),
  };
};

/** Appends evidence rows plus their audit events. Shared by capture and by the
 *  `add_evidence` review action so both paths log identically. */
const appendEvidence = async (
  db: ProjectEvolutionTx,
  params: {
    item: ItemRow;
    evidence: ReturnType<typeof normalizeEvidenceInput>[];
    capturedBy: string | null;
    actor: string | null;
  }
): Promise<string[]> => {
  const ids: string[] = [];
  for (const evidence of params.evidence) {
    // A repeat delivery of the same external source onto an item we already
    // hold is a no-op rather than an error — the partial unique index would
    // reject it anyway, and adapters retry.
    if (evidence.externalSourceId) {
      const existing = await findEvidenceByExternalSource(db, {
        projectId: params.item.projectId,
        sourceKind: evidence.sourceKind,
        externalSourceId: evidence.externalSourceId,
      });
      if (existing) {
        ids.push(existing.id);
        continue;
      }
    }

    const { id } = await insertEvidence(db, {
      itemId: params.item.id,
      projectId: params.item.projectId,
      sourceKind: evidence.sourceKind,
      sourceReference: evidence.sourceReference,
      externalSourceId: evidence.externalSourceId,
      excerpt: evidence.excerpt,
      sourceAuthor: evidence.sourceAuthor,
      excerptProvidedBy: evidence.excerptProvidedBy,
      capturedBy: params.capturedBy,
      occurredAt: evidence.occurredAt,
    });
    ids.push(id);

    // NFR-PE-12: the event payload records provenance, never the excerpt.
    await insertEvent(db, {
      projectId: params.item.projectId,
      itemId: params.item.id,
      eventType: "evidence_added",
      actor: params.actor,
      payload: {
        evidence_id: id,
        source_kind: evidence.sourceKind,
        source_reference: evidence.sourceReference,
        external_source_id: evidence.externalSourceId,
        provided_by: evidence.excerptProvidedBy,
      },
    });
  }
  return ids;
};

/* ------------------------------------------------------------------
 * 11.2 review_project_update — lifecycle (FR-PE-11 … FR-PE-18)
 * ------------------------------------------------------------------ */

export type ReviewAction =
  | "inspect"
  | "revise"
  | "accept"
  | "reject"
  | "add_evidence"
  | "supersede_evidence"
  | "redact_evidence";

export interface ReviewProjectUpdateInput {
  projectId: string;
  itemId: string;
  action: ReviewAction;
  reviewer?: string | null;
  note?: string | null;
  title?: string | null;
  statement?: string | null;
  rationale?: string | null;
  supersedesItemId?: string | null;
  evidence?: EvidenceInput[] | null;
  evidenceId?: string | null;
  redactionReason?: string | null;
}

export interface ItemDetailOutput {
  item: ItemOutput;
  versions: Array<{
    revision: number;
    title: string;
    statement: string;
    rationale: string | null;
    authored_by: string | null;
    created_at: string | null;
  }>;
  evidence: EvidenceOutput[];
  events: EventOutput[];
  relations: RelationOutput[];
  links: Array<{
    id: string;
    target_kind: string;
    session_id: string | null;
    external_task_id: string | null;
    external_task_ref: string | null;
    external_tracker_type: string | null;
    created_at: string | null;
  }>;
}

export interface ReviewProjectUpdateOutput {
  item_id: string;
  status: string;
  revision: number;
  action: ReviewAction;
  superseded_item_id?: string | null;
  evidence_ids?: string[];
  evidence_id?: string | null;
  detail?: ItemDetailOutput;
}

/** FR-PE-61 / §14.6: the one path that returns full evidence excerpts. */
export const getItemDetail = async (
  db: ProjectEvolutionTx,
  itemId: string,
  projectId: string
): Promise<ItemDetailOutput> => {
  const item = await loadItemInProject(db, itemId, projectId);
  const [versions, evidence, events, relations, links] = await Promise.all([
    findVersionsByItemId(db, itemId),
    findEvidenceByItemIds(db, [itemId]),
    findEventsByItemId(db, itemId),
    findRelationsForItems(db, [itemId], { includeRetracted: true }),
    findLinksForItems(db, [itemId]),
  ]);

  const liveEvidenceCount = evidence.filter(
    (e) => e.redactedAt === null && e.supersededByEvidenceId === null
  ).length;
  const redactedEvidenceCount = evidence.filter((e) => e.redactedAt !== null).length;

  return {
    item: toItemOutput(item, liveEvidenceCount, redactedEvidenceCount),
    versions: versions.map((v) => ({
      revision: v.revision,
      title: v.title,
      statement: v.statement,
      rationale: v.rationale,
      authored_by: v.authoredBy,
      created_at: iso(v.createdAt),
    })),
    evidence: evidence.map((e) => toEvidenceOutput(e, "full")),
    events: events.map((e) => ({
      id: e.id,
      item_id: e.itemId,
      event_type: e.eventType,
      revision: e.revision,
      actor: e.actor,
      note: e.note,
      payload: e.payload,
      created_at: iso(e.createdAt),
    })),
    relations: relations.map(toRelationOutput),
    links: links.map((l) => ({
      id: l.id,
      target_kind: l.targetKind,
      session_id: l.sessionId,
      external_task_id: l.externalTaskId,
      external_task_ref: l.externalTaskRef,
      external_tracker_type: l.externalTrackerType,
      created_at: iso(l.createdAt),
    })),
  };
};

export const reviewProjectUpdate = async (
  db: ProjectEvolutionTx,
  input: ReviewProjectUpdateInput
): Promise<ReviewProjectUpdateOutput> => {
  const item = await loadItemInProject(db, input.itemId, input.projectId);
  const reviewer = optionalTrimmed(input.reviewer);
  const note = optionalTrimmed(input.note);

  switch (input.action) {
    case "inspect": {
      const detail = await getItemDetail(db, item.id, input.projectId);
      return {
        item_id: item.id,
        status: item.status,
        revision: item.revision,
        action: "inspect",
        detail,
      };
    }

    case "revise":
      return reviseItem(db, { item, reviewer, note, input });

    case "accept":
      return acceptItem(db, { item, reviewer, note, input });

    case "reject": {
      // FR-PE-14: rejection is recorded, never a delete. The item and all of
      // its evidence stay queryable in history (FR-PE-23).
      if (item.status !== "proposed") {
        throw conflictError(`Only proposed items can be rejected (item is ${item.status})`);
      }
      await markItemReviewed(db, { itemId: item.id, status: "rejected", approvedBy: reviewer });
      await insertEvent(db, {
        projectId: input.projectId,
        itemId: item.id,
        eventType: "rejected",
        revision: item.revision,
        actor: reviewer,
        note,
      });
      return { item_id: item.id, status: "rejected", revision: item.revision, action: "reject" };
    }

    case "add_evidence": {
      // FR-PE-05/FR-PE-24: evidence may be strengthened at any point in the
      // lifecycle, including after acceptance — appending support to accepted
      // knowledge never rewrites it.
      const evidenceInputs = (input.evidence ?? []).map(normalizeEvidenceInput);
      if (evidenceInputs.length === 0) {
        throw validationError("add_evidence requires at least one evidence record");
      }
      const evidenceIds = await appendEvidence(db, {
        item,
        evidence: evidenceInputs,
        capturedBy: reviewer,
        actor: reviewer,
      });
      return {
        item_id: item.id,
        status: item.status,
        revision: item.revision,
        action: "add_evidence",
        evidence_ids: evidenceIds,
      };
    }

    case "supersede_evidence": {
      // FR-PE-27: a correction appends replacement evidence and records the
      // supersession. The original row is left intact.
      const evidenceId = requireNonEmpty(input.evidenceId, "evidence_id");
      const original = await findEvidenceById(db, evidenceId);
      if (!original || original.itemId !== item.id) {
        throw notFoundError(`Evidence ${evidenceId} not found on item ${item.id}`);
      }
      if (original.supersededByEvidenceId) {
        throw conflictError(`Evidence ${evidenceId} has already been superseded`);
      }
      const replacements = (input.evidence ?? []).map(normalizeEvidenceInput);
      if (replacements.length !== 1) {
        throw validationError(
          "supersede_evidence requires exactly one replacement evidence record"
        );
      }
      const [replacementId] = await appendEvidence(db, {
        item,
        evidence: replacements,
        capturedBy: reviewer,
        actor: reviewer,
      });
      await markEvidenceSuperseded(db, {
        evidenceId,
        supersededByEvidenceId: replacementId,
      });
      await insertEvent(db, {
        projectId: input.projectId,
        itemId: item.id,
        eventType: "evidence_superseded",
        actor: reviewer,
        note,
        payload: { evidence_id: evidenceId, replaced_by_evidence_id: replacementId },
      });
      return {
        item_id: item.id,
        status: item.status,
        revision: item.revision,
        action: "supersede_evidence",
        evidence_id: replacementId,
      };
    }

    case "redact_evidence": {
      // FR-PE-27 / §14.5: security- or legal-mandated erasure. The excerpt is
      // cleared but the row survives as an audited tombstone, so the item is
      // visibly missing evidence rather than silently unsupported.
      const evidenceId = requireNonEmpty(input.evidenceId, "evidence_id");
      const reason = requireNonEmpty(input.redactionReason, "redaction_reason");
      const target = await findEvidenceById(db, evidenceId);
      if (!target || target.itemId !== item.id) {
        throw notFoundError(`Evidence ${evidenceId} not found on item ${item.id}`);
      }
      if (target.redactedAt) {
        throw conflictError(`Evidence ${evidenceId} has already been redacted`);
      }
      await redactEvidence(db, { evidenceId, reason });
      await insertEvent(db, {
        projectId: input.projectId,
        itemId: item.id,
        eventType: "evidence_redacted",
        actor: reviewer,
        note,
        payload: { evidence_id: evidenceId, redaction_reason: reason },
      });
      return {
        item_id: item.id,
        status: item.status,
        revision: item.revision,
        action: "redact_evidence",
        evidence_id: evidenceId,
      };
    }

    default:
      throw validationError(`Unsupported review action "${String(input.action)}"`);
  }
};

/**
 * FR-PE-12 / FR-PE-50: a reviewer corrects a proposal by appending revision
 * n+1. Earlier revisions stay byte-identical in
 * project_evolution_item_versions, so "what did the AI originally propose"
 * remains answerable after the correction.
 */
const reviseItem = async (
  db: ProjectEvolutionTx,
  params: {
    item: ItemRow;
    reviewer: string | null;
    note: string | null;
    input: ReviewProjectUpdateInput;
  }
): Promise<ReviewProjectUpdateOutput> => {
  const { item, reviewer, note, input } = params;

  if (item.status !== "proposed") {
    throw conflictError(
      `Only proposed items can be revised (item is ${item.status}). Accepted knowledge changes by proposing a superseding item.`
    );
  }

  const title =
    input.title === undefined || input.title === null
      ? item.title
      : requireNonEmpty(input.title, "title");
  const statement =
    input.statement === undefined || input.statement === null
      ? item.statement
      : requireNonEmpty(input.statement, "statement");
  const rationale =
    input.rationale === undefined ? item.rationale : optionalTrimmed(input.rationale);

  if (title === item.title && statement === item.statement && rationale === item.rationale) {
    throw validationError("revise requires at least one changed field");
  }

  const revision = item.revision + 1;
  const statementChanged = statement !== item.statement;
  const embedding = statementChanged
    ? await embedOrNull(embedTextOf({ title, statement, rationale }))
    : null;

  await insertItemVersion(db, {
    itemId: item.id,
    projectId: item.projectId,
    revision,
    title,
    statement,
    rationale,
    authoredBy: reviewer,
    aiConfidence: null,
    aiModel: null,
  });

  await applyItemRevision(db, {
    itemId: item.id,
    revision,
    title,
    statement,
    rationale,
    embedding,
    statementHash: statementHashOf(item.type, statement),
  });

  await insertEvent(db, {
    projectId: item.projectId,
    itemId: item.id,
    eventType: "revised",
    revision,
    actor: reviewer,
    note,
    payload: {
      title_changed: title !== item.title,
      statement_changed: statementChanged,
      rationale_changed: rationale !== item.rationale,
    },
  });

  return { item_id: item.id, status: item.status, revision, action: "revise" };
};

/**
 * FR-PE-13/16/18: acceptance is the only transition that changes current
 * project truth, so it is where the invariants are enforced:
 *   - the item must still be proposed;
 *   - it must carry at least one live evidence record;
 *   - a declared supersession is applied atomically with the acceptance.
 * All of this runs inside the request transaction, so a failure part-way
 * through leaves neither the acceptance nor the supersession behind.
 */
const acceptItem = async (
  db: ProjectEvolutionTx,
  params: {
    item: ItemRow;
    reviewer: string | null;
    note: string | null;
    input: ReviewProjectUpdateInput;
  }
): Promise<ReviewProjectUpdateOutput> => {
  const { item, reviewer, note, input } = params;

  if (item.status !== "proposed") {
    throw conflictError(`Only proposed items can be accepted (item is ${item.status})`);
  }

  const evidenceCount = await countLiveEvidence(db, item.id);
  if (evidenceCount === 0) {
    throw conflictError(
      "An accepted item must have at least one evidence record (FR-PE-18). Add evidence before accepting."
    );
  }

  const supersedesItemId = optionalTrimmed(input.supersedesItemId) ?? item.proposedSupersedesItemId;

  let supersededItemId: string | null = null;

  if (supersedesItemId) {
    if (supersedesItemId === item.id) {
      throw validationError("An item cannot supersede itself");
    }
    // FR-PE-31: both endpoints must belong to the same project.
    const target = await loadItemInProject(db, supersedesItemId, item.projectId);
    if (target.status !== "accepted") {
      throw conflictError(
        `Only an accepted item can be superseded (target ${target.id} is ${target.status})`
      );
    }

    const marked = await markItemSuperseded(db, {
      itemId: target.id,
      supersededByItemId: item.id,
    });
    if (!marked) {
      throw conflictError(
        `Item ${target.id} was superseded concurrently; re-read it before accepting again`
      );
    }
    supersededItemId = target.id;

    // FR-PE-15/20: the supersedes edge is what establishes precedence. Recency
    // alone never does.
    const existingRelation = await findLiveRelation(db, {
      fromItemId: item.id,
      toItemId: target.id,
      relationType: "supersedes",
    });
    if (!existingRelation) {
      await insertRelation(db, {
        projectId: item.projectId,
        fromItemId: item.id,
        toItemId: target.id,
        relationType: "supersedes",
        createdBy: reviewer,
      });
      await insertEvent(db, {
        projectId: item.projectId,
        itemId: item.id,
        eventType: "relation_created",
        actor: reviewer,
        payload: { relation_type: "supersedes", to_item_id: target.id },
      });
    }

    await insertEvent(db, {
      projectId: item.projectId,
      itemId: target.id,
      eventType: "superseded",
      revision: target.revision,
      actor: reviewer,
      note,
      payload: { superseded_by_item_id: item.id },
    });
  }

  await markItemReviewed(db, { itemId: item.id, status: "accepted", approvedBy: reviewer });
  await insertEvent(db, {
    projectId: item.projectId,
    itemId: item.id,
    eventType: "accepted",
    revision: item.revision,
    actor: reviewer,
    note,
    payload: { supersedes_item_id: supersededItemId, evidence_count: evidenceCount },
  });

  return {
    item_id: item.id,
    status: "accepted",
    revision: item.revision,
    action: "accept",
    superseded_item_id: supersededItemId,
  };
};

/* ------------------------------------------------------------------
 * 11.3 query_project_context — retrieval (FR-PE-35 … FR-PE-42)
 * ------------------------------------------------------------------ */

export interface QueryProjectContextInput {
  projectId: string;
  query?: string | null;
  taskContext?: {
    title?: string | null;
    description?: string | null;
    acceptanceCriteria?: string | null;
  } | null;
  types?: string[] | null;
  limit?: number | null;
  hops?: number | null;
  includeHistory?: boolean | null;
}

export interface ContextItemOutput extends ItemOutput {
  score: number;
  match_reasons: string[];
  hops: number;
  evidence: EvidenceOutput[];
  replaces?: { id: string; title: string } | null;
}

export interface ContextWarning {
  kind: "unresolved_contradiction" | "superseded_match";
  message: string;
  item_ids: string[];
}

export interface QueryProjectContextOutput {
  items: ContextItemOutput[];
  count: number;
  truncated: boolean;
  warnings: ContextWarning[];
  degraded: boolean;
}

const SCORE_WEIGHTS = {
  semantic: 0.5,
  text: 0.25,
  recency: 0.15,
  evidence: 0.1,
} as const;

/** Recency contribution decays over a quarter; older accepted knowledge is
 *  still returned, just ranked below fresher material of equal relevance. */
const recencyScore = (row: ItemRow): number => {
  const at = row.occurredAt ?? row.createdAt;
  if (!at) return 0;
  const ageDays = (Date.now() - at.getTime()) / 86_400_000;
  return Math.max(0, 1 - ageDays / 90);
};

interface Candidate {
  row: ItemRow;
  similarity: number;
  textRank: number;
  reasons: Set<string>;
  hops: number;
}

const mergeCandidate = (
  map: Map<string, Candidate>,
  row: RetrievedItemRow | ItemRow,
  reason: string,
  hops = 0
): void => {
  const retrieved = row as RetrievedItemRow;
  const existing = map.get(row.id);
  if (existing) {
    existing.similarity = Math.max(existing.similarity, retrieved.similarity ?? 0);
    existing.textRank = Math.max(existing.textRank, retrieved.textRank ?? 0);
    existing.reasons.add(reason);
    existing.hops = Math.min(existing.hops, hops);
    return;
  }
  map.set(row.id, {
    row,
    similarity: retrieved.similarity ?? 0,
    textRank: retrieved.textRank ?? 0,
    reasons: new Set([reason]),
    hops,
  });
};

export const queryProjectContext = async (
  db: ProjectEvolutionTx,
  input: QueryProjectContextInput
): Promise<QueryProjectContextOutput> => {
  // FR-PE-41: context responses are bounded. A caller cannot ask for the whole
  // project history through this endpoint.
  const limit = Math.min(Math.max(input.limit ?? DEFAULT_CONTEXT_LIMIT, 1), MAX_CONTEXT_LIMIT);
  const hops = Math.min(Math.max(input.hops ?? 1, 0), 2);
  const types = input.types && input.types.length > 0 ? input.types.map(assertItemType) : undefined;

  const queryText = [
    optionalTrimmed(input.query),
    optionalTrimmed(input.taskContext?.title),
    optionalTrimmed(input.taskContext?.description),
    optionalTrimmed(input.taskContext?.acceptanceCriteria),
  ]
    .filter(Boolean)
    .join("\n")
    .trim();

  const candidates = new Map<string, Candidate>();
  const warnings: ContextWarning[] = [];
  /** replacement item id -> the superseded item whose wording matched. */
  const replacedBy = new Map<string, { id: string; title: string }>();
  let degraded = false;

  if (queryText.length === 0) {
    // FR-PE-37 with no question asked: the answer is simply the current state.
    const current = await findCurrentStateItems(db, {
      projectId: input.projectId,
      types,
      limit: limit + 1,
    });
    current.forEach((row) => mergeCandidate(candidates, row, "current_state"));
  } else {
    const embedding = await embedOrNull(queryText);
    // NFR-PE-07: with no embedding provider the lexical branch still returns a
    // deterministic, lifecycle-correct answer — degraded, not broken.
    degraded = embedding === null;

    const [semantic, lexical] = await Promise.all([
      embedding
        ? findItemsSemantic(db, {
            projectId: input.projectId,
            embedding,
            types,
            threshold: CONTEXT_SEMANTIC_THRESHOLD,
            limit: limit * 2,
            currentOnly: !input.includeHistory,
          })
        : Promise.resolve([]),
      findItemsFullText(db, {
        projectId: input.projectId,
        query: queryText,
        types,
        limit: limit * 2,
        currentOnly: !input.includeHistory,
      }),
    ]);

    semantic.forEach((row) => mergeCandidate(candidates, row, "semantic"));
    lexical.forEach((row) => mergeCandidate(candidates, row, "text"));

    // FR-PE-42: a question phrased in the old wording still lands on the item
    // that replaced it. We search history for the match, then hand back the
    // current replacement.
    if (!input.includeHistory) {
      const historicalMatches = await findItemsFullText(db, {
        projectId: input.projectId,
        query: queryText,
        types,
        limit,
        currentOnly: false,
      });
      for (const match of historicalMatches) {
        if (match.status !== "superseded") continue;
        const replacement = await findCurrentReplacement(db, match.id);
        if (!replacement || replacement.status !== "accepted") continue;
        mergeCandidate(candidates, replacement, "replaces_superseded_match");
        const candidate = candidates.get(replacement.id);
        if (candidate) {
          candidate.textRank = Math.max(candidate.textRank, match.textRank);
        }
        replacedBy.set(replacement.id, { id: match.id, title: match.title });
        warnings.push({
          kind: "superseded_match",
          message: `"${match.title}" matched your query but was superseded by "${replacement.title}"`,
          item_ids: [match.id, replacement.id],
        });
      }
    }

    // FR-PE-32: expand the neighbourhood around the seeds so a matched decision
    // brings its cause and the requirement it implements along with it.
    if (hops > 0 && candidates.size > 0) {
      const related = await expandRelatedItems(db, {
        projectId: input.projectId,
        seedIds: Array.from(candidates.keys()),
        hops,
        limit: limit * 2,
        currentOnly: !input.includeHistory,
      });
      related.forEach(({ item, hops: distance, viaRelation }) =>
        mergeCandidate(candidates, item, `relationship:${viaRelation}`, distance)
      );
    }
  }

  const ranked = Array.from(candidates.values());
  const itemIds = ranked.map((c) => c.row.id);
  const evidenceRows = await findEvidenceByItemIds(db, itemIds);
  const evidenceByItem = new Map<string, EvidenceRow[]>();
  for (const row of evidenceRows) {
    const list = evidenceByItem.get(row.itemId) ?? [];
    list.push(row);
    evidenceByItem.set(row.itemId, list);
  }

  const scored = ranked.map((candidate) => {
    const evidence = evidenceByItem.get(candidate.row.id) ?? [];
    const liveEvidence = evidence.filter(
      (e) => e.redactedAt === null && e.supersededByEvidenceId === null
    );
    // FR-PE-36: evidence availability is part of relevance — a well-supported
    // item outranks an equally-similar one nobody backed up.
    const evidenceSignal = liveEvidence.length > 0 ? 1 : 0;
    // Relationship-only hits are supporting context, not the answer, so they
    // are damped by distance.
    const hopPenalty = candidate.hops === 0 ? 1 : candidate.hops === 1 ? 0.6 : 0.35;

    const score =
      (SCORE_WEIGHTS.semantic * candidate.similarity +
        SCORE_WEIGHTS.text * Math.min(candidate.textRank * 10, 1) +
        SCORE_WEIGHTS.recency * recencyScore(candidate.row) +
        SCORE_WEIGHTS.evidence * evidenceSignal) *
      hopPenalty;

    return { candidate, liveEvidence, evidence, score };
  });

  // NFR-PE-07: ties break on created_at then id, so repeated identical queries
  // return an identical ordering.
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const aTime = a.candidate.row.createdAt?.getTime() ?? 0;
    const bTime = b.candidate.row.createdAt?.getTime() ?? 0;
    if (bTime !== aTime) return bTime - aTime;
    return a.candidate.row.id.localeCompare(b.candidate.row.id);
  });

  const truncated = scored.length > limit;
  const page = scored.slice(0, limit);

  const items: ContextItemOutput[] = page.map(({ candidate, liveEvidence, evidence, score }) => {
    const output: ContextItemOutput = {
      ...toItemOutput(
        candidate.row,
        liveEvidence.length,
        evidence.filter((e) => e.redactedAt !== null).length
      ),
      score: Math.round(score * 1000) / 1000,
      match_reasons: Array.from(candidate.reasons).sort(),
      hops: candidate.hops,
      // FR-PE-38: every returned item cites its evidence. Excerpts are
      // previews here; `inspect` returns them in full (§14.6).
      evidence: evidence
        .slice(0, EVIDENCE_PER_ITEM_IN_CONTEXT)
        .map((e) => toEvidenceOutput(e, "preview")),
    };

    const replaced = replacedBy.get(candidate.row.id);
    if (replaced) output.replaces = replaced;

    return output;
  });

  // FR-PE-22: contradictions are surfaced with the answer rather than left for
  // the reader to notice.
  const contradictions = await findUnresolvedContradictions(db, input.projectId);
  const returnedIds = new Set(items.map((i) => i.id));
  for (const contradiction of contradictions) {
    if (!returnedIds.has(contradiction.fromItemId) && !returnedIds.has(contradiction.toItemId)) {
      continue;
    }
    warnings.push({
      kind: "unresolved_contradiction",
      message: `"${contradiction.fromTitle}" contradicts "${contradiction.toTitle}" and the conflict is unresolved`,
      item_ids: [contradiction.fromItemId, contradiction.toItemId],
    });
  }

  return { items, count: items.length, truncated, warnings, degraded };
};

/* ------------------------------------------------------------------
 * 11.4 get_project_history (FR-PE-39 … FR-PE-40)
 * ------------------------------------------------------------------ */

export interface GetProjectHistoryInput {
  projectId: string;
  itemId?: string | null;
  types?: string[] | null;
  statuses?: string[] | null;
  eventTypes?: string[] | null;
  since?: string | null;
  until?: string | null;
  limit?: number | null;
  offset?: number | null;
}

export interface GetProjectHistoryOutput {
  events: EventOutput[];
  items: Array<ItemOutput & { relations: RelationOutput[] }>;
  total_items: number;
  limit: number;
  offset: number;
}

export const getProjectHistory = async (
  db: ProjectEvolutionTx,
  input: GetProjectHistoryInput
): Promise<GetProjectHistoryOutput> => {
  const limit = Math.min(Math.max(input.limit ?? DEFAULT_HISTORY_LIMIT, 1), MAX_HISTORY_LIMIT);
  const offset = Math.max(input.offset ?? 0, 0);
  const types = input.types && input.types.length > 0 ? input.types.map(assertItemType) : undefined;
  const statuses = input.statuses && input.statuses.length > 0 ? input.statuses : undefined;
  const since = parseDate(input.since, "since");
  const until = parseDate(input.until, "until");

  const [events, items, totalItems] = await Promise.all([
    findEvents(db, {
      projectId: input.projectId,
      itemId: optionalTrimmed(input.itemId),
      eventTypes: input.eventTypes ?? undefined,
      since,
      until,
      limit,
      offset,
    }),
    findItems(db, { projectId: input.projectId, types, statuses, since, until, limit, offset }),
    countItems(db, { projectId: input.projectId, types, statuses, since, until }),
  ]);

  const itemIds = items.map((i) => i.id);
  const [evidence, relations] = await Promise.all([
    findEvidenceByItemIds(db, itemIds),
    // FR-PE-40: history shows supersession and contradiction edges, including
    // retracted ones, so an audit can see what was linked and later unlinked.
    findRelationsForItems(db, itemIds, { includeRetracted: true }),
  ]);

  const evidenceCounts = tallyEvidence(evidence);

  return {
    events: events.map((e) => ({
      id: e.id,
      item_id: e.itemId,
      event_type: e.eventType,
      revision: e.revision,
      actor: e.actor,
      note: e.note,
      payload: e.payload,
      created_at: iso(e.createdAt),
    })),
    items: items.map((item) => ({
      ...toItemOutput(
        item,
        (evidenceCounts.get(item.id) ?? NO_EVIDENCE).live,
        (evidenceCounts.get(item.id) ?? NO_EVIDENCE).redacted
      ),
      relations: relations
        .filter((r) => r.fromItemId === item.id || r.toItemId === item.id)
        .map(toRelationOutput),
    })),
    total_items: totalItems,
    limit,
    offset,
  };
};

/* ------------------------------------------------------------------
 * 11.5 link_project_updates (FR-PE-29 … FR-PE-31, FR-PE-45)
 * ------------------------------------------------------------------ */

export interface LinkProjectUpdatesInput {
  projectId: string;
  action?: "create" | "retract" | null;
  actor?: string | null;
  fromItemId?: string | null;
  toItemId?: string | null;
  relationType?: string | null;
  itemId?: string | null;
  sessionId?: string | null;
  externalTaskId?: string | null;
  externalTaskRef?: string | null;
  externalTrackerType?: "clickup" | "jira" | "asana" | null;
}

export interface LinkProjectUpdatesOutput {
  action: "create" | "retract";
  kind: "relation" | "link";
  id: string;
  relation_type?: string;
  target_kind?: string;
  already_existed?: boolean;
}

export const linkProjectUpdates = async (
  db: ProjectEvolutionTx,
  input: LinkProjectUpdatesInput
): Promise<LinkProjectUpdatesOutput> => {
  const action = input.action ?? "create";
  const actor = optionalTrimmed(input.actor);

  const isRelation = Boolean(input.fromItemId || input.toItemId || input.relationType);
  const isEntityLink = Boolean(input.sessionId || input.externalTaskId);

  if (isRelation && isEntityLink) {
    throw validationError(
      "Provide either an item-to-item relation or a session/task link, not both"
    );
  }

  if (isRelation) {
    const fromItemId = requireNonEmpty(input.fromItemId, "from_item_id");
    const toItemId = requireNonEmpty(input.toItemId, "to_item_id");
    const relationType = assertRelationType(requireNonEmpty(input.relationType, "relation_type"));

    if (fromItemId === toItemId) {
      throw validationError("from_item_id and to_item_id must differ");
    }

    // FR-PE-31: both endpoints must be in the caller's project. Cross-project
    // relations are explicitly out of scope (§12.4).
    const from = await loadItemInProject(db, fromItemId, input.projectId);
    const to = await loadItemInProject(db, toItemId, input.projectId);

    if (action === "retract") {
      const existing = await findLiveRelation(db, {
        fromItemId: from.id,
        toItemId: to.id,
        relationType,
      });
      if (!existing) {
        throw notFoundError(`No live ${relationType} relation between those items`);
      }
      await retractRelation(db, { relationId: existing.id, retractedBy: actor });
      // The relation row is kept and stamped; retraction is an appended event,
      // not a delete (§11.5).
      await insertEvent(db, {
        projectId: input.projectId,
        itemId: from.id,
        eventType: "relation_retracted",
        actor,
        payload: { relation_id: existing.id, relation_type: relationType, to_item_id: to.id },
      });
      return { action: "retract", kind: "relation", id: existing.id, relation_type: relationType };
    }

    if (relationType === "supersedes") {
      throw validationError(
        "supersedes relations are created by accepting a superseding item (FR-PE-15), not by linking"
      );
    }

    const existing = await findLiveRelation(db, {
      fromItemId: from.id,
      toItemId: to.id,
      relationType,
    });
    if (existing) {
      return {
        action: "create",
        kind: "relation",
        id: existing.id,
        relation_type: relationType,
        already_existed: true,
      };
    }

    const inserted = await insertRelation(db, {
      projectId: input.projectId,
      fromItemId: from.id,
      toItemId: to.id,
      relationType,
      createdBy: actor,
    });
    if (!inserted) {
      throw conflictError("That relation was created concurrently");
    }
    await insertEvent(db, {
      projectId: input.projectId,
      itemId: from.id,
      eventType: "relation_created",
      actor,
      payload: { relation_id: inserted.id, relation_type: relationType, to_item_id: to.id },
    });
    return {
      action: "create",
      kind: "relation",
      id: inserted.id,
      relation_type: relationType,
      already_existed: false,
    };
  }

  if (!isEntityLink) {
    throw validationError(
      "Provide from_item_id/to_item_id/relation_type for a relation, or session_id/external_task_id for a link"
    );
  }

  // FR-PE-45: links to Lore sessions and external tasks. Lesson and pattern
  // links are Phase 2 (FR-PE-46) — a lesson is reachable today through the
  // session that produced it.
  const itemId = requireNonEmpty(input.itemId, "item_id");
  const item = await loadItemInProject(db, itemId, input.projectId);
  const sessionId = optionalTrimmed(input.sessionId);
  const externalTaskId = optionalTrimmed(input.externalTaskId);
  const targetKind: "session" | "task" = sessionId ? "session" : "task";

  if (sessionId) {
    const session = await findSessionById(db, sessionId);
    if (!session || session.projectId !== input.projectId) {
      throw notFoundError(`Session ${sessionId} not found in this project`);
    }
  }

  const existing = await findLiveLink(db, {
    itemId: item.id,
    targetKind,
    sessionId,
    externalTaskId,
  });

  if (action === "retract") {
    if (!existing) {
      throw notFoundError("No live link matching that target");
    }
    await retractLink(db, { linkId: existing.id, retractedBy: actor });
    await insertEvent(db, {
      projectId: input.projectId,
      itemId: item.id,
      eventType: "link_retracted",
      actor,
      payload: { link_id: existing.id, target_kind: targetKind },
    });
    return { action: "retract", kind: "link", id: existing.id, target_kind: targetKind };
  }

  if (existing) {
    return {
      action: "create",
      kind: "link",
      id: existing.id,
      target_kind: targetKind,
      already_existed: true,
    };
  }

  const { id } = await insertLink(db, {
    projectId: input.projectId,
    itemId: item.id,
    targetKind,
    sessionId,
    externalTaskId,
    externalTaskRef: optionalTrimmed(input.externalTaskRef),
    externalTrackerType: input.externalTrackerType ?? null,
    createdBy: actor,
  });
  await insertEvent(db, {
    projectId: input.projectId,
    itemId: item.id,
    eventType: "link_created",
    actor,
    payload: {
      link_id: id,
      target_kind: targetKind,
      session_id: sessionId,
      external_task_id: externalTaskId,
    },
  });

  return {
    action: "create",
    kind: "link",
    id,
    target_kind: targetKind,
    already_existed: false,
  };
};

/* ------------------------------------------------------------------
 * Current-state listing for the Web UI (FR-PE-62) and export (NFR-PE-11)
 * ------------------------------------------------------------------ */

export interface ListCurrentStateInput {
  projectId: string;
  types?: string[] | null;
  limit?: number | null;
  offset?: number | null;
}

export const listCurrentState = async (
  db: ProjectEvolutionTx,
  input: ListCurrentStateInput
): Promise<{ items: ItemOutput[]; total: number; warnings: ContextWarning[] }> => {
  const limit = Math.min(Math.max(input.limit ?? MAX_CONTEXT_LIMIT, 1), MAX_HISTORY_LIMIT);
  const types = input.types && input.types.length > 0 ? input.types.map(assertItemType) : undefined;

  const [rows, total] = await Promise.all([
    findCurrentStateItems(db, {
      projectId: input.projectId,
      types,
      limit,
      offset: input.offset ?? 0,
    }),
    countCurrentStateItems(db, { projectId: input.projectId, types }),
  ]);

  const evidence = await findEvidenceByItemIds(
    db,
    rows.map((r) => r.id)
  );
  const counts = tallyEvidence(evidence);

  const contradictions = await findUnresolvedContradictions(db, input.projectId);

  return {
    items: rows.map((row) =>
      toItemOutput(
        row,
        (counts.get(row.id) ?? NO_EVIDENCE).live,
        (counts.get(row.id) ?? NO_EVIDENCE).redacted
      )
    ),
    total,
    warnings: contradictions.map((c) => ({
      kind: "unresolved_contradiction" as const,
      message: `"${c.fromTitle}" contradicts "${c.toTitle}" and the conflict is unresolved`,
      item_ids: [c.fromItemId, c.toItemId],
    })),
  };
};

export interface ListProposalsInput {
  projectId: string;
  limit?: number | null;
  offset?: number | null;
}

/** FR-PE-60: the review inbox. */
export const listProposals = async (
  db: ProjectEvolutionTx,
  input: ListProposalsInput
): Promise<{ items: ItemOutput[]; total: number }> => {
  const limit = Math.min(Math.max(input.limit ?? DEFAULT_HISTORY_LIMIT, 1), MAX_HISTORY_LIMIT);
  const [rows, total] = await Promise.all([
    findItems(db, {
      projectId: input.projectId,
      statuses: ["proposed"],
      limit,
      offset: input.offset ?? 0,
    }),
    countItems(db, { projectId: input.projectId, statuses: ["proposed"] }),
  ]);

  const evidence = await findEvidenceByItemIds(
    db,
    rows.map((r) => r.id)
  );
  const counts = tallyEvidence(evidence);

  return {
    items: rows.map((row) =>
      toItemOutput(
        row,
        (counts.get(row.id) ?? NO_EVIDENCE).live,
        (counts.get(row.id) ?? NO_EVIDENCE).redacted
      )
    ),
    total,
  };
};

/**
 * NFR-PE-11: project history exports as versioned JSON or streaming JSON Lines.
 * The JSONL form emits one record per line so an operator can pipe a large
 * project's history without holding it all in memory.
 */
export interface ExportProjectHistoryInput {
  projectId: string;
  includeExcerpts?: boolean | null;
}

export interface ExportRecord {
  kind: "item" | "evidence" | "relation" | "event";
  [key: string]: unknown;
}

export const exportProjectHistory = async (
  db: ProjectEvolutionTx,
  input: ExportProjectHistoryInput
): Promise<{ version: string; project_id: string; records: ExportRecord[] }> => {
  const items = await findItems(db, { projectId: input.projectId, limit: MAX_HISTORY_LIMIT });
  const itemIds = items.map((i) => i.id);
  const [evidence, relations, events] = await Promise.all([
    findEvidenceByItemIds(db, itemIds),
    findRelationsForItems(db, itemIds, { includeRetracted: true }),
    findEvents(db, { projectId: input.projectId, limit: MAX_HISTORY_LIMIT }),
  ]);

  // §14.6: excerpts stay out of the export unless explicitly requested, so a
  // routine backup does not become a copy of the evidence corpus.
  const evidenceMode = input.includeExcerpts ? "full" : "metadata";

  const records: ExportRecord[] = [
    ...items.map((item) => ({ kind: "item" as const, ...toItemOutput(item, 0) })),
    ...evidence.map((row) => ({
      kind: "evidence" as const,
      item_id: row.itemId,
      ...toEvidenceOutput(row, evidenceMode),
    })),
    ...relations.map((row) => ({ kind: "relation" as const, ...toRelationOutput(row) })),
    ...events.map((row) => ({
      kind: "event" as const,
      id: row.id,
      item_id: row.itemId,
      event_type: row.eventType,
      revision: row.revision,
      actor: row.actor,
      note: row.note,
      payload: row.payload,
      created_at: iso(row.createdAt),
    })),
  ];

  return { version: "1.0", project_id: input.projectId, records };
};

export const exportProjectHistoryJsonl = async (
  db: ProjectEvolutionTx,
  input: ExportProjectHistoryInput
): Promise<string> => {
  const { records } = await exportProjectHistory(db, input);
  return records.map((record) => JSON.stringify(record)).join("\n");
};

export { findItemsByIds };
