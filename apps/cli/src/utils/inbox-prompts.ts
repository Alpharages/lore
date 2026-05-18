import * as readline from "readline";
import type { InboxSuggestion } from "../api/client.js";
import { ask, createReadline as sharedCreateReadline } from "./line-reader.js";

export type InboxAction = "accept" | "reject" | "skip" | "quit";

export const formatSuggestion = (
  suggestion: InboxSuggestion,
  index: number,
  total: number
): string => {
  const severityLabel = suggestion.severity.toUpperCase();
  const tags = suggestion.stack_tags.length > 0 ? suggestion.stack_tags.join(", ") : "(none)";
  return [
    `\n─── Suggestion ${index + 1} of ${total} ───────────────────────────────`,
    `  Title:      ${suggestion.title}`,
    `  Severity:   ${severityLabel}`,
    `  Problem:    ${suggestion.problem}`,
    `  Stack tags: ${tags}`,
    `  Seen:       ${suggestion.occurrence_count}× across projects`,
    `────────────────────────────────────────────────────────────`,
  ].join("\n");
};

export const promptAction = async (rl: readline.Interface): Promise<InboxAction> => {
  while (true) {
    const answer = await ask(rl, "  [a]ccept | [r]eject | [s]kip | [q]uit › ");
    const key = answer.trim().toLowerCase();
    if (key === "a" || key === "accept") return "accept";
    if (key === "r" || key === "reject") return "reject";
    if (key === "s" || key === "skip") return "skip";
    if (key === "q" || key === "quit") return "quit";
    console.log("  Please enter a, r, s, or q.");
  }
};

export const createReadline = sharedCreateReadline;
