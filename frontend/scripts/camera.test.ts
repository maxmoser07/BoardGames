/**
 * Tests der Kamera-Bibliothek – ohne Browser und ohne echte Kamera.
 * Ausführen: `npm test`
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { classifyColor, circularHueDistance, rgbToHsv } from "../src/lib/camera/color.ts";
import { emptyBoard, toConnectFourMoves, winnerOf } from "../src/lib/camera/connectFour.ts";
import { ConnectFourDetector } from "../src/lib/camera/detector.ts";
import {
  cellCenter,
  cornersFromRect,
  createHomography,
  flipCorners,
  scaleCorners,
} from "../src/lib/camera/geometry.ts";
import { MoveTracker } from "../src/lib/camera/moveTracker.ts";
import { averageColor, CanvasPixelSource } from "../src/lib/camera/pixelSource.ts";
import { refineBoardCorners } from "../src/lib/camera/refine.ts";
import type {
  BoardObservation,
  BoardState,
  PixelSource,
  Rgb,
} from "../src/lib/camera/types.ts";

const RED: Rgb = { r: 220, g: 30, b: 30 };
const YELLOW: Rgb = { r: 240, g: 210, b: 20 };
const GREEN: Rgb = { r: 40, g: 190, b: 70 };
const EMPTY: Rgb = { r: 12, g: 12, b: 12 };

function colorOf(side: "red" | "yellow" | null): Rgb {
  if (side === "red") return RED;
  if (side === "yellow") return YELLOW;
  return EMPTY;
}

/** Synthetisches Kamerabild: jede Zelle liefert ihre Farbe. */
function boardSource(board: BoardState, cell = 100): PixelSource {
  const rows = board.length;
  const cols = rows === 0 ? 0 : board[0].length;

  return {
    width: cols * cell,
    height: rows * cell,
    averageColor(x: number, y: number): Rgb {
      const col = Math.min(cols - 1, Math.max(0, Math.floor(x / cell)));
      const row = Math.min(rows - 1, Math.max(0, Math.floor(y / cell)));
      return colorOf(board[row][col]);
    },
  };
}

/** Beobachtung mit frei wählbarer Konfidenz, ohne den Detektor zu bemühen. */
function observation(
  board: BoardState,
  confidence = 0.95,
  capturedAt = 1_000,
): BoardObservation {
  return {
    layout: { rows: board.length, cols: board.length === 0 ? 0 : board[0].length },
    cells: board.map((line) =>
      line.map((side) => ({ side, confidence, color: colorOf(side) })),
    ),
    confidence,
    capturedAt,
  };
}

function cloneBoard(board: BoardState): BoardState {
  return board.map((line) => [...line]);
}

/**
 * Synthetisches Kamerabild eines roten Vier-Gewinnt-Bretts mit weißen Stegen
 * und runden Löchern. `rect` beschreibt die äußeren Zellgrenzen des Rasters.
 */
function renderBoardImage(
  board: BoardState,
  rect: { x: number; y: number; width: number; height: number },
  width = 720,
  height = 620,
): PixelSource {
  const rows = board.length;
  const cols = rows === 0 ? 0 : board[0].length;
  const data = new Uint8ClampedArray(width * height * 4);

  const background: Rgb = { r: 24, g: 26, b: 34 };
  const plastic: Rgb = { r: 190, g: 48, b: 44 };
  const ridge: Rgb = { r: 236, g: 236, b: 232 };
  const empty: Rgb = { r: 222, g: 222, b: 218 };

  const paint = (x: number, y: number, color: Rgb): void => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const index = (y * width + x) * 4;
    data[index] = color.r;
    data[index + 1] = color.g;
    data[index + 2] = color.b;
    data[index + 3] = 255;
  };

  const fillRect = (x: number, y: number, w: number, h: number, color: Rgb): void => {
    const fromX = Math.max(0, Math.floor(x));
    const fromY = Math.max(0, Math.floor(y));
    const toX = Math.min(width, Math.ceil(x + w));
    const toY = Math.min(height, Math.ceil(y + h));
    for (let py = fromY; py < toY; py += 1) {
      for (let px = fromX; px < toX; px += 1) paint(px, py, color);
    }
  };

  const fillCircle = (cx: number, cy: number, radius: number, color: Rgb): void => {
    const fromX = Math.max(0, Math.floor(cx - radius));
    const toX = Math.min(width - 1, Math.ceil(cx + radius));
    const fromY = Math.max(0, Math.floor(cy - radius));
    const toY = Math.min(height - 1, Math.ceil(cy + radius));
    for (let py = fromY; py <= toY; py += 1) {
      for (let px = fromX; px <= toX; px += 1) {
        const dx = px - cx;
        const dy = py - cy;
        if (dx * dx + dy * dy <= radius * radius) paint(px, py, color);
      }
    }
  };

  fillRect(0, 0, width, height, background);
  fillRect(rect.x, rect.y, rect.width, rect.height, plastic);

  const cellWidth = rect.width / cols;
  const cellHeight = rect.height / rows;
  const line = Math.max(2, Math.min(cellWidth, cellHeight) * 0.05);

  for (let col = 0; col <= cols; col += 1) {
    fillRect(rect.x + col * cellWidth - line / 2, rect.y, line, rect.height, ridge);
  }
  for (let row = 0; row <= rows; row += 1) {
    fillRect(rect.x, rect.y + row * cellHeight - line / 2, rect.width, line, ridge);
  }

  const holeRadius = Math.min(cellWidth, cellHeight) * 0.34;
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const cx = rect.x + (col + 0.5) * cellWidth;
      const cy = rect.y + (row + 0.5) * cellHeight;
      const side = board[row][col];
      fillCircle(cx, cy, holeRadius, side === null ? empty : colorOf(side));
    }
  }

  return new CanvasPixelSource({ width, height, data } as ImageData);
}

function moveEvents(events: ReturnType<MoveTracker["feed"]>) {
  return events.filter((event) => event.type === "move");
}

describe("Kamera-Geometrie", () => {
  it("bildet die vier Ecken und die Mitte korrekt ab", () => {
    const corners = cornersFromRect({ x: 10, y: 20, width: 100, height: 50 });
    const transform = createHomography(corners);

    assert.deepEqual(transform.pointAt(0, 0), corners.topLeft);
    assert.deepEqual(transform.pointAt(1, 0), corners.topRight);
    assert.deepEqual(transform.pointAt(1, 1), corners.bottomRight);
    assert.deepEqual(transform.pointAt(0, 1), corners.bottomLeft);
    assert.deepEqual(transform.pointAt(0.5, 0.5), { x: 60, y: 45 });
  });

  it("weist entartete Ecken ab", () => {
    assert.throws(() =>
      createHomography({
        topLeft: { x: 0, y: 0 },
        topRight: { x: 1, y: 0 },
        bottomRight: { x: 2, y: 0 },
        bottomLeft: { x: 3, y: 0 },
      }),
    );
  });

  it("berechnet Zellmitten und skaliert Ecken", () => {
    const center = cellCenter({ rows: 6, cols: 7 }, 0, 0);
    assert.ok(Math.abs(center.x - 1 / 14) < 1e-12);
    assert.ok(Math.abs(center.y - 1 / 12) < 1e-12);

    const scaled = scaleCorners(
      cornersFromRect({ x: 1, y: 2, width: 3, height: 4 }),
      10,
      10,
    );
    assert.deepEqual(scaled.topLeft, { x: 10, y: 20 });
    assert.deepEqual(scaled.bottomRight, { x: 40, y: 60 });
  });

  it("spiegelt Ecken für die Kamerarichtung", () => {
    const corners = cornersFromRect({ x: 10, y: 20, width: 100, height: 50 });

    const mirroredX = flipCorners(corners, true, false);
    assert.deepEqual(mirroredX.topLeft, corners.topRight);
    assert.deepEqual(mirroredX.topRight, corners.topLeft);
    assert.deepEqual(mirroredX.bottomRight, corners.bottomLeft);

    const mirroredY = flipCorners(corners, false, true);
    assert.deepEqual(mirroredY.topLeft, corners.bottomLeft);
    assert.deepEqual(mirroredY.bottomLeft, corners.topLeft);
    assert.deepEqual(mirroredY.bottomRight, corners.topRight);

    const rotated = flipCorners(corners, true, true);
    assert.deepEqual(rotated.topLeft, corners.bottomRight);
    assert.deepEqual(rotated.bottomRight, corners.topLeft);
  });
});

describe("Farbklassifikation", () => {
  it("erkennt Rot und Gelb", () => {
    const red = classifyColor(RED);
    assert.equal(red.side, "red");
    assert.ok(red.confidence > 0.5);

    const yellow = classifyColor(YELLOW);
    assert.equal(yellow.side, "yellow");
    assert.ok(yellow.confidence > 0.5);
  });

  it("erkennt Grün und ordnet es der zweiten Seite zu", () => {
    const green = classifyColor(GREEN);
    assert.equal(green.side, "red");
    assert.ok(green.confidence > 0.5);

    const mapped = classifyColor(GREEN, { greenAs: "yellow" });
    assert.equal(mapped.side, "yellow");
  });

  it("erkennt dunkle und graue Felder als leer", () => {
    const dark = classifyColor({ r: 10, g: 10, b: 10 });
    assert.equal(dark.side, null);
    assert.ok(dark.confidence > 0.5);

    const gray = classifyColor({ r: 128, g: 128, b: 128 });
    assert.equal(gray.side, null);
    assert.ok(gray.confidence > 0.5);
  });

  it("lässt unbekannte Farben ohne sichere Seite", () => {
    const blue = classifyColor({ r: 20, g: 20, b: 220 });
    assert.equal(blue.side, null);
    assert.equal(blue.confidence, 0);
  });

  it("erkennt dunkle gelbe und grüne Steine", () => {
    const darkGreen = classifyColor({ r: 50, g: 100, b: 60 });
    assert.equal(darkGreen.side, "red");
    assert.ok(darkGreen.confidence > 0.5);

    const darkYellow = classifyColor({ r: 150, g: 130, b: 40 });
    assert.equal(darkYellow.side, "yellow");
    assert.ok(darkYellow.confidence > 0.5);
  });

  it("rechnet Hue und Abstände auf dem Farbkreis", () => {
    const red = rgbToHsv({ r: 255, g: 0, b: 0 });
    assert.equal(red.h, 0);
    assert.equal(red.s, 1);
    assert.equal(red.v, 1);
    assert.equal(circularHueDistance(350, 10), 20);
    assert.equal(circularHueDistance(10, 350), 20);
  });
});

describe("Connect-Four-Detektor", () => {
  it("liest die Zellmitten aus einem synthetischen Bild", () => {
    const board = emptyBoard();
    board[5][0] = "red";
    board[5][1] = "yellow";
    board[4][1] = "red";

    const detector = new ConnectFourDetector({
      corners: cornersFromRect({ x: 0, y: 0, width: 700, height: 600 }),
    });
    const result = detector.detect(boardSource(board), 1_234);

    assert.equal(result.layout.rows, 6);
    assert.equal(result.layout.cols, 7);
    assert.equal(result.cells[5][0].side, "red");
    assert.equal(result.cells[5][1].side, "yellow");
    assert.equal(result.cells[4][1].side, "red");
    assert.equal(result.cells[0][0].side, null);
    assert.equal(result.capturedAt, 1_234);
    assert.ok(result.confidence > 0.5);
  });

  it("liest grüne Steine als zweite Seite", () => {
    const source: PixelSource = {
      width: 700,
      height: 600,
      averageColor: () => GREEN,
    };
    const detector = new ConnectFourDetector({
      corners: cornersFromRect({ x: 0, y: 0, width: 700, height: 600 }),
    });

    const result = detector.detect(source, 1);
    assert.equal(result.cells[0][0].side, "red");
    assert.equal(result.cells[5][6].side, "red");
  });

  it("spiegelt das Bild bei flipX und flipY", () => {
    const board = emptyBoard();
    board[5][0] = "red";
    board[4][1] = "yellow";
    const source = boardSource(board);
    const corners = cornersFromRect({ x: 0, y: 0, width: 700, height: 600 });

    const flippedX = new ConnectFourDetector({ corners, flipX: true }).detect(source, 1);
    assert.equal(flippedX.cells[5][6].side, "red");
    assert.equal(flippedX.cells[4][5].side, "yellow");
    assert.equal(flippedX.cells[5][0].side, null);

    const flippedY = new ConnectFourDetector({ corners, flipY: true }).detect(source, 1);
    assert.equal(flippedY.cells[0][0].side, "red");
    assert.equal(flippedY.cells[1][1].side, "yellow");
    assert.equal(flippedY.cells[5][0].side, null);

    const flippedBoth = new ConnectFourDetector({
      corners,
      flipX: true,
      flipY: true,
    }).detect(source, 1);
    assert.equal(flippedBoth.cells[0][6].side, "red");
    assert.equal(flippedBoth.cells[1][5].side, "yellow");
  });
});

describe("MoveTracker", () => {
  it("meldet neue Steine als Züge", () => {
    const tracker = new MoveTracker({ confirmationFrames: 1, now: () => 5_000 });
    const start = emptyBoard();
    tracker.feed(observation(start, 0.95, 1_000));

    const first = cloneBoard(start);
    first[5][0] = "red";
    const events = tracker.feed(observation(first, 0.95, 2_000));
    const moves = moveEvents(events);

    assert.equal(moves.length, 1);
    assert.equal(moves[0].type, "move");
    if (moves[0].type === "move") {
      assert.deepEqual(moves[0].move, {
        turn: 1,
        side: "red",
        location: { x: 0, y: 5 },
        confidence: 0.95,
        capturedAt: 2_000,
        detectedAt: 5_000,
        frame: undefined,
      });
    }
    assert.equal(tracker.turn, 1);

    const second = cloneBoard(first);
    second[5][1] = "yellow";
    const secondEvents = moveEvents(tracker.feed(observation(second, 0.95, 3_000)));
    assert.equal(secondEvents.length, 1);
    if (secondEvents[0].type === "move") {
      assert.equal(secondEvents[0].move.turn, 2);
      assert.equal(secondEvents[0].move.side, "yellow");
      assert.deepEqual(secondEvents[0].move.location, { x: 1, y: 5 });
    }
  });

  it("wartet auf die konfigurierte Bestätigung", () => {
    const tracker = new MoveTracker({ confirmationFrames: 2 });
    const start = emptyBoard();
    tracker.feed(observation(start));

    const next = cloneBoard(start);
    next[5][0] = "red";

    assert.equal(moveEvents(tracker.feed(observation(next, 0.95, 2_000))).length, 0);
    assert.equal(moveEvents(tracker.feed(observation(next, 0.95, 3_000))).length, 1);
  });

  it("ignoriert unsichere Zellen, übernimmt sie aber später sicher erkannt", () => {
    const tracker = new MoveTracker({ confirmationFrames: 1 });
    const start = emptyBoard();
    tracker.feed(observation(start));

    const next = cloneBoard(start);
    next[5][0] = "red";

    assert.equal(moveEvents(tracker.feed(observation(next, 0.2, 2_000))).length, 0);
    assert.equal(tracker.turn, 0);

    // Dieselbe Zelle, jetzt mit hoher Konfidenz: Der Schlüssel ändert sich,
    // deshalb darf der Zug nicht dauerhaft verschluckt werden.
    assert.equal(moveEvents(tracker.feed(observation(next, 0.95, 3_000))).length, 1);
    assert.equal(tracker.turn, 1);
  });

  it("übernimmt mehrere gleichzeitig erkannte Steine von unten nach oben", () => {
    const tracker = new MoveTracker({ confirmationFrames: 1 });
    const start = emptyBoard();
    tracker.feed(observation(start));

    const next = cloneBoard(start);
    next[5][0] = "red";
    next[4][0] = "yellow";

    const moves = moveEvents(tracker.feed(observation(next, 0.95, 2_000)));
    assert.equal(moves.length, 2);
    if (moves[0].type === "move" && moves[1].type === "move") {
      assert.deepEqual(moves[0].move.location, { x: 0, y: 5 });
      assert.deepEqual(moves[1].move.location, { x: 0, y: 4 });
    }
  });

  it("ignoriert Steine, die in der Luft hängen", () => {
    const tracker = new MoveTracker({ confirmationFrames: 1 });
    const start = emptyBoard();
    tracker.feed(observation(start));

    const next = cloneBoard(start);
    next[4][0] = "red";

    assert.equal(moveEvents(tracker.feed(observation(next, 0.95, 2_000))).length, 0);
    assert.equal(tracker.turn, 0);
  });

  it("erkennt ein geleertes Brett als Reset", () => {
    const tracker = new MoveTracker({ confirmationFrames: 1 });
    const start = emptyBoard();
    start[5][0] = "red";
    start[5][1] = "yellow";
    tracker.feed(observation(start));

    const events = tracker.feed(observation(emptyBoard(), 0.95, 2_000));
    assert.equal(events.filter((event) => event.type === "reset").length, 1);
    assert.equal(tracker.turn, 0);
    assert.deepEqual(tracker.board, emptyBoard());
  });

  it("liest ein deutlich anderes Brett neu ein", () => {
    const tracker = new MoveTracker({ confirmationFrames: 1 });
    tracker.feed(observation(emptyBoard()));

    const next = emptyBoard();
    for (let row = 0; row < 5; row += 1) {
      for (let col = 0; col < 7; col += 1) next[row][col] = "red";
    }

    const events = tracker.feed(observation(next, 0.95, 2_000));
    const reset = events.find((event) => event.type === "reset");
    assert.ok(reset);
    if (reset?.type === "reset") assert.equal(reset.reason, "resync");
  });

  it("nimmt ein laufendes Brett als Startzustand, ohne Züge zu erfinden", () => {
    const tracker = new MoveTracker({ confirmationFrames: 1 });
    const board = emptyBoard();
    board[5][0] = "red";
    board[5][1] = "yellow";

    tracker.feed(observation(board));
    assert.equal(tracker.turn, 0);
    assert.deepEqual(tracker.board, board);
  });

  it("weist Beobachtungen mit falscher Brettgröße ab", () => {
    const tracker = new MoveTracker({ confirmationFrames: 1 });
    const wrong = { ...observation(emptyBoard()), layout: { rows: 5, cols: 7 } };
    assert.throws(() => tracker.feed(wrong));
  });
});

describe("Connect-Four-Ableitungen", () => {
  it("erkennt einen senkrechten Sieg", () => {
    const board = emptyBoard();
    for (let row = 2; row < 6; row += 1) board[row][3] = "red";
    assert.equal(winnerOf(board), "red");
  });

  it("erkennt ein Unentschieden auf vollem Brett", () => {
    const board = emptyBoard();
    for (let row = 0; row < 6; row += 1) {
      for (let col = 0; col < 7; col += 1) {
        board[row][col] = (row + 2 * col) % 4 < 2 ? "red" : "yellow";
      }
    }
    assert.equal(winnerOf(board), "draw");
  });

  it("meldet während einer laufenden Partie noch keinen Sieger", () => {
    assert.equal(winnerOf(emptyBoard()), null);
  });

  it("wandelt erkannte Züge in das API-Format", () => {
    const moves = toConnectFourMoves([
      {
        turn: 1,
        side: "red",
        location: { x: 3, y: 5 },
        confidence: 0.9,
        capturedAt: 1,
        detectedAt: 2,
      },
    ]);
    assert.deepEqual(moves, [
      { turn: 1, player: "red", location: { x: 3, y: 5 } },
    ]);
  });
});

describe("Pixelquelle", () => {
  it("mittelt Pixel innerhalb eines Kreises", () => {
    const data = new Uint8ClampedArray([
      255, 0, 0, 255, 255, 0, 0, 255,
      255, 0, 0, 255, 255, 0, 0, 255,
    ]);
    assert.deepEqual(averageColor(data, 2, 2, 0, 0, 1), { r: 255, g: 0, b: 0 });
    assert.deepEqual(averageColor(data, 0, 0, 0, 0, 1), { r: 0, g: 0, b: 0 });
  });

  it("funktioniert mit einer ImageData-artigen Struktur", () => {
    const image = {
      width: 1,
      height: 1,
      data: new Uint8ClampedArray([10, 20, 30, 255]),
    } as ImageData;
    const source = new CanvasPixelSource(image);
    assert.deepEqual(source.averageColor(0, 0, 0), { r: 10, g: 20, b: 30 });
  });
});

describe("Automatische Brett-Ausrichtung", () => {
  const rect = { x: 60, y: 60, width: 600, height: 500 };
  const trueCorners = cornersFromRect(rect);
  /** Ecken so versetzt, wie sie beim Ziehen auf den Lochrand entstehen. */
  const insetCorners = cornersFromRect({
    x: rect.x + 15,
    y: rect.y + 15,
    width: rect.width - 30,
    height: rect.height - 30,
  });

  function cornerDistances(
    actual: {
      topLeft: { x: number; y: number };
      topRight: { x: number; y: number };
      bottomRight: { x: number; y: number };
      bottomLeft: { x: number; y: number };
    },
  ): number[] {
    const expected = [
      trueCorners.topLeft,
      trueCorners.topRight,
      trueCorners.bottomRight,
      trueCorners.bottomLeft,
    ];
    const found = [actual.topLeft, actual.topRight, actual.bottomRight, actual.bottomLeft];
    return expected.map((point, index) =>
      Math.hypot(found[index].x - point.x, found[index].y - point.y),
    );
  }

  it("findet die Zellgrenzen trotz zu klein gesetzter Ecken", () => {
    const board = emptyBoard();
    board[0][0] = "yellow";
    board[3][2] = "red";
    board[5][0] = "red";
    board[5][6] = "yellow";
    const source = renderBoardImage(board, rect);

    const refined = refineBoardCorners(source, insetCorners);
    assert.ok(refined !== null);

    const distances = cornerDistances(refined);
    for (const distance of distances) {
      assert.ok(distance < 6, `Ecke liegt ${distance.toFixed(1)} px daneben`);
    }
  });

  it("erkennt mit den ausgerichteten Ecken alle Steine", () => {
    const board = emptyBoard();
    board[0][0] = "red";
    board[3][3] = "yellow";
    board[4][6] = "red";
    board[5][0] = "red";
    board[5][6] = "yellow";
    const source = renderBoardImage(board, rect);

    const refined = refineBoardCorners(source, insetCorners);
    assert.ok(refined !== null);

    const detector = new ConnectFourDetector({ corners: refined });
    const result = detector.detect(source, 1);

    for (let row = 0; row < 6; row += 1) {
      for (let col = 0; col < 7; col += 1) {
        assert.equal(result.cells[row][col].side, board[row][col], `Zelle ${row}/${col}`);
      }
    }
  });

  it("verändert eine bereits passende Kalibrierung kaum", () => {
    const source = renderBoardImage(emptyBoard(), rect);

    const refined = refineBoardCorners(source, trueCorners);
    assert.ok(refined !== null);

    for (const distance of cornerDistances(refined)) {
      assert.ok(distance < 4, `Ecke liegt ${distance.toFixed(1)} px daneben`);
    }
  });

  it("gibt bei einem unbrauchbaren Bild null zurück", () => {
    const blank: PixelSource = {
      width: 320,
      height: 240,
      averageColor: () => ({ r: 120, g: 120, b: 120 }),
    };
    const corners = cornersFromRect({ x: 0, y: 0, width: 320, height: 240 });
    assert.equal(refineBoardCorners(blank, corners), null);
  });
});
