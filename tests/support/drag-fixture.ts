export function branchSpacingSource(intrusion = false, initialOverlap = false) {
  const node = (id: string, x: number, y: number, ideas = {}) => ({
    id,
    title: id,
    attr: { style: { width: 100 }, 'maplet:position': { x, y } },
    ideas,
  });
  return JSON.stringify(
    node('root', 80, 80, {
      1: node('a', 280, 80, { 1: node('child', intrusion ? 680 : 480, 80) }),
      2: node('b', 480, intrusion ? (initialOverlap ? 80 : 160) : 240, {
        1: node('bChild', 680, intrusion ? 400 : 240),
      }),
    }),
  );
}
