import { useState } from "react";
import { RotateCcw } from "lucide-react";

import { opponent, type GameMove, type GameType, type Side } from "../types";
import {
  emptyGridBoard,
  gridPosition,
  placeGridMove,
  gridWinner,
  type GridBoard,
  type GridRules,
} from "./logic/grid";
import type { GameComponentProps } from "./types";
import { useGameRecord } from "./useGameRecord";

const LABEL: Record<Side, string> = { red: "Rot", yellow: "Gelb" };

interface Props extends GameComponentProps {
  game: GameType;
}

function rulesOf(game: GameType): GridRules {
  return {
    rows: game.board?.rows ?? 3,
    cols: game.board?.cols ?? 3,
    winLength: game.winLength > 0 ? game.winLength : 3,
    gravity: game.gravity,
  };
}

/**
 * Brett für die konfigurierbaren Vorlagen `grid` und `connect-four`.
 * Brettgröße und Gewinnbedingung kommen aus `game_types.rules_json`.
 */
export function GridGame({ context, game }: Props) {
  const rules = rulesOf(game);
  const [board, setBoard] = useState<GridBoard>(() => emptyGridBoard(rules));
  const [turn, setTurn] = useState<Side>("red");
  const [moves, setMoves] = useState<GameMove[]>([]);
  const [winner, setWinner] = useState<Side | "draw" | null>(null);
  const [lastIndex, setLastIndex] = useState<number | null>(null);
  const { record, error, reset: resetRecord } = useGameRecord(context);

  const locked = context.paused || winner !== null;

  function play(row: number, col: number): void {
    if (locked) return;
    const placed = placeGridMove(board, rules, turn, col, row);
    if (placed === null) return;

    const move: GameMove = {
      turn: moves.length + 1,
      player: turn,
      location: { x: placed.col, y: placed.row },
      payload: {
        cell: placed.index,
        col: placed.col,
        row: placed.row,
        ...(rules.gravity ? {} : { free: true }),
      },
    };
    const nextMoves = [...moves, move];
    const result = gridWinner(placed.board, rules, placed.index);

    setBoard(placed.board);
    setMoves(nextMoves);
    setLastIndex(placed.index);

    if (result !== null) {
      setWinner(result);
      void record({ moves: nextMoves, winner: result });
    } else {
      setTurn(opponent(turn));
    }
  }

  function reset(): void {
    setBoard(emptyGridBoard(rules));
    setTurn("red");
    setMoves([]);
    setWinner(null);
    setLastIndex(null);
    resetRecord();
  }

  const status =
    winner === null
      ? `${LABEL[turn]} ist am Zug`
      : winner === "draw"
        ? "Unentschieden"
        : `${LABEL[winner]} gewinnt`;

  const cells = Array.from({ length: rules.rows }, (_, row) =>
    Array.from({ length: rules.cols }, (_, col) => gridPosition(rules, row * rules.cols + col)),
  ).flat();

  return (
    <section className="board-game board-game--grid" aria-label={game.displayName}>
      <header className="board-game__head">
        <div>
          <p className="board-game__eyebrow">{game.displayName}</p>
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

      <div
        className={`grid-board${rules.gravity ? " grid-board--gravity" : ""}`}
        role="grid"
        aria-label="Spielfeld"
        style={
          {
            "--cols": String(rules.cols),
            "--rows": String(rules.rows),
          } as React.CSSProperties
        }
      >
        {cells.map(({ row, col }) => {
          const index = row * rules.cols + col;
          const cell = board[index];
          const isLast = lastIndex === index;
          return (
            <button
              key={index}
              type="button"
              role="gridcell"
              className={`grid-board__cell${cell ? ` grid-board__cell--${cell}` : ""}${
                isLast ? " is-last" : ""
              }`}
              onClick={() => play(row, col)}
              disabled={locked || cell !== null}
              aria-label={
                rules.gravity
                  ? `Spalte ${col + 1}${cell ? `, ${LABEL[cell]}` : ""}`
                  : `Zeile ${row + 1}, Spalte ${col + 1}${cell ? `, ${LABEL[cell]}` : ""}`
              }
            >
              {cell ? (rules.gravity ? "" : cell === "red" ? "X" : "O") : ""}
            </button>
          );
        })}
      </div>

      <p className="board-game__hint">
        {rules.cols}×{rules.rows} · {rules.winLength} in einer Reihe ·{" "}
        {rules.gravity ? "Steine fallen in die Spalte" : "freie Platzierung"} ·{" "}
        {moves.length} {moves.length === 1 ? "Zug" : "Züge"}
      </p>
    </section>
  );
}
