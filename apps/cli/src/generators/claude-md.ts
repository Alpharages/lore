import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import Handlebars from "handlebars";
import type { WizardAnswers } from "../utils/init-prompts.js";
import { detectStackStandards } from "../utils/stack-standards.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const generateClaudeMd = (answers: WizardAnswers): string => {
  const templatePath = path.resolve(__dirname, "../..", "templates", "CLAUDE.md.hbs");
  if (!fs.existsSync(templatePath)) {
    throw new Error(`Template not found: ${templatePath}`);
  }
  const templateSrc = fs.readFileSync(templatePath, "utf-8");
  const template = Handlebars.compile(templateSrc);
  const allTags = answers.repos.flatMap((r) => r.stack);
  return template({
    project: { name: answers.projectName, slug: answers.projectSlug },
    mcp: { server: answers.serverUrl },
    repos: answers.repos,
    methodology: answers.methodology,
    agentStandards: detectStackStandards(allTags),
  });
};
