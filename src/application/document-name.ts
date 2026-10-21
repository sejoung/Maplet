import { AppError } from '../domain/errors';
import { sanitizeFilename, stripMapExtensions } from '../domain/filename';

export function renameFilename(input: string): string {
  const name = stripMapExtensions(sanitizeFilename(input).trim()).replace(/[.\s]+$/, '');
  if (!name) throw new AppError('common.pleaseEnterFileName');
  return `${name}.maplet`;
}

export function filenameFromTitle(title: string): string | null {
  try {
    return renameFilename([...title.trim().replace(/\s+/g, ' ')].slice(0, 80).join(''));
  } catch {
    return null;
  }
}
