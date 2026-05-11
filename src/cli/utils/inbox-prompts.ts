import * as readline from "readline";
import type { InboxSuggestion } from "../api/client.js";

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

export const promptAction = (rl: readline.Interface): Promise<InboxAction> => {
  return new Promise((resolve) => {
    const ask = (): void => {
      rl.question("  [a]ccept | [r]eject | [s]kip | [q]uit › ", (answer) => {
        const key = answer.trim().toLowerCase();
        if (key === "a" || key === "accept") return resolve("accept");
        if (key === "r" || key === "reject") return resolve("reject");
        if (key === "s" || key === "skip") return resolve("skip");
        if (key === "q" || key === "quit") return resolve("quit");
        console.log("  Please enter a, r, s, or q.");
        ask();
      });
    };
    ask();
  });
};

export const createReadline = (): readline.Interface =>
  readline.createInterface({ input: process.stdin, output: process.stdout });
