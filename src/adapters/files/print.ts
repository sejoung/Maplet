const escapeText = (text: string) =>
  text.replace(/[&<>]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[char]!);

/**
 * Print an SVG drawing on its own page through a hidden frame, so the browser's print dialog
 * (which also saves PDFs) shows only the map. `title` becomes the suggested PDF name.
 */
export function printSvg(svg: string, width: number, height: number, title: string): void {
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.tabIndex = -1;
  Object.assign(frame.style, {
    position: 'fixed',
    width: '0',
    height: '0',
    border: '0',
    visibility: 'hidden',
  });
  const landscape = width > height;
  frame.srcdoc = [
    '<!doctype html><html><head><meta charset="utf-8">',
    `<title>${escapeText(title)}</title>`,
    '<style>',
    `@page { size: ${landscape ? 'landscape' : 'portrait'}; margin: 12mm; }`,
    'html, body { margin: 0; background: #fff; }',
    'svg { display: block; width: 100%; height: auto; max-height: 100vh; }',
    '</style></head><body>',
    svg,
    '</body></html>',
  ].join('');
  const cleanup = () => frame.remove();
  frame.addEventListener(
    'load',
    () => {
      const view = frame.contentWindow!;
      view.addEventListener('afterprint', cleanup, { once: true });
      // Browsers without afterprint still release the frame.
      window.setTimeout(cleanup, 60_000);
      view.focus();
      view.print();
    },
    { once: true },
  );
  document.body.append(frame);
}
