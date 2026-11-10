/**
 * Automatische Feinkorrektur der Brettkalibrierung.
 *
 * Die vier von Hand gesetzten Ecken sind selten pixelgenau. Wer sie auf den
 * Rand der Löcher statt auf die Zellgrenzen zieht, verschiebt alle Probepunkte
 * um einen Bruchteil einer Zelle – der Detektor liest dann teilweise den roten
 * Brettkunststoff statt des Steins.
 *
 * Diese Datei sucht deshalb für jede Zelle den tatsächlichen Lochmittelpunkt
 * im Kamerabild und passt daraus eine neue Homographie an. Das Ergebnis sind
 * Ecken, die auf den Zellgrenzen des Rasters liegen. Grundlage für die
 * Farberkennung und für ein deckungsgleiches Overlay.
 */

import { cellCenter, cellSizeAt, createHomography, type Homography } from "./geometry.ts";
import type { BoardCorners, BoardLayout, PixelSource, Point, Rgb } from "./types.ts";

export interface RefineOptions {
  /** Suchfenster um die nominelle Zellmitte, als Anteil der kürzeren Zellkante. */
  windowRadius?: number;
  /** Radius der Farbprobe in der Zellmitte, als Anteil der kürzeren Zellkante. */
  sampleRadius?: number;
  /** Mindest-Farbabstand zwischen Loch und Brettkunststoff. */
  minPlasticDistance?: number;
  /** So viele sicher gefundene Löcher braucht eine Neuausrichtung. */
  minInliers?: number;
}

interface Settings {
  windowRadius: number;
  sampleRadius: number;
  minPlasticDistance: number;
  minInliers: number;
}

const DEFAULT_SETTINGS: Settings = {
  windowRadius: 0.52,
  sampleRadius: 0.1,
  minPlasticDistance: 22,
  minInliers: 12,
};

const DEFAULT_LAYOUT: BoardLayout = { rows: 6, cols: 7 };

interface PointPair {
  /** Normierte Brettkoordinate. */
  u: number;
  v: number;
  /** Gefundener Bildpunkt. */
  x: number;
  y: number;
}

interface Hole {
  center: Point;
  area: number;
  color: Rgb;
}

interface HomographyFit {
  pointAt(u: number, v: number): Point;
}

function colorDistance(a: Rgb, b: Rgb): number {
  return Math.hypot(a.r - b.r, a.g - b.g, a.b - b.b);
}

function pointDistance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}

/**
 * Richtet die vier Ecken am tatsächlichen Lochraster des Bildes aus.
 *
 * Liefert die korrigierten Ecken oder `null`, wenn das Bild keine sichere
 * Ausrichtung zulässt (z. B. unscharf, abgedeckt oder falsches Brett). In dem
 * Fall sollten die vom Benutzer gesetzten Ecken unverändert bleiben.
 */
export function refineBoardCorners(
  source: PixelSource,
  corners: BoardCorners,
  layout: BoardLayout = DEFAULT_LAYOUT,
  options: RefineOptions = {},
): BoardCorners | null {
  if (source.width <= 0 || source.height <= 0) return null;

  const settings: Settings = { ...DEFAULT_SETTINGS, ...options };

  let transform: Homography;
  try {
    transform = createHomography(corners);
  } catch {
    return null;
  }

  const plastic = estimateBoardColor(source, transform);
  if (plastic === null) return null;

  const matches: PointPair[] = [];
  for (let row = 0; row < layout.rows; row += 1) {
    for (let col = 0; col < layout.cols; col += 1) {
      const center = cellCenter(layout, row, col);
      const nominal = transform.pointAt(center.x, center.y);
      const size = cellSizeAt(transform, layout, row, col);
      const cell = Math.min(size.width, size.height);
      if (!Number.isFinite(cell) || cell < 3) continue;

      const hole = locateHole(source, nominal, cell, plastic, settings);
      if (hole === null) continue;
      if (colorDistance(hole.color, plastic) < settings.minPlasticDistance) continue;

      matches.push({ u: center.x, v: center.y, x: hole.center.x, y: hole.center.y });
    }
  }

  if (matches.length < settings.minInliers) return null;

  const fit = robustFit(matches);
  if (fit === null) return null;

  const refined: BoardCorners = {
    topLeft: fit.pointAt(0, 0),
    topRight: fit.pointAt(1, 0),
    bottomRight: fit.pointAt(1, 1),
    bottomLeft: fit.pointAt(0, 1),
  };

  if (!isPlausible(corners, refined, transform, layout)) return null;
  return refined;
}

/**
 * Brettkunststoff über den Median vieler Proben schätzen.
 *
 * Kunststoff macht den größten Teil des Bretts aus, deshalb ist der Median
 * robuster als ein einzelner Messpunkt – auch wenn bereits Steine liegen.
 */
function estimateBoardColor(source: PixelSource, transform: Homography): Rgb | null {
  const grid = 24;
  const radius = Math.max(1, Math.min(source.width, source.height) * 0.004);
  const samples: Rgb[] = [];

  for (let row = 0; row < grid; row += 1) {
    const v = 0.15 + (0.7 * (row + 0.5)) / grid;
    for (let col = 0; col < grid; col += 1) {
      const u = 0.15 + (0.7 * (col + 0.5)) / grid;
      const point = transform.pointAt(u, v);
      if (point.x < 0 || point.y < 0 || point.x >= source.width || point.y >= source.height) {
        continue;
      }
      samples.push(source.averageColor(point.x, point.y, radius));
    }
  }

  if (samples.length < 16) return null;

  return {
    r: median(samples.map((sample) => sample.r)),
    g: median(samples.map((sample) => sample.g)),
    b: median(samples.map((sample) => sample.b)),
  };
}

/**
 * Lochmittelpunkt rund um die nominelle Zellmitte suchen.
 *
 * Ein Loch (bzw. ein Stein darin) hebt sich farblich vom Kunststoff ab und
 * bildet einen zusammenhängenden Fleck. Der Fleck wird geflutet und sein
 * Schwerpunkt bestimmt – so spielt es keine Rolle, ob die Zelle leer, gelb,
 * grün oder rot ist.
 */
function locateHole(
  source: PixelSource,
  nominal: Point,
  cell: number,
  plastic: Rgb,
  settings: Settings,
): Hole | null {
  const sampleRadius = Math.max(1, settings.sampleRadius * cell);
  const expectedArea = Math.PI * (cell * 0.36) ** 2;

  const seeds: Point[] = [nominal];
  for (let index = 0; index < 8; index += 1) {
    const angle = (index / 8) * Math.PI * 2;
    seeds.push({
      x: nominal.x + Math.cos(angle) * cell * 0.22,
      y: nominal.y + Math.sin(angle) * cell * 0.22,
    });
  }

  let best: Hole | null = null;
  let bestScore = Number.POSITIVE_INFINITY;

  for (let index = 0; index < seeds.length; index += 1) {
    const seed = seeds[index];
    const reference = source.averageColor(seed.x, seed.y, sampleRadius);
    if (colorDistance(reference, plastic) < settings.minPlasticDistance) continue;

    const region = fillHole(source, seed, cell * settings.windowRadius, reference, plastic);
    if (region === null) continue;

    // Ein Loch ist ungefähr kreisförmig. Zu große oder zu kleine Flächen
    // stammen von Rahmenlinien, Hintergrund oder unscharfen Kanten.
    if (region.area < expectedArea * 0.25 || region.area > expectedArea * 2.4) continue;

    const score =
      pointDistance(region.center, nominal) + Math.abs(region.area - expectedArea) / expectedArea;
    if (score < bestScore) {
      bestScore = score;
      best = { center: region.center, area: region.area, color: reference };
    }

    // Passt bereits der nominelle Punkt, sind die Alternativen nicht nötig.
    if (index === 0) break;
  }

  return best;
}

/**
 * Zusammenhängenden Fleck um den Startpunkt fluten und dessen Schwerpunkt
 * zurückgeben. Pixel zählen als "Loch", wenn ihre Farbe näher an der
 * Lochfarbe als am Kunststoff liegt.
 */
function fillHole(
  source: PixelSource,
  seed: Point,
  radius: number,
  reference: Rgb,
  plastic: Rgb,
): { center: Point; area: number } | null {
  const minX = Math.max(0, Math.floor(seed.x - radius));
  const maxX = Math.min(source.width - 1, Math.ceil(seed.x + radius));
  const minY = Math.max(0, Math.floor(seed.y - radius));
  const maxY = Math.min(source.height - 1, Math.ceil(seed.y + radius));
  const width = maxX - minX + 1;
  const height = maxY - minY + 1;
  if (width < 2 || height < 2) return null;

  const radiusSquared = radius * radius;
  const mask = new Uint8Array(width * height);
  let seedIndex = -1;
  let seedDistance = Number.POSITIVE_INFINITY;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const px = minX + x;
      const py = minY + y;
      const dx = px - seed.x;
      const dy = py - seed.y;
      const distanceSquared = dx * dx + dy * dy;
      if (distanceSquared > radiusSquared) continue;

      const color = source.averageColor(px, py, 0);
      if (colorDistance(color, reference) >= colorDistance(color, plastic)) continue;

      mask[y * width + x] = 1;
      if (distanceSquared < seedDistance) {
        seedDistance = distanceSquared;
        seedIndex = y * width + x;
      }
    }
  }

  if (seedIndex < 0) return null;

  const visited = new Uint8Array(width * height);
  const stack: number[] = [seedIndex];
  visited[seedIndex] = 1;
  let count = 0;
  let sumX = 0;
  let sumY = 0;

  const visit = (index: number): void => {
    if (mask[index] === 1 && visited[index] === 0) {
      visited[index] = 1;
      stack.push(index);
    }
  };

  while (stack.length > 0) {
    const index = stack.pop() as number;
    const x = index % width;
    const y = (index - x) / width;
    count += 1;
    sumX += minX + x;
    sumY += minY + y;

    if (x > 0) visit(index - 1);
    if (x + 1 < width) visit(index + 1);
    if (y > 0) visit(index - width);
    if (y + 1 < height) visit(index + width);
  }

  if (count === 0) return null;
  return { center: { x: sumX / count, y: sumY / count }, area: count };
}

/** Homographie an alle gefundenen Lochmitten anpassen, Ausreißer verwerfen. */
function robustFit(points: PointPair[]): HomographyFit | null {
  let inliers = points;
  const initialFit = fitHomography(inliers);
  if (initialFit === null) return null;
  let currentFit: HomographyFit = initialFit;

  for (let iteration = 0; iteration < 2; iteration += 1) {
    const residuals = inliers.map((point) =>
      pointDistance(currentFit.pointAt(point.u, point.v), point),
    );
    const limit = Math.max(3, median(residuals) * 3);
    const next = inliers.filter((_, index) => residuals[index] <= limit);
    if (next.length < 8 || next.length === inliers.length) break;

    const nextFit = fitHomography(next);
    if (nextFit === null) break;
    inliers = next;
    currentFit = nextFit;
  }

  return currentFit;
}

/**
 * Projektive Abbildung aus Punktpaaren (normierte Brettkoordinaten -> Bild)
 * per kleinster Quadrate berechnen. Die Koordinaten werden vorher normiert,
 * damit das Gleichungssystem gut konditioniert bleibt.
 */
function fitHomography(points: PointPair[]): HomographyFit | null {
  if (points.length < 4) return null;

  const count = points.length;
  let sumU = 0;
  let sumV = 0;
  let sumX = 0;
  let sumY = 0;
  for (const point of points) {
    sumU += point.u;
    sumV += point.v;
    sumX += point.x;
    sumY += point.y;
  }
  const meanU = sumU / count;
  const meanV = sumV / count;
  const meanX = sumX / count;
  const meanY = sumY / count;

  let deviationU = 0;
  let deviationV = 0;
  let deviationX = 0;
  let deviationY = 0;
  for (const point of points) {
    deviationU += (point.u - meanU) ** 2;
    deviationV += (point.v - meanV) ** 2;
    deviationX += (point.x - meanX) ** 2;
    deviationY += (point.y - meanY) ** 2;
  }

  const scaleU = Math.sqrt(deviationU / count) || 0.5;
  const scaleV = Math.sqrt(deviationV / count) || 0.5;
  const scaleX = Math.sqrt(deviationX / count) || 1;
  const scaleY = Math.sqrt(deviationY / count) || 1;

  const matrix: number[][] = Array.from({ length: 8 }, () => Array<number>(9).fill(0));

  for (const point of points) {
    const u = (point.u - meanU) / scaleU;
    const v = (point.v - meanV) / scaleV;
    const x = (point.x - meanX) / scaleX;
    const y = (point.y - meanY) / scaleY;

    addEquation(matrix, [u, v, 1, 0, 0, 0, -u * x, -v * x], x);
    addEquation(matrix, [0, 0, 0, u, v, 1, -u * y, -v * y], y);
  }

  const h = solve(matrix);
  if (h === null) return null;

  return {
    pointAt(u: number, v: number): Point {
      const nu = (u - meanU) / scaleU;
      const nv = (v - meanV) / scaleV;
      const w = h[6] * nu + h[7] * nv + 1;
      if (Math.abs(w) < 1e-9) return { x: Number.NaN, y: Number.NaN };
      return {
        x: ((h[0] * nu + h[1] * nv + h[2]) / w) * scaleX + meanX,
        y: ((h[3] * nu + h[4] * nv + h[5]) / w) * scaleY + meanY,
      };
    },
  };
}

function addEquation(matrix: number[][], row: number[], rhs: number): void {
  for (let rowIndex = 0; rowIndex < 8; rowIndex += 1) {
    if (row[rowIndex] === 0) continue;
    for (let column = 0; column < 8; column += 1) {
      matrix[rowIndex][column] += row[rowIndex] * row[column];
    }
    matrix[rowIndex][8] += row[rowIndex] * rhs;
  }
}

/** Löst ein 8x8-Gleichungssystem per Gauß-Jordan mit Spaltenpivot. */
function solve(matrix: number[][]): number[] | null {
  const size = matrix.length;

  for (let column = 0; column < size; column += 1) {
    let pivot = column;
    for (let row = column + 1; row < size; row += 1) {
      if (Math.abs(matrix[row][column]) > Math.abs(matrix[pivot][column])) pivot = row;
    }
    if (Math.abs(matrix[pivot][column]) < 1e-10) return null;

    if (pivot !== column) {
      const swap = matrix[column];
      matrix[column] = matrix[pivot];
      matrix[pivot] = swap;
    }

    const divisor = matrix[column][column];
    for (let index = column; index <= size; index += 1) {
      matrix[column][index] /= divisor;
    }

    for (let row = 0; row < size; row += 1) {
      if (row === column) continue;
      const factor = matrix[row][column];
      if (factor === 0) continue;
      for (let index = column; index <= size; index += 1) {
        matrix[row][index] -= factor * matrix[column][index];
      }
    }
  }

  const result: number[] = [];
  for (let index = 0; index < size; index += 1) result.push(matrix[index][size]);
  return result;
}

/** Grobe Plausibilitätsprüfung, damit eine schlechte Anpassung nichts kaputt macht. */
function isPlausible(
  original: BoardCorners,
  refined: BoardCorners,
  transform: Homography,
  layout: BoardLayout,
): boolean {
  const size = cellSizeAt(
    transform,
    layout,
    Math.floor(layout.rows / 2),
    Math.floor(layout.cols / 2),
  );
  const cell = Math.min(size.width, size.height);
  if (!Number.isFinite(cell) || cell <= 0) return false;

  const keys = ["topLeft", "topRight", "bottomRight", "bottomLeft"] as const;
  for (const key of keys) {
    const point = refined[key];
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return false;
    if (pointDistance(point, original[key]) > cell * 1.1) return false;
  }

  const areaOriginal = Math.abs(polygonArea(original));
  const areaRefined = Math.abs(polygonArea(refined));
  if (areaOriginal <= 0) return false;
  if (areaRefined < areaOriginal * 0.4 || areaRefined > areaOriginal * 2.4) return false;

  if (!isConvex(refined)) return false;
  if (Math.sign(polygonArea(original)) !== Math.sign(polygonArea(refined))) return false;

  return true;
}

function polygonArea(corners: BoardCorners): number {
  const points = [corners.topLeft, corners.topRight, corners.bottomRight, corners.bottomLeft];
  let sum = 0;
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const next = points[(index + 1) % points.length];
    sum += current.x * next.y - next.x * current.y;
  }
  return sum / 2;
}

function isConvex(corners: BoardCorners): boolean {
  const points = [corners.topLeft, corners.topRight, corners.bottomRight, corners.bottomLeft];
  let sign = 0;

  for (let index = 0; index < points.length; index += 1) {
    const a = points[index];
    const b = points[(index + 1) % points.length];
    const c = points[(index + 2) % points.length];
    const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
    if (Math.abs(cross) < 1e-6) return false;

    const current = Math.sign(cross);
    if (sign === 0) sign = current;
    else if (sign !== current) return false;
  }

  return true;
}
