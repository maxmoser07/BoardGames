/**
 * Zugriff auf die Gerätekamera.
 *
 * Die Klasse kapselt `getUserMedia`, ein verstecktes <video>-Element und das
 * Zeichnen eines Frames auf ein Canvas. Der Rest der Bibliothek arbeitet nur
 * noch mit `PixelSource` und braucht keinen Browser.
 */

import { CanvasPixelSource } from "./pixelSource.ts";
import type { CameraCaptureOptions, PixelSource } from "./types";

export interface CapturedFrame {
  source: PixelSource;
  capturedAt: number;
  width: number;
  height: number;
}

export class CameraCapture {
  private readonly options: CameraCaptureOptions;
  private stream: MediaStream | null = null;
  private videoElement: HTMLVideoElement | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private context: CanvasRenderingContext2D | null = null;

  constructor(options: CameraCaptureOptions = {}) {
    this.options = options;
  }

  get video(): HTMLVideoElement | null {
    return this.videoElement;
  }

  get active(): boolean {
    return this.stream !== null;
  }

  static isSupported(): boolean {
    return (
      typeof navigator !== "undefined" &&
      typeof navigator.mediaDevices?.getUserMedia === "function"
    );
  }

  /**
   * Startet den Kamerastream.
   *
   * `video` überschreibt das Element aus den Optionen. Das ist der Weg für den
   * React-Hook: Das Element existiert erst nach dem ersten Render.
   */
  async start(video?: HTMLVideoElement): Promise<HTMLVideoElement> {
    if (this.stream !== null && this.videoElement !== null) {
      return this.videoElement;
    }
    if (!CameraCapture.isSupported()) {
      throw new Error("Dieser Browser unterstützt keinen Kamerazugriff (getUserMedia).");
    }

    const constraints: MediaStreamConstraints = {
      audio: false,
      video: {
        ...(this.options.deviceId === undefined
          ? {}
          : { deviceId: { exact: this.options.deviceId } }),
        ...(this.options.facingMode === undefined
          ? {}
          : { facingMode: this.options.facingMode }),
        ...(this.options.width === undefined ? {} : { width: { ideal: this.options.width } }),
        ...(this.options.height === undefined ? {} : { height: { ideal: this.options.height } }),
      },
    };

    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    const element = video ?? this.options.video ?? document.createElement("video");
    element.srcObject = stream;
    element.muted = true;
    element.playsInline = true;
    element.autoplay = true;

    try {
      await element.play();
      if (element.videoWidth === 0 || element.videoHeight === 0) {
        await waitForMetadata(element);
      }
    } catch (error) {
      stream.getTracks().forEach((track) => track.stop());
      element.srcObject = null;
      throw error;
    }

    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (context === null) {
      stream.getTracks().forEach((track) => track.stop());
      element.srcObject = null;
      throw new Error("Der Browser konnte kein 2D-Canvas für Kamerabilder anlegen.");
    }

    this.stream = stream;
    this.videoElement = element;
    this.canvas = canvas;
    this.context = context;
    return element;
  }

  /** Zeichnet den aktuellen Videoframe und liefert die Pixelquelle dafür. */
  capture(): CapturedFrame | null {
    if (this.videoElement === null || this.canvas === null || this.context === null) {
      return null;
    }

    const width = this.videoElement.videoWidth;
    const height = this.videoElement.videoHeight;
    if (width === 0 || height === 0) return null;

    if (this.canvas.width !== width) this.canvas.width = width;
    if (this.canvas.height !== height) this.canvas.height = height;

    this.context.drawImage(this.videoElement, 0, 0, width, height);
    const image = this.context.getImageData(0, 0, width, height);

    return {
      source: new CanvasPixelSource(image),
      capturedAt: Date.now(),
      width,
      height,
    };
  }

  /** Beendet den Stream und gibt die Kamera wieder frei. */
  stop(): void {
    if (this.stream !== null) {
      this.stream.getTracks().forEach((track) => track.stop());
      this.stream = null;
    }
    if (this.videoElement !== null) {
      this.videoElement.srcObject = null;
      this.videoElement = null;
    }
    this.canvas = null;
    this.context = null;
  }
}

function waitForMetadata(video: HTMLVideoElement): Promise<void> {
  return new Promise((resolve, reject) => {
    let timeout: ReturnType<typeof setTimeout> | null = null;

    function cleanup(): void {
      if (timeout !== null) clearTimeout(timeout);
      video.removeEventListener("loadedmetadata", onLoaded);
      video.removeEventListener("error", onError);
    }
    function fail(): void {
      cleanup();
      reject(new Error("Der Kamerastream liefert keine Videobilder."));
    }
    function onLoaded(): void {
      cleanup();
      resolve();
    }
    function onError(): void {
      fail();
    }

    timeout = setTimeout(fail, 5000);
    video.addEventListener("loadedmetadata", onLoaded);
    video.addEventListener("error", onError);
  });
}
