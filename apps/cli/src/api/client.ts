export interface InboxSuggestion {
  id: string;
  title: string;
  problem: string;
  severity: string;
  stack_tags: string[];
  occurrence_count: number;
}

export interface AcceptResult {
  new_lesson_id: string;
  action: "accepted";
}

export interface RejectResult {
  action: "rejected";
}

export class LoreClient {
  private readonly authHeaders: Record<string, string>;

  constructor(
    private readonly baseUrl: string,
    apiKey: string
  ) {
    this.authHeaders = {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    };
  }

  readonly getInbox = async (slug: string): Promise<InboxSuggestion[]> => {
    const res = await fetch(`${this.baseUrl}/api/projects/${slug}/inbox`, {
      method: "GET",
      headers: this.authHeaders,
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`${res.status}: ${body}`);
    }
    return res.json() as Promise<InboxSuggestion[]>;
  };

  readonly acceptPropagation = async (propagationId: string): Promise<AcceptResult> => {
    const res = await fetch(`${this.baseUrl}/api/propagations/${propagationId}/accept`, {
      method: "POST",
      headers: this.authHeaders,
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`${res.status}: ${body}`);
    }
    return res.json() as Promise<AcceptResult>;
  };

  readonly rejectPropagation = async (propagationId: string): Promise<RejectResult> => {
    const res = await fetch(`${this.baseUrl}/api/propagations/${propagationId}/reject`, {
      method: "POST",
      headers: this.authHeaders,
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`${res.status}: ${body}`);
    }
    return res.json() as Promise<RejectResult>;
  };
}
