import { useMemo, useState } from 'react';
import type { MindMap } from '../domain/model';
import { topLevel, visibleSelection } from '../domain/selection';

/** The focused node and the multi-selection around it; unknown or hidden IDs drop out. */
export function useSelection(map: MindMap) {
  const [state, setState] = useState(() => ({ focused: map.roots[0], ids: [map.roots[0]] }));
  const selectedId = Object.hasOwn(map.nodes, state.focused) ? state.focused : map.roots[0];
  const selection = useMemo(() => {
    const visible = visibleSelection(map, state.ids);
    return visible.includes(selectedId) ? visible : [selectedId];
  }, [map, state.ids, selectedId]);
  return {
    selectedId,
    /** Every selected node, including `selectedId`. */
    selection,
    /** The branches a command on `id` acts on: the whole selection when `id` is part of it. */
    targets: (id: string) =>
      selection.length > 1 && selection.includes(id) ? topLevel(map, selection) : [id],
    setSelected: (id: string) => setState({ focused: id, ids: [id] }),
    /** Add a node to the selection and focus it, or remove it and focus the last remaining one. */
    toggleSelect: (id: string) => {
      if (!Object.hasOwn(map.nodes, id)) return;
      if (!selection.includes(id)) return setState({ focused: id, ids: [...selection, id] });
      if (selection.length === 1) return;
      const rest = selection.filter((key) => key !== id);
      setState({ focused: id === selectedId ? rest.at(-1)! : state.focused, ids: rest });
    },
    // Not validated here: callers may select nodes an edit has just added. Rendering drops
    // unknown or hidden IDs.
    selectNodes: (ids: string[], primary: string) =>
      setState({ focused: primary, ids: ids.includes(primary) ? ids : [...ids, primary] }),
  };
}
