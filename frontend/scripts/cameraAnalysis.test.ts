/**
 * Tests fuer das Live-Feedback und die Zuganalyse der Kamera-Ansicht.
 * Ausfuehren: `npm test`
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { emptyBoard } from "../src/lib/camera/connectFour.ts";
import type { BoardObservation, TrackedMove } from "../src/lib/camera/types.ts";
import {
  assessMoves,
  describeDetection,
  summariseMoves,
} from "../src/lib/cameraAnalysis.ts";
import {
  estimateMoveChances,
  immediateWinningColumns,
} from "../src/lib/connectFourOdds.ts";

function observation(confidence: number): BoardObservation {
  return {
    layout: { rows: 6, cols: 7 },
    cells: Array.from({ length: 6 }, () =>
      Array.from({ length: 7 }, () => ({
        side: null,
        confidence,
        color: { r: 0, g: 0, b: 0 },
      })),
    ),
    confidence,
    capturedAt: 1_000,
  };
}

function trackedMove(
  turn: number,
  side: "red" | "yellow",
  col: number,
  row: number,
): TrackedMove {
  return {
    turn,
    side,
    location: { x: col, y: row },
    confidence: 0.9,
    capturedAt: 1_000 + turn,
    detectedAt: 2_000 + turn,
  };
}

/** Baut Zuege wie im echten Spiel: jeder Stein landet auf dem ersten freien Feld. */
function trackedGame(
  entries: ReadonlyArray<readonly [number, "red" | "yellow", number]>,
): TrackedMove[] {
  const heights = new Array<number>(7).fill(0);
  return entries.map(([turn, side, col]) => {
    const row = 5 - heights[col];
    heights[col] += 1;
    return trackedMove(turn, side, col, row);
  });
}

describe("Kamera-Live-Feedback", () => {
  it("wartet ohne Beobachtung auf das erste Bild", () => {
    const feedback = describeDetection(null, 0, null, 5_000);
    assert.equal(feedback.state, "waiting");
    assert.equal(feedback.totalCells, 42);
    assert.equal(feedback.confidence, null);
  });

  it("meldet eine stabile Erkennung", () => {
    const feedback = describeDetection(observation(0.9), 12, 4_800, 5_000);
    assert.equal(feedback.state, "stable");
    assert.equal(feedback.uncertainCells, 0);
    assert.equal(feedback.perCell.length, 6);
    assert.equal(feedback.perCell[0].length, 7);
    assert.equal(feedback.lastFrameAgoMs, 200);
  });

  it("erkennt unsichere Zellen und alte Frames", () => {
    const unsure = describeDetection(observation(0.2), 3, 4_900, 5_000);
    assert.equal(unsure.state, "attention");
    assert.equal(unsure.uncertainCells, 42);

    const stale = describeDetection(observation(0.9), 3, 1_000, 5_000);
    assert.equal(stale.state, "stale");
    assert.equal(stale.lastFrameAgoMs, 4_000);
  });
});

describe("Kamera-Zuganalyse", () => {
  it("bewertet jede legale Spalte und erkennt den Sofortsieg", () => {
    const board = emptyBoard({ rows: 6, cols: 7 });
    board[5][0] = "red";
    board[5][1] = "red";
    board[5][2] = "red";

    assert.deepEqual(immediateWinningColumns(board, "red"), [3]);

    const chances = estimateMoveChances(board, "red", { samples: 8 });
    assert.equal(chances.bestColumn, 3);
    assert.equal(chances.bestChance, 100);
    assert.equal(chances.chances[3], 100);
  });

  it("stuft den entscheidenden Zug als besten Zug ein", () => {
    const moves = trackedGame([
      [1, "red", 0],
      [2, "yellow", 0],
      [3, "red", 1],
      [4, "yellow", 1],
      [5, "red", 2],
      [6, "yellow", 6],
      [7, "red", 3],
    ]);

    const assessments = assessMoves(moves, { maxMoves: 10, samples: 12 });
    assert.equal(assessments.length, 7);
    const last = assessments[assessments.length - 1];
    assert.equal(last.turn, 7);
    assert.equal(last.playedChance, 100);
    assert.equal(last.grade, "best");

    const summary = summariseMoves(assessments);
    assert.equal(summary.total, 7);
    assert.ok(summary.accuracy >= 0 && summary.accuracy <= 100);
  });

  it("bezieht Steine vor dem Tracking als Startbrett ein", () => {
    const startBoard = emptyBoard({ rows: 6, cols: 7 });
    startBoard[5][0] = "red";
    startBoard[5][1] = "red";
    startBoard[5][2] = "red";

    const [assessment] = assessMoves([trackedMove(1, "red", 3, 5)], {
      samples: 8,
      startBoard,
    });

    assert.equal(assessment.playedChance, 100);
    assert.equal(assessment.grade, "best");
  });
});
