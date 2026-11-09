/**
 * Gemeinsame Typen der Kamera-Bibliothek.
 *
 * Die Bibliothek ist bewusst spielunabhängig aufgebaut: Ein `BoardDetector`
 * liest aus einem Bild ein `BoardObservation`, der `MoveTracker` vergleicht
 * aufeinanderfolgende Beobachtungen und erzeugt daraus `TrackedMove`s. Für
 * Connect Four gibt es einen fertigen Detektor, weitere Spiele können einen
 * eigenen beisteuern.
 */

/** Eine der beiden Connect-Four-Seiten. */
export type Side = "red" | "yellow";

export interface Point {
  x: number;
  y: number;
}

/** Die vier Ecken des Spielfelds im Kamerabild, gegen den Uhrzeigersinn ab oben links. */
export interface BoardCorners {
  topLeft: Point;
  topRight: Point;
  bottomRight: Point;
  bottomLeft: Point;
}

export interface BoardLayout {
  rows: number;
  cols: number;
}

/** Brettzustand als [Zeile][Spalte]; Zeile 0 ist die oberste Reihe. */
export type BoardState = (Side | null)[][];

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

export interface Hsv {
  h: number;
  s: number;
  v: number;
}

/** Ergebnis der Farbklassifikation einer einzelnen Zelle. */
export interface CellObservation {
  side: Side | null;
  /** 0..1 – Konfidenz für `side`; bei `null` heißt das "sicher leer". */
  confidence: number;
  color: Rgb;
}

/** Optionaler Verweis auf das Bild, aus dem ein Zug erkannt wurde. */
export interface FrameReference {
  index?: number;
  offsetMs?: number;
  storageUri?: string;
}

/** Ein vollständig gelesenes Brett aus einem Kamerabild. */
export interface BoardObservation {
  layout: BoardLayout;
  cells: CellObservation[][];
  /** Durchschnittliche Konfidenz über alle Zellen. */
  confidence: number;
  /** Aufnahmezeitpunkt in Millisekunden seit Epoche. */
  capturedAt: number;
  frame?: FrameReference;
}

/**
 * Minimale Bildabstraktion. Der Detektor braucht nur die durchschnittliche
 * Farbe eines kreisförmigen Ausschnitts – dadurch lässt sich die Erkennung in
 * Tests ohne Browser und ohne echte Kamera prüfen.
 */
export interface PixelSource {
  readonly width: number;
  readonly height: number;
  averageColor(x: number, y: number, radius: number): Rgb;
}

export interface BoardDetector {
  readonly layout: BoardLayout;
  detect(source: PixelSource, capturedAt: number): BoardObservation;
}

export interface ColorThresholds {
  /** Unter diesem Helligkeitswert gilt eine Zelle als leer. */
  emptyValue: number;
  /** Unter dieser Sättigung gilt eine Zelle als leer (grau/weiß/schwarz). */
  emptySaturation: number;
  /** Ab dieser Sättigung kann eine Zelle eine Spielfarbe sein. */
  minSaturation: number;
  /** Ab dieser Helligkeit kann eine Zelle eine Spielfarbe sein. */
  minValue: number;
  /** Hue-Mittelwert für Rot (0 = reines Rot). */
  redHue: number;
  /** Hue-Mittelwert für Gelb. */
  yellowHue: number;
  /** Ab dieser Hue-Abweichung ist eine Farbe keiner Seite mehr zuzuordnen. */
  maxHueDistance: number;
}

export interface ConnectFourDetectorOptions {
  corners: BoardCorners;
  layout?: BoardLayout;
  /**
   * Radius der Farbprobe als Anteil der kürzeren Zellkante.
   * 0.3 liest die Mitte eines Steins, ohne den Rand zu treffen.
   */
  sampleRadius?: number;
  thresholds?: Partial<ColorThresholds>;
  /**
   * Spalten spiegeln. Nötig, wenn die Kamera das Brett von der anderen
   * Längsseite sieht oder das Vorschaubild gespiegelt ist.
   */
  flipX?: boolean;
  /**
   * Reihen spiegeln. Nötig, wenn die Kamera auf der Gegenseite steht: Aus
   * Sicht von Rot ist die unterste Reihe dann oben im Bild.
   */
  flipY?: boolean;
}

/** Ein aus dem Kamerabild abgeleiteter Zug. */
export interface TrackedMove {
  turn: number;
  side: Side;
  /** x = Spalte, y = Zeile (0 = oberste Reihe), wie bei `ConnectFourMove`. */
  location: Point;
  confidence: number;
  capturedAt: number;
  detectedAt: number;
  frame?: FrameReference;
}

export type TrackerEvent =
  | { type: "move"; move: TrackedMove; board: BoardState }
  | { type: "reset"; reason: "board-cleared" | "resync"; board: BoardState }
  | { type: "update"; board: BoardState; observation: BoardObservation };

export interface MoveTrackerOptions {
  layout?: BoardLayout;
  /** Mindestkonfidenz einer Zelle, damit eine Änderung zählt. Standard: 0.5. */
  minConfidence?: number;
  /** Gleiche Bilder in Folge, bevor eine Änderung übernommen wird. Standard: 2. */
  confirmationFrames?: number;
  /** Anteil geänderter Zellen, ab dem das Brett neu eingelesen wird. Standard: 0.5. */
  resetThreshold?: number;
  /** Uhr für Tests; Standard ist `Date.now`. */
  now?: () => number;
}

export interface CameraCaptureOptions {
  deviceId?: string;
  facingMode?: "user" | "environment";
  width?: number;
  height?: number;
  /** Vorhandenes <video>-Element wiederverwenden (z. B. aus einem React-Ref). */
  video?: HTMLVideoElement;
}

export interface CameraMoveTrackerOptions {
  calibration: BoardCorners;
  layout?: BoardLayout;
  capture?: CameraCaptureOptions;
  detection?: Omit<ConnectFourDetectorOptions, "corners" | "layout">;
  tracker?: MoveTrackerOptions;
  /** Aufnahmeintervall in ms. Standard: 500. 0 = nur manuell über `tick()`. */
  intervalMs?: number;
  onMove?: (move: TrackedMove) => void;
  onReset?: (event: Extract<TrackerEvent, { type: "reset" }>) => void;
  onUpdate?: (event: Extract<TrackerEvent, { type: "update" }>) => void;
  onError?: (error: Error) => void;
}
