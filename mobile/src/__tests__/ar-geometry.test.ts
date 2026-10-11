import { describe, expect, test } from '@jest/globals';

import { boxToView } from '@/lib/ar-geometry';

describe('boxToView', () => {
  test('same shape: fractions map straight onto the view', () => {
    expect(boxToView([0.25, 0.5, 0.5, 0.25], 0.75, { width: 300, height: 400 }, false)).toEqual({
      left: 75,
      top: 200,
      width: 150,
      height: 100,
    });
  });

  test('a 3:4 photo on a taller phone screen is cropped at the sides', () => {
    // 390x844 view; the photo is scaled to 633x844 and centred, so 121.5 px are cut off each side.
    const rect = boxToView([0.5, 0, 0.1, 0.1], 0.75, { width: 390, height: 844 }, false);
    expect(rect.left).toBeCloseTo(-121.5 + 0.5 * 633);
    expect(rect.width).toBeCloseTo(63.3);
    expect(rect.top).toBe(0);
  });

  test('a wide photo on a tall view is cropped top and bottom', () => {
    const rect = boxToView([0, 0, 1, 1], 2, { width: 200, height: 50 }, false);
    expect(rect).toEqual({ left: 0, top: -25, width: 200, height: 100 });
  });

  test('front camera: the preview is mirrored, so the box is flipped', () => {
    expect(boxToView([0.1, 0, 0.2, 0.2], 1, { width: 100, height: 100 }, true).left).toBeCloseTo(70);
  });
});
