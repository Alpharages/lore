export type Severity = "critical" | "high" | "medium" | "low";

export type Provenance = "code_review" | "manual" | "propagated";

export type FilterState = {
  tags: string[];
  severity: string[];
  category: string;
};

export const EMPTY_FILTERS: FilterState = { tags: [], severity: [], category: "" };

export interface Lesson {
  id: string;
  title: string;
  problem: string;
  fix: string;
  preventionRule: string;
  rootCause?: string;
  severity: Severity;
  stackTags: string[];
  category?: string;
  code?: string;
  language?: string;
  provenance: Provenance;
  trustTier?: string;
  sessionId?: string;
  occurrenceCount: number;
  firstSeen?: string;
  lastSeen?: string;
}

export interface Propagation {
  id: string;
  lessonId: string;
  lessonTitle: string;
  problem: string;
  severity: Severity;
  stackTags: string[];
  occurrenceCount: number;
  sharedStackTags: string[];
  sourceProject: string;
  trustTier: "high" | "medium" | "low";
  createdAt: string;
  targetProject?: string;
}

export interface LessonTrendPoint {
  week: string;
  count: number;
}

export interface Stats {
  totalLessons: number;
  sessionsRun: number;
  propagationsSent: number;
  propagationsAccepted: number;
  delta?: {
    totalLessons?: number;
    sessionsRun?: number;
    propagationsSent?: number;
    propagationsAccepted?: number;
  };
  weeklyLessonCounts?: LessonTrendPoint[];
}

export interface PropagationMetadata {
  lastRunAt: string | null;
}

export interface Project {
  id: string;
  name: string;
  slug: string;
  stackTags: string[];
  lessonCount: number;
  createdAt: string;
  keyId: string | null;
}

export interface Pattern {
  id: string;
  title: string;
  description: string;
  codeExample?: string | null;
  codeLanguage?: string | null;
  stackTags: string[];
  category?: string | null;
  usageCount: number;
  lastUsedAt?: string | null;
  externalTaskRef?: string | null;
  externalTrackerType?: string | null;
}

export interface ProjectKeyReference {
  keyId: string | null;
  maskedKey: string | null;
}

/* ------------------------------------------------------------------
 * Project Evolution (planning-artifacts/project-evolution-prd.md)
 * ------------------------------------------------------------------ */

export type EvolutionItemType =
  | "requirement"
  | "decision"
  | "scope_change"
  | "constraint"
  | "research_finding";

export type EvolutionStatus = "proposed" | "accepted" | "rejected" | "superseded";

export type EvolutionRelationType =
  | "supersedes"
  | "supports"
  | "contradicts"
  | "caused_by"
  | "implements"
  | "related_to";

export const EVOLUTION_TYPE_LABELS: Record<EvolutionItemType, string> = {
  requirement: "Requirement",
  decision: "Decision",
  scope_change: "Scope change",
  constraint: "Constraint",
  research_finding: "Research finding",
};

/** Display order for the grouped current-context view (FR-PE-62). */
export const EVOLUTION_TYPE_ORDER: EvolutionItemType[] = [
  "requirement",
  "decision",
  "scope_change",
  "constraint",
  "research_finding",
];

export interface EvolutionEvidence {
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
  excerpt?: string | null;
  excerpt_preview?: string | null;
}

export interface EvolutionItem {
  id: string;
  type: EvolutionItemType;
  revision: number;
  title: string;
  statement: string;
  rationale: string | null;
  status: EvolutionStatus;
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

export interface EvolutionRelation {
  id: string;
  from_item_id: string;
  to_item_id: string;
  relation_type: EvolutionRelationType;
  created_by: string | null;
  created_at: string | null;
  retracted_at: string | null;
}

export interface EvolutionEvent {
  id: string;
  item_id: string | null;
  event_type: string;
  revision: number | null;
  actor: string | null;
  note: string | null;
  payload: unknown;
  created_at: string | null;
}

export interface EvolutionWarning {
  kind: "unresolved_contradiction" | "superseded_match";
  message: string;
  item_ids: string[];
}

export interface EvolutionItemDetail {
  item: EvolutionItem;
  versions: Array<{
    revision: number;
    title: string;
    statement: string;
    rationale: string | null;
    authored_by: string | null;
    created_at: string | null;
  }>;
  evidence: EvolutionEvidence[];
  events: EvolutionEvent[];
  relations: EvolutionRelation[];
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

export interface EvolutionHistory {
  events: EvolutionEvent[];
  items: Array<EvolutionItem & { relations: EvolutionRelation[] }>;
  total_items: number;
  limit: number;
  offset: number;
}

export type EvolutionReviewAction = "accept" | "reject" | "revise";
