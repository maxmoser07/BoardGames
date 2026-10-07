/**
 * Datenzugriff für die Oberfläche.
 *
 * Alles liegt im Rust-Backend (axum) in MySQL – Sitzungen, Verläufe und
 * Personen. Der Browser hält nichts davon mehr; im localStorage steht nur noch,
 * wer gerade als wer eingeloggt ist (`usePersistentState`).
 *
 * Die Routen sind 1:1 die aus `backend/src/api.rs`:
 *
 *   GET    /api/health
 *   GET    /api/users
 *   GET    /api/games
 *   GET    /api/sessions
 *   POST   /api/sessions                       { gameType, hostId, players }
 *   GET    /api/sessions/{id}
 *   POST   /api/sessions/{id}/pause
 *   POST   /api/sessions/{id}/resume
 *   POST   /api/sessions/{id}/abort
 *   POST   /api/sessions/{id}/surrender        { userId }
 *   POST   /api/connect-four/games             { moves, winner, durationMs, sessionId }
 *   GET    /api/connect-four/games
 *   DELETE /api/demo-data
 *
 * Das Backend antwortet in snake_case; die Abbildung auf die Typen aus
 * `../types` übernehmen die `to…`-Funktionen unten. Das ist die einzige Stelle,
 * an der die beiden Schreibweisen nebeneinander vorkommen.
 *
 * Ist das Backend nicht erreichbar, wirft jede Funktion einen `ApiError` mit
 * sprechendem Text. Es gibt bewusst **keinen** Rückfall auf localStorage: sonst
 * entstünden Daten, die nur auf einem Rechner existieren und beim nächsten
 * Start einfach weg wären.
 */

import {
  type ConnectFourResult,
  type GameOutcome,
  type GameSession,
  type GameType,
  type RecordedGame,
  type Side,
  type User,
  type UserRole,
} from "../types";
import { validateConnectFourResult } from "./connectFour";
import { bySortOrder, GAME_TYPES } from "./gameTypes";

export interface CreateSessionInput {
  gameType: string;
  hostId: number;
  players: Record<Side, number>;
}

export interface RecordGameContext {
  sessionId: string | null;
  players: Record<Side, number | null>;
  startedAt: number;
  /** Bis zum Partieende angehaltene Zeit – wird von der Dauer abgezogen. */
  pausedMs: number;
}

export interface Api {
  getUsers(): Promise<User[]>;
  getGameTypes(): Promise<GameType[]>;
  getGameType(name: string): Promise<GameType | null>;
  listSessions(): Promise<GameSession[]>;
  getSession(id: string): Promise<GameSession | null>;
  createSession(input: CreateSessionInput): Promise<GameSession>;
  pauseSession(id: string): Promise<GameSession>;
  resumeSession(id: string): Promise<GameSession>;
  abortSession(id: string): Promise<GameSession>;
  surrenderSession(id: string, userId: number): Promise<GameSession>;
  recordConnectFourGame(result: ConnectFourResult, context: RecordGameContext): Promise<RecordedGame>;
  listGames(): Promise<RecordedGame[]>;
  clearDemoData(): Promise<void>;
  subscribe(listener: () => void): () => void;
}

/** Fehler einer Anfrage – mit dem HTTP-Status, falls es einen gab. */
export class ApiError extends Error {
  readonly status: number | undefined;

  constructor(message: string, status?: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

/* -------------------------------------------------------------- Wire-Format */

interface WireUser {
  id: number;
  username: string;
  role: UserRole;
}

interface WireGameType {
  id: number;
  name: string;
  display_name: string;
  max_players: number;
}

interface WirePlayer {
  seat_index: number;
  user_id: number | null;
  side: string | null;
}

interface WireSession {
  id: number;
  game_type: string;
  host_id: number | null;
  outcome: "win" | "draw" | "aborted" | null;
  winner_side: Side | null;
  started_at: string;
  finished_at: string | null;
  duration_ms: number | null;
  paused_at: string | null;
  paused_ms: number;
  abort_reason: "host" | "surrender" | null;
  surrendered_by: number | null;
  demo: boolean;
  ad_hoc: boolean;
  players: WirePlayer[];
}

interface WireMove {
  move_index: number;
  payload: { col: number; row: number; side: Side };
}

interface WireGame {
  session: WireSession;
  moves: WireMove[];
}

/* ---------------------------------------------------------- HTTP-Grundlagen */

const BASE = "/api";

/** Meldet der Server `{"error": "…"}`, wird die so weitergereicht. */
async function messageOf(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: unknown };
    if (typeof body.error === "string" && body.error !== "") return body.error;
  } catch {
    // Keine JSON-Antwort, z. B. ein 502 vom Proxy.
  }
  return `Die Anfrage ist fehlgeschlagen (${response.status}).`;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${BASE}${path}`, {
      ...init,
      headers: {
        Accept: "application/json",
        ...(init?.body === undefined ? {} : { "Content-Type": "application/json" }),
        ...init?.headers,
      },
    });
  } catch {
    // Das Backend ist nicht erreichbar: Container aus, Port belegt oder CORS.
    // Fuer die Oberflaeche reicht der Hinweis, die Ursache steht im
    // DevTools-Tab "Network".
    throw new ApiError(
      "Das Backend ist nicht erreichbar. Läuft es? (`docker compose ps`, sonst `docker compose up -d`)",
    );
  }
  if (!response.ok) throw new ApiError(await messageOf(response), response.status);
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

/* ------------------------------------------------------------ Abbildung */

const SEAT_OF: Record<Side, number> = { red: 0, yellow: 1 };

/** Person auf einem Platz; 0 = unbekannt (Sitzungen aus `/play` haben keine). */
function playerOf(wire: WireSession, side: Side): number {
  return wire.players.find((player) => player.seat_index === SEAT_OF[side])?.user_id ?? 0;
}

/** `game_sessions.outcome` kennt `win`, das Frontend braucht die Farbseite. */
function toOutcome(wire: WireSession): GameOutcome | null {
  if (wire.outcome === null) return null;
  switch (wire.outcome) {
    case "win":
      return wire.winner_side === "yellow" ? "yellow_win" : "red_win";
    case "draw":
      return "draw";
    default:
      return "aborted";
  }
}

function toSession(wire: WireSession): GameSession {
  const outcome = toOutcome(wire);
  return {
    id: String(wire.id),
    gameType: wire.game_type,
    hostId: wire.host_id ?? 0,
    players: { red: playerOf(wire, "red"), yellow: playerOf(wire, "yellow") },
    createdAt: wire.started_at,
    finishedAt: wire.finished_at,
    outcome,
    abortReason: wire.abort_reason,
    surrenderedBy: wire.surrendered_by,
    // Eine gehostete Partie ist dieselbe Zeile wie ihre Sitzung, siehe
    // `record_connect_four_game` im Backend.
    gameId: outcome === null ? null : String(wire.id),
    pausedAt: wire.paused_at,
    pausedMs: wire.paused_ms,
    demo: wire.demo,
  };
}

function toGame(wire: WireGame): RecordedGame {
  const { session } = wire;
  return {
    id: String(session.id),
    // Ohne Sitzung gespielt (`/play`): gehört zu keiner Sitzungszeile.
    sessionId: session.ad_hoc ? null : String(session.id),
    gameType: session.game_type,
    winner: session.outcome === "draw" ? "draw" : (session.winner_side ?? "draw"),
    moves: wire.moves.map((move) => ({
      turn: move.move_index,
      player: move.payload.side,
      location: { x: move.payload.col, y: move.payload.row },
    })),
    playedAt: session.finished_at ?? session.started_at,
    durationMs: session.duration_ms ?? 0,
    players: { red: playerOf(session, "red"), yellow: playerOf(session, "yellow") },
    demo: session.demo,
  };
}

function byNewest<T extends { createdAt?: string; playedAt?: string }>(a: T, b: T): number {
  const left = a.createdAt ?? a.playedAt ?? "";
  const right = b.createdAt ?? b.playedAt ?? "";
  return right.localeCompare(left);
}

/* ------------------------------------------------------------------ Lesen */

async function getUsers(): Promise<User[]> {
  return await request<WireUser[]>("/users");
}

/**
 * Die technischen Spielen kommen aus der Datenbank, der Katalog (Regeln,
 * Vorschau, Reihenfolge) aus `lib/gameTypes.ts`. Deshalb werden beide
 * zusammengefuehrt statt eines das andere zu ersetzen: nur so erscheinen auch
 * die fuenf "in Arbeit"-Eintraege, die es nicht in `game_types` gibt.
 */
async function getGameTypes(): Promise<GameType[]> {
  const rows = await request<WireGameType[]>("/games");
  const byName = new Map(rows.map((row) => [row.name, row]));
  return GAME_TYPES.map((game) => {
    const row = byName.get(game.name);
    return row ? { ...game, id: row.id, maxPlayers: row.max_players } : game;
  }).sort((a, b) => bySortOrder(a, b));
}

async function getGameType(name: string): Promise<GameType | null> {
  const games = await getGameTypes();
  return games.find((game) => game.name === name) ?? null;
}

async function listSessions(): Promise<GameSession[]> {
  const rows = await request<WireSession[]>("/sessions");
  return rows.map(toSession).sort(byNewest);
}

async function getSession(id: string): Promise<GameSession | null> {
  try {
    return toSession(await request<WireSession>(`/sessions/${encodeURIComponent(id)}`));
  } catch (cause) {
    // Unbekannte Kennung ist kein Fehler, sondern "gibt es nicht".
    if (cause instanceof ApiError && cause.status === 404) return null;
    throw cause;
  }
}

async function listGames(): Promise<RecordedGame[]> {
  const rows = await request<WireGame[]>("/connect-four/games");
  return rows.map(toGame).sort(byNewest);
}

/* ---------------------------------------------------------------- Schreiben */

/** Antwortet, sobald die Sicht neu laden soll. */
let notify: () => void = () => {};

async function createSession(input: CreateSessionInput): Promise<GameSession> {
  // Schnellster Fehler zuerst, ohne Anfrage.
  if (input.players.red === input.players.yellow) {
    throw new ApiError("Rot und Gelb brauchen zwei verschiedene Spieler:innen.");
  }
  const wire = await request<WireSession>("/sessions", {
    method: "POST",
    body: JSON.stringify({
      game_type: input.gameType,
      host_id: input.hostId,
      players: input.players,
    }),
  });
  notify();
  return toSession(wire);
}

async function sessionAction(id: string, action: string, body?: unknown): Promise<GameSession> {
  const wire = await request<WireSession>(`/sessions/${encodeURIComponent(id)}/${action}`, {
    method: "POST",
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  notify();
  return toSession(wire);
}

const pauseSession = (id: string): Promise<GameSession> => sessionAction(id, "pause");
const resumeSession = (id: string): Promise<GameSession> => sessionAction(id, "resume");
const abortSession = (id: string): Promise<GameSession> => sessionAction(id, "abort");
const surrenderSession = (id: string, userId: number): Promise<GameSession> =>
  sessionAction(id, "surrender", { user_id: userId });

/**
 * Speichert eine beendete Partie in der Datenbank.
 *
 * `duration_ms` kann der Server nicht selbst messen, deshalb wird die im
 * Fenster verbrachte Zeit ohne Pausen mitgeschickt. Mit `session_id` wird die
 * gehostete Sitzung geschlossen – Sitzung und Partie sind dann ein Datensatz.
 */
async function recordConnectFourGame(
  result: ConnectFourResult,
  context: RecordGameContext,
): Promise<RecordedGame> {
  validateConnectFourResult(result);

  const durationMs = Math.max(0, Math.round(Date.now() - context.startedAt - context.pausedMs));
  const sessionId = context.sessionId === null ? null : Number(context.sessionId);

  const created = await request<{ session_id: number }>("/connect-four/games", {
    method: "POST",
    body: JSON.stringify({ ...result, duration_ms: durationMs, session_id: sessionId }),
  });

  // Das Gepeicherte zurücklesen statt zusammenzubauen: so zeigt die Oberflaeche
  // exakt das, was in der Datenbank steht.
  const stored = await request<WireGame>(`/connect-four/games/${created.session_id}`);
  notify();
  return toGame(stored);
}

async function clearDemoData(): Promise<void> {
  await request("/demo-data", { method: "DELETE" });
  notify();
}

/* ------------------------------------------------------------ Abonnements */

/**
 * Zeitabstand fuer das Nachladen offener Ansichten, in Millisekunden.
 *
 * Vorher meldete der `storage`-Event jede Aenderung im selben Browser. Aus der
 * Datenbank kommt so etwas nicht heraus, also wird gepollt: nach jeder eigenen
 * Aenderung sofort (siehe `notify`), sonst im Takt darueber. Das haelt Spielfeld-
 * Fenster und Dashboard im Schritt, auch ueber Browserfenster hinweg.
 */
const POLL_MS = 3000;

const listeners = new Set<() => void>();
let timer: number | null = null;

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (timer === null) {
    timer = window.setInterval(() => {
      // Im Hintergrundtab gibt es nichts zu zeigen – dann nicht laden.
      if (document.visibilityState === "visible") notify();
    }, POLL_MS);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && timer !== null) {
      window.clearInterval(timer);
      timer = null;
    }
  };
}

notify = () => {
  for (const listener of [...listeners]) listener();
};

/* ------------------------------------------------------------------ Export */

export const httpApi: Api = {
  getUsers,
  getGameTypes,
  getGameType,
  listSessions,
  getSession,
  createSession,
  pauseSession,
  resumeSession,
  abortSession,
  surrenderSession,
  recordConnectFourGame,
  listGames,
  clearDemoData,
  subscribe,
};

/** Einziger Zugriff der Oberflaeche: alles laeuft ueber das Backend. */
export const api: Api = httpApi;
