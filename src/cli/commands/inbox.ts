import * as fs from "fs";
import * as path from "path";
import { parse as parseYaml } from "yaml";
import { LoreClient } from "../api/client.js";
import { formatSuggestion, promptAction, createReadline } from "../utils/inbox-prompts.js";

interface LoreYaml {
  project?: { slug?: string };
  mcp?: { server?: string };
}

const findLoreYaml = (): string => {
  let dir = process.cwd();
  while (true) {
    const candidate = path.join(dir, "lore.yaml");
    if (fs.existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) throw new Error("lore.yaml not found in current directory or any parent.");
    dir = parent;
  }
};

const readLoreYaml = (): LoreYaml => {
  const filePath = findLoreYaml();
  const content = fs.readFileSync(filePath, "utf-8");
  return parseYaml(content) as LoreYaml;
};

export const inboxCommand = async (): Promise<void> => {
  let config: LoreYaml;
  try {
    config = readLoreYaml();
  } catch (err: any) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }

  const slug = config.project?.slug;
  if (!slug) {
    console.error("Error: project.slug is missing from lore.yaml.");
    process.exit(1);
  }

  const serverUrl = config.mcp?.server;
  if (!serverUrl) {
    console.error("Error: mcp.server is missing from lore.yaml.");
    process.exit(1);
  }

  const apiKey = process.env.LORE_API_KEY;
  if (!apiKey) {
    console.error("Error: LORE_API_KEY environment variable is not set.");
    process.exit(1);
  }

  const client = new LoreClient(serverUrl, apiKey);

  let suggestions;
  try {
    suggestions = await client.getInbox(slug);
  } catch (err: any) {
    console.error(`Error fetching inbox: ${err.message}`);
    process.exit(1);
  }

  if (suggestions.length === 0) {
    console.log("✓ No pending suggestions.");
    process.exit(0);
  }

  const rl = createReadline();

  for (let i = 0; i < suggestions.length; i++) {
    const suggestion = suggestions[i];
    console.log(formatSuggestion(suggestion, i, suggestions.length));

    const action = await promptAction(rl);

    if (action === "quit") {
      console.log("  Exiting inbox.");
      rl.close();
      process.exit(0);
    }

    if (action === "skip") {
      console.log("  Skipped.");
      continue;
    }

    try {
      if (action === "accept") {
        await client.acceptPropagation(suggestion.id);
        console.log("  ✓ Accepted — lesson added to your project.");
      } else {
        await client.rejectPropagation(suggestion.id);
        console.log("  ✓ Rejected.");
      }
    } catch (err: any) {
      console.error(`  Error processing action: ${err.message}`);
    }
  }

  rl.close();
  console.log("\n✓ Inbox complete.");
};
