import type { BoardGameResult, Side } from "../types";

/**
 * Alles, was ein Brett über seine Sitzung wissen muss.
 *
 * `sessionId === null` bedeutet: Partie ohne Sitzung aus `/play`. `paused`
 * wird vom Sitzungsfenster gesetzt; die Spiele sperren sich dann selbst über
 * `inert` im Rahmen.
 */
export interface GameContext {
  gameType: string;
  sessionId: string | null;
  players: Record<Side, number | null>;
  startedAt: number;
  pausedMs: number;
  paused: boolean;
  /** true = Freundschaftsspiel; das Ergebnis bleibt ohne Wertung. */
  friendly: boolean;
}

export interface GameComponentProps {
  context: GameContext;
}

/** Ein Spiel ist fertig; `winner` ist die Seite oder `"draw"`. */
export type Finished = Side | "draw";

export type { BoardGameResult };
