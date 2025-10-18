import type { Box } from '../types';

export interface OverlayGeometry {
  matrix: DOMMatrix;
  inverse: DOMMatrix;
}

export function createGeometry(matrix: DOMMatrix): OverlayGeometry {
  return {
    matrix,
    inverse: matrix.inverse(),
  };
}

export function transformBoxToScreen(box: Box, geometry: OverlayGeometry): Box {
  const topLeft = geometry.matrix.transformPoint(new DOMPoint(box.x, box.y));
  const bottomRight = geometry.matrix.transformPoint(new DOMPoint(box.x + box.w, box.y + box.h));
  const x = Math.min(topLeft.x, bottomRight.x);
  const y = Math.min(topLeft.y, bottomRight.y);
  const w = Math.abs(bottomRight.x - topLeft.x);
  const h = Math.abs(bottomRight.y - topLeft.y);
  return { x, y, w, h };
}

export function transformDeltaToPage(dx: number, dy: number, geometry: OverlayGeometry): { x: number; y: number } {
  const origin = geometry.inverse.transformPoint(new DOMPoint(0, 0));
  const point = geometry.inverse.transformPoint(new DOMPoint(dx, dy));
  return { x: point.x - origin.x, y: point.y - origin.y };
}
