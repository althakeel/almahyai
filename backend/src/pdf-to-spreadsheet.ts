import * as XLSX from 'xlsx';
import { extractPdfText } from './file-content';

const MAX_ROWS = 2000;

function textToRows(text: string): string[][] {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return [];

  const rows: string[][] = [];
  for (const line of lines.slice(0, MAX_ROWS)) {
    if (line.includes('\t')) {
      rows.push(line.split('\t').map((c) => c.trim()));
    } else if (line.includes(',') && line.split(',').length > 1) {
      rows.push(line.split(',').map((c) => c.trim()));
    } else if (/\s{2,}/.test(line)) {
      rows.push(line.split(/\s{2,}/).map((c) => c.trim()));
    } else {
      rows.push([line]);
    }
  }
  return rows;
}

export async function convertPdfToExcel(
  data: string,
  filename: string
): Promise<{ fileBase64: string; outputFilename: string; mimeType: string }> {
  const text = await extractPdfText(data);
  if (!text.trim()) {
    throw new Error(
      'Could not extract text from this PDF. It may be scanned or image-only — try a PDF with selectable text.'
    );
  }

  const rows = textToRows(text);
  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' });

  return {
    fileBase64: Buffer.from(out).toString('base64'),
    outputFilename: filename.replace(/\.pdf$/i, '') + '.xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  };
}

export async function convertPdfToCsv(
  data: string,
  filename: string
): Promise<{ fileBase64: string; outputFilename: string; mimeType: string }> {
  const text = await extractPdfText(data);
  if (!text.trim()) {
    throw new Error('Could not extract text from this PDF. Try a PDF with selectable text.');
  }

  const rows = textToRows(text);
  const ws = XLSX.utils.aoa_to_sheet(rows);
  const csv = XLSX.utils.sheet_to_csv(ws);

  return {
    fileBase64: Buffer.from(csv, 'utf8').toString('base64'),
    outputFilename: filename.replace(/\.pdf$/i, '') + '.csv',
    mimeType: 'text/csv',
  };
}
