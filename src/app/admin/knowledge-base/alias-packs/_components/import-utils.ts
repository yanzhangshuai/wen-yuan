/**
 * 知识包导入解析工具，从原 page.tsx 中抽出供 import 路由复用。
 */

export type ImportFormat = "JSON" | "CSV";

export interface ParsedImportPreview {
  entries: Array<{ canonicalName: string; aliases: string[]; entryType?: string; notes?: string }>;
  errors : string[];
}

function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      if (quoted && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }

    if (char === "," && !quoted) {
      cells.push(current);
      current = "";
      continue;
    }

    current += char;
  }

  cells.push(current);
  return cells.map((cell) => cell.trim());
}

export function parseImportPreview(format: ImportFormat, rawContent: string): ParsedImportPreview {
  if (!rawContent.trim()) {
    return { entries: [], errors: [] };
  }

  if (format === "JSON") {
    try {
      const parsed = JSON.parse(rawContent) as unknown;
      const rows = Array.isArray(parsed)
        ? parsed
        : typeof parsed === "object" && parsed !== null && Array.isArray((parsed as { entries?: unknown[] }).entries)
          ? (parsed as { entries: unknown[] }).entries
          : null;

      if (!rows) {
        return { entries: [], errors: ["JSON 需为条目数组，或包含 entries 数组的对象"] };
      }

      const entries: ParsedImportPreview["entries"] = [];
      const errors: string[] = [];

      rows.forEach((row, index) => {
        if (!row || typeof row !== "object") {
          errors.push(`第 ${index + 1} 条不是对象`);
          return;
        }

        const record = row as {
          canonicalName?: unknown;
          aliases?      : unknown;
          entryType?    : unknown;
          notes?        : unknown;
        };
        const canonicalName = typeof record.canonicalName === "string" ? record.canonicalName.trim() : "";
        if (!canonicalName) {
          errors.push(`第 ${index + 1} 条缺少 canonicalName`);
          return;
        }

        const aliases = Array.isArray(record.aliases)
          ? record.aliases.filter((value): value is string => typeof value === "string").map((value) => value.trim()).filter(Boolean)
          : typeof record.aliases === "string"
            ? record.aliases.split(/[|,，\n]/).map((value) => value.trim()).filter(Boolean)
            : [];

        entries.push({
          canonicalName,
          aliases,
          entryType: typeof record.entryType === "string" && record.entryType.trim() ? record.entryType.trim() : "CHARACTER",
          notes    : typeof record.notes === "string" && record.notes.trim() ? record.notes.trim() : undefined
        });
      });

      return { entries, errors };
    } catch (error) {
      return { entries: [], errors: [String(error)] };
    }
  }

  const lines = rawContent.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length === 0) {
    return { entries: [], errors: [] };
  }

  const header = splitCsvLine(lines[0]);
  const canonicalIndex = header.indexOf("canonicalName");
  const aliasesIndex = header.indexOf("aliases");
  const entryTypeIndex = header.indexOf("entryType");
  const notesIndex = header.indexOf("notes");

  if (canonicalIndex === -1 || aliasesIndex === -1) {
    return { entries: [], errors: ["CSV 需包含 canonicalName 与 aliases 列"] };
  }

  const entries: ParsedImportPreview["entries"] = [];
  const errors: string[] = [];

  for (let lineIndex = 1; lineIndex < lines.length; lineIndex += 1) {
    const columns = splitCsvLine(lines[lineIndex]);
    const canonicalName = (columns[canonicalIndex] ?? "").trim();
    if (!canonicalName) {
      errors.push(`第 ${lineIndex + 1} 行缺少 canonicalName`);
      continue;
    }

    const aliases = (columns[aliasesIndex] ?? "")
      .split("|")
      .map((value) => value.trim())
      .filter(Boolean);

    entries.push({
      canonicalName,
      aliases,
      entryType: entryTypeIndex >= 0 && columns[entryTypeIndex]?.trim() ? columns[entryTypeIndex].trim() : "CHARACTER",
      notes    : notesIndex >= 0 && columns[notesIndex]?.trim() ? columns[notesIndex] : undefined
    });
  }

  return { entries, errors };
}
