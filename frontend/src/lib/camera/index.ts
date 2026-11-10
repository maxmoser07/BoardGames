/**
 * Kamera-Bibliothek für die Zugerkennung.
 *
 * Schnellstart:
 *
 * ```ts
 * import { createConnectFourCamera } from "./lib/camera";
 *
 * const camera = createConnectFourCamera({
 *   calibration: { topLeft, topRight, bottomRight, bottomLeft },
 *   onMove: (move) => console.log(move.turn, move.side, move.location),
 * });
 * await camera.start(videoElement);
 * ```
 *
 * Die Erkennung liest nur die Zellmitten. Das Brett muss also einmal kalibriert
 * werden (vier Ecken), danach reicht eine feste Kamera. Für andere Spiele kann
 * ein eigener `BoardDetector` an `MoveTracker` übergeben werden.
 */

export { CameraCapture } from "./camera.ts";
export type { CapturedFrame } from "./camera.ts";
export { CameraMoveTracker } from "./cameraTracker.ts";
export { classifyColor, circularHueDistance, DEFAULT_COLOR_THRESHOLDS, rgbToHsv } from "./color.ts";
export type { ColorClassification } from "./color.ts";
export {
  CONNECT_FOUR_BOARD,
  emptyBoard,
  toConnectFourMoves,
  winnerOf,
} from "./connectFour.ts";
export { ConnectFourDetector, CONNECT_FOUR_LAYOUT } from "./detector.ts";
export {
  cellCenter,
  cellSizeAt,
  cornersFromRect,
  createHomography,
  flipCorners,
  scaleCorners,
} from "./geometry.ts";
export type { Homography } from "./geometry.ts";
export { MoveTracker } from "./moveTracker.ts";
export { averageColor, CanvasPixelSource } from "./pixelSource.ts";
export { refineBoardCorners } from "./refine.ts";
export type { RefineOptions } from "./refine.ts";
export type {
  BoardCorners,
  BoardDetector,
  BoardLayout,
  BoardObservation,
  BoardState,
  CameraCaptureOptions,
  CameraMoveTrackerOptions,
  CellObservation,
  ColorThresholds,
  ConnectFourDetectorOptions,
  FrameReference,
  Hsv,
  MoveTrackerOptions,
  PixelSource,
  Point,
  Rgb,
  Side,
  TrackerEvent,
  TrackedMove,
} from "./types";

import { CameraMoveTracker } from "./cameraTracker.ts";
import type { CameraMoveTrackerOptions } from "./types";

/** Kurzform für Connect Four: Kamera + Detektor + Tracker in einem Aufruf. */
export function createConnectFourCamera(options: CameraMoveTrackerOptions): CameraMoveTracker {
  return new CameraMoveTracker(options);
}
