#!/usr/bin/env node
import { Command } from "commander";
import { inboxCommand } from "./commands/inbox.js";
import { initCommand } from "./commands/init.js";
import { installCommand } from "./commands/install.js";
import { updateCommand } from "./commands/update.js";

const program = new Command();

program
  .name("lore")
  .description("Lore CLI — institutional memory layer for BMAD-driven development")
  .version("0.1.0");

program
  .command("init")
  .description("Initialize a new Lore project configuration interactively")
  .action(initCommand);

program
  .command("install")
  .description("Configure MCP tools and AI assistant integration for this project")
  .option("--force", "bypass state check and reinstall everything")
  .action((opts) => installCommand({ force: opts.force }));

program
  .command("inbox")
  .description("Triage pending lesson-propagation suggestions from sister projects")
  .action(inboxCommand);

program
  .command("update")
  .description("Upgrade the lore-memory-mcp Docker image to a newer compatible version")
  .action(updateCommand);

(async () => {
  await program.parseAsync(process.argv);
})().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
