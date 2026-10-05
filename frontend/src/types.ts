/**
 * Gemeinsame Domänen-Typen.
 *
 * Die Farbnamen stammen aus `useConnectFour.ts`, das eingefroren ist und nur
 * `"red" | "yellow"` kennt. Damit App, Spielfenster und Datenhaltung dieselben
 * Begriffe verwenden, sind Sitzung, Ergebnis und Spielfeld-Seite konsequent
 * über `Side` modelliert:
 *
 *   seat 0 -> "red"    (Sitzung: playerRed)
 *   seat 1 -> "yellow" (Sitzung: playerYellow)
 *
 * Beim Umstieg auf das Rust-Backend entspricht `Side` der Spalte
 * `game_session_players.side` (siehe backend/migrations/..._init_schema.sql).
 */

export type UserRole = "admin" | "host" | "player";

/** Die beiden Farbseiten von Connect Four. Reihenfolge = seat_index. */
export type Side = "red" | "yellow";

export const SIDES: readonly Side[] = ["red", "yellow"] as const;

export const SIDE_LABEL: Record<Side, string> = {
  red: "Rot",
  yellow: "Gelb",
};

/** Das andere Feld: wird für Sieg/Antrag/Ansicht benötigt. */
export function opponent(side: Side): Side {
  return side === "red" ? "yellow" : "red";
}

export interface User {
  id: number;
  username: string;
  role: UserRole;
}

/**
 * Akzentfarbe eines Spiels. Als Schlüssel statt Farbwert, damit die Kacheln
 * Hell- und Dunkelmodus aus dem Stylesheet bekommen (siehe index.css).
 */
export type AccentKey = "red" | "amber" | "violet" | "teal" | "blue" | "rose";

export interface GameType {
  id: number;
  /** Schlüssel wie in `game_types.name` der Datenbank. */
  name: string;
  displayName: string;
  /** Untertitel in der Katalog-Kachel. */
  tagline: string;
  /** Ein Satz für die Detailseite. */
  description: string;
  maxPlayers: number;
  /** false = in der Datenbank angelegt, im Frontend aber noch nicht spielbar. */
  implemented: boolean;
  /** Brettmaße, `null` für Spiele ohne festes Raster. */
  board: { rows: number; cols: number } | null;
  accent: AccentKey;
  /** Stichworte der Regeln für die Detailseite. */
  rules: string[];
  /** Reihenfolge im Katalog. */
  sortOrder: number;
}

/** `running` = offen, `finished`/`aborted` = beendet (Spielstand liegt in der DB). */
export type SessionStatus = "running" | "finished" | "aborted";

/** Entspricht `game_sessions.outcome`, nur mit Farbnamen statt Sitzplätzen. */
export type GameOutcome = "red_win" | "yellow_win" | "draw" | "aborted";

export type AbortReason = "host" | "surrender";

export interface GameSession {
  id: string;
  gameType: string;
  hostId: number;
  /** Rot beginnt. Beide Plätze sind in der Praxis immer besetzt. */
  players: Record<Side, number>;
  createdAt: string;
  finishedAt: string | null;
  outcome: GameOutcome | null;
  abortReason: AbortReason | null;
  /** Wer aufgegeben hat – nur bei `abortReason === "surrender"`. */
  surrenderedBy: number | null;
  /** Verweis auf den gespeicherten Spielverlauf, sobald die Partie endet. */
  gameId: string | null;
  /** true = Beispieldatensatz aus `lib/api.ts`, kein Spiel aus diesem Browser. */
  demo?: boolean;
}

/* ---------------------------------------------------------------- Connect Four
 * Bildet das JSON ab, das `useConnectFour.ts` an
 * POST /api/connect-four/games schickt. x = Spalte, y = Zeile (0-basiert).
 */

export interface ConnectFourLocation {
  x: number;
  y: number;
}

export interface ConnectFourMove {
  turn: number;
  player: Side;
  location: ConnectFourLocation;
}

export interface ConnectFourResult {
  moves: ConnectFourMove[];
  winner: Side | "draw";
}

/** Ein abgeschlossener Spielverlauf inkl. Metadaten der Sitzung. */
export interface RecordedGame {
  id: string;
  /** null = lokal gespielt, ohne gehostete Sitzung. */
  sessionId: string | null;
  gameType: string;
  winner: Side | "draw";
  moves: ConnectFourMove[];
  playedAt: string;
  durationMs: number;
  players: Record<Side, number | null>;
  /** true = Beispieldatensatz aus `lib/api.ts`, kein Spiel aus diesem Browser. */
  demo?: boolean;
}

/* ------------------------------------------------------------------ Ableitungen */

export function sessionStatus(session: GameSession): SessionStatus {
  return session.outcome === null ? "running" : "aborted" === session.outcome ? "aborted" : "finished";
}

export function outcomeLabel(outcome: GameOutcome): string {
  switch (outcome) {
    case "red_win":
      return "Rot gewinnt";
    case "yellow_win":
      return "Gelb gewinnt";
    case "draw":
      return "Unentschieden";
    case "aborted":
      return "Abgebrochen";
  }
}

export function statusLabel(status: SessionStatus): string {
  switch (status) {
    case "running":
      return "Laufend";
    case "finished":
      return "Beendet";
    case "aborted":
      return "Abgebrochen";
  }
}

export function winnerToOutcome(winner: Side | "draw"): GameOutcome {
  return winner === "draw" ? "draw" : winner === "red" ? "red_win" : "yellow_win";
}
