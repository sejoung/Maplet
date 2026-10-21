import { useState } from 'react';
import { deleteNode, moveSibling } from '../domain/commands';
import {
  copySubtree,
  fragmentFromOutline,
  outlineOf,
  pasteFragment,
  type Fragment,
} from '../domain/clipboard';
import type { MindMap } from '../domain/model';
import type { DocumentState } from './useDocument';

/** Branch copy, cut, paste, duplicate and sibling order for the selected node. */
export function useNodeClipboard(doc: DocumentState, report: (reason: unknown) => void) {
  const [clip, setClip] = useState<Fragment | null>(null);
  const insert = (fragment: Fragment, parentId: string, afterId?: string) => {
    let pasted: string[] = [];
    const done = doc.edit((current) => {
      const result = pasteFragment(current, fragment, parentId, () => crypto.randomUUID(), afterId);
      pasted = result.roots;
      return result.map;
    });
    if (done && pasted[0]) doc.setSelected(pasted[0]);
  };
  const copy = (id: string) => {
    try {
      const fragment = copySubtree(doc.map, id);
      setClip(fragment);
      return outlineOf(fragment);
    } catch (reason) {
      report(reason);
      return null;
    }
  };
  const paste = (id: string, text?: string) => {
    // Text that is exactly our last copy keeps its notes, links and styles.
    const fragment =
      text === undefined || (clip && text === outlineOf(clip)) ? clip : fragmentFromOutline(text);
    if (fragment) return insert(fragment, id);
    if (text === undefined)
      void navigator.clipboard
        ?.readText()
        .then((value) => {
          const outline = fragmentFromOutline(value);
          if (outline) insert(outline, id);
        })
        .catch(report);
  };
  return {
    canPaste: Boolean(clip) || Boolean(navigator.clipboard?.readText),
    copy,
    paste: (id: string, text?: string) => {
      try {
        paste(id, text);
      } catch (reason) {
        report(reason);
      }
    },
    cut: (id: string) => {
      const map: MindMap = doc.map;
      const node = map.nodes[id];
      if (node.parentId === null && map.roots.length === 1) return null;
      const text = copy(id);
      if (text === null) return null;
      const fallback = node.parentId ?? map.roots.find((root) => root !== id)!;
      if (doc.edit((current) => deleteNode(current, id))) doc.setSelected(fallback);
      return text;
    },
    duplicate: (id: string) => {
      const parentId = doc.map.nodes[id]?.parentId;
      if (!parentId) return;
      insert(copySubtree(doc.map, id), parentId, id);
    },
    reorder: (id: string, offset: -1 | 1) =>
      doc.edit((current) => moveSibling(current, id, offset)),
  };
}
