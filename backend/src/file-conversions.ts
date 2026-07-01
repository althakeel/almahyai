import { jsPDF } from 'jspdf';
import * as XLSX from 'xlsx';
import type { MessageAttachment } from './database';
import { isPdfMime, isExcelMime, isTextMime } from './file-content';
import { convertSpreadsheetToPdf } from './excel-to-pdf';
import { convertPdfToCsv, convertPdfToExcel } from './pdf-to-spreadsheet';

export type ConversionKind =
  | 'spreadsheet-to-pdf'
  | 'spreadsheet-to-csv'
  | 'pdf-to-excel'
  | 'pdf-to-csv'
  | 'text-to-pdf';

function isSpreadsheetAttachment(attachment: MessageAttachment): boolean {
  return (
    isExcelMime(attachment.mimeType) ||
    (isTextMime(attachment.mimeType) && /\.csv$/i.test(attachment.filename))
  );
}

function wantsConversion(message: string): boolean {
  const text = message.trim().toLowerCase();
  return (
    /\b(convert|export|save|turn|change|make|transform)\b/.test(text) ||
    /\b(to|into|in)\s+(pdf|excel|xlsx|xls|csv|spreadsheet)\b/.test(text) ||
    /\bmin\s+(pdf|excel)\b/.test(text) ||
    (/\b(pdf|excel|xlsx|csv)\b/.test(text) && /\b(this|file|document|attached)\b/.test(text))
  );
}

function targetFormat(message: string): 'pdf' | 'excel' | 'csv' | null {
  const text = message.trim().toLowerCase();
  if (/\b(pdf)\b/.test(text) || /\bmin\s+pdf\b/.test(text)) return 'pdf';
  if (/\b(csv)\b/.test(text)) return 'csv';
  if (/\b(excel|xlsx|xls|spreadsheet)\b/.test(text) || /\bmin\s+excel\b/.test(text)) return 'excel';
  return null;
}

export function detectFileConversion(
  message: string,
  attachment: MessageAttachment
): ConversionKind | null {
  if (!wantsConversion(message)) return null;
  const target = targetFormat(message);
  if (!target) return null;

  if (isSpreadsheetAttachment(attachment)) {
    if (target === 'pdf') return 'spreadsheet-to-pdf';
    if (target === 'csv') return 'spreadsheet-to-csv';
  }

  if (isPdfMime(attachment.mimeType)) {
    if (target === 'excel') return 'pdf-to-excel';
    if (target === 'csv') return 'pdf-to-csv';
  }

  if (isTextMime(attachment.mimeType) && /\.txt$/i.test(attachment.filename) && target === 'pdf') {
    return 'text-to-pdf';
  }

  return null;
}

function readSpreadsheetWorkbook(data: string, mimeType: string, filename: string): XLSX.WorkBook {
  const buffer = Buffer.from(data, 'base64');
  if (isExcelMime(mimeType)) {
    return XLSX.read(buffer, { type: 'buffer' });
  }
  const text = buffer.toString('utf8');
  return XLSX.read(text, { type: 'string' });
}

function convertSpreadsheetToCsv(
  data: string,
  mimeType: string,
  filename: string
): { fileBase64: string; outputFilename: string; mimeType: string } {
  const workbook = readSpreadsheetWorkbook(data, mimeType, filename);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) throw new Error('Spreadsheet appears to be empty.');
  const csv = XLSX.utils.sheet_to_csv(sheet);
  const base = filename.replace(/\.(xlsx|xls|csv)$/i, '');
  return {
    fileBase64: Buffer.from(csv, 'utf8').toString('base64'),
    outputFilename: `${base}.csv`,
    mimeType: 'text/csv',
  };
}

function convertTextToPdf(
  data: string,
  filename: string
): { fileBase64: string; outputFilename: string; mimeType: string } {
  const text = Buffer.from(data, 'base64').toString('utf8').trim();
  if (!text) throw new Error('Text file is empty.');

  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const margin = 48;
  const pageWidth = doc.internal.pageSize.getWidth() - margin * 2;
  const pageHeight = doc.internal.pageSize.getHeight();
  let y = margin;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(16, 163, 127);
  doc.text(filename.replace(/\.txt$/i, ''), margin, y);
  y += 24;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(30);

  for (const line of text.split(/\r?\n/)) {
    const wrapped = doc.splitTextToSize(line || ' ', pageWidth);
    for (const w of wrapped) {
      if (y > pageHeight - margin) {
        doc.addPage();
        y = margin;
      }
      doc.text(w, margin, y);
      y += 14;
    }
  }

  const pdfBytes = Buffer.from(doc.output('arraybuffer'));
  return {
    fileBase64: pdfBytes.toString('base64'),
    outputFilename: filename.replace(/\.txt$/i, '') + '.pdf',
    mimeType: 'application/pdf',
  };
}

export async function runFileConversion(
  kind: ConversionKind,
  attachment: MessageAttachment
): Promise<MessageAttachment> {
  let result: { fileBase64: string; outputFilename: string; mimeType: string };

  switch (kind) {
    case 'spreadsheet-to-pdf': {
      const pdf = convertSpreadsheetToPdf(attachment.data, attachment.mimeType, attachment.filename);
      result = { fileBase64: pdf.pdfBase64, outputFilename: pdf.pdfFilename, mimeType: 'application/pdf' };
      break;
    }
    case 'spreadsheet-to-csv':
      result = convertSpreadsheetToCsv(attachment.data, attachment.mimeType, attachment.filename);
      break;
    case 'pdf-to-excel':
      result = await convertPdfToExcel(attachment.data, attachment.filename);
      break;
    case 'pdf-to-csv':
      result = await convertPdfToCsv(attachment.data, attachment.filename);
      break;
    case 'text-to-pdf':
      result = convertTextToPdf(attachment.data, attachment.filename);
      break;
    default:
      throw new Error('Unsupported conversion.');
  }

  return {
    mimeType: result.mimeType,
    data: result.fileBase64,
    filename: result.outputFilename,
  };
}

export function conversionSuccessMessage(
  sourceFilename: string,
  output: MessageAttachment
): string {
  const label =
    output.mimeType === 'application/pdf'
      ? 'PDF'
      : output.mimeType.includes('spreadsheet')
        ? 'Excel'
        : output.mimeType === 'text/csv'
          ? 'CSV'
          : 'file';
  return `I've converted "${sourceFilename}" to ${label}. Click Download ${label} below to save it.`;
}

export function buildPdfAttachmentFromText(content: string, baseName: string): MessageAttachment {
  const plain = content
    .replace(/\*\*/g, '')
    .replace(/^#+\s+/gm, '')
    .trim();
  const data = Buffer.from(plain || 'Document', 'utf8').toString('base64');
  const safe = baseName.replace(/[^\w\s-]/g, '').trim().slice(0, 40) || 'Almahy-Document';
  const result = convertTextToPdf(data, `${safe}.txt`);
  return {
    mimeType: result.mimeType,
    data: result.fileBase64,
    filename: `${safe}.pdf`,
  };
}
