import * as readline from "readline";

export interface WizardAnswers {
  projectName: string;
  projectSlug: string;
  serverUrl: string;
  repos: WizardRepo[];
  methodology?: WizardMethodology;
  tracker?: WizardTracker;
  validateTracker: boolean;
}

export interface WizardRepo {
  name: string;
  slug: string;
  path: string;
  stack: string[];
}

export interface WizardMethodology {
  type: "bmad";
  version: string;
}

export interface WizardTracker {
  type: "clickup" | "jira" | "asana";
  spaceId?: string;
  backlogListId?: string;
  activeSprintListId?: string;
  customFieldIds?: Record<string, string>;
}

export const createReadline = (): readline.Interface =>
  readline.createInterface({ input: process.stdin, output: process.stdout });

export const ask = (rl: readline.Interface, prompt: string): Promise<string> =>
  new Promise((resolve) => {
    rl.question(prompt, resolve);
  });

export const toKebabCase = (input: string): string =>
  input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-+/g, "-");

const SLUG_PATTERN = /^[a-z0-9-]{2,40}$/;
const SLUG_HINT = "2–40 chars, lowercase letters, numbers and hyphens only";

export const promptProjectName = async (rl: readline.Interface): Promise<string> => {
  const name = await ask(rl, "Project name › ");
  if (!name.trim()) {
    console.log("Project name is required.");
    return promptProjectName(rl);
  }
  return name.trim();
};

export const promptProjectSlug = async (
  rl: readline.Interface,
  derived: string
): Promise<string> => {
  const answer = await ask(rl, `Project slug [${derived}] › `);
  const slug = answer.trim() || derived;
  if (!SLUG_PATTERN.test(slug)) {
    console.log(`  Invalid slug "${slug}". ${SLUG_HINT}.`);
    return promptProjectSlug(rl, derived);
  }
  return slug;
};

export const promptServerUrl = async (rl: readline.Interface): Promise<string> => {
  const answer = await ask(rl, "Lore server URL [http://localhost:3100] › ");
  const url = (answer.trim() || "http://localhost:3100").replace(/\/$/, "");
  return url;
};

export const promptRepos = async (rl: readline.Interface): Promise<WizardRepo[]> => {
  const repos: WizardRepo[] = [];

  while (true) {
    console.log(
      repos.length === 0
        ? "\nAdd at least one repository."
        : "\nAdd another repository (or press Enter to finish)."
    );
    const name = await ask(rl, "  Repo name › ");
    if (!name.trim()) {
      if (repos.length === 0) {
        console.log("  At least one repository is required.");
        continue;
      }
      break;
    }

    const derivedSlug = toKebabCase(name);
    let slug = "";
    while (true) {
      const slugAnswer = await ask(rl, `  Repo slug [${derivedSlug}] › `);
      slug = slugAnswer.trim() || derivedSlug;
      if (SLUG_PATTERN.test(slug)) break;
      console.log(`  Invalid slug "${slug}". ${SLUG_HINT}.`);
    }

    const pathAnswer = await ask(rl, "  Relative path › ");
    const repoPath = pathAnswer.trim() || `.`;

    const stackAnswer = await ask(rl, "  Tech stack (comma-separated) › ");
    const stack = stackAnswer
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    repos.push({ name: name.trim(), slug, path: repoPath, stack });
  }

  return repos;
};

export const promptMethodology = async (
  rl: readline.Interface
): Promise<{
  methodology?: WizardMethodology;
  tracker?: WizardTracker;
  validateTracker: boolean;
}> => {
  const useMethodology = await ask(rl, "\nUse a methodology layer? [Y/n] › ");
  if (useMethodology.trim().toLowerCase() === "n") {
    return { validateTracker: false };
  }

  const type = "bmad" as const;
  const version = await ask(rl, "  Methodology version range [^6.0.0] › ");
  const versionRange = version.trim() || "^6.0.0";

  const trackerTypeAnswer = await ask(rl, "  Tracker type (clickup|jira|asana) [clickup] › ");
  const rawTrackerType = trackerTypeAnswer.trim().toLowerCase();
  const trackerType: "clickup" | "jira" | "asana" =
    rawTrackerType === "jira" ? "jira" : rawTrackerType === "asana" ? "asana" : "clickup";

  const spaceId = await ask(rl, "  Tracker space ID › ");
  const backlogListId = await ask(rl, "  Backlog list ID › ");
  const activeSprintListId = await ask(rl, "  Active sprint list ID › ");

  const customFieldAnswer = await ask(rl, "  Custom field IDs (key=value, comma-separated) › ");
  const customFieldIds: Record<string, string> = {};
  customFieldAnswer.split(",").forEach((pair) => {
    const [k, v] = pair.split("=");
    if (k && v) customFieldIds[k.trim()] = v.trim();
  });

  const validateAnswer = await ask(rl, "  Validate tracker connection now? [Y/n] › ");
  const validateTracker = validateAnswer.trim().toLowerCase() !== "n";

  return {
    methodology: { type, version: versionRange },
    tracker: {
      type: trackerType,
      spaceId: spaceId.trim() || undefined,
      backlogListId: backlogListId.trim() || undefined,
      activeSprintListId: activeSprintListId.trim() || undefined,
      customFieldIds: Object.keys(customFieldIds).length > 0 ? customFieldIds : undefined,
    },
    validateTracker,
  };
};

export const promptOverwrite = async (rl: readline.Interface): Promise<boolean> => {
  const answer = await ask(rl, "lore.yaml already exists. Overwrite? [y/N] › ");
  return answer.trim().toLowerCase() === "y";
};

export const warnIfInsecureUrl = (serverUrl: string): void => {
  if (
    serverUrl &&
    !serverUrl.startsWith("https://") &&
    !/^https?:\/\/(localhost|127\.0\.0\.1)/.test(serverUrl)
  ) {
    console.warn(
      "⚠️  Warning: The provided MCP server URL uses HTTP, not HTTPS.\n" +
        "   API keys and lesson content will be transmitted in the clear.\n" +
        "   Consider using HTTPS for your Lore server."
    );
  }
};

export const runWizard = async (rl: readline.Interface): Promise<WizardAnswers> => {
  const projectName = await promptProjectName(rl);
  const projectSlug = await promptProjectSlug(rl, toKebabCase(projectName));
  const serverUrl = await promptServerUrl(rl);
  const repos = await promptRepos(rl);
  const { methodology, tracker, validateTracker } = await promptMethodology(rl);

  return {
    projectName,
    projectSlug,
    serverUrl,
    repos,
    methodology,
    tracker,
    validateTracker,
  };
};
