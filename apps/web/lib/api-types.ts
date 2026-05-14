export type Severity = "critical" | "high" | "medium" | "low";

export type Provenance = "code_review" | "manual" | "propagated";

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
  whySuggested?: string;
  sharedStackTags?: string[];
  sourceProject?: string;
  trustTier?: string;
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
}

export interface Project {
  id: string;
  name: string;
  slug: string;
  stackTags: string[];
  lessonCount?: number;
  createdAt?: string;
}
