import * as fs from "fs";
import * as path from "path";
import * as os from "os";

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

export const appendClaudeMdInclude = (loreYamlPath: string, homeDir = os.homedir()): void => {
  const projectDir = path.dirname(loreYamlPath);
  const claudeMdPath = path.join(projectDir, "CLAUDE.md");
  const includeLine = `@${claudeMdPath}`;

  const claudeDir = path.join(homeDir, ".claude");
  const globalClaudeMd = path.join(claudeDir, "CLAUDE.md");

  if (!fs.existsSync(claudeDir)) {
    fs.mkdirSync(claudeDir, { recursive: true });
  }

  if (!fs.existsSync(globalClaudeMd)) {
    fs.writeFileSync(globalClaudeMd, includeLine + "\n");
    return;
  }

  const content = fs.readFileSync(globalClaudeMd, "utf-8");
  const lines = content.split("\n");

  if (lines.some((line) => line.trim() === includeLine)) {
    return;
  }

  const needsLeadingNewline = content.length > 0 && !content.endsWith("\n");
  const appendage = needsLeadingNewline ? "\n" + includeLine + "\n" : includeLine + "\n";

  fs.writeFileSync(globalClaudeMd, content + appendage);
};
