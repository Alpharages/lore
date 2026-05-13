import * as fs from "fs";
import * as path from "path";
import {
  createReadline,
  runWizard,
  promptOverwrite,
  warnIfInsecureUrl,
} from "../utils/init-prompts.js";
import { checkHealth, registerProject } from "../api/register.js";
import { writeCredential } from "../core/credentials.js";
import { generateLoreYaml } from "../generators/lore-yaml.js";
import { generateClaudeMd } from "../generators/claude-md.js";
import { generateConstitution } from "../generators/constitution.js";
import { writeRepoIdentities } from "../generators/repo-identity.js";

export const initCommand = async (): Promise<void> => {
  const adminSecret = process.env.LORE_ADMIN_SECRET;
  if (!adminSecret) {
    console.error("Error: LORE_ADMIN_SECRET environment variable is not set.");
    process.exit(1);
  }

  const rl = createReadline();

  try {
    const answers = await runWizard(rl);
    rl.close();

    warnIfInsecureUrl(answers.serverUrl);

    const reachable = await checkHealth(answers.serverUrl);
    if (!reachable) {
      console.error(`Cannot reach Lore server at ${answers.serverUrl}`);
      process.exit(1);
    }

    const cwd = process.cwd();
    const loreYamlPath = path.join(cwd, "lore.yaml");

    if (fs.existsSync(loreYamlPath)) {
      const overwriteRl = createReadline();
      const overwrite = await promptOverwrite(overwriteRl);
      overwriteRl.close();
      if (!overwrite) {
        console.log("Init cancelled.");
        process.exit(0);
      }
    }

    if (answers.methodology && answers.validateTracker) {
      console.warn(
        "⚠️  Tracker connection validation is not yet fully implemented. Skipping validation."
      );
    }

    const payload = {
      name: answers.projectName,
      slug: answers.projectSlug,
      stack_tags: Array.from(new Set(answers.repos.flatMap((r) => r.stack))),
      repos: answers.repos.map((r) => ({ slug: r.slug, stack_tags: r.stack })),
    };

    let result;
    try {
      result = await registerProject(answers.serverUrl, adminSecret, payload);
    } catch (err: any) {
      console.error(err.message);
      process.exit(1);
    }

    writeCredential(answers.projectSlug, result.api_key);
    fs.writeFileSync(loreYamlPath, generateLoreYaml(answers), "utf-8");
    fs.writeFileSync(path.join(cwd, "CLAUDE.md"), generateClaudeMd(answers), "utf-8");

    const opsDir = path.join(cwd, "ops");
    fs.mkdirSync(opsDir, { recursive: true });
    fs.writeFileSync(path.join(opsDir, "constitution.md"), generateConstitution(answers), "utf-8");

    writeRepoIdentities(answers, cwd);

    console.log("\n✓ Project registered successfully.");
    console.log(`\n  API Key: ${result.api_key}`);
    console.log("\n  Store it securely:");
    console.log(`    export LORE_API_KEY=${result.api_key}`);
    console.log("\n  Generated files:");
    console.log(`    ${loreYamlPath}`);
    console.log(`    ${path.join(cwd, "CLAUDE.md")}`);
    console.log(`    ${path.join(cwd, "ops", "constitution.md")}`);
    for (const repo of answers.repos) {
      console.log(`    ${path.join(cwd, "repos", repo.slug, "REPO_IDENTITY.md")}`);
    }
  } catch (err: any) {
    rl.close();
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }
};
