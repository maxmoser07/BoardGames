/**
 * Validierung eines abgeschlossenen Connect-Four-Verlaufs.
 *
 * `useConnectFour.ts` erzeugt die Züge selbst, ist aber eingefroren – die
 * Prüfung hier ist deshalb die einzige Stelle, an der ein fehlerhaftes
 * Ergebnis auffallen kann, bevor es gespeichert wird. Sie bildet bewusst
 * dieselben Regeln ab, die `backend/src/api.rs` serverseitig erzwingt
 * (fortlaufende `turn`-Nummern, Seiten "red"/"yellow", Koordinaten im Brett,
 * "draw" nur bei vollem Brett), plus die Physik: ein Stein landet auf dem
 * Boden oder auf einem bereits liegenden Stein.
 */

import type { ConnectFourResult, Side } from "../types";

export const ROWS = 6;
export const COLS = 7;
const CELLS = ROWS * COLS;
const SIDES = ["red", "yellow"] as const;

export class InvalidResultError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidResultError";
  }
}

function isSide(value: string): value is (typeof SIDES)[number] {
  return (SIDES as readonly string[]).includes(value);
}

export function validateConnectFourResult(result: ConnectFourResult): void {
  const { moves, winner } = result;

  if (!Array.isArray(moves) || moves.length === 0) {
    throw new InvalidResultError("Das Spiel enthält keine Züge.");
  }
  if (moves.length > CELLS) {
    throw new InvalidResultError(`${moves.length} Züge passen nicht auf ein ${ROWS}x${COLS}-Brett.`);
  }

  const height = new Array<number>(COLS).fill(0);

  moves.forEach((move, index) => {
    const turn = index + 1;
    if (move.turn !== turn) {
      throw new InvalidResultError(`Zug ${turn}: move.turn ist ${move.turn}.`);
    }
    if (!isSide(move.player)) {
      throw new InvalidResultError(`Zug ${turn}: "${move.player}" ist keine Farbe von Connect Four.`);
    }
    if (move.player !== (turn % 2 === 1 ? "red" : "yellow")) {
      throw new InvalidResultError(`Zug ${turn}: ${move.player} ist nicht am Zug.`);
    }

    const { x, y } = move.location;
    if (x < 0 || x >= COLS || y < 0 || y >= ROWS) {
      throw new InvalidResultError(`Zug ${turn}: Feld ${x}/${y} liegt außerhalb des Bretts.`);
    }
    if (y !== ROWS - 1 - height[x]) {
      throw new InvalidResultError(`Zug ${turn}: Stein in Spalte ${x} schwebt – Spalte ist nicht korrekt gefüllt.`);
    }
    height[x] += 1;
  });

  if (winner === "draw" && moves.length !== CELLS) {
    throw new InvalidResultError(`Ein Unentschieden braucht ein volles Brett, hier ${moves.length} von ${CELLS} Züge.`);
  }
  if (winner !== "draw" && moves.length === CELLS) {
    throw new InvalidResultError("Ein volles Brett kann nicht mit einem Sieg enden.");
  }
  if (winner !== "draw" && !moves.some((move) => move.player === winner)) {
    throw new InvalidResultError(`Für den Sieg "${winner}" gibt es in diesem Spiel keinen Zug.`);
  }
}

/** Kurzstatistik für die Ergebnisliste. */
export function summariseMoves(moves: ConnectFourResult["moves"]): {
  red: number;
  yellow: number;
  lastTurn: number;
} {
  return {
    red: moves.filter((move) => move.player === "red").length,
    yellow: moves.filter((move) => move.player === "yellow").length,
    lastTurn: moves.length,
  };
}

/**
 * Spielt die Züge auf ein 6x7-Raster zurück – für die Miniaturansicht in der
 * Historie, ohne das echte Brett erneut zu berechnen.
 */
export function buildGrid(moves: ConnectFourResult["moves"]): (Side | null)[][] {
  const grid: (Side | null)[][] = Array.from({ length: ROWS }, () => Array<Side | null>(COLS).fill(null));
  for (const move of moves) {
    const { x, y } = move.location;
    if (x >= 0 && x < COLS && y >= 0 && y < ROWS) grid[y][x] = move.player;
  }
  return grid;
}

