import { PDFParse } from 'pdf-parse';
import * as XLSX from 'xlsx';

export interface MessageAttachment {
  mimeType: string;
  data: string;
  filename: string;
  extractedText?: string;
}

const MAX_EXTRACT_CHARS = 120_000;

export const ALLOWED_DOCUMENT_MIMES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'text/plain',
  'text/csv',
  'application/csv',
];

export function isPdfMime(mimeType: string): boolean {
  return mimeType === 'application/pdf';
}

export function isExcelMime(mimeType: string): boolean {
  return (
    mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
    mimeType === 'application/vnd.ms-excel'
  );
}

export function isTextMime(mimeType: string): boolean {
  return mimeType === 'text/plain' || mimeType === 'text/csv' || mimeType === 'application/csv';
}

export function isSupportedDocumentMime(mimeType: string): boolean {
  return isPdfMime(mimeType) || isExcelMime(mimeType) || isTextMime(mimeType);
}

function truncate(text: string): string {
  if (text.length <= MAX_EXTRACT_CHARS) return text;
  return `${text.slice(0, MAX_EXTRACT_CHARS)}\n\n[Content truncated — file is very large.]`;
}

async function extractPdfText(data: string): Promise<string> {
  let parser: PDFParse | null = null;
  try {
    const buffer = Buffer.from(data, 'base64');
    parser = new PDFParse({ data: buffer });
    const result = await parser.getText();
    return result.text?.trim() ?? '';
  } catch {
    return '';
  } finally {
    await parser?.destroy().catch(() => {});
  }
}

function extractExcelText(data: string): string {
  const buffer = Buffer.from(data, 'base64');
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const parts: string[] = [];

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const csv = XLSX.utils.sheet_to_csv(sheet);
    if (csv.trim()) {
      parts.push(`### Sheet: ${sheetName}\n${csv}`);
    }
  }

  return parts.join('\n\n');
}

function extractPlainText(data: string): string {
  return Buffer.from(data, 'base64').toString('utf8').trim();
}

export async function buildAttachmentContext(attachment: MessageAttachment): Promise<string> {
  const name = attachment.filename || 'uploaded file';

  if (isPdfMime(attachment.mimeType)) {
    const pdfText = await extractPdfText(attachment.data);
    if (pdfText) {
      return truncate(`Attached PDF "${name}":\n\n${pdfText}`);
    }
    return `The user attached PDF file "${name}". Read and analyze the PDF content carefully.`;
  }

  if (isExcelMime(attachment.mimeType)) {
    const excelText = extractExcelText(attachment.data);
    if (!excelText.trim()) {
      throw new Error('Could not read data from this Excel file. Try saving it as .xlsx and upload again.');
    }
    return truncate(`Attached Excel "${name}":\n\n${excelText}`);
  }

  if (isTextMime(attachment.mimeType)) {
    const text = extractPlainText(attachment.data);
    if (!text) {
      throw new Error('Could not read text from this file.');
    }
    return truncate(`Attached file "${name}":\n\n${text}`);
  }

  throw new Error('Unsupported file type. Use image, PDF, Excel (.xlsx, .xls), CSV, or text (.txt).');
}

export async function prepareAttachment(
  attachment: MessageAttachment
): Promise<MessageAttachment> {
  const extractedText = await buildAttachmentContext(attachment);
  return { ...attachment, extractedText };
}
