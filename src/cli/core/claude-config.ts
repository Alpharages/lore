import * as fs from "fs";
import * as path from "path";
import * as os from "os";

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
