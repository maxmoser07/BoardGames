import { useCallback, useState } from "react";

export type Player = "red" | "yellow";
export type Cell = Player | null;

export type Location = { x: number; y: number };

export type Move = {
  turn: number;
  player: Player;
  location: Location;
};

export type GameResult = {
  moves: Move[];
  winner: Player | "draw";
};

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

const GAME_API_URL = "/api/connect-four/games";

async function submitGame(result: GameResult): Promise<void> {
  const res = await fetch(GAME_API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(result),
  });
  if (!res.ok) {
    throw new Error(`Failed to submit game: ${res.status}`);
  }
}

export function useConnectFour() {
  const [board, setBoard] = useState<Cell[][]>(createBoard);
  const [currentPlayer, setCurrentPlayer] = useState<Player>("red");
  const [winner, setWinner] = useState<Player | "draw" | null>(null);
  const [moves, setMoves] = useState<Move[]>([]);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const dropDisc = useCallback(
    (col: number) => {
      if (winner) return;

      let row = -1;
      for (let r = ROWS - 1; r >= 0; r--) {
        if (board[r][col] === null) {
          row = r;
          break;
        }
      }
      if (row === -1) return;

      const next = board.map((r) => [...r]);
      next[row][col] = currentPlayer;

      const move: Move = {
        turn: moves.length + 1,
        player: currentPlayer,
        location: { x: col, y: row }, // x = column, y = row
      };
      const nextMoves = [...moves, move];

      setBoard(next);
      setMoves(nextMoves);

      let result: Player | "draw" | null = null;
      if (checkWin(next, row, col, currentPlayer)) {
        result = currentPlayer;
      } else if (next.flat().every(Boolean)) {
        result = "draw";
      }

      if (result) {
        setWinner(result);
        submitGame({ moves: nextMoves, winner: result }).catch((err) => {
          console.error(err);
          setSubmitError("Could not save game.");
        });
      } else {
        setCurrentPlayer(currentPlayer === "red" ? "yellow" : "red");
      }
    },
    [board, currentPlayer, winner, moves]
  );

  const reset = useCallback(() => {
    setBoard(createBoard());
    setCurrentPlayer("red");
    setWinner(null);
    setMoves([]);
    setSubmitError(null);
  }, []);

  const status = winner
    ? winner === "draw"
      ? "It's a draw!"
      : `${winner[0].toUpperCase() + winner.slice(1)} wins!`
    : `${currentPlayer[0].toUpperCase() + currentPlayer.slice(1)}'s turn`;

  return {
    board,
    currentPlayer,
    winner,
    status,
    moves,
    submitError,
    dropDisc,
    reset,
  };
}