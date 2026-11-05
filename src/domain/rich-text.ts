/**
 * Inline emphasis inside node titles. Titles stay plain strings: `**bold**`, `*italic*`,
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

export interface TextFormat {
  bold: boolean;
  italic: boolean;
  highlight: HighlightColor | null;
}
export interface TextRun extends TextFormat {
  text: string;
}
/** One formatting change, applied to selected text or to whole node titles. */
export type FormatCommand =
  | { kind: 'bold' }
  | { kind: 'italic' }
  | { kind: 'highlight'; color: HighlightColor }
  | { kind: 'clear' };

export const PLAIN: TextFormat = { bold: false, italic: false, highlight: null };
type FormattedChar = TextFormat & { char: string };
type Token =
  | { kind: 'text'; text: string }
  | { kind: 'bold' | 'italic' }
  | { kind: 'mark'; color: HighlightColor | null; length: number; start: number };

const ESCAPABLE = new Set(['*', '=', '\\']);
const COLORED = new RegExp(`^==\\{(${HIGHLIGHT_COLORS.join('|')})\\}`);

function tokenize(raw: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < raw.length) {
    if (raw[i] === '\\' && ESCAPABLE.has(raw[i + 1])) {
      tokens.push({ kind: 'text', text: raw[i + 1] });
      i += 2;
    } else if (raw.startsWith('**', i)) {
      tokens.push({ kind: 'bold' });
      i += 2;
    } else if (raw[i] === '*') {
      tokens.push({ kind: 'italic' });
      i++;
    } else if (raw.startsWith('==', i)) {
      const colored = COLORED.exec(raw.slice(i, i + 12));
      const length = colored ? colored[0].length : 2;
      const color = (colored?.[1] as HighlightColor | undefined) ?? null;
      tokens.push({ kind: 'mark', color, length, start: i });
      i += length;
    } else {
      tokens.push({ kind: 'text', text: raw[i] });
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
  for (const kind of ['bold', 'italic'] as const) {
    const marks = tokens.flatMap((token, index) => (token.kind === kind ? [index] : []));
    for (let k = 0; k + 1 < marks.length; k += 2)
      if (hasText(marks[k], marks[k + 1])) roles.set(marks[k], 'open').set(marks[k + 1], 'close');
  }
  return roles;
}

function parseChars(raw: string): FormattedChar[] {
  const tokens = tokenize(raw);
  const roles = pairMarkers(tokens);
  const chars: FormattedChar[] = [];
  const format: TextFormat = { ...PLAIN };
  const literal = (text: string) =>
    text.split('').forEach((char) => chars.push({ char, ...format }));
  tokens.forEach((token, index) => {
    const role = roles.get(index);
    if (token.kind === 'text') chars.push({ char: token.text, ...format });
    else if (token.kind === 'mark') {
      if (role === 'open') format.highlight = token.color ?? 'yellow';
      else if (role === 'close') {
        format.highlight = null;
        literal(raw.slice(token.start + 2, token.start + token.length));
      } else literal(raw.slice(token.start, token.start + token.length));
    } else if (role) format[token.kind] = role === 'open';
    else literal(token.kind === 'bold' ? '**' : '*');
  });
  // Offsets are UTF-16 units like DOM selections; joined units restore surrogate pairs.
  return chars;
}

const sameFormat = (a: TextFormat, b: TextFormat) =>
  a.bold === b.bold && a.italic === b.italic && a.highlight === b.highlight;
const charsOf = (runs: TextRun[]): FormattedChar[] =>
  runs.flatMap(({ text, ...format }) => text.split('').map((char) => ({ char, ...format })));
const runsOf = (chars: FormattedChar[]): TextRun[] => {
  const runs: TextRun[] = [];
  for (const { char, ...format } of chars) {
    const last = runs.at(-1);
    if (last && sameFormat(last, format)) last.text += char;
    else runs.push({ text: char, ...format });
  }
  return runs;
};

/** The title split into consecutive runs of the same formatting. */
export function richRuns(raw: string): TextRun[] {
  return runsOf(parseChars(raw));
}

/** The visible title without formatting markers, for labels, search and filenames. */
export function plainTitle(raw: string): string {
  return /[*=\\]/.test(raw)
    ? parseChars(raw)
        .map((char) => char.char)
        .join('')
    : raw;
}

type Piece = { marker: string } | { char: string };

/** Write runs back as a title that reads back as the same runs. */
export function formatRuns(runs: TextRun[]): string {
  const chars = charsOf(runs);
  const pieces: Piece[] = [];
  // Highlights nest around their stretch. Inside one, bold and italic are written as toggles
  // where they change, bold first: at most `***` meets, which always reads as both.
  let i = 0;
  while (i < chars.length) {
    const highlight = chars[i].highlight;
    let end = i;
    while (end < chars.length && chars[end].highlight === highlight) end++;
    if (highlight)
      pieces.push({
        marker: highlight === 'yellow' && chars[i].char !== '{' ? '==' : `=={${highlight}}`,
      });
    const state = { bold: false, italic: false };
    const toggle = (bold: boolean, italic: boolean) => {
      if (bold !== state.bold) pieces.push({ marker: '**' });
      if (italic !== state.italic) pieces.push({ marker: '*' });
      Object.assign(state, { bold, italic });
    };
    for (; i < end; i++) {
      toggle(chars[i].bold, chars[i].italic);
      pieces.push({ char: chars[i].char });
    }
    toggle(false, false);
    if (highlight) pieces.push({ marker: '==' });
  }
  const text = (piece: Piece | undefined) =>
    piece ? ('marker' in piece ? piece.marker : piece.char) : '';
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
    // A single `*` is a marker now, so a literal one is always escaped.
    const escaped =
      char === '*' ||
      (char === '=' && (next === char || previous === char)) ||
      (char === '\\' && ESCAPABLE.has(next));
    out = (escaped ? '\\' : '') + char + out;
  }
  return out;
}

export const runsText = (runs: TextRun[]) => runs.map((run) => run.text).join('');

const words = new Intl.Segmenter(undefined, { granularity: 'word' });

/** The word around a caret, so a command without a selection still has a target. */
export function wordAt(text: string, at: number): [number, number] | null {
  let found: [number, number] | null = null;
  for (const { segment, index, isWordLike } of words.segment(text)) {
    if (!isWordLike) continue;
    const end = index + segment.length;
    if (index <= at && at < end) return [index, end];
    if (end === at) found = [index, end];
  }
  return found;
}

/** Formatting shared by every character in `[from, to)`; `undefined` where it is mixed. */
export function rangeFormat(runs: TextRun[], from: number, to: number) {
  const chars = charsOf(runs).slice(from, to);
  const shared = <K extends keyof TextFormat>(key: K) =>
    chars.length && chars.every((char) => char[key] === chars[0][key]) ? chars[0][key] : undefined;
  return { bold: shared('bold'), italic: shared('italic'), highlight: shared('highlight') };
}
export type RangeFormat = ReturnType<typeof rangeFormat>;

/** Apply `patch` to the visible characters `[from, to)`. */
export function formatRange(
  runs: TextRun[],
  from: number,
  to: number,
  patch: Partial<TextFormat>,
): TextRun[] {
  return runsOf(
    charsOf(runs).map((char, index) =>
      index >= from && index < to ? { ...char, ...patch } : char,
    ),
  );
}

/**
 * What a command changes, given the formatting the target already shares: bold and italic
 * toggle, and choosing the highlight color that is already there takes it off.
 */
export function commandPatch(command: FormatCommand, current: RangeFormat): Partial<TextFormat> {
  if (command.kind === 'bold') return { bold: current.bold !== true };
  if (command.kind === 'italic') return { italic: current.italic !== true };
  if (command.kind === 'clear') return { ...PLAIN };
  return { highlight: current.highlight === command.color ? null : command.color };
}

/** Replace `[from, to)` with plain `text`, taking the formatting of the character before. */
export function replaceRange(runs: TextRun[], from: number, to: number, text: string): TextRun[] {
  const chars = charsOf(runs);
  const { bold, italic, highlight } = chars[from - 1] ?? chars[to] ?? PLAIN;
  const inserted = text.split('').map((char) => ({ char, bold, italic, highlight }));
  return runsOf([...chars.slice(0, from), ...inserted, ...chars.slice(to)]);
}
