import { useCallback, useLayoutEffect, useMemo, useState } from 'react';
import type { MindMap } from '../domain/model';
import { useTextLayout } from './useTextLayout';

export function useEditingLayout(map: MindMap, editingId: string | null, documentKey: number) {
  const [draft, setDraft] = useState<{ source: MindMap; id: string; title: string } | null>(null);
  useLayoutEffect(() => setDraft(null), [map, editingId, documentKey]);
  const previewMap = useMemo(() => {
    if (!draft || draft.source !== map || draft.id !== editingId || !map.nodes[draft.id])
      return map;
    return {
      ...map,
      nodes: { ...map.nodes, [draft.id]: { ...map.nodes[draft.id], title: draft.title } },
    };
  }, [map, editingId, draft]);
  const onDraftChange = useCallback(
    (id: string, title: string) => {
      setDraft({ source: map, id, title });
    },
    [map],
  );
  return { layout: useTextLayout(previewMap), onDraftChange };
}
