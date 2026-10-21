import { sanitizeFilename } from '../../domain/filename';
import { assertSize, byteLimitFor, MAX_MUP_BYTES } from '../limits';

export async function readMapFile(file: File): Promise<string> {
  // A nameless file cannot claim the larger native limit.
  assertSize(file.size, file.name ? byteLimitFor(file.name) : MAX_MUP_BYTES);
  return file.text();
}

export function downloadFile(content: string, name: string): void {
  const sanitized = sanitizeFilename(name);
  downloadBlob(
    new Blob([content], { type: 'application/json;charset=utf-8' }),
    /\.(maplet|mup)$/i.test(sanitized) ? sanitized : sanitized + '.maplet',
  );
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
