export interface LoreYamlRepo {
  slug: string;
  name: string;
  path: string;
  stack: string[];
}

export interface LoreYamlTracker {
  type: "clickup" | "jira" | "asana";
  space_id?: string;
  backlog_list_id?: string;
  active_sprint_list_id?: string;
  config?: Record<string, string>;
}

export interface LoreYamlMethodology {
  type: "bmad";
  version: string;
  allowed_workflows?: string[];
  default_dev_skill?: string;
  default_review_skill?: string;
}

export interface LoreYaml {
  lore: { version: string };
  project: { name: string; slug: string };
  mcp: { server: string };
  methodology?: LoreYamlMethodology;
  tracker?: LoreYamlTracker;
  repos: LoreYamlRepo[];
}
