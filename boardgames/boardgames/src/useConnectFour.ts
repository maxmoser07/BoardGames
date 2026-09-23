import { useCallback, useState } from "react";

export type Player = "red" | "yellow";
export type Cell = Player | null;

const ROWS = 6;
const COLS = 7;

const createBoard = (): Cell[][] =>
  Array.from({ length: ROWS }, () => Array<Cell>(COLS).fill(null));

const checkWin = (
  board: Cell[][],
  row: number,
  col: number,
  player: Player
): boolean => {
  const directions = [
    [0, 1],
    [1, 0],
    [1, 1],
    [1, -1],
  ];

  return directions.some(([dr, dc]) => {
    let count = 1;

    for (const sign of [1, -1]) {
      for (let step = 1; step < 4; step++) {
        const r = row + dr * step * sign;
        const c = col + dc * step * sign;

        if (r < 0 || r >= ROWS || c < 0 || c >= COLS) break;
        if (board[r][c] !== player) break;
        count++;
      }
    }

    return count >= 4;
  });
};

export function useConnectFour() {
  const [board, setBoard] = useState<Cell[][]>(createBoard);
  const [currentPlayer, setCurrentPlayer] = useState<Player>("red");
  const [winner, setWinner] = useState<Player | "draw" | null>(null);

  const dropDisc = useCallback(
    (col: number) => {
      if (winner) return;

      // find the lowest empty row in this column
      let row = -1;
      for (let r = ROWS - 1; r >= 0; r--) {
        if (board[r][col] === null) {
          row = r;
          break;
        }
      }
      if (row === -1) return; // column full

      // build the next board (pure, no side effects)
      const next = board.map((r) => [...r]);
      next[row][col] = currentPlayer;

      // commit state
      setBoard(next);

      if (checkWin(next, row, col, currentPlayer)) {
        setWinner(currentPlayer);
      } else if (next.flat().every(Boolean)) {
        setWinner("draw");
      } else {
        setCurrentPlayer(currentPlayer === "red" ? "yellow" : "red");
      }
    },
    [board, currentPlayer, winner]
  );

  const reset = useCallback(() => {
    setBoard(createBoard());
    setCurrentPlayer("red");
    setWinner(null);
  }, []);

  const status = winner
    ? winner === "draw"
      ? "It's a draw!"
      : `${winner[0].toUpperCase() + winner.slice(1)} wins!`
    : `${currentPlayer[0].toUpperCase() + currentPlayer.slice(1)}'s turn`;

  return { board, currentPlayer, winner, status, dropDisc, reset };
}