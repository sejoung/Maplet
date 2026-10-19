import type { MindNode } from '../domain/model';
import { characterWidth, nodeTypography } from '../domain/typography';
import { MIN_NODE_HEIGHT, MIN_NODE_WIDTH, sizeValue } from '../domain/node-size';

export function measureNode(node: MindNode) {
  const typography = nodeTypography(node.style);
  const width = sizeValue(node.style.width, MIN_NODE_WIDTH);
  const contentWidth = (width ?? 236) - 38;
  const lines: string[] = [];
  let line = '';
  let used = 0;
  for (const char of node.title) {
    const advance = characterWidth(char, typography);
    if (char === '\n' || used + advance > contentWidth) {
      lines.push(line);
      line = '';
      used = 0;
    }
    if (char !== '\n') {
      line += char;
      used += advance;
    }
  }
  if (line || !lines.length || node.title.endsWith('\n')) lines.push(line);
  return {
    width:
      width ??
      Math.max(
        156,
        Math.ceil(
          Math.max(
            ...lines.map((text) =>
              [...text].reduce((sum, char) => sum + characterWidth(char, typography), 0),
            ),
          ) + 38,
        ),
      ),
    height: Math.max(
      MIN_NODE_HEIGHT,
      sizeValue(node.style.height, MIN_NODE_HEIGHT) ?? 0,
      lines.length * typography.lineHeight + 30,
    ),
    lines,
  };
}
