import { useState } from "react";
import { RotateCcw } from "lucide-react";

import { opponent, type GameMove, type Side } from "../types";
import {
  TICTACTOE_SIZE,
  emptyTicTacToeBoard,
  ticTacToeMove,
  ticTacToeWinner,
  type TicTacToeBoard,
} from "./logic/tictactoe";
import type { GameComponentProps } from "./types";
import { useGameRecord } from "./useGameRecord";

const MARK: Record<Side, string> = { red: "X", yellow: "O" };
const LABEL: Record<Side, string> = { red: "Rot (X)", yellow: "Gelb (O)" };

export function TicTacToeGame({ context }: GameComponentProps) {
  const [board, setBoard] = useState<TicTacToeBoard>(emptyTicTacToeBoard);
  const [turn, setTurn] = useState<Side>("red");
  const [moves, setMoves] = useState<GameMove[]>([]);
  const [winner, setWinner] = useState<Side | "draw" | null>(null);
  const { record, error, reset: resetRecord } = useGameRecord(context);

  const locked = context.paused || winner !== null;

  function play(index: number): void {
    if (locked) return;
    const next = ticTacToeMove(board, index, turn);
    if (next === null) return;

    const move: GameMove = {
      turn: moves.length + 1,
      player: turn,
      location: { x: index % TICTACTOE_SIZE, y: Math.floor(index / TICTACTOE_SIZE) },
      payload: { cell: index },
    };
    const nextMoves = [...moves, move];
    const result = ticTacToeWinner(next);

    setBoard(next);
    setMoves(nextMoves);

    if (result !== null) {
      setWinner(result);
      void record({ moves: nextMoves, winner: result });
    } else {
      setTurn(opponent(turn));
    }
  }

  function reset(): void {
    setBoard(emptyTicTacToeBoard());
    setTurn("red");
    setMoves([]);
    setWinner(null);
    resetRecord();
  }

  const status =
    winner === null
      ? `${LABEL[turn]} ist am Zug`
      : winner === "draw"
        ? "Unentschieden"
        : `${LABEL[winner]} gewinnt`;

  return (
    <section className="board-game board-game--ttt" aria-label="Tic Tac Toe">
      <header className="board-game__head">
        <div>
          <p className="board-game__eyebrow">Tic Tac Toe</p>
          <h2 className="board-game__title">{status}</h2>
        </div>
        {context.sessionId === null ? (
          <button type="button" className="btn btn--ghost btn--sm" onClick={reset}>
            <RotateCcw aria-hidden="true" size={15} />
            Neu
          </button>
        ) : null}
      </header>

      {context.paused ? <p className="board-game__hint">Die Sitzung ist pausiert.</p> : null}
      {error ? <p className="board-game__error">{error}</p> : null}

      <div className="ttt" role="grid" aria-label="Spielfeld">
        {board.map((cell, index) => (
          <button
            key={index}
            type="button"
            role="gridcell"
            className={`ttt__cell${cell ? ` ttt__cell--${cell}` : ""}`}
            onClick={() => play(index)}
            disabled={locked || cell !== null}
            aria-label={`Feld ${index + 1}${cell ? `, ${LABEL[cell]}` : ""}`}
          >
            {cell ? MARK[cell] : ""}
          </button>
        ))}
      </div>

      <p className="board-game__hint">
        {moves.length} {moves.length === 1 ? "Zug" : "Zuege"} - Rot beginnt, Gelb antwortet.
      </p>
    </section>
  );
}
