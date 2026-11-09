import { useEffect, useRef, useState } from "react";
import { RotateCcw } from "lucide-react";

import type { GameMove, Side } from "../types";
import {
  MEMORY_COLS,
  flipMemoryCard,
  hideMemoryCards,
  initialMemoryState,
  type MemoryState,
} from "./logic/memory";
import type { GameComponentProps } from "./types";
import { useGameRecord } from "./useGameRecord";

const LABEL: Record<Side, string> = { red: "Rot", yellow: "Gelb" };

export function MemoryGame({ context }: GameComponentProps) {
  const [state, setState] = useState<MemoryState>(() => initialMemoryState());
  const [moves, setMoves] = useState<GameMove[]>([]);
  const [winner, setWinner] = useState<Side | "draw" | null>(null);
  const [owners, setOwners] = useState<Record<number, Side>>({});
  const hideTimer = useRef<number | null>(null);
  const { record, error, reset: resetRecord } = useGameRecord(context);

  useEffect(
    () => () => {
      if (hideTimer.current !== null) window.clearTimeout(hideTimer.current);
    },
    [],
  );

  const locked = context.paused || winner !== null || state.flipped.length >= 2;

  function flip(index: number): void {
    if (locked) return;
    const result = flipMemoryCard(state, index);
    if (result === null) return;

    const move: GameMove = {
      turn: moves.length + 1,
      player: state.turn,
      payload: {
        card: index,
        symbol: state.deck[index],
        matched: result.matchedNow,
        second: result.secondCard,
      },
    };
    const nextMoves = [...moves, move];

    setMoves(nextMoves);
    setState(result.state);

    if (result.matchedNow && result.secondCard) {
      const pair = [...state.flipped, index];
      setOwners((current) => {
        const next = { ...current };
        for (const card of pair) next[card] = state.turn;
        return next;
      });
    }

    if (result.finished !== null) {
      setWinner(result.finished);
      void record({ moves: nextMoves, winner: result.finished });
      return;
    }

    if (result.secondCard && !result.matchedNow) {
      if (hideTimer.current !== null) window.clearTimeout(hideTimer.current);
      hideTimer.current = window.setTimeout(() => {
        hideTimer.current = null;
        setState((current) => hideMemoryCards(current));
      }, 900);
    }
  }

  function reset(): void {
    if (hideTimer.current !== null) {
      window.clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }
    setState(initialMemoryState());
    setMoves([]);
    setWinner(null);
    setOwners({});
    resetRecord();
  }

  const status =
    winner === null
      ? `${LABEL[state.turn]} ist am Zug`
      : winner === "draw"
        ? "Unentschieden"
        : `${LABEL[winner]} gewinnt`;

  return (
    <section className="board-game board-game--memory" aria-label="Memory">
      <header className="board-game__head">
        <div>
          <p className="board-game__eyebrow">Memory</p>
          <h2 className="board-game__title">{status}</h2>
        </div>
        {context.sessionId === null ? (
          <button type="button" className="btn btn--ghost btn--sm" onClick={reset}>
            <RotateCcw aria-hidden="true" size={15} />
            Neu
          </button>
        ) : null}
      </header>

      <p className="board-game__score">
        <span className="side__dot side__dot--red" aria-hidden="true" />
        Rot {state.scores.red}
        <span className="side__dot side__dot--yellow" aria-hidden="true" />
        Gelb {state.scores.yellow}
      </p>

      {context.paused ? <p className="board-game__hint">Die Sitzung ist pausiert.</p> : null}
      {error ? <p className="board-game__error">{error}</p> : null}

      <div
        className="memory"
        style={{ "--memory-cols": String(MEMORY_COLS) } as React.CSSProperties}
        role="grid"
        aria-label="Karten"
      >
        {state.deck.map((symbol, index) => {
          const matched = state.matched.includes(index);
          const visible = matched || state.flipped.includes(index);
          const owner = owners[index];
          return (
            <button
              key={index}
              type="button"
              role="gridcell"
              className={`memory__card${visible ? " is-visible" : ""}${matched ? " is-matched" : ""}${
                owner ? ` memory__card--${owner}` : ""
              }`}
              onClick={() => flip(index)}
              disabled={locked || matched || state.flipped.includes(index)}
              aria-label={visible ? `Karte ${index + 1}: ${symbol}` : `Karte ${index + 1}: verdeckt`}
            >
              <span className="memory__face">{visible ? symbol : "?"}</span>
            </button>
          );
        })}
      </div>

      <p className="board-game__hint">
        Ein Paar bringt einen Punkt und einen weiteren Zug. {moves.length}{" "}
        {moves.length === 1 ? "Karte" : "Karten"} aufgedeckt.
      </p>
    </section>
  );
}
