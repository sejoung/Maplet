import { MAX_BYTES } from '../mup/codec';
import { MAX_MAPLET_BYTES } from '../maplet/codec';

export async function readMapFile(file: File): Promise<string> {
  const limit = file.name && !/\.mup$/i.test(file.name) ? MAX_MAPLET_BYTES : MAX_BYTES;
  if (file.size > limit) throw new Error(`파일 크기는 ${limit / 1024 / 1024} MiB 이하여야 합니다.`);
  return file.text();
}

export function downloadFile(content: string, name: string): void {
  const blob = new Blob([content], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  const sanitized = [...name]
    .map((char) => (char.charCodeAt(0) < 32 ? '_' : char))
    .join('')
    .replace(/[\\/:*?"<>|]/g, '_');
  anchor.download = /\.(maplet|mup)$/i.test(sanitized) ? sanitized : sanitized + '.maplet';
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
