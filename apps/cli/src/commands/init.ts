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
import { upsertLoreSection } from "../core/claude-config.js";
import { generateLoreYaml } from "../generators/lore-yaml.js";
import { generateClaudeMd } from "../generators/claude-md.js";

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

    const loreSectionContent = generateClaudeMd(answers);
    const claudeMdPath = path.join(cwd, "CLAUDE.md");
    const agentsMdPath = path.join(cwd, "AGENTS.md");
    upsertLoreSection(claudeMdPath, loreSectionContent);
    upsertLoreSection(agentsMdPath, loreSectionContent);

    console.log("\n✓ Project registered successfully.");
    console.log(`\n  API Key: ${result.api_key}`);
    console.log("\n  Store it securely:");
    console.log(`    export LORE_API_KEY=${result.api_key}`);
    console.log("\n  Generated files:");
    console.log(`    ${loreYamlPath}`);
    console.log(`    ${claudeMdPath}`);
    console.log(`    ${agentsMdPath}`);
  } catch (err: any) {
    rl.close();
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }
};
