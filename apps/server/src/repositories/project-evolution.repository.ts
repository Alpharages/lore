import { and, eq, inArray, isNull, sql, desc, gte, lte, or } from "drizzle-orm";
import { NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "../db/schema.js";
import type {
  ProjectEvolutionItemType,
  ProjectEvolutionStatus,
  ProjectEvolutionRelationType,
  ProjectEvolutionEventType,
} from "../db/schema.js";

export type ProjectEvolutionTx = NodePgDatabase<typeof schema>;

/* ------------------------------------------------------------------
 * Row shapes
 * ------------------------------------------------------------------ */

export interface ItemRow {
  id: string;
  projectId: string;
  type: string;
  revision: number;
  title: string;
  statement: string;
  rationale: string | null;
  statementHash: string;
  status: string;
  captureMode: string;
  proposedBy: string | null;
  approvedBy: string | null;
  proposedSupersedesItemId: string | null;
  supersededByItemId: string | null;
  aiConfidence: string | null;
  aiModel: string | null;
  embeddingStatus: string;
  occurredAt: Date | null;
  createdAt: Date | null;
  reviewedAt: Date | null;
}

export interface EvidenceRow {
  id: string;
  itemId: string;
  projectId: string;
  sourceKind: string;
  sourceReference: string | null;
  externalSourceId: string | null;
  excerpt: string | null;
  sourceAuthor: string | null;
  excerptProvidedBy: string;
  capturedBy: string | null;
  occurredAt: Date | null;
  supersededByEvidenceId: string | null;
  redactedAt: Date | null;
  redactionReason: string | null;
  createdAt: Date | null;
}

export interface VersionRow {
  id: string;
  itemId: string;
  revision: number;
  title: string;
  statement: string;
  rationale: string | null;
  authoredBy: string | null;
  createdAt: Date | null;
}

export interface RelationRow {
  id: string;
  projectId: string;
  fromItemId: string;
  toItemId: string;
  relationType: string;
  createdBy: string | null;
  createdAt: Date | null;
  retractedAt: Date | null;
  retractedBy: string | null;
}

export interface LinkRow {
  id: string;
  projectId: string;
  itemId: string;
  targetKind: string;
  sessionId: string | null;
  externalTaskId: string | null;
  externalTaskRef: string | null;
  externalTrackerType: string | null;
  createdBy: string | null;
  createdAt: Date | null;
  retractedAt: Date | null;
}

export interface EventRow {
  id: string;
  projectId: string;
  itemId: string | null;
  eventType: string;
  revision: number | null;
  actor: string | null;
  note: string | null;
  payload: unknown;
  createdAt: Date | null;
}

/* ------------------------------------------------------------------
 * Item writes
 * ------------------------------------------------------------------ */

export interface InsertItemValues {
  projectId: string;
  type: ProjectEvolutionItemType;
  title: string;
  statement: string;
  rationale: string | null;
  statementHash: string;
  captureMode: string;
  proposedBy: string | null;
  proposedSupersedesItemId: string | null;
  aiConfidence: number | null;
  aiModel: string | null;
  embedding: number[] | null;
  occurredAt: Date | null;
}

export const insertItem = async (
  db: ProjectEvolutionTx,
  values: InsertItemValues
): Promise<{ id: string; createdAt: Date | null }> => {
  const [row] = await db
    .insert(schema.projectEvolutionItems)
    .values({
      projectId: values.projectId,
      type: values.type,
      title: values.title,
      statement: values.statement,
      rationale: values.rationale,
      statementHash: values.statementHash,
      status: "proposed",
      captureMode: values.captureMode,
      proposedBy: values.proposedBy,
      proposedSupersedesItemId: values.proposedSupersedesItemId,
      aiConfidence: values.aiConfidence === null ? null : String(values.aiConfidence),
      aiModel: values.aiModel,
      embedding: values.embedding,
      embeddingStatus: values.embedding ? "complete" : "pending",
      occurredAt: values.occurredAt,
    })
    .returning({
      id: schema.projectEvolutionItems.id,
      createdAt: schema.projectEvolutionItems.createdAt,
    });
  return { id: row.id, createdAt: row.createdAt };
};

export const findItemById = async (
  db: ProjectEvolutionTx,
  id: string
): Promise<ItemRow | undefined> => {
  const rows = await db
    .select()
    .from(schema.projectEvolutionItems)
    .where(eq(schema.projectEvolutionItems.id, id))
    .limit(1);
  return rows[0] as ItemRow | undefined;
};

export const findItemsByIds = async (db: ProjectEvolutionTx, ids: string[]): Promise<ItemRow[]> => {
  if (ids.length === 0) return [];
  const rows = await db
    .select()
    .from(schema.projectEvolutionItems)
    .where(inArray(schema.projectEvolutionItems.id, ids));
  return rows as ItemRow[];
};

/**
 * FR-PE-08: exact duplicate = same project, same type, same normalized
 * statement hash. Rejected items are ignored so a rejected statement can be
 * re-proposed with better evidence.
 */
export const findItemByStatementHash = async (
  db: ProjectEvolutionTx,
  params: { projectId: string; type: string; statementHash: string }
): Promise<ItemRow | undefined> => {
  const rows = await db
    .select()
    .from(schema.projectEvolutionItems)
    .where(
      and(
        eq(schema.projectEvolutionItems.projectId, params.projectId),
        eq(schema.projectEvolutionItems.type, params.type),
        eq(schema.projectEvolutionItems.statementHash, params.statementHash),
        sql`${schema.projectEvolutionItems.status} <> 'rejected'`
      )
    )
    .orderBy(desc(schema.projectEvolutionItems.createdAt))
    .limit(1);
  return rows[0] as ItemRow | undefined;
};

/**
 * Appends the next revision's projection onto the item. The prior revision is
 * preserved in project_evolution_item_versions — nothing is lost (FR-PE-12).
 */
export const applyItemRevision = async (
  db: ProjectEvolutionTx,
  params: {
    itemId: string;
    revision: number;
    title: string;
    statement: string;
    rationale: string | null;
    embedding: number[] | null;
    statementHash: string;
  }
): Promise<void> => {
  await db
    .update(schema.projectEvolutionItems)
    .set({
      revision: params.revision,
      title: params.title,
      statement: params.statement,
      rationale: params.rationale,
      statementHash: params.statementHash,
      ...(params.embedding ? { embedding: params.embedding, embeddingStatus: "complete" } : {}),
    })
    .where(eq(schema.projectEvolutionItems.id, params.itemId));
};

export const markItemReviewed = async (
  db: ProjectEvolutionTx,
  params: {
    itemId: string;
    status: Extract<ProjectEvolutionStatus, "accepted" | "rejected">;
    approvedBy: string | null;
  }
): Promise<void> => {
  await db
    .update(schema.projectEvolutionItems)
    .set({
      status: params.status,
      approvedBy: params.approvedBy,
      reviewedAt: sql`now()`,
    })
    .where(eq(schema.projectEvolutionItems.id, params.itemId));
};

/**
 * FR-PE-16: acceptance of a superseding item marks the replaced item
 * superseded in the same transaction as the acceptance. The guard on
 * `status = 'accepted'` makes the update idempotent and prevents a
 * concurrent double-supersession.
 */
export const markItemSuperseded = async (
  db: ProjectEvolutionTx,
  params: { itemId: string; supersededByItemId: string }
): Promise<boolean> => {
  const rows = await db
    .update(schema.projectEvolutionItems)
    .set({ status: "superseded", supersededByItemId: params.supersededByItemId })
    .where(
      and(
        eq(schema.projectEvolutionItems.id, params.itemId),
        eq(schema.projectEvolutionItems.status, "accepted")
      )
    )
    .returning({ id: schema.projectEvolutionItems.id });
  return rows.length > 0;
};

/* ------------------------------------------------------------------
 * Versions
 * ------------------------------------------------------------------ */

export const insertItemVersion = async (
  db: ProjectEvolutionTx,
  values: {
    itemId: string;
    projectId: string;
    revision: number;
    title: string;
    statement: string;
    rationale: string | null;
    authoredBy: string | null;
    aiConfidence: number | null;
    aiModel: string | null;
  }
): Promise<{ id: string }> => {
  const [row] = await db
    .insert(schema.projectEvolutionItemVersions)
    .values({
      itemId: values.itemId,
      projectId: values.projectId,
      revision: values.revision,
      title: values.title,
      statement: values.statement,
      rationale: values.rationale,
      authoredBy: values.authoredBy,
      aiConfidence: values.aiConfidence === null ? null : String(values.aiConfidence),
      aiModel: values.aiModel,
    })
    .returning({ id: schema.projectEvolutionItemVersions.id });
  return { id: row.id };
};

export const findVersionsByItemId = async (
  db: ProjectEvolutionTx,
  itemId: string
): Promise<VersionRow[]> => {
  const rows = await db
    .select()
    .from(schema.projectEvolutionItemVersions)
    .where(eq(schema.projectEvolutionItemVersions.itemId, itemId))
    .orderBy(schema.projectEvolutionItemVersions.revision);
  return rows as VersionRow[];
};

/* ------------------------------------------------------------------
 * Evidence
 * ------------------------------------------------------------------ */

export interface InsertEvidenceValues {
  itemId: string;
  projectId: string;
  sourceKind: string;
  sourceReference: string | null;
  externalSourceId: string | null;
  excerpt: string | null;
  sourceAuthor: string | null;
  excerptProvidedBy: string;
  capturedBy: string | null;
  occurredAt: Date | null;
}

export const insertEvidence = async (
  db: ProjectEvolutionTx,
  values: InsertEvidenceValues
): Promise<{ id: string }> => {
  const [row] = await db
    .insert(schema.projectEvolutionEvidence)
    .values(values)
    .returning({ id: schema.projectEvolutionEvidence.id });
  return { id: row.id };
};

/**
 * FR-PE-07 idempotency probe. Mirrors the partial unique index
 * idx_pe_evidence_idempotency so the service can short-circuit a repeated
 * adapter delivery before writing anything.
 */
export const findEvidenceByExternalSource = async (
  db: ProjectEvolutionTx,
  params: { projectId: string; sourceKind: string; externalSourceId: string }
): Promise<EvidenceRow | undefined> => {
  const rows = await db
    .select()
    .from(schema.projectEvolutionEvidence)
    .where(
      and(
        eq(schema.projectEvolutionEvidence.projectId, params.projectId),
        eq(schema.projectEvolutionEvidence.sourceKind, params.sourceKind),
        eq(schema.projectEvolutionEvidence.externalSourceId, params.externalSourceId)
      )
    )
    .limit(1);
  return rows[0] as EvidenceRow | undefined;
};

export const findEvidenceById = async (
  db: ProjectEvolutionTx,
  id: string
): Promise<EvidenceRow | undefined> => {
  const rows = await db
    .select()
    .from(schema.projectEvolutionEvidence)
    .where(eq(schema.projectEvolutionEvidence.id, id))
    .limit(1);
  return rows[0] as EvidenceRow | undefined;
};

export const findEvidenceByItemIds = async (
  db: ProjectEvolutionTx,
  itemIds: string[]
): Promise<EvidenceRow[]> => {
  if (itemIds.length === 0) return [];
  const rows = await db
    .select()
    .from(schema.projectEvolutionEvidence)
    .where(inArray(schema.projectEvolutionEvidence.itemId, itemIds))
    .orderBy(schema.projectEvolutionEvidence.createdAt, schema.projectEvolutionEvidence.id);
  return rows as EvidenceRow[];
};

/**
 * FR-PE-18: an accepted item must have at least one evidence record. Redacted
 * and superseded evidence do not count toward that floor — a tombstone is not
 * support for a statement.
 */
export const countLiveEvidence = async (
  db: ProjectEvolutionTx,
  itemId: string
): Promise<number> => {
  const result = await db.execute(sql`
    SELECT count(*)::int AS count
    FROM ${schema.projectEvolutionEvidence}
    WHERE item_id = ${itemId}::uuid
      AND redacted_at IS NULL
      AND superseded_by_evidence_id IS NULL
  `);
  const rows = (result as any).rows ?? [];
  return rows[0]?.count ?? 0;
};

export const markEvidenceSuperseded = async (
  db: ProjectEvolutionTx,
  params: { evidenceId: string; supersededByEvidenceId: string }
): Promise<void> => {
  await db
    .update(schema.projectEvolutionEvidence)
    .set({ supersededByEvidenceId: params.supersededByEvidenceId })
    .where(eq(schema.projectEvolutionEvidence.id, params.evidenceId));
};

/**
 * FR-PE-27: mandated erasure clears the excerpt but keeps the row as an
 * audited tombstone — the source reference and provenance survive.
 */
export const redactEvidence = async (
  db: ProjectEvolutionTx,
  params: { evidenceId: string; reason: string }
): Promise<void> => {
  await db
    .update(schema.projectEvolutionEvidence)
    .set({ excerpt: null, redactedAt: sql`now()`, redactionReason: params.reason })
    .where(eq(schema.projectEvolutionEvidence.id, params.evidenceId));
};

/* ------------------------------------------------------------------
 * Relations
 * ------------------------------------------------------------------ */

export const insertRelation = async (
  db: ProjectEvolutionTx,
  values: {
    projectId: string;
    fromItemId: string;
    toItemId: string;
    relationType: ProjectEvolutionRelationType;
    createdBy: string | null;
  }
): Promise<{ id: string } | undefined> => {
  const rows = await db
    .insert(schema.projectEvolutionRelations)
    .values(values)
    .onConflictDoNothing()
    .returning({ id: schema.projectEvolutionRelations.id });
  return rows[0];
};

export const findLiveRelation = async (
  db: ProjectEvolutionTx,
  params: { fromItemId: string; toItemId: string; relationType: string }
): Promise<RelationRow | undefined> => {
  const rows = await db
    .select()
    .from(schema.projectEvolutionRelations)
    .where(
      and(
        eq(schema.projectEvolutionRelations.fromItemId, params.fromItemId),
        eq(schema.projectEvolutionRelations.toItemId, params.toItemId),
        eq(schema.projectEvolutionRelations.relationType, params.relationType),
        isNull(schema.projectEvolutionRelations.retractedAt)
      )
    )
    .limit(1);
  return rows[0] as RelationRow | undefined;
};

export const retractRelation = async (
  db: ProjectEvolutionTx,
  params: { relationId: string; retractedBy: string | null }
): Promise<boolean> => {
  const rows = await db
    .update(schema.projectEvolutionRelations)
    .set({ retractedAt: sql`now()`, retractedBy: params.retractedBy })
    .where(
      and(
        eq(schema.projectEvolutionRelations.id, params.relationId),
        isNull(schema.projectEvolutionRelations.retractedAt)
      )
    )
    .returning({ id: schema.projectEvolutionRelations.id });
  return rows.length > 0;
};

export const findRelationsForItems = async (
  db: ProjectEvolutionTx,
  itemIds: string[],
  options: { includeRetracted?: boolean } = {}
): Promise<RelationRow[]> => {
  if (itemIds.length === 0) return [];
  const conditions = [
    or(
      inArray(schema.projectEvolutionRelations.fromItemId, itemIds),
      inArray(schema.projectEvolutionRelations.toItemId, itemIds)
    ),
  ];
  if (!options.includeRetracted) {
    conditions.push(isNull(schema.projectEvolutionRelations.retractedAt));
  }
  const rows = await db
    .select()
    .from(schema.projectEvolutionRelations)
    .where(and(...conditions));
  return rows as RelationRow[];
};

/**
 * FR-PE-21/22: unresolved contradictions among a set of items. A contradiction
 * stops being "unresolved" when the relation is retracted, or when either
 * endpoint leaves the current state (superseded or rejected).
 */
export const findUnresolvedContradictions = async (
  db: ProjectEvolutionTx,
  projectId: string
): Promise<
  Array<{
    relationId: string;
    fromItemId: string;
    toItemId: string;
    fromTitle: string;
    toTitle: string;
  }>
> => {
  const result = await db.execute(sql`
    SELECT r.id            AS relation_id,
           r.from_item_id  AS from_item_id,
           r.to_item_id    AS to_item_id,
           f.title         AS from_title,
           t.title         AS to_title
    FROM ${schema.projectEvolutionRelations} r
    JOIN ${schema.projectEvolutionItems} f ON f.id = r.from_item_id
    JOIN ${schema.projectEvolutionItems} t ON t.id = r.to_item_id
    WHERE r.project_id = ${projectId}::uuid
      AND r.relation_type = 'contradicts'
      AND r.retracted_at IS NULL
      AND f.status IN ('proposed', 'accepted')
      AND t.status IN ('proposed', 'accepted')
    ORDER BY r.created_at DESC
  `);
  const rows = (result as any).rows ?? [];
  return rows.map((r: Record<string, unknown>) => ({
    relationId: String(r.relation_id),
    fromItemId: String(r.from_item_id),
    toItemId: String(r.to_item_id),
    fromTitle: String(r.from_title),
    toTitle: String(r.to_title),
  }));
};

/* ------------------------------------------------------------------
 * Links
 * ------------------------------------------------------------------ */

export const insertLink = async (
  db: ProjectEvolutionTx,
  values: {
    projectId: string;
    itemId: string;
    targetKind: "session" | "task";
    sessionId: string | null;
    externalTaskId: string | null;
    externalTaskRef: string | null;
    externalTrackerType: string | null;
    createdBy: string | null;
  }
): Promise<{ id: string }> => {
  const [row] = await db
    .insert(schema.projectEvolutionLinks)
    .values(values)
    .returning({ id: schema.projectEvolutionLinks.id });
  return { id: row.id };
};

export const findLiveLink = async (
  db: ProjectEvolutionTx,
  params: {
    itemId: string;
    targetKind: "session" | "task";
    sessionId: string | null;
    externalTaskId: string | null;
  }
): Promise<LinkRow | undefined> => {
  const conditions = [
    eq(schema.projectEvolutionLinks.itemId, params.itemId),
    eq(schema.projectEvolutionLinks.targetKind, params.targetKind),
    isNull(schema.projectEvolutionLinks.retractedAt),
  ];
  if (params.targetKind === "session" && params.sessionId) {
    conditions.push(eq(schema.projectEvolutionLinks.sessionId, params.sessionId));
  } else if (params.externalTaskId) {
    conditions.push(eq(schema.projectEvolutionLinks.externalTaskId, params.externalTaskId));
  }
  const rows = await db
    .select()
    .from(schema.projectEvolutionLinks)
    .where(and(...conditions))
    .limit(1);
  return rows[0] as LinkRow | undefined;
};

export const retractLink = async (
  db: ProjectEvolutionTx,
  params: { linkId: string; retractedBy: string | null }
): Promise<boolean> => {
  const rows = await db
    .update(schema.projectEvolutionLinks)
    .set({ retractedAt: sql`now()`, retractedBy: params.retractedBy })
    .where(
      and(
        eq(schema.projectEvolutionLinks.id, params.linkId),
        isNull(schema.projectEvolutionLinks.retractedAt)
      )
    )
    .returning({ id: schema.projectEvolutionLinks.id });
  return rows.length > 0;
};

export const findLinksForItems = async (
  db: ProjectEvolutionTx,
  itemIds: string[]
): Promise<LinkRow[]> => {
  if (itemIds.length === 0) return [];
  const rows = await db
    .select()
    .from(schema.projectEvolutionLinks)
    .where(
      and(
        inArray(schema.projectEvolutionLinks.itemId, itemIds),
        isNull(schema.projectEvolutionLinks.retractedAt)
      )
    );
  return rows as LinkRow[];
};

export const findSessionById = async (
  db: ProjectEvolutionTx,
  sessionId: string
): Promise<{ id: string; projectId: string } | undefined> => {
  const rows = await db
    .select({ id: schema.sessions.id, projectId: schema.sessions.projectId })
    .from(schema.sessions)
    .where(eq(schema.sessions.id, sessionId))
    .limit(1);
  return rows[0];
};

/* ------------------------------------------------------------------
 * Events (append-only audit log)
 * ------------------------------------------------------------------ */

export const insertEvent = async (
  db: ProjectEvolutionTx,
  values: {
    projectId: string;
    itemId: string | null;
    eventType: ProjectEvolutionEventType;
    revision?: number | null;
    actor: string | null;
    actorKeyId?: string | null;
    note?: string | null;
    payload?: Record<string, unknown>;
  }
): Promise<{ id: string }> => {
  const [row] = await db
    .insert(schema.projectEvolutionEvents)
    .values({
      projectId: values.projectId,
      itemId: values.itemId,
      eventType: values.eventType,
      revision: values.revision ?? null,
      actor: values.actor,
      actorKeyId: values.actorKeyId ?? null,
      note: values.note ?? null,
      payload: values.payload ?? {},
    })
    .returning({ id: schema.projectEvolutionEvents.id });
  return { id: row.id };
};

export const findEventsByItemId = async (
  db: ProjectEvolutionTx,
  itemId: string
): Promise<EventRow[]> => {
  const rows = await db
    .select()
    .from(schema.projectEvolutionEvents)
    .where(eq(schema.projectEvolutionEvents.itemId, itemId))
    .orderBy(schema.projectEvolutionEvents.createdAt, schema.projectEvolutionEvents.id);
  return rows as EventRow[];
};

export interface FindEventsParams {
  projectId: string;
  itemId?: string | null;
  eventTypes?: string[];
  since?: Date | null;
  until?: Date | null;
  limit: number;
  offset?: number;
}

export const findEvents = async (
  db: ProjectEvolutionTx,
  params: FindEventsParams
): Promise<EventRow[]> => {
  const conditions = [eq(schema.projectEvolutionEvents.projectId, params.projectId)];
  if (params.itemId) {
    conditions.push(eq(schema.projectEvolutionEvents.itemId, params.itemId));
  }
  if (params.eventTypes && params.eventTypes.length > 0) {
    conditions.push(inArray(schema.projectEvolutionEvents.eventType, params.eventTypes));
  }
  if (params.since) {
    conditions.push(gte(schema.projectEvolutionEvents.createdAt, params.since));
  }
  if (params.until) {
    conditions.push(lte(schema.projectEvolutionEvents.createdAt, params.until));
  }
  const rows = await db
    .select()
    .from(schema.projectEvolutionEvents)
    .where(and(...conditions))
    .orderBy(desc(schema.projectEvolutionEvents.createdAt), desc(schema.projectEvolutionEvents.id))
    .limit(params.limit)
    .offset(params.offset ?? 0);
  return rows as EventRow[];
};

/* ------------------------------------------------------------------
 * Retrieval (FR-PE-35 … FR-PE-42)
 *
 * Every filter value below is bound as a query parameter. `types` and
 * `statuses` go through drizzle's `inArray`/`sql` parameter binding and the
 * query embedding is serialised into a single `::vector` parameter — nothing
 * caller-supplied is interpolated into SQL text.
 * ------------------------------------------------------------------ */

export interface RetrievedItemRow extends ItemRow {
  similarity: number;
  textRank: number;
  matchReason: string;
}

const CURRENT_STATE_SQL = sql`status = 'accepted' AND superseded_by_item_id IS NULL`;

const ITEM_COLUMNS = sql`
  id, project_id, type, revision, title, statement, rationale, statement_hash,
  status, capture_mode, proposed_by, approved_by, proposed_supersedes_item_id,
  superseded_by_item_id, ai_confidence, ai_model, embedding_status,
  occurred_at, created_at, reviewed_at
`;

const normalizeItemRow = (r: Record<string, unknown>): ItemRow => ({
  id: String(r.id),
  projectId: String(r.project_id),
  type: String(r.type),
  revision: Number(r.revision),
  title: String(r.title),
  statement: String(r.statement),
  rationale: r.rationale === null || r.rationale === undefined ? null : String(r.rationale),
  statementHash: String(r.statement_hash),
  status: String(r.status),
  captureMode: String(r.capture_mode),
  proposedBy: r.proposed_by === null || r.proposed_by === undefined ? null : String(r.proposed_by),
  approvedBy: r.approved_by === null || r.approved_by === undefined ? null : String(r.approved_by),
  proposedSupersedesItemId:
    r.proposed_supersedes_item_id === null || r.proposed_supersedes_item_id === undefined
      ? null
      : String(r.proposed_supersedes_item_id),
  supersededByItemId:
    r.superseded_by_item_id === null || r.superseded_by_item_id === undefined
      ? null
      : String(r.superseded_by_item_id),
  aiConfidence:
    r.ai_confidence === null || r.ai_confidence === undefined ? null : String(r.ai_confidence),
  aiModel: r.ai_model === null || r.ai_model === undefined ? null : String(r.ai_model),
  embeddingStatus: String(r.embedding_status),
  occurredAt: r.occurred_at ? new Date(String(r.occurred_at)) : null,
  createdAt: r.created_at ? new Date(String(r.created_at)) : null,
  reviewedAt: r.reviewed_at ? new Date(String(r.reviewed_at)) : null,
});

const normalizeRetrievedRow = (
  r: Record<string, unknown>,
  matchReason: string
): RetrievedItemRow => ({
  ...normalizeItemRow(r),
  similarity: r.similarity === null || r.similarity === undefined ? 0 : Number(r.similarity),
  textRank: r.text_rank === null || r.text_rank === undefined ? 0 : Number(r.text_rank),
  matchReason,
});

const rowsOf = (result: unknown): Record<string, unknown>[] => {
  const asAny = result as any;
  return asAny?.rows ?? (Array.isArray(result) ? result : []);
};

/**
 * Builds `ARRAY[$1, $2, ...]::<type>` with one bound parameter per element.
 *
 * Passing a JS array straight into a `sql` template binds it as a single
 * parameter, which node-postgres serialises as a bare comma-joined string —
 * `('constraint')::text[]` then fails to cast. Emitting an explicit ARRAY
 * constructor keeps every element individually parameterised.
 */
const boundArray = (values: string[], castTo: "text" | "uuid") => {
  const elements = sql.join(
    values.map((value) => sql`${value}`),
    sql`, `
  );
  return castTo === "uuid" ? sql`ARRAY[${elements}]::uuid[]` : sql`ARRAY[${elements}]::text[]`;
};

const typeFilter = (types: string[] | undefined) =>
  types && types.length > 0 ? sql` AND type = ANY(${boundArray(types, "text")})` : sql``;

export interface SemanticSearchParams {
  projectId: string;
  embedding: number[];
  types?: string[];
  threshold: number;
  limit: number;
  currentOnly: boolean;
}

export const findItemsSemantic = async (
  db: ProjectEvolutionTx,
  params: SemanticSearchParams
): Promise<RetrievedItemRow[]> => {
  const vectorParam = `[${params.embedding.join(",")}]`;
  const statusClause = params.currentOnly
    ? sql` AND ${CURRENT_STATE_SQL}`
    : sql` AND status <> 'rejected'`;

  const result = await db.execute(sql`
    SELECT ${ITEM_COLUMNS},
           1 - (embedding <=> ${vectorParam}::vector) AS similarity,
           0 AS text_rank
    FROM ${schema.projectEvolutionItems}
    WHERE project_id = ${params.projectId}::uuid
      AND embedding IS NOT NULL
      AND 1 - (embedding <=> ${vectorParam}::vector) >= ${params.threshold}
      ${statusClause}
      ${typeFilter(params.types)}
    ORDER BY similarity DESC, created_at DESC, id
    LIMIT ${params.limit}
  `);

  return rowsOf(result).map((row) => normalizeRetrievedRow(row, "semantic"));
};

export interface FullTextSearchParams {
  projectId: string;
  query: string;
  types?: string[];
  limit: number;
  currentOnly: boolean;
}

/**
 * Builds an OR tsquery from the caller's text.
 *
 * `websearch_to_tsquery`/`plainto_tsquery` combine terms with AND, which is
 * wrong for this endpoint: callers send whole questions and task descriptions
 * (FR-PE-35), and requiring every lexeme to appear means a five-word question
 * matches nothing. Widening to OR restores recall and lets `ts_rank` — which
 * scores a document matching more query terms higher — supply the precision.
 *
 * The construction is injection-safe without any string escaping of our own:
 * the text is first normalised to lexemes by `to_tsvector`, and each lexeme is
 * then emitted through `quote_literal`, so operator characters in the input
 * (`&`, `|`, `!`, parentheses) are stripped by the lexer before they can reach
 * `to_tsquery`. An input with no lexemes aggregates to NULL, and `@@ NULL` is
 * NULL — no rows, no error.
 */
const orTsQuery = (query: string) => sql`
  to_tsquery(
    'english',
    (
      SELECT string_agg(quote_literal(lexeme), ' | ')
      FROM unnest(to_tsvector('english', ${query}))
    )
  )
`;

export const findItemsFullText = async (
  db: ProjectEvolutionTx,
  params: FullTextSearchParams
): Promise<RetrievedItemRow[]> => {
  const statusClause = params.currentOnly
    ? sql` AND ${CURRENT_STATE_SQL}`
    : sql` AND status <> 'rejected'`;
  const tsQuery = orTsQuery(params.query);

  const result = await db.execute(sql`
    SELECT ${ITEM_COLUMNS},
           0 AS similarity,
           ts_rank(search_vector, ${tsQuery}) AS text_rank
    FROM ${schema.projectEvolutionItems}
    WHERE project_id = ${params.projectId}::uuid
      AND search_vector @@ ${tsQuery}
      ${statusClause}
      ${typeFilter(params.types)}
    ORDER BY text_rank DESC, created_at DESC, id
    LIMIT ${params.limit}
  `);

  return rowsOf(result).map((row) => normalizeRetrievedRow(row, "text"));
};

export interface CurrentStateParams {
  projectId: string;
  types?: string[];
  limit: number;
  offset?: number;
}

/**
 * FR-PE-19: current state is derived from accepted, non-superseded items.
 * Ordering is fully deterministic (NFR-PE-07) so results do not shuffle
 * between calls when semantic services are unavailable.
 */
export const findCurrentStateItems = async (
  db: ProjectEvolutionTx,
  params: CurrentStateParams
): Promise<RetrievedItemRow[]> => {
  const result = await db.execute(sql`
    SELECT ${ITEM_COLUMNS}, 0 AS similarity, 0 AS text_rank
    FROM ${schema.projectEvolutionItems}
    WHERE project_id = ${params.projectId}::uuid
      AND ${CURRENT_STATE_SQL}
      ${typeFilter(params.types)}
    ORDER BY coalesce(occurred_at, created_at) DESC, created_at DESC, id
    LIMIT ${params.limit}
    OFFSET ${params.offset ?? 0}
  `);

  return rowsOf(result).map((row) => normalizeRetrievedRow(row, "current_state"));
};

export const countCurrentStateItems = async (
  db: ProjectEvolutionTx,
  params: { projectId: string; types?: string[] }
): Promise<number> => {
  const result = await db.execute(sql`
    SELECT count(*)::int AS count
    FROM ${schema.projectEvolutionItems}
    WHERE project_id = ${params.projectId}::uuid
      AND ${CURRENT_STATE_SQL}
      ${typeFilter(params.types)}
  `);
  return rowsOf(result)[0]?.count ? Number(rowsOf(result)[0].count) : 0;
};

export interface FindItemsParams {
  projectId: string;
  types?: string[];
  statuses?: string[];
  since?: Date | null;
  until?: Date | null;
  limit: number;
  offset?: number;
}

/**
 * FR-PE-39: the explicit history query — type, status and date filters, with
 * rejected and superseded items included rather than hidden.
 */
export const findItems = async (
  db: ProjectEvolutionTx,
  params: FindItemsParams
): Promise<ItemRow[]> => {
  const conditions = [eq(schema.projectEvolutionItems.projectId, params.projectId)];
  if (params.types && params.types.length > 0) {
    conditions.push(inArray(schema.projectEvolutionItems.type, params.types));
  }
  if (params.statuses && params.statuses.length > 0) {
    conditions.push(inArray(schema.projectEvolutionItems.status, params.statuses));
  }
  if (params.since) {
    conditions.push(gte(schema.projectEvolutionItems.createdAt, params.since));
  }
  if (params.until) {
    conditions.push(lte(schema.projectEvolutionItems.createdAt, params.until));
  }
  const rows = await db
    .select()
    .from(schema.projectEvolutionItems)
    .where(and(...conditions))
    .orderBy(desc(schema.projectEvolutionItems.createdAt), desc(schema.projectEvolutionItems.id))
    .limit(params.limit)
    .offset(params.offset ?? 0);
  return rows as ItemRow[];
};

export const countItems = async (
  db: ProjectEvolutionTx,
  params: Omit<FindItemsParams, "limit" | "offset">
): Promise<number> => {
  const conditions = [eq(schema.projectEvolutionItems.projectId, params.projectId)];
  if (params.types && params.types.length > 0) {
    conditions.push(inArray(schema.projectEvolutionItems.type, params.types));
  }
  if (params.statuses && params.statuses.length > 0) {
    conditions.push(inArray(schema.projectEvolutionItems.status, params.statuses));
  }
  if (params.since) {
    conditions.push(gte(schema.projectEvolutionItems.createdAt, params.since));
  }
  if (params.until) {
    conditions.push(lte(schema.projectEvolutionItems.createdAt, params.until));
  }
  const result = await db.execute(
    sql`SELECT count(*)::int AS count FROM ${schema.projectEvolutionItems} WHERE ${and(...conditions)}`
  );
  const row = rowsOf(result)[0];
  return row?.count ? Number(row.count) : 0;
};

/**
 * FR-PE-09: semantic duplicate *suggestions*. Deliberately read-only — nothing
 * here merges accepted project knowledge; the caller surfaces the candidates
 * for review.
 */
export const findSemanticDuplicateCandidates = async (
  db: ProjectEvolutionTx,
  params: {
    projectId: string;
    type: string;
    embedding: number[];
    threshold: number;
    limit: number;
    excludeItemId?: string | null;
  }
): Promise<Array<{ id: string; title: string; status: string; similarity: number }>> => {
  const vectorParam = `[${params.embedding.join(",")}]`;
  const excludeClause = params.excludeItemId
    ? sql` AND id <> ${params.excludeItemId}::uuid`
    : sql``;

  const result = await db.execute(sql`
    SELECT id, title, status, 1 - (embedding <=> ${vectorParam}::vector) AS similarity
    FROM ${schema.projectEvolutionItems}
    WHERE project_id = ${params.projectId}::uuid
      AND type = ${params.type}
      AND embedding IS NOT NULL
      AND status <> 'rejected'
      AND 1 - (embedding <=> ${vectorParam}::vector) >= ${params.threshold}
      ${excludeClause}
    ORDER BY similarity DESC, id
    LIMIT ${params.limit}
  `);

  return rowsOf(result).map((r) => ({
    id: String(r.id),
    title: String(r.title),
    status: String(r.status),
    similarity: Number(r.similarity),
  }));
};

/**
 * FR-PE-32: one- and two-hop relationship expansion. The recursive CTE walks
 * live relations in both directions from the seed set and returns the reached
 * item ids with the hop distance at which each was first reached. `hops` is
 * clamped by the caller to 1 or 2, so the walk cannot run away on a dense
 * graph.
 */
export const expandRelatedItems = async (
  db: ProjectEvolutionTx,
  params: {
    projectId: string;
    seedIds: string[];
    hops: number;
    limit: number;
    currentOnly: boolean;
  }
): Promise<Array<{ item: ItemRow; hops: number; viaRelation: string }>> => {
  if (params.seedIds.length === 0) return [];

  const seeds = boundArray(params.seedIds, "uuid");

  const statusClause = params.currentOnly
    ? sql` AND ${CURRENT_STATE_SQL}`
    : sql` AND status <> 'rejected'`;

  const result = await db.execute(sql`
    WITH RECURSIVE edges AS (
      SELECT from_item_id AS src, to_item_id AS dst, relation_type
      FROM ${schema.projectEvolutionRelations}
      WHERE project_id = ${params.projectId}::uuid AND retracted_at IS NULL
      UNION ALL
      SELECT to_item_id AS src, from_item_id AS dst, relation_type
      FROM ${schema.projectEvolutionRelations}
      WHERE project_id = ${params.projectId}::uuid AND retracted_at IS NULL
    ),
    walk AS (
      SELECT e.dst AS item_id, 1 AS hops, e.relation_type
      FROM edges e
      WHERE e.src = ANY(${seeds})
      UNION ALL
      SELECT e.dst, w.hops + 1, e.relation_type
      FROM walk w
      JOIN edges e ON e.src = w.item_id
      WHERE w.hops < ${params.hops}
    ),
    reached AS (
      SELECT item_id, min(hops) AS hops, min(relation_type) AS relation_type
      FROM walk
      WHERE NOT (item_id = ANY(${seeds}))
      GROUP BY item_id
    )
    SELECT i.id, i.project_id, i.type, i.revision, i.title, i.statement, i.rationale,
           i.statement_hash, i.status, i.capture_mode, i.proposed_by, i.approved_by,
           i.proposed_supersedes_item_id, i.superseded_by_item_id, i.ai_confidence,
           i.ai_model, i.embedding_status, i.occurred_at, i.created_at, i.reviewed_at,
           r.hops AS hops, r.relation_type AS via_relation
    FROM reached r
    JOIN ${schema.projectEvolutionItems} i ON i.id = r.item_id
    WHERE i.project_id = ${params.projectId}::uuid
      ${statusClause}
    ORDER BY r.hops, coalesce(i.occurred_at, i.created_at) DESC, i.id
    LIMIT ${params.limit}
  `);

  return rowsOf(result).map((row) => ({
    item: normalizeItemRow(row),
    hops: Number(row.hops),
    viaRelation: String(row.via_relation),
  }));
};

/**
 * FR-PE-42: follow the supersession chain from a matched-but-superseded item to
 * the accepted item that now stands in its place. Bounded to 10 links so a
 * cycle introduced by a bad backfill cannot spin forever.
 */
export const findCurrentReplacement = async (
  db: ProjectEvolutionTx,
  itemId: string
): Promise<ItemRow | undefined> => {
  const result = await db.execute(sql`
    WITH RECURSIVE chain AS (
      SELECT id, superseded_by_item_id, 0 AS depth
      FROM ${schema.projectEvolutionItems}
      WHERE id = ${itemId}::uuid
      UNION ALL
      SELECT i.id, i.superseded_by_item_id, c.depth + 1
      FROM chain c
      JOIN ${schema.projectEvolutionItems} i ON i.id = c.superseded_by_item_id
      WHERE c.depth < 10
    )
    SELECT ${ITEM_COLUMNS}
    FROM ${schema.projectEvolutionItems}
    WHERE id = (
      SELECT id FROM chain WHERE depth > 0 ORDER BY depth DESC LIMIT 1
    )
  `);
  const row = rowsOf(result)[0];
  return row ? normalizeItemRow(row) : undefined;
};
