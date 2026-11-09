import { useState } from "react";
import { Dices, RotateCcw } from "lucide-react";

import type { GameMove, Side } from "../types";
import {
  MENSCH_TRACK,
  initialMenschState,
  menschLegalTokens,
  menschRingPosition,
  moveMensch,
  rollMensch,
  rollMenschDie,
  trackSquare,
  type MenschState,
} from "./logic/mensch";
import type { GameComponentProps } from "./types";
import { useGameRecord } from "./useGameRecord";

const LABEL: Record<Side, string> = { red: "Rot", yellow: "Gelb" };

export function MenschGame({ context }: GameComponentProps) {
  const [state, setState] = useState<MenschState>(initialMenschState);
  const [moves, setMoves] = useState<GameMove[]>([]);
  const [lastRoll, setLastRoll] = useState<number | null>(null);
  const { record, error, reset: resetRecord } = useGameRecord(context);

  const locked = context.paused || state.winner !== null;
  const legal = state.awaitingMove && state.dice !== null ? menschLegalTokens(state, state.dice) : [];

  function roll(): void {
    if (locked || state.awaitingMove) return;
    const die = rollMenschDie();
    setLastRoll(die);
    setState(rollMensch(state, die));
  }

  function moveToken(tokenId: number): void {
    if (locked) return;
    const result = moveMensch(state, tokenId);
    if (result === null) return;

    const move: GameMove = {
      turn: moves.length + 1,
      player: state.turn,
      payload: {
        dice: result.move.dice,
        token: result.move.token,
        from: result.move.from,
        to: result.move.to,
        captured: result.move.captured,
      },
    };
    const nextMoves = [...moves, move];

    setState(result.state);
    setMoves(nextMoves);

    if (result.state.winner !== null) {
      void record({ moves: nextMoves, winner: result.state.winner });
    }
  }

  function reset(): void {
    setState(initialMenschState());
    setMoves([]);
    setLastRoll(null);
    resetRecord();
  }

  const occupancy = new Map<number, { side: Side; token: number }[]>();
  for (const side of ["red", "yellow"] as const) {
    for (const token of state.tokens[side]) {
      if (token.state !== "track") continue;
      const square = trackSquare(side, token.progress);
      const list = occupancy.get(square) ?? [];
      list.push({ side, token: token.id });
      occupancy.set(square, list);
    }
  }

  const headline =
    state.winner !== null ? `${LABEL[state.winner]} gewinnt` : `${LABEL[state.turn]} ist am Zug`;

  return (
    <section className="board-game board-game--mensch" aria-label="Mensch aergere dich nicht">
      <header className="board-game__head">
        <div>
          <p className="board-game__eyebrow">Mensch aergere dich nicht</p>
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

      <div className="mensch" role="grid" aria-label="Rundkurs">
        {Array.from({ length: MENSCH_TRACK }, (_, index) => {
          const position = menschRingPosition(index);
          const tokens = occupancy.get(index) ?? [];
          return (
            <div
              key={index}
              role="gridcell"
              className={`mensch__cell${index === 0 ? " mensch__cell--red-start" : ""}${
                index === 20 ? " mensch__cell--yellow-start" : ""
              }`}
              style={{ gridRow: position.row + 1, gridColumn: position.col + 1 }}
              aria-label={`Feld ${index + 1}`}
            >
              {tokens.map(({ side, token }) => {
                const canMove = !locked && side === state.turn && legal.includes(token);
                return (
                  <button
                    key={`${side}-${token}`}
                    type="button"
                    className={`mensch__token mensch__token--${side}${canMove ? " is-legal" : ""}`}
                    onClick={() => moveToken(token)}
                    disabled={!canMove}
                    aria-label={`${LABEL[side]} Figur ${token + 1}`}
                  >
                    {token + 1}
                  </button>
                );
              })}
            </div>
          );
        })}

        <div className="mensch__center">
          <p className="mensch__turn">{state.winner !== null ? "Partie beendet" : `${LABEL[state.turn]} am Zug`}</p>

          {state.winner !== null ? (
            <p className="mensch__dice">{state.winner === "red" ? "Rot" : "Gelb"}</p>
          ) : state.awaitingMove ? (
            <>
              <p className="mensch__dice">{state.dice}</p>
              <p className="mensch__hint">Figur waehlen</p>
            </>
          ) : (
            <button type="button" className="btn btn--primary" onClick={roll} disabled={locked}>
              <Dices aria-hidden="true" size={16} />
              Wuerfeln
            </button>
          )}

          {lastRoll !== null && !state.awaitingMove && state.winner === null ? (
            <p className="mensch__hint">Letzter Wurf: {lastRoll}</p>
          ) : null}
        </div>
      </div>

      <div className="mensch__players">
        {(["red", "yellow"] as const).map((side) => {
          const bank = state.tokens[side].filter((token) => token.state === "bank");
          const home = state.tokens[side].filter((token) => token.state === "home").length;
          return (
            <div className={`mensch__player mensch__player--${side}`} key={side}>
              <p className="mensch__player-name">
                <span className={`side__dot side__dot--${side}`} aria-hidden="true" />
                {LABEL[side]}
              </p>
              <p className="mensch__player-meta">
                Bank {bank.length} - Haus {home}/4
              </p>
              <div className="mensch__bank">
                {bank.map((token) => {
                  const canMove = !locked && side === state.turn && legal.includes(token.id);
                  return (
                    <button
                      key={token.id}
                      type="button"
                      className={`mensch__token mensch__token--${side}${canMove ? " is-legal" : ""}`}
                      onClick={() => moveToken(token.id)}
                      disabled={!canMove}
                      aria-label={`${LABEL[side]} Figur ${token.id + 1} aus der Bank`}
                    >
                      {token.id + 1}
                    </button>
                  );
                })}
                {bank.length === 0 ? <span className="mensch__empty">keine</span> : null}
              </div>
            </div>
          );
        })}
      </div>

      <p className="board-game__hint">
        Eine Sechs bringt eine Figur aus der Bank und erlaubt einen weiteren Wurf. {moves.length}{" "}
        {moves.length === 1 ? "Zug" : "Zuege"} gespielt.
      </p>
    </section>
  );
}
