import type { Side } from "../../types";

/**
 * Konfigurierbares Raster für die Spiellogik-Vorlagen `grid` und
 * `connect-four`. Dieselben Regeln prüft das Backend in
 * `validate_grid`, damit neue Spiele aus der Administration speicherbar sind.
 */
export interface GridRules {
  rows: number;
  cols: number;
  winLength: number;
  /** true = Steine fallen in die unterste freie Zeile. */
  gravity: boolean;
}

export type GridCell = Side | null;
export type GridBoard = GridCell[];

export interface GridPlacement {
  board: GridBoard;
  index: number;
  row: number;
  col: number;
}

export function emptyGridBoard(rules: Pick<GridRules, "rows" | "cols">): GridBoard {
  return Array.from({ length: rules.rows * rules.cols }, () => null);
}

export function gridIndex(rules: Pick<GridRules, "cols">, row: number, col: number): number {
  return row * rules.cols + col;
}

export function gridPosition(
  rules: Pick<GridRules, "cols">,
  index: number,
): { row: number; col: number } {
  return { row: Math.floor(index / rules.cols), col: index % rules.cols };
}

/** Unterste freie Zeile einer Spalte; `null`, wenn die Spalte voll ist. */
export function gridDropRow(
  board: GridBoard,
  rules: Pick<GridRules, "rows" | "cols">,
  col: number,
): number | null {
  if (col < 0 || col >= rules.cols) return null;
  for (let row = rules.rows - 1; row >= 0; row -= 1) {
    if (board[gridIndex(rules, row, col)] === null) return row;
  }
  return null;
}

/**
 * Setzt einen Stein. Bei `gravity` ist `row` ohne Bedeutung, bei freier
 * Platzierung wird genau dieses Feld belegt.
 */
export function placeGridMove(
  board: GridBoard,
  rules: GridRules,
  side: Side,
  col: number,
  row: number,
): GridPlacement | null {
  if (col < 0 || col >= rules.cols) return null;

  const targetRow = rules.gravity ? gridDropRow(board, rules, col) : row;
  if (targetRow === null || targetRow < 0 || targetRow >= rules.rows) return null;

  const index = gridIndex(rules, targetRow, col);
  if (board[index] !== null) return null;

  const next = board.slice();
  next[index] = side;
  return { board: next, index, row: targetRow, col };
}

/** Prüft nach dem letzten Zug auf Sieg oder volles Brett. */
export function gridWinner(
  board: GridBoard,
  rules: GridRules,
  lastIndex: number,
): Side | "draw" | null {
  const side = board[lastIndex];
  if (side === null) return null;
  if (gridLine(board, rules, lastIndex, side)) return side;
  return board.every((cell) => cell !== null) ? "draw" : null;
}

/** Zusammenhängende Felder ab `index` in alle vier Richtungen. */
export function gridLine(
  board: GridBoard,
  rules: Pick<GridRules, "rows" | "cols" | "winLength">,
  index: number,
  side: Side,
): boolean {
  const { row, col } = gridPosition(rules, index);
  const directions: Array<[number, number]> = [
    [0, 1],
    [1, 0],
    [1, 1],
    [1, -1],
  ];

  return directions.some(([dr, dc]) => {
    let count = 1;
    for (const sign of [1, -1] as const) {
      let r = row + dr * sign;
      let c = col + dc * sign;
      while (r >= 0 && r < rules.rows && c >= 0 && c < rules.cols) {
        if (board[gridIndex(rules, r, c)] !== side) break;
        count += 1;
        r += dr * sign;
        c += dc * sign;
      }
    }
    return count >= rules.winLength;
  });
}
