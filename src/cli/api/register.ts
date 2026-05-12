export interface RegisterPayload {
  name: string;
  slug: string;
  stack_tags: string[];
  repos: Array<{ slug: string; stack_tags: string[] }>;
}

export interface RegisterResult {
  project_id: string;
  api_key: string;
  message: string;
}

export const checkHealth = async (serverUrl: string): Promise<boolean> => {
  try {
    const res = await fetch(`${serverUrl}/health`, {
      method: "GET",
      signal: AbortSignal.timeout(10_000),
    });
    return res.ok;
  } catch {
    return false;
  }
};

export const registerProject = async (
  serverUrl: string,
  adminSecret: string,
  payload: RegisterPayload
): Promise<RegisterResult> => {
  const res = await fetch(`${serverUrl}/api/projects/register`, {
    method: "POST",
    headers: {
      "x-admin-secret": adminSecret,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Registration failed ${res.status}: ${body}`);
  }
  return res.json() as Promise<RegisterResult>;
};
