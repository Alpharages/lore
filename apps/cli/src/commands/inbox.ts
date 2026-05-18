import { findLoreYaml } from "../core/config-finder.js";
import { parseLoreConfig, LoreConfig } from "../core/config-parser.js";
import { LoreClient } from "../api/client.js";
import { getApiKey } from "../core/credentials.js";
import { formatSuggestion, promptAction, createReadline } from "../utils/inbox-prompts.js";

export const inboxCommand = async (): Promise<void> => {
  let config: LoreConfig;
  try {
    config = parseLoreConfig(findLoreYaml());
  } catch (err: any) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }

  const slug = config.project.slug;
  const serverUrl = config.mcp.server;

  const apiKey = getApiKey(slug) ?? process.env.LORE_API_KEY;
  if (!apiKey) {
    console.error(
      `Error: no API key found for project "${slug}". ` +
        "Run `lore init` first, or set LORE_API_KEY."
    );
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
      rl.close();
      process.exit(1);
    }
  }

  rl.close();
  console.log("\n✓ Inbox complete.");
};
