import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import Handlebars from "handlebars";
import type { WizardAnswers, WizardRepo } from "../utils/init-prompts.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const generateRepoIdentity = (repo: WizardRepo, _answers: WizardAnswers): string => {
  const templatePath = path.resolve(__dirname, "../../..", "templates", "REPO_IDENTITY.md.hbs");
  if (!fs.existsSync(templatePath)) {
    throw new Error(`Template not found: ${templatePath}`);
  }
  const templateSrc = fs.readFileSync(templatePath, "utf-8");
  const template = Handlebars.compile(templateSrc);
  return template({ repo });
};

export const writeRepoIdentities = (answers: WizardAnswers, cwd: string): string[] => {
  const written: string[] = [];
  for (const repo of answers.repos) {
    const content = generateRepoIdentity(repo, answers);
    const dir = path.join(cwd, "repos", repo.slug);
    fs.mkdirSync(dir, { recursive: true });
    const filePath = path.join(dir, "REPO_IDENTITY.md");
    fs.writeFileSync(filePath, content, "utf-8");
    written.push(filePath);
  }
  return written;
};
