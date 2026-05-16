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

export interface ProjectKeyReference {
  keyId: string | null;
  maskedKey: string | null;
}
