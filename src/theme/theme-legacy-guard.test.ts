import { readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";

import { describe, expect, it } from "vitest";

const SOURCE_ROOT = resolve(process.cwd(), "src");
const SOURCE_FILE_PATTERN = /\.(ts|tsx|css)$/;
const TEST_FILE_PATTERN = /\.(test|spec)\.(ts|tsx)$/;
const FORBIDDEN_THEME_PATTERNS = [
  { label: "dark:", regex: /\bdark:/ },
  { label: ".dark", regex: /\.dark\b/ }
];

function collectSourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = join(dir, entry.name);

    if (entry.isDirectory()) {
      return collectSourceFiles(entryPath);
    }

    if (!SOURCE_FILE_PATTERN.test(entry.name) || TEST_FILE_PATTERN.test(entry.name)) {
      return [];
    }

    return [entryPath];
  });
}

describe("theme system legacy guard", () => {
  it("rejects .dark selectors and dark: variants because the repo uses data-theme", () => {
    // 扫描源码文本而不是依赖运行时快照，能直接阻断新的禁用主题机制回流。
    const offenders = collectSourceFiles(SOURCE_ROOT).flatMap((filePath) => {
      const content = readFileSync(filePath, "utf8");

      return FORBIDDEN_THEME_PATTERNS.flatMap(({ label, regex }) =>
        regex.test(content) ? [`${relative(process.cwd(), filePath)} -> ${label}`] : []
      );
    });

    expect(offenders).toEqual([]);
  });
});
