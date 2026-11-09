/**
 * Pixelzugriff für die Kamera-Erkennung.
 *
 * `CanvasPixelSource` kapselt ein `ImageData` aus einem Canvas. Die reine
 * Funktion `averageColor` ist davon unabhängig und damit ohne Browser testbar.
 */

import type { PixelSource, Rgb } from "./types";

/**
 * Durchschnittsfarbe eines Kreises um (x, y).
 *
 * Pixel außerhalb des Bildes werden ignoriert. Ein Radius von 0 liest genau
 * einen Pixel. Der Kreis vermeidet, dass der Rand eines Steins oder das
 * Brett zwischen den Feldern die Messung verfälscht.
 */
export function averageColor(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  x: number,
  y: number,
  radius: number,
): Rgb {
  if (width <= 0 || height <= 0) return { r: 0, g: 0, b: 0 };

  const centerX = Math.round(x);
  const centerY = Math.round(y);
  const sampleRadius = Math.max(0, Math.round(radius));
  const minX = Math.max(0, centerX - sampleRadius);
  const maxX = Math.min(width - 1, centerX + sampleRadius);
  const minY = Math.max(0, centerY - sampleRadius);
  const maxY = Math.min(height - 1, centerY + sampleRadius);
  const radiusSquared = sampleRadius * sampleRadius;

  let sumR = 0;
  let sumG = 0;
  let sumB = 0;
  let count = 0;

  for (let py = minY; py <= maxY; py += 1) {
    for (let px = minX; px <= maxX; px += 1) {
      const dx = px - centerX;
      const dy = py - centerY;
      if (sampleRadius > 0 && dx * dx + dy * dy > radiusSquared) continue;

      const index = (py * width + px) * 4;
      sumR += data[index];
      sumG += data[index + 1];
      sumB += data[index + 2];
      count += 1;
    }
  }

  if (count === 0) {
    const clampedX = Math.min(width - 1, Math.max(0, centerX));
    const clampedY = Math.min(height - 1, Math.max(0, centerY));
    const index = (clampedY * width + clampedX) * 4;
    return { r: data[index], g: data[index + 1], b: data[index + 2] };
  }

  return {
    r: sumR / count,
    g: sumG / count,
    b: sumB / count,
  };
}

export class CanvasPixelSource implements PixelSource {
  readonly width: number;
  readonly height: number;
  private readonly data: Uint8ClampedArray;

  constructor(image: ImageData) {
    this.width = image.width;
    this.height = image.height;
    this.data = image.data;
  }

  averageColor(x: number, y: number, radius: number): Rgb {
    return averageColor(this.data, this.width, this.height, x, y, radius);
  }
}
