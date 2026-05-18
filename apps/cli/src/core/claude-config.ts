import * as fs from "fs";

const LORE_START = "<!-- lore:start -->";
const LORE_END = "<!-- lore:end -->";

export const upsertLoreSection = (filePath: string, sectionContent: string): void => {
  const block = `${LORE_START}\n${sectionContent.trim()}\n${LORE_END}`;

  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, block + "\n", "utf-8");
    return;
  }

  const content = fs.readFileSync(filePath, "utf-8");
  const startIdx = content.indexOf(LORE_START);
  const endIdx = content.indexOf(LORE_END);

  if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
    const before = content.slice(0, startIdx);
    const after = content.slice(endIdx + LORE_END.length);
    fs.writeFileSync(filePath, before + block + after, "utf-8");
  } else {
    const needsNewline = content.length > 0 && !content.endsWith("\n");
    fs.writeFileSync(filePath, content + (needsNewline ? "\n" : "") + "\n" + block + "\n", "utf-8");
  }
};
