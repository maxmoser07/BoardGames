/**
 * Tests fuer die reine Schrittlogik der Wiedergabe.
 * Ausfuehren: `npm test` (Node 24 fuehrt TypeScript direkt aus).
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { clampMoveStep, replayStepLabel, shiftMoveStep } from "../src/lib/replay.ts";

describe("Wiedergabe", () => {
  it("klemmt Schritte auf den gespeicherten Verlauf", () => {
    assert.equal(clampMoveStep(-4, 12), 0);
    assert.equal(clampMoveStep(5, 12), 5);
    assert.equal(clampMoveStep(99, 12), 12);
    assert.equal(clampMoveStep(2.9, 12), 2);
  });

  it("behandelt fehlende oder ungültige Werte als Start", () => {
    assert.equal(clampMoveStep(Number.NaN, 12), 0);
    assert.equal(clampMoveStep(3, Number.NaN), 0);
    assert.equal(clampMoveStep(3, -1), 0);
  });

  it("geht in beide Richtungen nie über den Verlauf hinaus", () => {
    assert.equal(shiftMoveStep(0, -1, 4), 0);
    assert.equal(shiftMoveStep(4, 1, 4), 4);
    assert.equal(shiftMoveStep(2, 1, 4), 3);
  });

  it("beschreibt Start, Zwischenstand und Endstand", () => {
    assert.equal(replayStepLabel(0, 0), "Keine Züge gespeichert");
    assert.equal(replayStepLabel(0, 7), "Startstellung - 0 von 7");
    assert.equal(replayStepLabel(3, 7), "Zug 3 von 7");
    assert.equal(replayStepLabel(7, 7), "Endstand - 7 von 7");
    assert.equal(replayStepLabel(42, 7), "Endstand - 7 von 7");
  });
});
