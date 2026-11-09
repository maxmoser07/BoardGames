import { useMemo } from "react";

import { buildGrid } from "../lib/connectFour";
import { SIDE_LABEL, type GameMove, type Side } from "../types";
import { replayChessMoves, type ChessPieceType } from "../games/logic/chess";
import { MEMORY_COLS, MEMORY_ROWS } from "../games/logic/memory";
import {
  MENSCH_TRACK,
  menschRingPosition,
  replayMenschMoves,
  trackSquare,
} from "../games/logic/mensch";
import "../games/games.css";

interface GamePreviewProps {
  gameType: string;
  moves: GameMove[];
  /** CSS-Klasse fuer die Groesse, Standard ist die kleine Variante. */
  size?: "sm" | "md";
}

/**
 * Miniaturbrett aus einem gespeicherten Spielverlauf. Rein lesend - die
 * eigentliche Spiellogik liegt in den Modulen unter `games/logic`.
 */
export function GamePreview({ gameType, moves, size = "sm" }: GamePreviewProps) {
  const counts: Record<Side, number> = {
    red: moves.filter((move) => move.player === "red").length,
    yellow: moves.filter((move) => move.player === "yellow").length,
  };

  return (
    <div className={`mini mini--${size}`}>
      {gameType === "connect-four" ? (
        <ConnectFourPreview moves={moves} size={size} />
      ) : gameType === "tictactoe" ? (
        <TicTacToePreview moves={moves} />
      ) : gameType === "memory" ? (
        <MemoryPreview moves={moves} />
      ) : gameType === "schach" ? (
        <ChessPreview moves={moves} />
      ) : gameType === "mensch-aergere-dich-nicht" ? (
        <MenschPreview moves={moves} />
      ) : (
        <p className="mini__legend">Keine Vorschau</p>
      )}

      {gameType !== "connect-four" ? (
        <p className="mini__legend">
          <span className="side__dot side__dot--red" aria-hidden="true" />
          {counts.red}
          <span className="side__dot side__dot--yellow" aria-hidden="true" />
          {counts.yellow}
        </p>
      ) : null}
    </div>
  );
}

function ConnectFourPreview({ moves, size }: { moves: GameMove[]; size: "sm" | "md" }) {
  const grid = useMemo(() => buildGrid(moves), [moves]);
  const counts: Record<Side, number> = {
    red: moves.filter((move) => move.player === "red").length,
    yellow: moves.filter((move) => move.player === "yellow").length,
  };

  return (
    <div className={`preview preview--${size}`}>
      <div
        className="preview__grid"
        role="img"
        aria-label={`Spielstand nach ${moves.length} Zuegen: ${SIDE_LABEL.red} ${counts.red}, ${SIDE_LABEL.yellow} ${counts.yellow}`}
      >
        {grid.map((row, y) =>
          row.map((cell, x) => (
            <span key={`${x}-${y}`} className={`preview__cell${cell ? ` preview__cell--${cell}` : ""}`} />
          )),
        )}
      </div>
      <p className="preview__legend">
        <span className="side__dot side__dot--red" aria-hidden="true" />
        {counts.red}
        <span className="side__dot side__dot--yellow" aria-hidden="true" />
        {counts.yellow}
      </p>
    </div>
  );
}

function TicTacToePreview({ moves }: { moves: GameMove[] }) {
  const board = useMemo(() => {
    const cells: (Side | null)[] = Array.from({ length: 9 }, () => null);
    for (const move of moves) {
      const cell = Number(move.payload?.cell);
      if (Number.isInteger(cell) && cell >= 0 && cell < cells.length) cells[cell] = move.player;
    }
    return cells;
  }, [moves]);

  return (
    <div className="mini__grid mini__grid--ttt" role="img" aria-label="Tic-Tac-Toe-Endstand">
      {board.map((cell, index) => (
        <span
          key={index}
          className={`mini__cell${cell ? ` mini__cell--text-${cell}` : ""}`}
        >
          {cell === "red" ? "X" : cell === "yellow" ? "O" : ""}
        </span>
      ))}
    </div>
  );
}

function MemoryPreview({ moves }: { moves: GameMove[] }) {
  const cards = useMemo(() => {
    const cells: (string | null)[] = Array.from(
      { length: MEMORY_COLS * MEMORY_ROWS },
      () => null,
    );
    for (const move of moves) {
      const card = Number(move.payload?.card);
      const symbol = move.payload?.symbol;
      if (
        Number.isInteger(card) &&
        card >= 0 &&
        card < cells.length &&
        typeof symbol === "string"
      ) {
        cells[card] = symbol;
      }
    }
    return cells;
  }, [moves]);

  return (
    <div className="mini__grid mini__grid--memory" role="img" aria-label="Memory-Endstand">
      {cards.map((symbol, index) => (
        <span
          key={index}
          className={`mini__cell${symbol ? "" : " mini__cell--hidden"}`}
        >
          {symbol ?? "?"}
        </span>
      ))}
    </div>
  );
}

const CHESS_LETTER: Record<ChessPieceType, string> = {
  p: "P",
  n: "N",
  b: "B",
  r: "R",
  q: "Q",
  k: "K",
};

function ChessPreview({ moves }: { moves: GameMove[] }) {
  const state = useMemo(() => replayChessMoves(moves), [moves]);

  return (
    <div className="mini__grid mini__grid--chess" role="img" aria-label="Schach-Endstand">
      {state.board.map((piece, index) => {
        const row = Math.floor(index / 8);
        const col = index % 8;
        const dark = (row + col) % 2 === 1;
        return (
          <span
            key={index}
            className={`mini__cell${dark ? " mini__cell--dark" : ""}${
              piece ? ` mini__cell--text-${piece.color}` : ""
            }`}
          >
            {piece ? CHESS_LETTER[piece.type] : ""}
          </span>
        );
      })}
    </div>
  );
}

function MenschPreview({ moves }: { moves: GameMove[] }) {
  const state = useMemo(() => replayMenschMoves(moves), [moves]);

  const occupancy = useMemo(() => {
    const map = new Map<number, Side>();
    for (const side of ["red", "yellow"] as const) {
      for (const token of state.tokens[side]) {
        if (token.state === "track") map.set(trackSquare(side, token.progress), side);
      }
    }
    return map;
  }, [state]);

  const ring = useMemo(() => {
    const cells = new Map<string, number>();
    for (let index = 0; index < MENSCH_TRACK; index += 1) {
      const { row, col } = menschRingPosition(index);
      cells.set(`${row}-${col}`, index);
    }
    return cells;
  }, []);

  return (
    <div className="mini__grid mini__grid--mensch" role="img" aria-label="Mensch-aergere-dich-nicht-Endstand">
      {Array.from({ length: 11 * 11 }, (_, position) => {
        const row = Math.floor(position / 11);
        const col = position % 11;
        const index = ring.get(`${row}-${col}`);
        if (index === undefined) {
          return <span key={position} className="mini__cell" style={{ visibility: "hidden" }} />;
        }
        const side = occupancy.get(index);
        return (
          <span
            key={position}
            className={`mini__cell mini__cell--ring${side ? ` mini__cell--dot-${side}` : ""}`}
          />
        );
      })}
    </div>
  );
}
