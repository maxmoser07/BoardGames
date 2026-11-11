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
  /** Kommt nur aus dem Profil-Endpunkt, nicht aus der Benutzerliste. */
  email?: string;
  /** `2026-10-07T06:40:40Z`; nur im Profil vorhanden. */
  createdAt?: string;
}

/**
 * Akzentfarbe eines Spiels. Als Schlüssel statt Farbwert, damit die Kacheln
 * Hell- und Dunkelmodus aus dem Stylesheet bekommen (siehe index.css).
 */
export type AccentKey = "red" | "amber" | "violet" | "teal" | "blue" | "rose";

export const ACCENT_KEYS: readonly AccentKey[] = ["red", "amber", "violet", "teal", "blue", "rose"];

/**
 * Vorlage, mit der ein Spiel gespielt wird. Die Administration wählt sie im
 * UI; Brettmaße und Gewinnbedingung kommen aus `rules_json`.
 */
export type GameEngine = "connect-four" | "grid" | "memory" | "chess" | "mensch";

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
  /** false = ohne Engine-Vorlage und damit noch nicht spielbar. */
  implemented: boolean;
  /** Brettmaße, `null` für Spiele ohne festes Raster. */
  board: { rows: number; cols: number } | null;
  accent: AccentKey;
  /** Stichworte der Regeln für die Detailseite. */
  rules: string[];
  /** Reihenfolge im Katalog. */
  sortOrder: number;
  /** Spiel-Logik; `null` = Eintrag ohne Brett („in Arbeit“). */
  engine: GameEngine | null;
  /** Felder in einer Reihe für Raster-Spiele. */
  winLength: number;
  /** true = Steine fallen in die unterste freie Zeile (Vier-Gewinnt-Vorlage). */
  gravity: boolean;
}

/**
 * `running` = offen, `paused` = angehalten, `finished`/`aborted` = beendet.
 *
 * Eine Pause setzt weder `outcome` noch `finishedAt` – die CHECK-Constraints in
 * `game_sessions` erlauben beides nur zusammen. Der Pausenzustand gehört
 * deshalb in `metadata_json` (siehe `pausedAt`), nicht in eine eigene Spalte.
 */
export type SessionStatus = "running" | "paused" | "finished" | "aborted";

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
  /**
   * Zeitpunkt der aktuellen Pause, `null` wenn die Sitzung läuft oder
   * beendet ist. Entspricht `metadata_json.paused_at` in der Datenbank.
   */
  pausedAt: string | null;
  /**
   * Bis hierher abgeschlossene Pausenzeit in Millisekunden. Wird bei
   * `resumeSession` addiert, damit die Spielzeit ohne Pausen berechenbar
   * bleibt, auch wenn das Fenster neu geladen wurde.
   */
  pausedMs: number;
  /**
   * true = Beispieldatensatz aus der Migration
   * `backend/migrations/20251007000001_seed_demo_session.sql`, kein echtes Spiel.
   */
  demo?: boolean;
  /**
   * true = Freundschaftsspiel. Verlauf und Ergebnis werden gespeichert,
   * fließen aber nicht in die Wertung ein.
   */
  friendly?: boolean;
}

/* ---------------------------------------------------------------- Spielzüge
 * Ein Zug ist spielunabhängig: `turn` und `player` gelten überall, die
 * Details stecken in `payload`. Für Raster-Spiele (Vier Gewinnt, Tic Tac Toe)
 * gibt es zusätzlich `location`; die übrigen Spiele nutzen nur `payload`.
 */

export interface ConnectFourLocation {
  x: number;
  y: number;
}

export interface GameMove {
  turn: number;
  player: Side;
  /** Rasterposition, `null`/fehlend bei Spielen ohne festes Raster. */
  location?: ConnectFourLocation | null;
  /** Spielspezifische Angaben, z. B. Karte, Würfel, von/nach. */
  payload?: Record<string, unknown>;
}

/* ---------------------------------------------------------------- Connect Four
 * Bildet das JSON ab, das `useConnectFour.ts` an
 * POST /api/connect-four/games schickt. x = Spalte, y = Zeile (0-basiert).
 */

export interface ConnectFourMove extends GameMove {
  location: ConnectFourLocation;
}

export interface ConnectFourResult {
  moves: ConnectFourMove[];
  winner: Side | "draw";
}

/** Ergebnis eines beliebigen Spiels; `moves` tragen die Details im `payload`. */
export interface BoardGameResult {
  moves: GameMove[];
  winner: Side | "draw";
}

/** Ein abgeschlossener Spielverlauf inkl. Metadaten der Sitzung. */
export interface RecordedGame {
  id: string;
  /** null = lokal gespielt, ohne gehostete Sitzung. */
  sessionId: string | null;
  gameType: string;
  winner: Side | "draw";
  moves: GameMove[];
  playedAt: string;
  durationMs: number;
  players: Record<Side, number | null>;
  /** true = Beispieldatensatz aus `lib/api.ts`, kein Spiel aus diesem Browser. */
  demo?: boolean;
  /** true = Freundschaftsspiel; das Ergebnis bleibt ohne Wertung. */
  friendly?: boolean;
}

/* ------------------------------------------------------------------ Ableitungen */

export function sessionStatus(session: GameSession): SessionStatus {
  if (session.outcome !== null) return session.outcome === "aborted" ? "aborted" : "finished";
  return session.pausedAt === null ? "running" : "paused";
}

/** `null`, solange die Sitzung nicht angehalten ist. */
export function isRunning(session: GameSession): boolean {
  return session.outcome === null && session.pausedAt === null;
}

/** `true`, solange das Brett bedient werden darf. */
export function isPlayable(session: GameSession): boolean {
  return isRunning(session);
}

/**
 * Bisherige Spielzeit ohne Pausen. `now` kommt von außen, damit die Berechnung
 * in React nicht auf `Date.now()` während des Renderns angewiesen ist.
 */
export function playedMs(session: GameSession, now: number): number {
  const end = session.finishedAt ? Date.parse(session.finishedAt) : now;
  const total = end - Date.parse(session.createdAt);
  // Eine noch laufende Pause zählt nicht zur Spielzeit.
  const openPause = session.pausedAt === null ? 0 : now - Date.parse(session.pausedAt);
  return Math.max(0, total - session.pausedMs - openPause);
}

/** Pausenzeit insgesamt: abgeschlossene Pausen plus eine noch offene. */
export function pausedMs(session: GameSession, now: number): number {
  const openPause = session.pausedAt === null ? 0 : now - Date.parse(session.pausedAt);
  return session.pausedMs + Math.max(0, openPause);
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
    case "paused":
      return "Pausiert";
    case "finished":
      return "Beendet";
    case "aborted":
      return "Abgebrochen";
  }
}

export function winnerToOutcome(winner: Side | "draw"): GameOutcome {
  return winner === "draw" ? "draw" : winner === "red" ? "red_win" : "yellow_win";
}

export type ReportStatus = "open" | "reviewed" | "resolved" | "dismissed";

export interface PlayerReport {
  id: number;
  reporter_id: number | null;
  reported_user_id: number;
  session_id: number | null;
  reason: string;
  details: string | null;
  status: ReportStatus;
  admin_note: string | null;
  reviewed_by: number | null;
  created_at: string;
  updated_at: string;
  reviewed_at: string | null;
}

/* -------------------------------------------------------------------- Ratings */

export interface PlayerRating {
  userId: number;
  username: string;
  role: UserRole;
  rating: number;
  gamesPlayed: number;
  wins: number;
  losses: number;
  draws: number;
  updatedAt: string;
}

export interface ResetRatingInput {
  /** Zielwert; ohne Angabe gilt der Standardwert 1000. */
  rating?: number;
  reason?: string | null;
  /** Standard ist true: ein Reset setzt auch die Statistik zurueck. */
  resetStats?: boolean;
}

/* ------------------------------------------------------------------- Freunde */

/** Ein Konto in der Freundesliste, ergaenzt um das Datum der Freundschaft. */
export interface FriendUser extends User {
  friendsSince: string;
}

export type FriendRequestDirection = "incoming" | "outgoing";

/** Offene Anfrage; `user` ist je nach Richtung die andere Person. */
export interface FriendRequest {
  id: number;
  direction: FriendRequestDirection;
  message: string | null;
  createdAt: string;
  user: User;
}

/** Alles, was die Profilseite fuer Freundschaften braucht. */
export interface FriendOverview {
  friends: FriendUser[];
  incoming: FriendRequest[];
  outgoing: FriendRequest[];
}

/* --------------------------------------------------- Meldungs-Visualisierung */

export type ReportStatusCounts = Record<ReportStatus, number>;

export interface ReportReasonCount {
  reason: string;
  count: number;
}

export interface ReportMonthCount {
  month: string;
  count: number;
}

export interface ReportUserCount {
  user_id: number;
  username: string;
  count: number;
}

export interface ReportOverview {
  /** `all` fuer Admins, `mine` fuer alle anderen Rollen. */
  scope: "all" | "mine";
  total: number;
  by_status: ReportStatusCounts;
  /** Meldungen, die die angemeldete Person selbst geschrieben hat. */
  submitted: ReportStatusCounts;
  /** Meldungen, in denen die angemeldete Person gemeldet wurde. */
  received: ReportStatusCounts;
  by_reason: ReportReasonCount[];
  by_month: ReportMonthCount[];
  /** Nur fuer Admins gefuellt. */
  top_reported: ReportUserCount[];
}
