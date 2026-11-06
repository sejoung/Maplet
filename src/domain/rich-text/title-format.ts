import type { JsonObject, MindMap, MindNode } from '../model';
import {
  commandPatch,
  formatRange,
  formatRuns,
  rangeFormat,
  richRuns,
  runsText,
  type FormatCommand,
  type TextRun,
} from './rich-text';
import { legacyEmphasis } from '../style/typography';
import { editNodes } from '../node-edits';

/** `style` without the whole-node emphasis of older documents (see `legacyEmphasis`). */
export function withoutLegacyEmphasis(style: JsonObject): JsonObject {
  if (!('fontWeight' in style) && !('fontStyle' in style)) return style;
  return Object.fromEntries(
    Object.entries(style).filter(([key]) => key !== 'fontWeight' && key !== 'fontStyle'),
  );
}

/** The title's runs with any whole-node emphasis applied to every character. */
export function effectiveRuns(node: Pick<MindNode, 'title' | 'style'>): TextRun[] {
  const legacy = legacyEmphasis(node.style);
  const runs = richRuns(node.title);
  if (!legacy.bold && !legacy.italic) return runs;
  return runs.map((run) => ({
    ...run,
    bold: run.bold || legacy.bold,
    italic: run.italic || legacy.italic,
  }));
}

/** The title with whole-node emphasis written into it, as the inline editor shows it. */
export const effectiveTitle = (node: Pick<MindNode, 'title' | 'style'>) =>
  formatRuns(effectiveRuns(node));

/**
 * Apply a command to the whole title of every node in `ids` as one change. Bold and
 * italic turn on unless every node already has them throughout; a highlight color comes
 * off only when every node is entirely that color.
 */
export function formatNodeTitles(map: MindMap, ids: readonly string[], command: FormatCommand) {
  const targets = ids.filter((id) => Object.hasOwn(map.nodes, id));
  const all = targets.map((id) => effectiveRuns(map.nodes[id]));
  const joined = all.flat();
  const patch = commandPatch(command, rangeFormat(joined, 0, runsText(joined).length));
  const edits = editNodes(map);
  targets.forEach((id, index) => {
    const runs = formatRange(all[index], 0, runsText(all[index]).length, patch);
    edits.set(id, {
      title: formatRuns(runs),
      style: withoutLegacyEmphasis(map.nodes[id].style),
    });
  });
  return edits.done();
}

/** Formatting the whole titles of `ids` share, as the toolbar shows it. */
export function nodesFormat(map: MindMap, ids: readonly string[]) {
  const runs = ids
    .filter((id) => Object.hasOwn(map.nodes, id))
    .flatMap((id) => effectiveRuns(map.nodes[id]));
  return rangeFormat(runs, 0, runsText(runs).length);
}
