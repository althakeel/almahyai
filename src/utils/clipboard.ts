import type { MessageImage } from '../types';

export function imageDataUrl(image: MessageImage): string {
  return `data:${image.mimeType};base64,${image.data}`;
}

export async function copyTextToClipboard(text: string): Promise<void> {
  await navigator.clipboard.writeText(text);
}

export async function copyImageToClipboard(image: MessageImage): Promise<void> {
  const response = await fetch(imageDataUrl(image));
  const blob = await response.blob();
  const type = blob.type || image.mimeType || 'image/png';

  if (typeof ClipboardItem !== 'undefined') {
    await navigator.clipboard.write([new ClipboardItem({ [type]: blob })]);
    return;
  }

  throw new Error('Image copy is not supported in this environment.');
}

export function saveImageToFile(image: MessageImage, filename?: string): void {
  const ext = image.mimeType.split('/')[1]?.replace('jpeg', 'jpg') || 'png';
  const link = document.createElement('a');
  link.href = imageDataUrl(image);
  link.download = filename ?? `orion-ai-${Date.now()}.${ext}`;
  link.click();
}

export async function shareImage(image: MessageImage): Promise<'shared' | 'copied' | 'saved'> {
  const response = await fetch(imageDataUrl(image));
  const blob = await response.blob();
  const ext = image.mimeType.split('/')[1]?.replace('jpeg', 'jpg') || 'png';
  const filename = `orion-ai-${Date.now()}.${ext}`;
  const file = new File([blob], filename, { type: blob.type || image.mimeType });

  if (typeof navigator.share === 'function') {
    const payload: ShareData = { title: 'Orion AI image', files: [file] };
    if (!navigator.canShare || navigator.canShare(payload)) {
      await navigator.share(payload);
      return 'shared';
    }
  }

  try {
    await copyImageToClipboard(image);
    return 'copied';
  } catch {
    saveImageToFile(image, filename);
    return 'saved';
  }
}
