/**
 * Inline emphasis inside node titles. Titles stay plain strings: `**bold**`,
 * `==highlight==` (yellow) and `=={green}highlight==`. A backslash before `*`, `=` or `\`
 * keeps that character literal, and unmatched or empty markers stay as typed.
 */
export const HIGHLIGHT_COLORS = ['yellow', 'green', 'blue', 'pink'] as const;
export type HighlightColor = (typeof HIGHLIGHT_COLORS)[number];
/** Pastel fills that keep dark text readable in light and dark themes and in exports. */
export const HIGHLIGHT_FILLS: Record<HighlightColor, string> = {
  yellow: '#fde68a',
  green: '#bbf7d0',
  blue: '#bfdbfe',
  pink: '#fbcfe8',
};
export const HIGHLIGHT_TEXT = '#25352d';

export interface TextRun {
  text: string;
  bold: boolean;
  highlight: HighlightColor | null;
}
type Format = Omit<TextRun, 'text'>;
interface RichChar extends Format {
  char: string;
  /** Where the character sits in the raw title, including its escape. */
  start: number;
}
type Token =
  | { kind: 'text'; text: string; start: number }
  | { kind: 'bold'; start: number }
  | { kind: 'mark'; color: HighlightColor | null; start: number; length: number };

const ESCAPABLE = new Set(['*', '=', '\\']);
const COLORED = new RegExp(`^==\\{(${HIGHLIGHT_COLORS.join('|')})\\}`);

function tokenize(raw: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < raw.length) {
    if (raw[i] === '\\' && ESCAPABLE.has(raw[i + 1])) {
      tokens.push({ kind: 'text', text: raw[i + 1], start: i });
      i += 2;
    } else if (raw.startsWith('**', i)) {
      tokens.push({ kind: 'bold', start: i });
      i += 2;
    } else if (raw.startsWith('==', i)) {
      const colored = COLORED.exec(raw.slice(i, i + 12));
      const length = colored ? colored[0].length : 2;
      tokens.push({
        kind: 'mark',
        color: (colored?.[1] as HighlightColor) ?? null,
        start: i,
        length,
      });
      i += length;
    } else {
      tokens.push({ kind: 'text', text: raw[i], start: i });
      i++;
    }
  }
  return tokens;
}

/** Pair markers; anything left unpaired, or wrapping no text, is shown literally. */
function pairMarkers(tokens: Token[]) {
  const roles = new Map<number, 'open' | 'close'>();
  const hasText = (from: number, to: number) =>
    tokens.slice(from + 1, to).some((token) => token.kind === 'text');
  let open = -1;
  tokens.forEach((token, index) => {
    if (token.kind !== 'mark') return;
    if (open < 0) open = index;
    else if (hasText(open, index)) {
      // A colored marker inside a highlight closes it; its `{color}` part stays text.
      roles.set(open, 'open').set(index, 'close');
      open = -1;
    } else if (token.color === null) open = -1;
    else open = index;
  });
  const bolds = tokens.flatMap((token, index) => (token.kind === 'bold' ? [index] : []));
  for (let k = 0; k + 1 < bolds.length; k += 2) {
    if (hasText(bolds[k], bolds[k + 1])) roles.set(bolds[k], 'open').set(bolds[k + 1], 'close');
  }
  return roles;
}

function parseChars(raw: string): RichChar[] {
  const tokens = tokenize(raw);
  const roles = pairMarkers(tokens);
  const chars: RichChar[] = [];
  let bold = false;
  let highlight: HighlightColor | null = null;
  const literal = (text: string, start: number) =>
    text
      .split('')
      .forEach((char, offset) => chars.push({ char, bold, highlight, start: start + offset }));
  tokens.forEach((token, index) => {
    const role = roles.get(index);
    if (token.kind === 'text')
      chars.push({ char: token.text, bold, highlight, start: token.start });
    else if (token.kind === 'bold') {
      if (role) bold = role === 'open';
      else literal('**', token.start);
    } else if (role === 'open') highlight = token.color ?? 'yellow';
    else if (role === 'close') {
      highlight = null;
      literal(raw.slice(token.start + 2, token.start + token.length), token.start + 2);
    } else literal(raw.slice(token.start, token.start + token.length), token.start);
  });
  // Offsets are UTF-16 units like textarea selections; joined units restore surrogate pairs.
  return chars;
}

const sameFormat = (a: Format, b: Format) => a.bold === b.bold && a.highlight === b.highlight;

/** The title split into consecutive runs of the same formatting. */
export function richRuns(raw: string): TextRun[] {
  const runs: TextRun[] = [];
  for (const { char, bold, highlight } of parseChars(raw)) {
    const last = runs.at(-1);
    if (last && sameFormat(last, { bold, highlight })) last.text += char;
    else runs.push({ text: char, bold, highlight });
  }
  return runs;
}

/** The visible title without formatting markers, for labels, search and filenames. */
export function plainTitle(raw: string): string {
  return /[*=\\]/.test(raw)
    ? parseChars(raw)
        .map((char) => char.char)
        .join('')
    : raw;
}

type Piece = { marker: string } | { char: string; index: number };

/** Write formatted characters back as a title, recording where each character lands. */
function serialize(chars: (Format & { char: string })[]) {
  const pieces: Piece[] = [];
  let i = 0;
  while (i < chars.length) {
    const highlight = chars[i].highlight;
    let end = i;
    while (end < chars.length && chars[end].highlight === highlight) end++;
    if (highlight)
      pieces.push({
        marker: highlight === 'yellow' && chars[i].char !== '{' ? '==' : `=={${highlight}}`,
      });
    while (i < end) {
      const bold = chars[i].bold;
      if (bold) pieces.push({ marker: '**' });
      while (i < end && chars[i].bold === bold) pieces.push({ char: chars[i].char, index: i++ });
      if (bold) pieces.push({ marker: '**' });
    }
    if (highlight) pieces.push({ marker: '==' });
  }
  const text = (piece: Piece | undefined) =>
    piece ? ('marker' in piece ? piece.marker : piece.char) : '';
  const starts: number[] = [];
  const ends: number[] = [];
  // Build from the end so each character knows exactly what follows it.
  let out = '';
  for (let k = pieces.length - 1; k >= 0; k--) {
    const piece = pieces[k];
    if ('marker' in piece) {
      out = piece.marker + out;
      continue;
    }
    const next = out[0] ?? '';
    const previous = text(pieces[k - 1]).at(-1) ?? '';
    const { char } = piece;
    const escaped =
      ((char === '*' || char === '=') && (next === char || previous === char)) ||
      (char === '\\' && ESCAPABLE.has(next));
    out = (escaped ? '\\' : '') + char + out;
    starts[piece.index] = out.length;
    ends[piece.index] = out.length - (escaped ? 2 : 1);
  }
  // Positions were counted from the end; turn them into offsets from the start.
  return {
    raw: out,
    starts: starts.map((fromEnd) => out.length - fromEnd),
    ends: ends.map((fromEnd) => out.length - fromEnd),
  };
}

/** Write runs back as a title that reads back as the same runs. */
export function formatRuns(runs: TextRun[]): string {
  return serialize(
    runs.flatMap(({ text, ...format }) => text.split('').map((char) => ({ char, ...format }))),
  ).raw;
}

export interface RichEdit {
  value: string;
  start: number;
  end: number;
}
type Change = (selected: Format[]) => (format: Format) => Format;

const words = new Intl.Segmenter(undefined, { granularity: 'word' });

/** The word around a caret, so a shortcut without a selection still has a target. */
function wordAt(text: string, at: number): [number, number] | null {
  let found: [number, number] | null = null;
  for (const { segment, index, isWordLike } of words.segment(text)) {
    if (!isWordLike) continue;
    const end = index + segment.length;
    if (index <= at && at < end) return [index, end];
    if (end === at) found = [index, end];
  }
  return found;
}

function applyFormat(raw: string, start: number, end: number, change: Change): RichEdit | null {
  const chars = parseChars(raw);
  const plainAt = (offset: number) => chars.filter((char) => char.start < offset).length;
  let from = plainAt(Math.min(start, end));
  let to = plainAt(Math.max(start, end));
  if (from === to) {
    const word = wordAt(chars.map((char) => char.char).join(''), from);
    if (!word) return null;
    [from, to] = word;
  }
  const update = change(chars.slice(from, to));
  const next = chars.map((char, index) =>
    index >= from && index < to ? { ...char, ...update(char) } : char,
  );
  const written = serialize(next);
  return { value: written.raw, start: written.starts[from], end: written.ends[to - 1] };
}

/** Make the selection bold, or plain again when it is already all bold. */
export const toggleBold = (raw: string, start: number, end: number) =>
  applyFormat(raw, start, end, (selected) => {
    const bold = !selected.every((format) => format.bold);
    return (format) => ({ ...format, bold });
  });

/** Step the selection through the highlight colors and then back to none. */
export const cycleHighlight = (raw: string, start: number, end: number) =>
  applyFormat(raw, start, end, (selected) => {
    const colors = new Set(selected.map((format) => format.highlight));
    const [current] = colors;
    const index = colors.size === 1 && current ? HIGHLIGHT_COLORS.indexOf(current) : -1;
    const highlight = index < 0 ? HIGHLIGHT_COLORS[0] : (HIGHLIGHT_COLORS[index + 1] ?? null);
    return (format) => ({ ...format, highlight });
  });

/** Remove bold and highlights from the selection. */
export const clearFormatting = (raw: string, start: number, end: number) =>
  applyFormat(raw, start, end, () => () => ({ bold: false, highlight: null }));
