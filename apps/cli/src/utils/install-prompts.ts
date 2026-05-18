import checkbox from "@inquirer/checkbox";
import { IdeProfile } from "../core/ide-config.js";
import { ask, createReadline as sharedCreateReadline } from "./line-reader.js";

export const createReadline = sharedCreateReadline;
export { ask };

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
