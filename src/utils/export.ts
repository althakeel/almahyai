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
