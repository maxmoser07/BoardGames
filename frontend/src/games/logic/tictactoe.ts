import type { Side } from "../../types";

export type TicTacToeCell = Side | null;
export type TicTacToeBoard = TicTacToeCell[];

export const TICTACTOE_SIZE = 3;
export const TICTACTOE_CELLS = TICTACTOE_SIZE * TICTACTOE_SIZE;

export const TICTACTOE_LINES: readonly (readonly [number, number, number])[] = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
];

export function emptyTicTacToeBoard(): TicTacToeBoard {
  return Array.from({ length: TICTACTOE_CELLS }, () => null);
}

export function ticTacToeWinner(board: TicTacToeBoard): Side | "draw" | null {
  for (const [a, b, c] of TICTACTOE_LINES) {
    if (board[a] !== null && board[a] === board[b] && board[a] === board[c]) return board[a];
  }
  return board.every((cell) => cell !== null) ? "draw" : null;
}

export function ticTacToeMove(board: TicTacToeBoard, index: number, side: Side): TicTacToeBoard | null {
  if (index < 0 || index >= TICTACTOE_CELLS) return null;
  if (board[index] !== null) return null;
  const next = board.slice();
  next[index] = side;
  return next;
}
