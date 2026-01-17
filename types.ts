
export interface Point {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const CANVAS_WIDTH = 128;
export const CANVAS_HEIGHT = 64;

export type PixelArray = Uint8Array; // 0 or 1

export interface ClipboardData {
  w: number;
  h: number;
  data: Uint8Array;
}
