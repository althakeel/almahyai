import type { Message } from '../types';

function sanitizeFilename(name: string): string {
  return name.replace(/[^\w\s-]/g, '').trim().slice(0, 60) || 'orion-chat';
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function escHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export async function exportMessagesToPdf(messages: Message[], title: string): Promise<void> {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const margin = 40;
  const pageWidth = doc.internal.pageSize.getWidth() - margin * 2;
  const pageHeight = doc.internal.pageSize.getHeight();
  let y = margin;

  const newPageIfNeeded = (needed: number) => {
    if (y + needed > pageHeight - margin) {
      doc.addPage();
      y = margin;
    }
  };

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(16, 163, 127);
  doc.text(title, margin, y);
  y += 22;

  doc.setFontSize(9);
  doc.setTextColor(120);
  doc.text(`Exported ${new Date().toLocaleString()} · Almahy AI`, margin, y);
  y += 20;

  for (const msg of messages) {
    if (msg.role === 'system') continue;

    const role = msg.role === 'user' ? 'You' : 'Almahy AI';
    const header = `${role} · ${new Date(msg.createdAt).toLocaleString()}`;

    newPageIfNeeded(30);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(16, 163, 127);
    doc.text(header, margin, y);
    y += 16;

    if (msg.content) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.setTextColor(30);
      const lines = doc.splitTextToSize(msg.content, pageWidth);
      for (const line of lines) {
        newPageIfNeeded(14);
        doc.text(line, margin, y);
        y += 14;
      }
    }

    if (msg.image) {
      try {
        const dataUrl = `data:${msg.image.mimeType};base64,${msg.image.data}`;
        const format = msg.image.mimeType.includes('jpeg') || msg.image.mimeType.includes('jpg') ? 'JPEG' : 'PNG';
        newPageIfNeeded(130);
        doc.addImage(dataUrl, format, margin, y, Math.min(pageWidth, 220), 110);
        y += 118;
      } catch {
        doc.setFontSize(9);
        doc.setTextColor(150);
        doc.text('[Image attached]', margin, y);
        y += 12;
      }
    }

    y += 10;
  }

  doc.save(`${sanitizeFilename(title)}.pdf`);
}

/** Create a new PDF document from any text (AI replies, edited content, etc.). */
export async function exportTextToPdf(title: string, content: string): Promise<void> {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const margin = 48;
  const pageWidth = doc.internal.pageSize.getWidth() - margin * 2;
  const pageHeight = doc.internal.pageSize.getHeight();
  let y = margin;

  const newPageIfNeeded = (needed: number) => {
    if (y + needed > pageHeight - margin) {
      doc.addPage();
      y = margin;
    }
  };

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.setTextColor(16, 163, 127);
  const titleLines = doc.splitTextToSize(title, pageWidth);
  for (const line of titleLines) {
    newPageIfNeeded(22);
    doc.text(line, margin, y);
    y += 22;
  }

  y += 6;
  doc.setFontSize(9);
  doc.setTextColor(120);
  doc.text(`Created ${new Date().toLocaleString()} · Almahy AI`, margin, y);
  y += 22;

  const lines = content.replace(/\r\n/g, '\n').split('\n');

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    if (!line.trim()) {
      y += 8;
      continue;
    }

    if (/^###\s+/.test(line)) {
      newPageIfNeeded(20);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(40);
      const text = line.replace(/^###\s+/, '');
      for (const wrapped of doc.splitTextToSize(text, pageWidth)) {
        newPageIfNeeded(14);
        doc.text(wrapped, margin, y);
        y += 14;
      }
      y += 4;
      continue;
    }

    if (/^##\s+/.test(line)) {
      newPageIfNeeded(22);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(13);
      doc.setTextColor(16, 163, 127);
      const text = line.replace(/^##\s+/, '');
      for (const wrapped of doc.splitTextToSize(text, pageWidth)) {
        newPageIfNeeded(16);
        doc.text(wrapped, margin, y);
        y += 16;
      }
      y += 6;
      continue;
    }

    if (/^#\s+/.test(line)) {
      newPageIfNeeded(24);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(15);
      doc.setTextColor(16, 163, 127);
      const text = line.replace(/^#\s+/, '');
      for (const wrapped of doc.splitTextToSize(text, pageWidth)) {
        newPageIfNeeded(18);
        doc.text(wrapped, margin, y);
        y += 18;
      }
      y += 8;
      continue;
    }

    if (/^[-*•]\s+/.test(line)) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.setTextColor(30);
      const text = `• ${line.replace(/^[-*•]\s+/, '')}`;
      for (const wrapped of doc.splitTextToSize(text, pageWidth - 12)) {
        newPageIfNeeded(14);
        doc.text(wrapped, margin + 8, y);
        y += 14;
      }
      continue;
    }

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(30);
    for (const wrapped of doc.splitTextToSize(line, pageWidth)) {
      newPageIfNeeded(14);
      doc.text(wrapped, margin, y);
      y += 14;
    }
  }

  doc.save(`${sanitizeFilename(title)}.pdf`);
}

export function exportMessagesToExcel(messages: Message[], title: string): void {
  const rows = messages
    .filter((m) => m.role !== 'system')
    .map(
      (m) =>
        `<tr>
          <td>${escHtml(new Date(m.createdAt).toLocaleString())}</td>
          <td>${escHtml(m.role === 'user' ? 'You' : 'Almahy AI')}</td>
          <td>${escHtml(m.content || '')}</td>
          <td>${m.image ? 'Yes' : 'No'}</td>
        </tr>`
    )
    .join('');

  const html = `<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel">
<head><meta charset="UTF-8">
<!--[if gte mso 9]><xml><x:ExcelWorkbook><x:ExcelWorksheets><x:ExcelWorksheet>
<x:Name>Chat</x:Name><x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions>
</x:ExcelWorksheet></x:ExcelWorksheets></x:ExcelWorkbook></xml><![endif]-->
<style>td,th{border:1px solid #ccc;padding:6px;font-family:Segoe UI,Arial;font-size:11pt;}</style>
</head><body>
<h2>${escHtml(title)}</h2>
<table><tr><th>Time</th><th>Role</th><th>Message</th><th>Image</th></tr>${rows}</table>
</body></html>`;

  downloadBlob(new Blob([html], { type: 'application/vnd.ms-excel;charset=utf-8' }), `${sanitizeFilename(title)}.xls`);
}

export async function exportMessageToPdf(message: Message, title: string): Promise<void> {
  return exportMessagesToPdf([message], title);
}

export function exportMessageToExcel(message: Message, title: string): void {
  exportMessagesToExcel([message], title);
}

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

/** Create a new Excel workbook from AI table output (markdown tables or sheet sections). */
export async function exportTextToExcel(title: string, content: string): Promise<void> {
  const XLSX = await import('xlsx');
  const wb = XLSX.utils.book_new();
  const usedNames = new Set<string>();

  const sections = extractSheetSections(content);
  const tables = sections.length > 0 ? sections : [{ name: 'Sheet1', tables: extractMarkdownTables(content) }];

  let sheetCount = 0;
  for (const section of tables) {
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
    const ws = XLSX.utils.aoa_to_sheet(lines.length > 0 ? lines.map((l) => [l]) : [['']]);
    XLSX.utils.book_append_sheet(wb, ws, safeSheetName('Content', usedNames));
  }

  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  downloadBlob(
    new Blob([out], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }),
    `${sanitizeFilename(title)}.xlsx`
  );
}
