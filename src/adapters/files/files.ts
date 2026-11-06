import { sanitizeFilename } from '../../domain/filename';
import { assertSize, MAX_MUP_BYTES } from '../limits';
import { documentDownload, formatOf, type FileDownload } from '../formats';

export async function readMapFile(file: File): Promise<string> {
  // A nameless file cannot claim the larger native limit.
  assertSize(file.size, file.name ? formatOf(file.name).maxBytes : MAX_MUP_BYTES);
  return file.text();
}

/** Download a map document; a name without a map extension gets `.maplet`. */
export function downloadFile(content: string, name: string): void {
  downloadText(documentDownload(content, sanitizeFilename(name)));
}

export function downloadText({ content, name, type }: FileDownload): void {
  downloadBlob(new Blob([content], { type }), name);
}

export function downloadBlob(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = sanitizeFilename(name);
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
