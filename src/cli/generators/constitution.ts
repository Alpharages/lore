import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import Handlebars from "handlebars";
import type { WizardAnswers } from "../utils/init-prompts.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const generateConstitution = (answers: WizardAnswers): string => {
  const templatePath = path.resolve(__dirname, "../../..", "templates", "constitution.md.hbs");
  if (!fs.existsSync(templatePath)) {
    throw new Error(`Template not found: ${templatePath}`);
  }
  const templateSrc = fs.readFileSync(templatePath, "utf-8");
  const template = Handlebars.compile(templateSrc);
  return template({
    project: { name: answers.projectName, slug: answers.projectSlug },
    repos: answers.repos,
  });
};
