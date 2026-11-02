import { describe, expect, it } from 'vitest';
import { captureScrollPositions, restoreScrollPositions, type ScrollPositionTarget } from './scroll-position';

function scrollTarget(key: string, scrollLeft = 0, scrollTop = 0): ScrollPositionTarget {
  return { dataset: { scrollKey: key }, scrollLeft, scrollTop };
}

describe('scroll position preservation', () => {
  it('restores an availability grid after the view is re-rendered', () => {
    const originalGrid = scrollTarget('availability-range-week-one', 486, 32);
    const positions = captureScrollPositions([originalGrid]);
    const rerenderedGrid = scrollTarget('availability-range-week-one');

    restoreScrollPositions([rerenderedGrid], positions);

    expect(rerenderedGrid.scrollLeft).toBe(486);
    expect(rerenderedGrid.scrollTop).toBe(32);
  });

  it('matches grids by stable key rather than render order', () => {
    const positions = captureScrollPositions([
      scrollTarget('availability-range-first', 120),
      scrollTarget('availability-range-second', 640),
    ]);
    const secondGrid = scrollTarget('availability-range-second');
    const firstGrid = scrollTarget('availability-range-first');

    restoreScrollPositions([secondGrid, firstGrid], positions);

    expect(firstGrid.scrollLeft).toBe(120);
    expect(secondGrid.scrollLeft).toBe(640);
  });
});
