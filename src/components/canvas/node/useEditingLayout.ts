import { useCallback, useLayoutEffect, useMemo, useState } from 'react';
import type { MindMap } from '../../../domain/model';
import { effectiveTitle, withoutLegacyEmphasis } from '../../../domain/rich-text/title-format';
import { useTextLayout } from './useTextLayout';

export function useEditingLayout(map: MindMap, editingId: string | null, documentKey: number) {
  const [draft, setDraft] = useState<{ source: MindMap; id: string; title: string } | null>(null);
  useLayoutEffect(() => setDraft(null), [map, editingId, documentKey]);
  const previewMap = useMemo(() => {
    if (!editingId || !Object.hasOwn(map.nodes, editingId)) return map;
    const node = map.nodes[editingId];
    const style = withoutLegacyEmphasis(node.style);
    const typed = draft && draft.source === map && draft.id === editingId ? draft.title : null;
    // The editor shows whole-node emphasis as formatted text; measure it the same way.
    if (typed === null && style === node.style) return map;
    const title = typed ?? effectiveTitle(node);
    return { ...map, nodes: { ...map.nodes, [editingId]: { ...node, title, style } } };
  }, [map, editingId, draft]);
  const onDraftChange = useCallback(
    (id: string, title: string) => {
      setDraft({ source: map, id, title });
    },
    [map],
  );
  return { layout: useTextLayout(previewMap), onDraftChange };
}
