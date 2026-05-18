import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import Handlebars from "handlebars";
import type { WizardAnswers } from "../utils/init-prompts.js";
import { detectStackStandards } from "../utils/stack-standards.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Walk up from this module looking for `templates/CLAUDE.md.hbs`. Works whether
// the file is at <pkg>/dist/generators/ (dev/published) or any future layout
// shuffle — as long as a sibling `templates/` directory ships in the package.
const findTemplate = (relativePath: string): string => {
  let dir = __dirname;
  // Stop at the filesystem root.
  for (let i = 0; i < 10; i++) {
    const candidate = path.join(dir, "templates", relativePath);
    if (fs.existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error(
    `Template not found: "templates/${relativePath}". ` +
      `Searched upward from ${__dirname}. ` +
      `If you installed from npm, this is a packaging bug — please file an issue.`
  );
};

export const generateClaudeMd = (answers: WizardAnswers): string => {
  const templatePath = findTemplate("CLAUDE.md.hbs");
  const templateSrc = fs.readFileSync(templatePath, "utf-8");
  // The output is Markdown, not HTML — disable Handlebars HTML escaping
  // so backticks, `=`, `>` etc. survive as literals.
  const template = Handlebars.compile(templateSrc, { noEscape: true });
  const allTags = answers.repos.flatMap((r) => r.stack);
  return template({
    project: { name: answers.projectName, slug: answers.projectSlug },
    mcp: { server: answers.serverUrl },
    repos: answers.repos,
    methodology: answers.methodology,
    agentStandards: detectStackStandards(allTags),
  });
};
