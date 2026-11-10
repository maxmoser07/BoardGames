/**
 * Verbindet Kamera, Detektor und Tracker zu einer bequemen Fassade.
 *
 * ```ts
 * const camera = new CameraMoveTracker({
 *   calibration: corners,
 *   onMove: (move) => console.log(move),
 * });
 * await camera.start(videoElement);
 * ```
 */

import { CameraCapture } from "./camera.ts";
import { ConnectFourDetector } from "./detector.ts";
import { MoveTracker } from "./moveTracker.ts";
import { refineBoardCorners } from "./refine.ts";
import type {
  BoardCorners,
  CameraMoveTrackerOptions,
  TrackerEvent,
} from "./types";

export class CameraMoveTracker {
  readonly tracker: MoveTracker;
  readonly capture: CameraCapture;

  private readonly options: CameraMoveTrackerOptions;
  private readonly listeners = new Set<(event: TrackerEvent) => void>();
  private readonly unsubscribeTracker: () => void;
  private detector: ConnectFourDetector;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(options: CameraMoveTrackerOptions) {
    this.options = options;
    this.tracker = new MoveTracker(options.tracker);
    this.capture = new CameraCapture(options.capture);
    this.detector = this.createDetector(options.calibration);

    this.unsubscribeTracker = this.tracker.subscribe((event) => {
      for (const listener of this.listeners) listener(event);
      if (event.type === "move") {
        this.options.onMove?.(event.move);
      } else if (event.type === "reset") {
        this.options.onReset?.(event);
      } else {
        this.options.onUpdate?.(event);
      }
    });
  }

  get video(): HTMLVideoElement | null {
    return this.capture.video;
  }

  get running(): boolean {
    return this.capture.active;
  }

  subscribe(listener: (event: TrackerEvent) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** Neue Ecken, z. B. nachdem das Brett anders ausgerichtet wurde. */
  calibrate(corners: BoardCorners): void {
    this.detector = this.createDetector(corners);
  }

  /**
   * Richtet die übergebenen Ecken an den tatsächlichen Löchern des aktuellen
   * Kamerabilds aus.
   *
   * Liefert die korrigierten Ecken zurück oder `null`, wenn das Bild keine
   * sichere Ausrichtung zulässt. Der Tracker übernimmt die neuen Ecken nicht
   * selbst – so kann die Oberfläche das Overlay gleich mitverschieben.
   */
  snapCalibration(corners: BoardCorners): BoardCorners | null {
    const frame = this.capture.capture();
    if (frame === null) return null;
    return refineBoardCorners(frame.source, corners, this.options.layout);
  }

  async start(video?: HTMLVideoElement): Promise<void> {
    await this.capture.start(video);
    if (this.timer !== null) return;

    const interval = this.options.intervalMs ?? 500;
    if (interval > 0) {
      this.timer = setInterval(() => this.tickSafely(), interval);
    }
    this.tickSafely();
  }

  stop(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.capture.stop();
  }

  /** Brett und erkannte Züge verwerfen, Kamera läuft weiter. */
  reset(): void {
    this.tracker.reset();
  }

  /** Verarbeitet genau einen Frame; nützlich für Tests und manuellen Betrieb. */
  tick(): TrackerEvent[] {
    const frame = this.capture.capture();
    if (frame === null) return [];

    const observation = this.detector.detect(frame.source, frame.capturedAt);
    return this.tracker.feed(observation);
  }

  dispose(): void {
    this.stop();
    this.unsubscribeTracker();
    this.listeners.clear();
  }

  private createDetector(corners: BoardCorners): ConnectFourDetector {
    return new ConnectFourDetector({
      corners,
      layout: this.options.layout,
      ...this.options.detection,
    });
  }

  private tickSafely(): void {
    try {
      this.tick();
    } catch (error) {
      const normalized = error instanceof Error ? error : new Error(String(error));
      this.options.onError?.(normalized);
    }
  }
}
