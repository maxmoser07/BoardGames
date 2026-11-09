import { useState } from "react";
import { RotateCcw } from "lucide-react";

import type { GameMove, Side } from "../types";
import {
  chessStatus,
  colOf,
  initialChessState,
  legalMovesFrom,
  makeMove,
  rowOf,
  type ChessPieceType,
  type ChessState,
} from "./logic/chess";
import type { GameComponentProps } from "./types";
import { useGameRecord } from "./useGameRecord";

const LABEL: Record<Side, string> = { red: "Rot", yellow: "Gelb" };

const PIECE_LETTER: Record<ChessPieceType, string> = {
  p: "P",
  n: "N",
  b: "B",
  r: "R",
  q: "Q",
  k: "K",
};

const PIECE_NAME: Record<ChessPieceType, string> = {
  p: "Bauer",
  n: "Springer",
  b: "Laeufer",
  r: "Turm",
  q: "Dame",
  k: "Koenig",
};

export function ChessGame({ context }: GameComponentProps) {
  const [state, setState] = useState<ChessState>(initialChessState);
  const [selected, setSelected] = useState<number | null>(null);
  const [moves, setMoves] = useState<GameMove[]>([]);
  const [winner, setWinner] = useState<Side | "draw" | null>(null);
  const { record, error, reset: resetRecord } = useGameRecord(context);

  const status = chessStatus(state);
  const locked = context.paused || winner !== null;
  const legal = selected === null ? [] : legalMovesFrom(state, selected);

  function clickSquare(index: number): void {
    if (locked) return;

    const piece = state.board[index];

    if (selected === null) {
      if (piece !== null && piece.color === state.turn) setSelected(index);
      return;
    }

    if (index === selected) {
      setSelected(null);
      return;
    }

    if (piece !== null && piece.color === state.turn) {
      setSelected(index);
      return;
    }

    if (!legal.includes(index)) {
      setSelected(null);
      return;
    }

    const made = makeMove(state, selected, index);
    if (!made) {
      setSelected(null);
      return;
    }

    const move: GameMove = {
      turn: moves.length + 1,
      player: state.turn,
      payload: {
        from: [rowOf(made.move.from), colOf(made.move.from)],
        to: [rowOf(made.move.to), colOf(made.move.to)],
        piece: made.move.piece.type,
        captured: made.move.captured?.type ?? null,
        promotion: made.move.promotion,
        castle: made.move.castle,
        en_passant: made.move.enPassant,
      },
    };
    const nextMoves = [...moves, move];

    setState(made.state);
    setMoves(nextMoves);
    setSelected(null);

    const nextStatus = chessStatus(made.state);
    if (nextStatus.winner !== null) {
      setWinner(nextStatus.winner);
      void record({ moves: nextMoves, winner: nextStatus.winner });
    }
  }

  function reset(): void {
    setState(initialChessState());
    setSelected(null);
    setMoves([]);
    setWinner(null);
    resetRecord();
  }

  const headline =
    winner === "draw"
      ? "Patt - Unentschieden"
      : winner !== null
        ? `${LABEL[winner]} gewinnt`
        : status.inCheck
          ? `${LABEL[state.turn]} ist im Schach`
          : `${LABEL[state.turn]} ist am Zug`;

  return (
    <section className="board-game board-game--chess" aria-label="Schach">
      <header className="board-game__head">
        <div>
          <p className="board-game__eyebrow">Schach</p>
          <h2 className="board-game__title">{headline}</h2>
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

      <div className="chess" role="grid" aria-label="Schachbrett">
        {state.board.map((piece, index) => {
          const row = rowOf(index);
          const col = colOf(index);
          const dark = (row + col) % 2 === 1;
          const isSelected = selected === index;
          const isTarget = legal.includes(index);
          const isLast =
            state.lastMove !== null &&
            (state.lastMove.from === index || state.lastMove.to === index);

          return (
            <button
              key={index}
              type="button"
              role="gridcell"
              className={`chess__square${dark ? " chess__square--dark" : ""}${
                isSelected ? " is-selected" : ""
              }${isTarget ? " is-target" : ""}${isLast ? " is-last" : ""}`}
              onClick={() => clickSquare(index)}
              disabled={locked}
              aria-label={`${String.fromCharCode(97 + col)}${8 - row}${
                piece ? ` ${PIECE_NAME[piece.type]} ${LABEL[piece.color]}` : ""
              }`}
            >
              {isTarget ? <span className="chess__target" aria-hidden="true" /> : null}
              {piece ? (
                <span className={`chess__piece chess__piece--${piece.color}`}>
                  {PIECE_LETTER[piece.type]}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      <p className="board-game__hint">
        {moves.length} {moves.length === 1 ? "Zug" : "Zuege"} - Rot beginnt. Bauern werden
        automatisch zur Dame.
      </p>
    </section>
  );
}
