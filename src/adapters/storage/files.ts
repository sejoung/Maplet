import { MAX_BYTES } from '../mup/codec';

export async function readMapFile(file: File): Promise<string> {
  if (file.size > MAX_BYTES) throw new Error('파일 크기는 10 MiB 이하여야 합니다.');
  return file.text();
}

export function downloadFile(content: string, name: string): void {
  const blob = new Blob([content], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download =
    [...name]
      .map((char) => (char.charCodeAt(0) < 32 ? '_' : char))
      .join('')
      .replace(/[\\/:*?"<>|]/g, '_')
      .replace(/\.mup$/i, '') + '.mup';
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
