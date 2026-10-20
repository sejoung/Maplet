export function renameFilename(input: string): string {
  const safe = [...input]
    .map((char) => (char.charCodeAt(0) < 32 ? '_' : char))
    .join('')
    .replace(/[\\/:*?"<>|]/g, '_')
    .trim();
  const name = safe.replace(/(?:\.(?:maplet|mup|json))+$/i, '').replace(/[.\s]+$/, '');
  if (!name) throw new Error('파일 이름을 입력해 주세요.');
  return `${name}.maplet`;
}

export function filenameFromTitle(title: string): string | null {
  try {
    return renameFilename([...title.trim().replace(/\s+/g, ' ')].slice(0, 80).join(''));
  } catch {
    return null;
  }
}
