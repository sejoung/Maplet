import { createElement, type ReactNode } from 'react';
import type { MeasuredRun } from '../../engine/layout/node-measure';
import { richWrappers } from './rich-markup';

function RichRun({ run }: { run: MeasuredRun }) {
  return richWrappers(run).reduce<ReactNode>(
    (inner, { tag, className, highlight, style }) =>
      createElement(tag, { className, 'data-highlight': highlight, style }, inner),
    run.text,
  );
}

/** One wrapped title line with its inline bold, italic and highlighter runs. */
export function RichLine({ runs }: { runs: MeasuredRun[] }) {
  if (!runs.length) return <span> </span>;
  return (
    <span>
      {runs.map((run, index) =>
        // A highlighted run is its own mark; others get a span to sit in.
        run.highlight ? (
          <RichRun key={index} run={run} />
        ) : (
          <span key={index}>
            <RichRun run={run} />
          </span>
        ),
      )}
    </span>
  );
}
