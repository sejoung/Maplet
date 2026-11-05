import { HIGHLIGHT_FILLS, HIGHLIGHT_TEXT } from '../domain/rich-text';
import type { MeasuredRun } from '../engine/node-measure';

/** One wrapped title line with its inline bold and highlighter runs. */
export function RichLine({ runs }: { runs: MeasuredRun[] }) {
  if (!runs.length) return <span>{' '}</span>;
  return (
    <span>
      {runs.map((run, index) => {
        const text = run.bold ? <strong className="rich-bold">{run.text}</strong> : run.text;
        return run.highlight ? (
          <mark
            key={index}
            className="rich-mark"
            data-highlight={run.highlight}
            style={{ background: HIGHLIGHT_FILLS[run.highlight], color: HIGHLIGHT_TEXT }}
          >
            {text}
          </mark>
        ) : (
          <span key={index}>{text}</span>
        );
      })}
    </span>
  );
}
