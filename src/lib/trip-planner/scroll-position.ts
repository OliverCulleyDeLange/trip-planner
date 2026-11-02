export interface ScrollPositionTarget {
  dataset: { scrollKey?: string };
  scrollLeft: number;
  scrollTop: number;
}

export interface ScrollPosition {
  left: number;
  top: number;
}

export function captureScrollPositions(targets: Iterable<ScrollPositionTarget>): Map<string, ScrollPosition> {
  const positions = new Map<string, ScrollPosition>();
  for (const target of targets) {
    const key = target.dataset.scrollKey;
    if (key) positions.set(key, { left: target.scrollLeft, top: target.scrollTop });
  }
  return positions;
}

export function restoreScrollPositions(targets: Iterable<ScrollPositionTarget>, positions: ReadonlyMap<string, ScrollPosition>): void {
  for (const target of targets) {
    const key = target.dataset.scrollKey;
    const position = key ? positions.get(key) : undefined;
    if (!position) continue;
    target.scrollLeft = position.left;
    target.scrollTop = position.top;
  }
}
