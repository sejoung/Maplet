export interface InlineLayoutCase {
  id: string;
  style: { fontFamily: string; fontSize: number; textAlign: string; width?: number };
}

interface MatrixInput {
  cases: InlineLayoutCase[];
  title: string;
}

// This rendering matrix uses the real app's DOM and handlers. Dedicated keyboard E2Es
// cover trusted key input; keeping the matrix in the browser avoids per-assertion RPCs.
export async function inspectInlineLayoutMatrix({ cases, title }: MatrixInput) {
  const frame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  const geometry = (node: HTMLElement) => {
    const content = node.querySelector<HTMLElement>('.node-text, .inline-node-editor')!;
    const box = node.getBoundingClientRect(),
      text = content.getBoundingClientRect();
    const style = getComputedStyle(content);
    return {
      x: box.x,
      y: box.y,
      width: box.width,
      height: box.height,
      textX: text.x,
      textY: text.y,
      textWidth: text.width,
      textHeight: text.height,
      font: style.fontFamily,
      size: style.fontSize,
      lineHeight: style.lineHeight,
      align: style.textAlign,
    };
  };
  const key = (element: HTMLElement, key: string) =>
    element.dispatchEvent(
      new KeyboardEvent('keydown', { key, code: key, bubbles: true, cancelable: true }),
    );
  const failures: unknown[] = [];
  for (const { id, style } of cases) {
    const node = document.querySelector<HTMLElement>(`[data-node-id="${id}"]`)!;
    node.focus();
    // Selection may pan an offscreen node. Wait for React and the resulting frame.
    await frame();
    await frame();
    const before = geometry(node);
    if (
      node.getAttribute('aria-selected') !== 'true' ||
      before.align !== style.textAlign ||
      before.size !== `${style.fontSize}px`
    )
      failures.push({ id, style, before, reason: 'selection or typography' });
    key(node, 'F2');
    await frame();
    const input = node.querySelector<HTMLTextAreaElement>('.inline-node-editor');
    if (!input) {
      failures.push({ id, style, reason: 'editor did not open' });
      continue;
    }
    if (document.activeElement !== input || input.value !== title)
      failures.push({ id, style, reason: 'editor focus or title' });
    const during = geometry(node);
    if (JSON.stringify(before) !== JSON.stringify(during))
      failures.push({ id, style, before, during });
    const probe = input.cloneNode() as HTMLTextAreaElement;
    probe.value = input.value;
    probe.rows = 1;
    Object.assign(probe.style, {
      position: 'absolute',
      visibility: 'hidden',
      width: `${input.clientWidth}px`,
      height: '0px',
    });
    input.parentElement!.append(probe);
    const nativeHeight = {
      actual: probe.scrollHeight,
      expected: input.clientHeight,
      horizontalOverflow: input.scrollWidth > input.clientWidth,
    };
    probe.remove();
    if (nativeHeight.actual !== nativeHeight.expected || nativeHeight.horizontalOverflow)
      failures.push({ id, style, nativeHeight });
    key(input, 'Escape');
    await frame();
    if (node.querySelector('.inline-node-editor'))
      failures.push({ id, style, reason: 'editor did not close' });
    const after = geometry(node);
    if (JSON.stringify(before) !== JSON.stringify(after))
      failures.push({ id, style, before, after });
  }
  return failures;
}
