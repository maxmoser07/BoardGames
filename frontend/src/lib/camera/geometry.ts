/**
 * Geometrie für die Kamera-Erkennung.
 *
 * Vier vom Benutzer gesetzte Ecken beschreiben das Spielfeld im Kamerabild.
 * Eine projektive Abbildung (Homographie) rechnet daraus Brettkoordinaten in
 * Bildkoordinaten um. Damit funktionieren auch schräge Aufnahmen, solange das
 * Brett einigermaßen rechteckig im Bild liegt.
 */

import type { BoardCorners, BoardLayout, Point } from "./types";

export interface Homography {
  /** Bildpunkt für normierte Brettkoordinaten (0..1, 0..1). */
  pointAt(u: number, v: number): Point;
}

/**
 * Erzeugt die projektive Abbildung vom Einheitsquadrat auf das Viereck.
 *
 * Die Ecken werden in dieser Reihenfolge erwartet:
 * `topLeft -> (0,0)`, `topRight -> (1,0)`, `bottomRight -> (1,1)`,
 * `bottomLeft -> (0,1)`.
 */
export function createHomography(corners: BoardCorners): Homography {
  const { topLeft: p0, topRight: p1, bottomRight: p2, bottomLeft: p3 } = corners;

  const dx1 = p1.x - p2.x;
  const dx2 = p3.x - p2.x;
  const dy1 = p1.y - p2.y;
  const dy2 = p3.y - p2.y;
  const sx = p0.x - p1.x + p2.x - p3.x;
  const sy = p0.y - p1.y + p2.y - p3.y;

  const denominator = dx1 * dy2 - dx2 * dy1;
  if (Math.abs(denominator) < 1e-9) {
    throw new Error("Die vier Brett-Ecken sind entartet (alle auf einer Linie).");
  }

  const g = (sx * dy2 - dx2 * sy) / denominator;
  const h = (dx1 * sy - sx * dy1) / denominator;
  const a = p1.x - p0.x + g * p1.x;
  const b = p3.x - p0.x + h * p3.x;
  const c = p0.x;
  const d = p1.y - p0.y + g * p1.y;
  const e = p3.y - p0.y + h * p3.y;
  const f = p0.y;

  return {
    pointAt(u: number, v: number): Point {
      const w = g * u + h * v + 1;
      return {
        x: (a * u + b * v + c) / w,
        y: (d * u + e * v + f) / w,
      };
    },
  };
}

/** Mittelpunkt einer Zelle in normierten Brettkoordinaten. */
export function cellCenter(layout: BoardLayout, row: number, col: number): Point {
  return {
    x: (col + 0.5) / layout.cols,
    y: (row + 0.5) / layout.rows,
  };
}

/** Ungefähre Breite und Höhe einer Zelle im Bild, gemessen an ihren Kanten. */
export function cellSizeAt(
  transform: Homography,
  layout: BoardLayout,
  row: number,
  col: number,
): { width: number; height: number } {
  const u = (col + 0.5) / layout.cols;
  const v = (row + 0.5) / layout.rows;
  const halfU = 0.5 / layout.cols;
  const halfV = 0.5 / layout.rows;

  const left = transform.pointAt(u - halfU, v);
  const right = transform.pointAt(u + halfU, v);
  const top = transform.pointAt(u, v - halfV);
  const bottom = transform.pointAt(u, v + halfV);

  return {
    width: Math.hypot(right.x - left.x, right.y - left.y),
    height: Math.hypot(bottom.x - top.x, bottom.y - top.y),
  };
}

/** Ecken eines achsenparallelen Rechtecks – praktisch für kalibrierte Kamerabilder. */
export function cornersFromRect(rect: {
  x: number;
  y: number;
  width: number;
  height: number;
}): BoardCorners {
  return {
    topLeft: { x: rect.x, y: rect.y },
    topRight: { x: rect.x + rect.width, y: rect.y },
    bottomRight: { x: rect.x + rect.width, y: rect.y + rect.height },
    bottomLeft: { x: rect.x, y: rect.y + rect.height },
  };
}

/**
 * Skaliert Ecken von einer Vorschau auf die tatsächliche Videoauflösung.
 *
 * Wer die Ecken per Klick in einem per CSS verkleinerten <video> setzt, muss
 * die Koordinaten vor dem Übergeben an die Bibliothek umrechnen.
 */
export function scaleCorners(corners: BoardCorners, scaleX: number, scaleY: number): BoardCorners {
  const scale = (point: Point): Point => ({ x: point.x * scaleX, y: point.y * scaleY });
  return {
    topLeft: scale(corners.topLeft),
    topRight: scale(corners.topRight),
    bottomRight: scale(corners.bottomRight),
    bottomLeft: scale(corners.bottomLeft),
  };
}

/**
 * Spiegelt die vier Ecken für die Sichtrichtung der Kamera.
 *
 * `flipX` tauscht links/rechts, `flipY` oben/unten. Das Bild selbst bleibt
 * unverändert; nur die Zuordnung Bild -> Brett wird gedreht. So kann dieselbe
 * Kalibrierung für eine Kamera auf der gegenüberliegenden Brettseite genutzt
 * werden.
 */
export function flipCorners(corners: BoardCorners, flipX = false, flipY = false): BoardCorners {
  let { topLeft, topRight, bottomRight, bottomLeft } = corners;

  if (flipX) {
    [topLeft, topRight] = [topRight, topLeft];
    [bottomLeft, bottomRight] = [bottomRight, bottomLeft];
  }
  if (flipY) {
    [topLeft, bottomLeft] = [bottomLeft, topLeft];
    [topRight, bottomRight] = [bottomRight, topRight];
  }

  return { topLeft, topRight, bottomRight, bottomLeft };
}
