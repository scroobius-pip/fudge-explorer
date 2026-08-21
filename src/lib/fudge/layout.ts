import * as THREE from "three";
import type { Capture } from "./types";

export type Slot = {
  id: number;
  position: [number, number, number];
  size: [number, number];
  layer: 0 | 1;
  rank: number;
};

export const VIEW_DEPTH_STEP = 9;
export const MASONRY_GAP = 0.09;

export type LayoutBounds = {
  cx: number;
  cy: number;
  cz: number;
  halfW: number;
  halfH: number;
};

export function viewPlaneZ(depth: number) {
  return -Math.max(0, depth) * VIEW_DEPTH_STEP;
}

type Cell = {
  id: number;
  col: number;
  x: number;
  y: number;
  width: number;
  height: number;
};

function columnCount(n: number) {
  if (n <= 2) return n;
  if (n <= 5) return 3;
  if (n <= 10) return 5;
  if (n <= 18) return 7;
  if (n <= 32) return 9;
  if (n <= 52) return 11;
  if (n <= 100) return 13;
  if (n <= 180) return 17;
  if (n <= 320) return 21;
  return 25;
}

function masonryCells(
  items: Capture[],
  cols: number,
  width: number,
  gapX: number,
  gapY: number,
): Cell[] {
  const colCount = Math.max(1, cols);
  const heights = Array.from({ length: colCount }, () => 0);
  const cells: Cell[] = [];

  for (const item of items) {
    let col = 0;
    for (let c = 1; c < colCount; c++) {
      if ((heights[c] ?? 0) < (heights[col] ?? 0)) col = c;
    }
    const aspect = Math.max(0.42, Math.min(4.6, item.aspect || 1.45));
    const height = width / aspect;
    cells.push({
      id: item.id,
      col,
      x: col * (width + gapX),
      y: -(heights[col] ?? 0) - height / 2,
      width,
      height,
    });
    heights[col] = (heights[col] ?? 0) + height + gapY;
  }

  const totalW = colCount * width + Math.max(0, colCount - 1) * gapX;
  const totalH = Math.max(0, ...heights) - gapY;
  const ox = totalW / 2 - width / 2;
  const oy = totalH / 2;

  return cells.map((cell) => ({
    ...cell,
    x: cell.x - ox,
    y: cell.y + oy,
  }));
}

function packMasonryWall(items: Capture[], depth: number): Slot[] {
  const cols = columnCount(items.length);
  const width = cols >= 11 ? 1.08 : cols >= 7 ? 1.16 : 1.34;
  const cells = masonryCells(items, cols, width, MASONRY_GAP, MASONRY_GAP);
  const z = viewPlaneZ(depth);

  return cells.map((cell, index) => ({
    id: cell.id,
    position: [cell.x, cell.y, z],
    size: [cell.width, cell.height],
    layer: 0 as const,
    rank: index,
  }));
}

export function slotToward(
  slots: Slot[],
  fromId: number | null,
  dirX: number,
  dirY: number,
): number | null {
  if (slots.length === 0) return null;
  const center =
    (fromId != null && slots.find((slot) => slot.id === fromId)) ||
    slots.reduce((best, slot) => {
      const d = slot.position[0] ** 2 + slot.position[1] ** 2;
      const bd = best.position[0] ** 2 + best.position[1] ** 2;
      return d < bd ? slot : best;
    });
  if (fromId == null || !slots.some((slot) => slot.id === fromId))
    return center.id;

  let best: Slot | null = null;
  let bestScore = Infinity;
  for (const slot of slots) {
    if (slot.id === center.id) continue;
    const dx = slot.position[0] - center.position[0];
    const dy = slot.position[1] - center.position[1];
    const along = dx * dirX + dy * dirY;
    if (along < 0.05) continue;
    const across = Math.abs(dx * dirY - dy * dirX);
    const score = along + across * 2.6;
    if (score < bestScore) {
      bestScore = score;
      best = slot;
    }
  }
  return best?.id ?? null;
}

export function denseLayout(captures: Capture[], depth = 0): Slot[] {
  if (captures.length === 0) return [];
  return packMasonryWall(captures, depth);
}

export function layoutBounds(slots: Slot[]): LayoutBounds {
  if (slots.length === 0) {
    return { cx: 0, cy: 0, cz: 0, halfW: 4, halfH: 2.4 };
  }
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  let z = 0;
  for (const slot of slots) {
    const [x, y, zz] = slot.position;
    const [w, h] = slot.size;
    minX = Math.min(minX, x - w / 2);
    maxX = Math.max(maxX, x + w / 2);
    minY = Math.min(minY, y - h / 2);
    maxY = Math.max(maxY, y + h / 2);
    z += zz;
  }
  return {
    cx: (minX + maxX) / 2,
    cy: (minY + maxY) / 2,
    cz: z / slots.length,
    halfW: Math.max(1.2, (maxX - minX) / 2),
    halfH: Math.max(0.8, (maxY - minY) / 2),
  };
}

export function facingQuaternion(
  _position?: [number, number, number],
): THREE.Quaternion {
  return new THREE.Quaternion();
}
