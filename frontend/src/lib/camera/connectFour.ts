/**
 * Connect-Four-Helfer für die Kamera-Bibliothek.
 *
 * `winnerOf` und `toConnectFourMoves` verbinden die erkannten Züge mit der
 * bestehenden Oberfläche: Am Ende einer Partie lassen sich die Züge direkt an
 * `api.recordConnectFourGame` übergeben.
 */

import type { ConnectFourMove } from "../../types";
import type { BoardLayout, BoardState, Side, TrackedMove } from "./types";

export const CONNECT_FOUR_BOARD: BoardLayout = { rows: 6, cols: 7 };

export function emptyBoard(layout: BoardLayout = CONNECT_FOUR_BOARD): BoardState {
  return Array.from({ length: layout.rows }, () => Array<Side | null>(layout.cols).fill(null));
}

const DIRECTIONS: ReadonlyArray<readonly [number, number]> = [
  [0, 1],
  [1, 0],
  [1, 1],
  [1, -1],
];

/**
 * Sieger oder "draw" aus einem Brett; `null`, solange die Partie läuft.
 * Dieselben Regeln wie `checkWin` in `useConnectFour.ts`.
 */
export function winnerOf(board: BoardState): Side | "draw" | null {
  const rows = board.length;
  const cols = rows === 0 ? 0 : board[0].length;

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const side = board[row][col];
      if (side === null) continue;

      for (const [dr, dc] of DIRECTIONS) {
        let count = 1;
        for (const sign of [1, -1]) {
          for (let step = 1; step < 4; step += 1) {
            const r = row + dr * step * sign;
            const c = col + dc * step * sign;
            if (r < 0 || r >= rows || c < 0 || c >= cols) break;
            if (board[r][c] !== side) break;
            count += 1;
          }
        }
        if (count >= 4) return side;
      }
    }
  }

  const full = board.every((line) => line.every((cell) => cell !== null));
  return full ? "draw" : null;
}

/** Wandelt erkannte Züge in das Format von `POST /api/connect-four/games`. */
export function toConnectFourMoves(moves: TrackedMove[]): ConnectFourMove[] {
  return moves.map((move) => ({
    turn: move.turn,
    player: move.side,
    location: { x: move.location.x, y: move.location.y },
  }));
}
