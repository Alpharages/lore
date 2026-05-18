import * as fs from "fs";
import * as path from "path";

export const findLoreYaml = (): string => {
  let dir = process.cwd();
  while (true) {
    const candidate = path.join(dir, "lore.yaml");
    if (fs.existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) {
      throw new Error(`lore.yaml not found in ${process.cwd()} or any parent directory.`);
    }
    dir = parent;
  }
};
