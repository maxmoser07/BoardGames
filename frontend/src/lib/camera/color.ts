/**
 * Farbklassifikation für die Kamera-Erkennung.
 *
 * Die physischen Steine werden über ihren Farbton (Hue) und ihre Sättigung
 * unterschieden. Das ist robuster als reine RGB-Schwellen, weil es weniger auf
 * die absolute Helligkeit reagiert – wichtig bei wechselndem Licht.
 */

import type { ColorThresholds, Hsv, Rgb, Side } from "./types";

export const DEFAULT_COLOR_THRESHOLDS: ColorThresholds = {
  emptyValue: 0.22,
  emptySaturation: 0.28,
  minSaturation: 0.3,
  minValue: 0.2,
  redHue: 0,
  yellowHue: 55,
  greenHue: 125,
  maxHueDistance: 35,
};

export interface ColorClassification {
  side: Side | null;
  confidence: number;
  hsv: Hsv;
}

export interface ColorClassificationOptions extends Partial<ColorThresholds> {
  /** Interne Seite für grüne Steine; Standard "red" (die andere Seite bleibt "yellow"). */
  greenAs?: Side;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export function rgbToHsv(rgb: Rgb): Hsv {
  const r = rgb.r / 255;
  const g = rgb.g / 255;
  const b = rgb.b / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;

  let h = 0;
  if (delta !== 0) {
    if (max === r) {
      h = 60 * (((g - b) / delta) % 6);
    } else if (max === g) {
      h = 60 * ((b - r) / delta + 2);
    } else {
      h = 60 * ((r - g) / delta + 4);
    }
  }
  if (h < 0) h += 360;

  return {
    h,
    s: max === 0 ? 0 : delta / max,
    v: max,
  };
}

/** Abstand zweier Hue-Werte auf dem Farbkreis, immer 0..180. */
export function circularHueDistance(a: number, b: number): number {
  const difference = Math.abs(a - b) % 360;
  return Math.min(difference, 360 - difference);
}

/**
 * Ordnet eine Farbe einer Seite oder "leer" zu.
 *
 * `confidence` ist die Sicherheit der Entscheidung. Bei `side === null` heißt
 * eine hohe Konfidenz "sicher leer", eine niedrige "unbekannte Farbe". Der
 * `MoveTracker` ignoriert Änderungen unterhalb seiner Mindestkonfidenz.
 */
export function classifyColor(
  rgb: Rgb,
  overrides: ColorClassificationOptions = {},
): ColorClassification {
  const { greenAs = "red", ...thresholdOverrides } = overrides;
  const thresholds: ColorThresholds = { ...DEFAULT_COLOR_THRESHOLDS, ...thresholdOverrides };
  const hsv = rgbToHsv(rgb);

  // Leer ist entweder dunkel (schwarze Schlitze) oder grau/weiß (Brettrahmen).
  const darkScore = clamp01((thresholds.emptyValue - hsv.v) / thresholds.emptyValue);
  const grayScore = clamp01((thresholds.emptySaturation - hsv.s) / thresholds.emptySaturation);
  const emptyConfidence = Math.max(darkScore, grayScore);

  // Sättigung und Helligkeit müssen deutlich über dem Leer-Bereich liegen.
  const saturationScore = clamp01((hsv.s - thresholds.minSaturation) / 0.6);
  const valueScore = clamp01((hsv.v - thresholds.minValue) / 0.6);

  const sideScore = (hue: number): number => {
    const hueScore = clamp01(1 - circularHueDistance(hsv.h, hue) / thresholds.maxHueDistance);
    return hueScore * saturationScore * valueScore;
  };

  // Gelb und Grün liegen weit genug vom roten Brettkunststoff entfernt, dass
  // sie auch bei dunkleren Steinen (Schatten, schwaches Licht) erkannt werden
  // dürfen. Rot bleibt streng bewertet – sonst würde der Brettrahmen als
  // roter Stein zählen.
  const distinctChroma = clamp01((hsv.s - thresholds.minSaturation) / 0.2);
  const distinctValue = clamp01((hsv.v - 0.12) / 0.2);
  const distinctScore = (hue: number): number => {
    const hueScore = clamp01(1 - circularHueDistance(hsv.h, hue) / thresholds.maxHueDistance);
    return hueScore * distinctChroma * distinctValue;
  };

  const redScore = sideScore(thresholds.redHue);
  const yellowScore = distinctScore(thresholds.yellowHue);
  const greenScore = distinctScore(thresholds.greenHue);

  let bestSide: Side = redScore >= yellowScore ? "red" : "yellow";
  let bestSideScore = Math.max(redScore, yellowScore);

  // Grün ist ein eigener Hue-Bereich, wird aber auf eine bestehende Seite
  // abgebildet: Die Datenhaltung kennt weiterhin nur "red"/"yellow".
  if (greenScore > bestSideScore) {
    bestSide = greenAs;
    bestSideScore = greenScore;
  }

  if (bestSideScore > emptyConfidence) {
    return { side: bestSide, confidence: bestSideScore, hsv };
  }
  return { side: null, confidence: emptyConfidence, hsv };
}
