import * as readline from "readline";
import checkbox from "@inquirer/checkbox";
import { IdeProfile } from "../core/ide-config.js";

export const createReadline = (): readline.Interface =>
  readline.createInterface({ input: process.stdin, output: process.stdout });

export const ask = (rl: readline.Interface, prompt: string): Promise<string> =>
  new Promise((resolve) => {
    rl.question(prompt, resolve);
  });

export const promptIdeSelection = async (
  profiles: IdeProfile[],
  detectedIds: string[]
): Promise<string[]> => {
  if (profiles.length === 0) {
    return [];
  }

  const choices = profiles.map((profile) => ({
    name: `${profile.name}${detectedIds.includes(profile.id) ? " [detected]" : ""}`,
    value: profile.id,
    checked: detectedIds.includes(profile.id),
  }));

  try {
    const answer = await checkbox({
      message: "Select IDEs/agents to configure MCP servers for (press Enter to skip):",
      choices,
      shortcuts: { all: "a", invert: "i" },
    });
    return answer;
  } catch (err: any) {
    if (
      err.name === "ExitPromptError" ||
      err.name === "CancelPromptError" ||
      err.code === "ABORT_PROMPT"
    ) {
      process.exit(130);
    }
    throw err;
  }
};

export const promptClaudeInclude = async (
  rl: readline.Interface,
  detected: boolean
): Promise<boolean> => {
  const detectedLabel = detected ? " [detected]" : "";
  const answer = await ask(
    rl,
    `\nConfigure Claude Code context includes?${detectedLabel} [Y/n] › `
  );
  return answer.trim().toLowerCase() !== "n";
};
