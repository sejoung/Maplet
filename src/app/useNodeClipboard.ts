import { useState } from 'react';
import { deleteNodes, moveSibling } from '../domain/commands';
import {
  copyBranches,
  fragmentFromOutline,
  outlineOf,
  pasteFragment,
  type Fragment,
} from '../domain/clipboard';
import { canDeleteNodes } from '../domain/selection';
import type { DocumentState } from './useDocument';

/** Branch copy, cut, paste, duplicate and sibling order for the selected nodes. */
export function useNodeClipboard(doc: DocumentState, report: (reason: unknown) => void) {
  const [clip, setClip] = useState<Fragment | null>(null);
  const insert = (fragment: Fragment, parentId: string, afterId?: string) => {
    let pasted: string[] = [];
    const done = doc.edit((current) => {
      const result = pasteFragment(current, fragment, parentId, () => crypto.randomUUID(), afterId);
      pasted = result.roots;
      return result.map;
    });
    if (done && pasted.length) doc.selectNodes(pasted, pasted[0]);
  };
  const copy = (id: string) => {
    try {
      const fragment = copyBranches(doc.map, doc.targets(id));
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
      const map = doc.map;
      const ids = doc.targets(id);
      if (!canDeleteNodes(map, ids)) return null;
      const text = copy(id);
      if (text === null) return null;
      const fallback = map.nodes[ids[0]].parentId ?? map.roots.find((root) => !ids.includes(root))!;
      if (doc.edit((current) => deleteNodes(current, ids))) doc.setSelected(fallback);
      return text;
    },
    duplicate: (id: string) => {
      const ids = doc.targets(id).filter((key) => doc.map.nodes[key]?.parentId);
      if (!ids.length) return;
      const copies: string[] = [];
      const done = doc.edit((current) =>
        ids.reduce((map, key) => {
          const result = pasteFragment(
            map,
            copyBranches(current, [key]),
            current.nodes[key].parentId!,
            () => crypto.randomUUID(),
            key,
          );
          copies.push(...result.roots);
          return result.map;
        }, current),
      );
      if (done) doc.selectNodes(copies, copies.at(-1)!);
    },
    reorder: (id: string, offset: -1 | 1) => {
      if (doc.selection.length === 1) doc.edit((current) => moveSibling(current, id, offset));
    },
  };
}
