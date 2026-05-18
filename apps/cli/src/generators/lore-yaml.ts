import { stringify } from "yaml";
import type {
  LoreYaml,
  LoreYamlRepo,
  LoreYamlMethodology,
  LoreYamlTracker,
} from "../types/lore-yaml.js";
import type {
  WizardAnswers,
  WizardRepo,
  WizardMethodology,
  WizardTracker,
} from "../utils/init-prompts.js";

export const buildLoreYaml = (answers: WizardAnswers): LoreYaml => {
  const doc: LoreYaml = {
    lore: { version: "^1.0.0" },
    project: { name: answers.projectName, slug: answers.projectSlug },
    mcp: { server: answers.serverUrl },
    repos: answers.repos.map(mapRepo),
  };

  if (answers.methodology) {
    doc.methodology = mapMethodology(answers.methodology);
  }

  if (answers.tracker) {
    doc.tracker = mapTracker(answers.tracker);
  }

  return doc;
};

export const generateLoreYaml = (answers: WizardAnswers): string => {
  const doc = buildLoreYaml(answers);
  return stringify(doc);
};

const mapRepo = (repo: WizardRepo): LoreYamlRepo => ({
  slug: repo.slug,
  name: repo.name,
  path: repo.path,
  stack: repo.stack,
});

const mapMethodology = (methodology: WizardMethodology): LoreYamlMethodology => ({
  type: methodology.type,
  version: methodology.version,
});

const mapTracker = (tracker: WizardTracker): LoreYamlTracker => ({
  type: tracker.type,
  space_id: tracker.spaceId,
  backlog_list_id: tracker.backlogListId,
  active_sprint_list_id: tracker.activeSprintListId,
  config: tracker.customFieldIds,
});
