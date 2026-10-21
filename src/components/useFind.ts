import { useMemo, useState } from 'react';
import type { MindMap } from '../domain/model';

/** Find-as-you-type over node titles, in document order, stepping with next and previous. */
export function useFind(map: MindMap, selected: string, select: (id: string) => void) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const ordered = useMemo(() => {
    const term = query.trim().toLocaleLowerCase();
    if (!open || !term) return [];
    const result: string[] = [];
    const visit = (id: string) => {
      if (map.nodes[id].title.toLocaleLowerCase().includes(term)) result.push(id);
      map.nodes[id].children.forEach(visit);
    };
    map.roots.forEach(visit);
    return result;
  }, [map, query, open]);
  const matches = useMemo(() => new Set(ordered), [ordered]);
  const index = ordered.indexOf(selected);
  const step = (offset: 1 | -1) => {
    if (!ordered.length) return;
    const from = index < 0 ? (offset > 0 ? -1 : 0) : index;
    select(ordered[(from + offset + ordered.length) % ordered.length]);
  };
  return {
    open,
    query,
    setQuery,
    matches,
    count: ordered.length,
    /** 1-based position of the selected node among the matches, or 0. */
    position: index + 1,
    next: () => step(1),
    previous: () => step(-1),
    show: () => setOpen(true),
    close: () => setOpen(false),
  };
}
export type FindState = ReturnType<typeof useFind>;
