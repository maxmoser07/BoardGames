/**
 * Connect-Four-Detektor.
 *
 * Der Detektor liest die Farbe in der Mitte jeder Zelle. Die Zellmitten werden
 * über die kalibrierten Ecken und eine Homographie aus dem Kamerabild
 * berechnet – dadurch funktionieren auch leicht schräge Aufnahmen.
 */

import { classifyColor } from "./color.ts";
import { cellCenter, cellSizeAt, createHomography, type Homography } from "./geometry.ts";
import type {
  BoardDetector,
  BoardLayout,
  BoardObservation,
  CellObservation,
  ColorThresholds,
  ConnectFourDetectorOptions,
  PixelSource,
} from "./types";

export const CONNECT_FOUR_LAYOUT: BoardLayout = { rows: 6, cols: 7 };

export class ConnectFourDetector implements BoardDetector {
  readonly layout: BoardLayout;
  private readonly transform: Homography;
  private readonly sampleRadius: number;
  private readonly thresholds: Partial<ColorThresholds>;
  private readonly flipX: boolean;
  private readonly flipY: boolean;

  constructor(options: ConnectFourDetectorOptions) {
    this.layout = options.layout ?? CONNECT_FOUR_LAYOUT;
    this.transform = createHomography(options.corners);
    this.sampleRadius = options.sampleRadius ?? 0.3;
    this.thresholds = options.thresholds ?? {};
    this.flipX = options.flipX ?? false;
    this.flipY = options.flipY ?? false;
  }

  detect(source: PixelSource, capturedAt: number): BoardObservation {
    const cells: CellObservation[][] = Array.from({ length: this.layout.rows }, () =>
      Array<CellObservation>(this.layout.cols),
    );
    let confidenceSum = 0;

    for (let imageRow = 0; imageRow < this.layout.rows; imageRow += 1) {
      for (let imageCol = 0; imageCol < this.layout.cols; imageCol += 1) {
        const center = cellCenter(this.layout, imageRow, imageCol);
        const point = this.transform.pointAt(center.x, center.y);
        const size = cellSizeAt(this.transform, this.layout, imageRow, imageCol);
        const radius = Math.max(1, this.sampleRadius * Math.min(size.width, size.height));

        const color = source.averageColor(point.x, point.y, radius);
        const classification = classifyColor(color, this.thresholds);

        const row = this.flipY ? this.layout.rows - 1 - imageRow : imageRow;
        const col = this.flipX ? this.layout.cols - 1 - imageCol : imageCol;
        cells[row][col] = {
          side: classification.side,
          confidence: classification.confidence,
          color,
        };
        confidenceSum += classification.confidence;
      }
    }

    const cellCount = this.layout.rows * this.layout.cols;
    return {
      layout: this.layout,
      cells,
      confidence: cellCount === 0 ? 0 : confidenceSum / cellCount,
      capturedAt,
    };
  }
}
