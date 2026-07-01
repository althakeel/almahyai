import * as XLSX from 'xlsx';
import type { MessageAttachment } from './database';

function parseMarkdownTableRow(line: string): string[] | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith('|') || !trimmed.endsWith('|')) return null;
  const cells = trimmed
    .slice(1, -1)
    .split('|')
    .map((c) => c.trim());
  return cells.length > 0 ? cells : null;
}

function isSeparatorRow(cells: string[]): boolean {
  return cells.every((c) => /^:?-{2,}:?$/.test(c.replace(/\s/g, '')));
}

function extractMarkdownTables(content: string): string[][][] {
  const tables: string[][][] = [];
  const lines = content.split('\n');
  let i = 0;

  while (i < lines.length) {
    const header = parseMarkdownTableRow(lines[i]);
    if (!header) {
      i += 1;
      continue;
    }
    const sep = i + 1 < lines.length ? parseMarkdownTableRow(lines[i + 1]) : null;
    if (!sep || !isSeparatorRow(sep)) {
      i += 1;
      continue;
    }
    const rows: string[][] = [header];
    i += 2;
    while (i < lines.length) {
      const row = parseMarkdownTableRow(lines[i]);
      if (!row) break;
      rows.push(row);
      i += 1;
    }
    if (rows.length > 1) tables.push(rows);
  }

  return tables;
}

function extractSheetSections(content: string): { name: string; tables: string[][][] }[] {
  const sections: { name: string; tables: string[][][] }[] = [];
  const parts = content.split(/^##\s+Sheet:\s*/im);

  if (parts.length <= 1) {
    const tables = extractMarkdownTables(content);
    if (tables.length > 0) sections.push({ name: 'Sheet1', tables });
    return sections;
  }

  for (let i = 1; i < parts.length; i++) {
    const chunk = parts[i];
    const nl = chunk.indexOf('\n');
    const name = (nl >= 0 ? chunk.slice(0, nl) : chunk).trim() || `Sheet${i}`;
    const body = nl >= 0 ? chunk.slice(nl + 1) : '';
    const tables = extractMarkdownTables(body);
    if (tables.length > 0) sections.push({ name, tables });
  }

  return sections;
}

function safeSheetName(name: string, used: Set<string>): string {
  const base = name.replace(/[\\/*?:[\]]/g, '').trim().slice(0, 28) || 'Sheet';
  let candidate = base;
  let n = 2;
  while (used.has(candidate.toLowerCase())) {
    candidate = `${base.slice(0, 25)}_${n}`;
    n += 1;
  }
  used.add(candidate.toLowerCase());
  return candidate;
}

export function contentHasMarkdownTable(content: string): boolean {
  return extractMarkdownTables(content).length > 0;
}

export function wantsExcelOutput(message: string): boolean {
  const text = message.trim().toLowerCase();
  const wantsAction = /\b(create|make|generate|build|give me|send|export|download|need|prepare|produce)\b/.test(
    text
  );
  const wantsExcel =
    /\b(excel|spreadsheet|xlsx|xls|worksheet|workbook)\b/.test(text) ||
    /\bexcel file\b/.test(text);
  return wantsAction && wantsExcel;
}

export function wantsPdfDocumentOutput(message: string): boolean {
  const text = message.trim().toLowerCase();
  const wantsAction = /\b(create|make|generate|build|give me|send|export|download|need|write|prepare)\b/.test(
    text
  );
  const wantsPdf =
    /\b(pdf|document|report|letter|proposal)\b/.test(text) && !/\b(convert|from)\b/.test(text);
  return wantsAction && wantsPdf && !wantsExcelOutput(message);
}

export function buildExcelAttachment(content: string, baseName: string): MessageAttachment | null {
  const wb = XLSX.utils.book_new();
  const usedNames = new Set<string>();
  const sections = extractSheetSections(content);
  const blocks =
    sections.length > 0 ? sections : [{ name: 'Sheet1', tables: extractMarkdownTables(content) }];

  let sheetCount = 0;
  for (const section of blocks) {
    for (const table of section.tables) {
      const ws = XLSX.utils.aoa_to_sheet(table);
      const sheetName = safeSheetName(
        section.tables.length > 1 ? `${section.name}_${sheetCount + 1}` : section.name,
        usedNames
      );
      XLSX.utils.book_append_sheet(wb, ws, sheetName);
      sheetCount += 1;
    }
  }

  if (sheetCount === 0) {
    const lines = content
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
    if (lines.length === 0) return null;
    const ws = XLSX.utils.aoa_to_sheet(lines.map((l) => [l.replace(/^#+\s*/, '')]));
    XLSX.utils.book_append_sheet(wb, ws, safeSheetName('Content', usedNames));
  }

  const buffer = XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' }) as Buffer;
  const safe = baseName.replace(/[^\w\s-]/g, '').trim().slice(0, 40) || 'Almahy-Spreadsheet';

  return {
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    data: buffer.toString('base64'),
    filename: `${safe}.xlsx`,
  };
}
