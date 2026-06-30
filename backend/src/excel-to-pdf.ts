import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { isExcelMime, isTextMime } from './file-content';

const MAX_ROWS_PER_SHEET = 500;
const MAX_COLS = 20;

function sheetRows(sheet: XLSX.WorkSheet): string[][] {
  const ref = sheet['!ref'];
  if (!ref) return [];
  const range = XLSX.utils.decode_range(ref);
  const rows: string[][] = [];
  const rowEnd = Math.min(range.e.r, range.s.r + MAX_ROWS_PER_SHEET - 1);
  const colEnd = Math.min(range.e.c, range.s.c + MAX_COLS - 1);

  for (let r = range.s.r; r <= rowEnd; r++) {
    const row: string[] = [];
    for (let c = range.s.c; c <= colEnd; c++) {
      const cell = sheet[XLSX.utils.encode_cell({ r, c })];
      row.push(cell?.w ?? cell?.v?.toString() ?? '');
    }
    rows.push(row);
  }
  return rows;
}

function readWorkbook(data: string, mimeType: string, filename: string): XLSX.WorkBook {
  const buffer = Buffer.from(data, 'base64');
  if (isExcelMime(mimeType)) {
    return XLSX.read(buffer, { type: 'buffer' });
  }
  if (isTextMime(mimeType) && /\.csv$/i.test(filename)) {
    const text = buffer.toString('utf8');
    return XLSX.read(text, { type: 'string' });
  }
  throw new Error('Attach an Excel (.xlsx, .xls) or CSV file to convert to PDF.');
}

export function convertSpreadsheetToPdf(
  data: string,
  mimeType: string,
  filename: string
): { pdfBase64: string; pdfFilename: string } {
  const workbook = readWorkbook(data, mimeType, filename);
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  let firstPage = true;

  for (const sheetName of workbook.SheetNames) {
    const rows = sheetRows(workbook.Sheets[sheetName]);
    if (rows.length === 0) continue;

    if (!firstPage) doc.addPage();
    firstPage = false;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(16, 163, 127);
    doc.text(sheetName, 40, 28);

    const head = rows.length > 1 ? [rows[0].map(String)] : [];
    const body = (rows.length > 1 ? rows.slice(1) : rows).map((row) => row.map(String));

    autoTable(doc, {
      startY: 36,
      head: head.length > 0 ? head : undefined,
      body,
      styles: { fontSize: 7, cellPadding: 3 },
      headStyles: { fillColor: [16, 163, 127], textColor: 255 },
      margin: { left: 28, right: 28 },
      tableWidth: pageWidth - 56,
    });
  }

  if (firstPage) {
    throw new Error('This spreadsheet appears to be empty. Add data and try again.');
  }

  const pdfBytes = Buffer.from(doc.output('arraybuffer'));
  const pdfFilename = filename.replace(/\.(xlsx|xls|csv)$/i, '') + '.pdf';

  return { pdfBase64: pdfBytes.toString('base64'), pdfFilename };
}
