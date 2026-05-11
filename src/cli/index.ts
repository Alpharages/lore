#!/usr/bin/env node
import { Command } from "commander";
import { inboxCommand } from "./commands/inbox.js";

const program = new Command();

program
  .name("lore")
  .description("Lore CLI — institutional memory layer for BMAD-driven development")
  .version("0.1.0");

program
  .command("inbox")
  .description("Triage pending lesson-propagation suggestions from sister projects")
  .action(inboxCommand);

program.parseAsync(process.argv);
