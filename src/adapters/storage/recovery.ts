import type { Draft } from './drafts';
import { parseDocument, nativeFilename } from '../documents';
import { serializeMaplet } from '../maplet/codec';

export function restoreDraft(draft: Draft) {
  const map = parseDocument(draft.content);
  map.original = draft.original ?? map.original;
  const baseline = draft.savedContent ? parseDocument(draft.savedContent) : null;
  if (baseline) baseline.original = map.original;
  return {
    map,
    filename: nativeFilename(draft.filename),
    savedContent: baseline ? serializeMaplet(baseline) : '',
  };
}
