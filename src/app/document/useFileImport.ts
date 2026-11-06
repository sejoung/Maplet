import { useRef } from 'react';
import { openMapFile } from '../../adapters/formats';
import { readMapFile } from '../../adapters/files/files';
import { autoArrange } from '../../engine/layout/auto-arrange';
import type { TextMeasurer } from '../../engine/layout/node-measure';
import type { MindMap } from '../../domain/model';

interface Options {
  /** May ask the user first; resolves false when they keep the current map. */
  allowReplace(): boolean | Promise<boolean>;
  measure: TextMeasurer;
  open(map: MindMap, name: string): void;
  report(reason: unknown): void;
}

/** Open a local map file; only the latest of overlapping imports takes effect. */
export function useFileImport({ allowReplace, measure, open, report }: Options) {
  const generation = useRef(0);
  return async (file: File) => {
    const started = ++generation.current;
    const latest = () => started === generation.current;
    try {
      const opened = openMapFile(await readMapFile(file), file.name);
      // Outlines arrive without a layout; balance their branches like Auto arrange.
      const next = opened.needsLayout ? autoArrange(opened.map, measure) : opened.map;
      if (!latest() || !(await allowReplace()) || !latest()) return;
      open(next, file.name);
    } catch (reason) {
      if (latest()) report(reason);
    }
  };
}
