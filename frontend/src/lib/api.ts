/**
 * Datenzugriff für die Oberfläche.
 *
 * Alles liegt im Rust-Backend (axum) in MySQL – Sitzungen, Verläufe und
 * Personen. Der Browser hält nichts davon mehr; im localStorage stehen nur
 * Bearer-Token und Profil der angemeldeten Person (siehe `auth.ts`).
 *
 * Alle Routen ausser `/health`, `/login` und `/register` verlangen den Token
 * als `Authorization: Bearer <token>`. Die Rechte aus `v_user_permissions`
 * prueft das Backend bei jeder Anfrage neu.
 *
 * Die Routen sind 1:1 die aus `backend/src/api.rs`:
 *
 *   GET    /api/health
 *   POST   /api/login, /api/register, /api/logout
 *   GET    /api/users
 *   GET    /api/games
 *   POST   /api/games                          { name, display_name, max_players } (nur Admin)
 *   DELETE /api/games/{id}                     (nur Admin)
 *   GET    /api/sessions
 *   POST   /api/sessions                       { gameType, hostId, players }
 *   GET    /api/sessions/{id}
 *   POST   /api/sessions/{id}/pause
 *   POST   /api/sessions/{id}/resume
 *   POST   /api/sessions/{id}/abort
 *   POST   /api/sessions/{id}/surrender        { userId }
 *   POST   /api/connect-four/games             { moves, winner, durationMs, sessionId }
 *   GET    /api/connect-four/games
 *   DELETE /api/demo-data                      (nur Admin)
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
  type BoardGameResult,
  type ConnectFourResult,
  type FriendOverview,
  type FriendRequest,
  type FriendUser,
  type GameOutcome,
  type GameSession,
  type GameType,
  type PlayerRating,
  type PlayerReport,
  type RecordedGame,
  type ReportOverview,
  type ReportStatus,
  type ResetRatingInput,
  type Side,
  type User,
  type UserRole,
} from "../types";
import { getToken, signIn, signOut } from "./auth";
import { validateConnectFourResult } from "./connectFour";
import {
  gameTypeFromRow,
  mergeGameTypes,
  type GameRulesJson,
  type GameTypeRow,
} from "./gameTypes";

export interface CreateGameTypeInput {
  /** Technische Kennung (`game_types.name`), z. B. `backgammon`. */
  name: string;
  displayName: string;
  maxPlayers: number;
  /** Logik-Vorlage und Darstellung; ohne Angabe bleibt das Spiel „in Arbeit“. */
  rules?: GameRulesJson;
}

export interface UpdateGameTypeInput {
  displayName?: string;
  maxPlayers?: number;
  /** `null` entfernt die Logik, `undefined` lässt sie unverändert. */
  rules?: GameRulesJson | null;
}

export interface CreateSessionInput {
  gameType: string;
  hostId: number;
  players: Record<Side, number>;
  /** true = Freundschaftsspiel ohne Wertung. */
  friendly?: boolean;
}

export interface RecordGameContext {
  sessionId: string | null;
  players: Record<Side, number | null>;
  startedAt: number;
  /** Bis zum Partieende angehaltene Zeit – wird von der Dauer abgezogen. */
  pausedMs: number;
  /** Nur für Partien ohne Sitzung; dort sind alle Ergebnisse ungewertet. */
  friendly?: boolean;
}

export interface Api {
  getUsers(): Promise<User[]>;
  getUser(id: number): Promise<User>;
  getFriends(): Promise<FriendOverview>;
  sendFriendRequest(userId: number, message?: string | null): Promise<FriendRequest>;
  acceptFriendRequest(id: number): Promise<FriendRequest>;
  declineFriendRequest(id: number): Promise<FriendRequest>;
  cancelFriendRequest(id: number): Promise<void>;
  removeFriend(userId: number): Promise<void>;
  login(username: string, password: string): Promise<User>;
  register(input: { username: string; password: string; email?: string | null }): Promise<User>;
  logout(): Promise<void>;
  getGameTypes(): Promise<GameType[]>;
  getGameType(name: string): Promise<GameType | null>;
  /** Legt ein Spiel im Katalog an (nur Admin). */
  createGameType(input: CreateGameTypeInput): Promise<GameType>;
  /** Ändert Anzeige, Spielerzahl oder Spiellogik (nur Admin). */
  updateGameType(id: number, input: UpdateGameTypeInput): Promise<GameType>;
  /** Entfernt ein Spiel aus dem Katalog (nur Admin). */
  deleteGameType(id: number): Promise<void>;
  listSessions(): Promise<GameSession[]>;
  getSession(id: string): Promise<GameSession | null>;
  createSession(input: CreateSessionInput): Promise<GameSession>;
  pauseSession(id: string): Promise<GameSession>;
  resumeSession(id: string): Promise<GameSession>;
  abortSession(id: string): Promise<GameSession>;
  surrenderSession(id: string, userId: number): Promise<GameSession>;
  recordConnectFourGame(result: ConnectFourResult, context: RecordGameContext): Promise<RecordedGame>;
  /** Speichert eine beendete Partie eines beliebigen Spiels. */
  recordGame(gameType: string, result: BoardGameResult, context: RecordGameContext): Promise<void>;
  listGames(): Promise<RecordedGame[]>;
  clearDemoData(): Promise<void>;
  getReports(filter?: { status?: ReportStatus; reportedUserId?: number; reporterId?: number }): Promise<PlayerReport[]>;
  createReport(input: {
    reporterId?: number | null;
    reportedUserId: number;
    sessionId?: number | null;
    reason: string;
    details?: string | null;
  }): Promise<PlayerReport>;
  updateReport(id: number, input: { status?: ReportStatus; adminNote?: string | null; reviewedBy?: number | null }): Promise<PlayerReport>;
  deleteReport(id: number): Promise<void>;
  getReportOverview(): Promise<ReportOverview>;
  getRatings(): Promise<PlayerRating[]>;
  getRating(userId: number): Promise<PlayerRating>;
  resetRating(userId: number, input?: ResetRatingInput): Promise<PlayerRating>;
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
  email?: string;
  created_at?: string;
}

function toUser(wire: WireUser): User {
  return {
    id: wire.id,
    username: wire.username,
    role: wire.role,
    email: wire.email,
    createdAt: wire.created_at,
  };
}

interface WireFriend {
  id: number;
  username: string;
  role: UserRole;
  friends_since: string;
}

interface WireFriendRequest {
  id: number;
  direction: "incoming" | "outgoing";
  message: string | null;
  created_at: string;
  user: WireUser;
}

interface WireFriendOverview {
  friends: WireFriend[];
  incoming: WireFriendRequest[];
  outgoing: WireFriendRequest[];
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
  friendly: boolean;
  players: WirePlayer[];
}

interface WireMove {
  move_index: number;
  payload: Record<string, unknown> & { side?: Side; col?: number; row?: number };
}

interface WireGame {
  session: WireSession;
  moves: WireMove[];
}

interface WireReport {
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

interface WireReportOverview {
  scope: "all" | "mine";
  total: number;
  by_status: Record<ReportStatus, number>;
  submitted: Record<ReportStatus, number>;
  received: Record<ReportStatus, number>;
  by_reason: Array<{ reason: string; count: number }>;
  by_month: Array<{ month: string; count: number }>;
  top_reported: Array<{ user_id: number; username: string; count: number }>;
}

interface WireRating {
  user_id: number;
  username: string;
  role: UserRole;
  rating: number;
  games_played: number;
  wins: number;
  losses: number;
  draws: number;
  updated_at: string;
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
  const token = getToken();
  let response: Response;
  try {
    response = await fetch(`${BASE}${path}`, {
      ...init,
      headers: {
        Accept: "application/json",
        ...(token === null ? {} : { Authorization: `Bearer ${token}` }),
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
  if (response.status === 401) {
    // Abgelaufenes oder zurueckgezogenes Token: lokal abmelden. Die Ansichten
    // haengen an `useAuth` und zeigen danach sofort die Anmeldung.
    if (path !== "/login" && path !== "/register") signOut();
    throw new ApiError(await messageOf(response), response.status);
  }
  if (!response.ok) throw new ApiError(await messageOf(response), response.status);
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

/* ------------------------------------------------------------ Abbildung */

const SEAT_OF: Record<Side, number> = { red: 0, yellow: 1 };

/**
 * Kennungen sind `game_sessions.id`, also Zahlen.
 *
 * Vor dem Backend hat der Browser selbst Kennungen erzeugt (`s-a1b2c3`). Solche
 * Pfade liegen noch in Lesezeichen und in Tabs, die über eine alte Version
 * gelaufen sind - in der Datenbank können sie nicht stehen. Sie deshalb hier
 * abzuweisen spart eine aussichtslose Anfrage und gibt eine verständliche
 * Meldung statt einer Fehlermeldung des Servers.
 */
function isStoredId(id: string): boolean {
  return /^[1-9][0-9]*$/.test(id);
}

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
    friendly: wire.friendly,
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
    moves: wire.moves.map((move) => {
      const payload = move.payload ?? {};
      const col = typeof payload.col === "number" ? payload.col : null;
      const row = typeof payload.row === "number" ? payload.row : null;
      return {
        turn: move.move_index,
        player: (payload.side as Side | undefined) ?? "red",
        location: col !== null && row !== null ? { x: col, y: row } : null,
        payload,
      };
    }),
    playedAt: session.finished_at ?? session.started_at,
    durationMs: session.duration_ms ?? 0,
    players: { red: playerOf(session, "red"), yellow: playerOf(session, "yellow") },
    demo: session.demo,
    friendly: session.friendly,
  };
}

function byNewest<T extends { createdAt?: string; playedAt?: string }>(a: T, b: T): number {
  const left = a.createdAt ?? a.playedAt ?? "";
  const right = b.createdAt ?? b.playedAt ?? "";
  return right.localeCompare(left);
}

/* ------------------------------------------------------------------ Lesen */

async function getUsers(): Promise<User[]> {
  return (await request<WireUser[]>("/users")).map(toUser);
}

async function getUser(id: number): Promise<User> {
  return toUser(await request<WireUser>(`/users/${id}`));
}

function toFriend(wire: WireFriend): FriendUser {
  return {
    id: wire.id,
    username: wire.username,
    role: wire.role,
    friendsSince: wire.friends_since,
  };
}

function toFriendRequest(wire: WireFriendRequest): FriendRequest {
  return {
    id: wire.id,
    direction: wire.direction,
    message: wire.message,
    createdAt: wire.created_at,
    user: toUser(wire.user),
  };
}

async function getFriends(): Promise<FriendOverview> {
  const wire = await request<WireFriendOverview>("/friends");
  return {
    friends: wire.friends.map(toFriend),
    incoming: wire.incoming.map(toFriendRequest),
    outgoing: wire.outgoing.map(toFriendRequest),
  };
}

async function sendFriendRequest(userId: number, message?: string | null): Promise<FriendRequest> {
  const wire = await request<WireFriendRequest>("/friends/requests", {
    method: "POST",
    body: JSON.stringify({ user_id: userId, message: message ?? null }),
  });
  notify();
  return toFriendRequest(wire);
}

async function acceptFriendRequest(id: number): Promise<FriendRequest> {
  const wire = await request<WireFriendRequest>(
    `/friends/requests/${encodeURIComponent(String(id))}/accept`,
    { method: "POST" },
  );
  notify();
  return toFriendRequest(wire);
}

async function declineFriendRequest(id: number): Promise<FriendRequest> {
  const wire = await request<WireFriendRequest>(
    `/friends/requests/${encodeURIComponent(String(id))}/decline`,
    { method: "POST" },
  );
  notify();
  return toFriendRequest(wire);
}

async function cancelFriendRequest(id: number): Promise<void> {
  await request(`/friends/requests/${encodeURIComponent(String(id))}`, { method: "DELETE" });
  notify();
}

async function removeFriend(userId: number): Promise<void> {
  await request(`/friends/${encodeURIComponent(String(userId))}`, { method: "DELETE" });
  notify();
}

async function login(username: string, password: string): Promise<User> {
  const wire = await request<WireUser & { user?: WireUser; token?: string }>("/login", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
  const user = toUser(wire.user ?? wire);
  if (typeof wire.token === "string" && wire.token !== "") signIn(user, wire.token);
  return user;
}

async function register(input: { username: string; password: string; email?: string | null }): Promise<User> {
  const wire = await request<WireUser & { user?: WireUser; token?: string }>("/register", {
    method: "POST",
    body: JSON.stringify({ username: input.username, password: input.password, email: input.email ?? null }),
  });
  const user = toUser(wire.user ?? wire);
  if (typeof wire.token === "string" && wire.token !== "") signIn(user, wire.token);
  return user;
}

async function logout(): Promise<void> {
  try {
    await request("/logout", { method: "POST" });
  } finally {
    // Auch ohne erreichbares Backend lokal abmelden.
    signOut();
  }
}

/**
 * Die technischen Spiele kommen aus der Datenbank, der Katalog (Regeln,
 * Vorschau, Reihenfolge) aus `lib/gameTypes.ts`. Die Datenbank bestimmt, welche
 * Spiele es gibt: neu angelegte sind mit Engine-Vorlage sofort spielbar und
 * erscheinen sonst als „in Arbeit“; geloeschte verschwinden sofort.
 */
async function getGameTypes(): Promise<GameType[]> {
  return mergeGameTypes(await request<GameTypeRow[]>("/games"));
}

async function getGameType(name: string): Promise<GameType | null> {
  const games = await getGameTypes();
  return games.find((game) => game.name === name) ?? null;
}

async function createGameType(input: CreateGameTypeInput): Promise<GameType> {
  const row = await request<GameTypeRow>("/games", {
    method: "POST",
    body: JSON.stringify({
      name: input.name,
      display_name: input.displayName,
      max_players: input.maxPlayers,
      rules_json: input.rules ?? null,
    }),
  });
  notify();
  return gameTypeFromRow(row);
}

async function updateGameType(id: number, input: UpdateGameTypeInput): Promise<GameType> {
  const row = await request<GameTypeRow>(`/games/${encodeURIComponent(String(id))}`, {
    method: "PATCH",
    body: JSON.stringify({
      ...(input.displayName === undefined ? {} : { display_name: input.displayName }),
      ...(input.maxPlayers === undefined ? {} : { max_players: input.maxPlayers }),
      ...(input.rules === undefined ? {} : { rules_json: input.rules }),
    }),
  });
  notify();
  return gameTypeFromRow(row);
}

async function deleteGameType(id: number): Promise<void> {
  await request(`/games/${encodeURIComponent(String(id))}`, { method: "DELETE" });
  notify();
}

async function listSessions(): Promise<GameSession[]> {
  const rows = await request<WireSession[]>("/sessions");
  return rows.map(toSession).sort(byNewest);
}

async function getSession(id: string): Promise<GameSession | null> {
  // Siehe `isStoredId`: eine alte Kennung ist "gibt es nicht", kein Fehler.
  if (!isStoredId(id)) return null;
  try {
    return toSession(await request<WireSession>(`/sessions/${encodeURIComponent(id)}`));
  } catch (cause) {
    // Unbekannte Kennung ist kein Fehler, sondern "gibt es nicht".
    if (cause instanceof ApiError && cause.status === 404) return null;
    throw cause;
  }
}

async function listGames(): Promise<RecordedGame[]> {
  // Alle Spiele in einer Liste: die Historie ist spielunabhängig, und die
  // Oberfläche filtert nach `gameType`.
  const rows = await request<WireGame[]>("/games/results");
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
      friendly: input.friendly ?? false,
    }),
  });
  notify();
  return toSession(wire);
}

async function sessionAction(id: string, action: string, body?: unknown): Promise<GameSession> {
  if (!isStoredId(id)) throw new ApiError(`Sitzung ${id} gibt es nicht (mehr).`);
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
  // Eine alte Kennung (siehe `isStoredId`) wird wie "ohne Sitzung" behandelt:
  // Der Server legt dann eine eigene Zeile an, statt an einer fremden zu scheitern.
  const sessionId = context.sessionId !== null && isStoredId(context.sessionId) ? Number(context.sessionId) : null;

  const created = await request<{ session_id: number }>("/connect-four/games", {
    method: "POST",
    body: JSON.stringify({
      ...result,
      duration_ms: durationMs,
      session_id: sessionId,
      friendly: context.friendly ?? true,
    }),
  });

  // Das Gepeicherte zurücklesen statt zusammenzubauen: so zeigt die Oberflaeche
  // exakt das, was in der Datenbank steht.
  const stored = await request<WireGame>(`/connect-four/games/${created.session_id}`);
  notify();
  return toGame(stored);
}

/**
 * Speichert eine beendete Partie eines der neuen Brettspiele.
 *
 * Die Route ist spielunabhängig (`/api/games/{name}/results`); den Verlauf
 * prüft der Server je nach Spiel. Wie bei Vier Gewinnt wird die gehostete
 * Sitzung mit derselben Zeile geschlossen.
 */
async function recordGame(
  gameType: string,
  result: BoardGameResult,
  context: RecordGameContext,
): Promise<void> {
  const durationMs = Math.max(0, Math.round(Date.now() - context.startedAt - context.pausedMs));
  const sessionId = context.sessionId !== null && isStoredId(context.sessionId) ? Number(context.sessionId) : null;

  await request(`/games/${encodeURIComponent(gameType)}/results`, {
    method: "POST",
    body: JSON.stringify({
      moves: result.moves,
      winner: result.winner,
      duration_ms: durationMs,
      session_id: sessionId,
      friendly: context.friendly ?? true,
    }),
  });
  notify();
}

async function clearDemoData(): Promise<void> {
  await request("/demo-data", { method: "DELETE" });
  notify();
}

async function getReports(filter?: { status?: ReportStatus; reportedUserId?: number; reporterId?: number }): Promise<PlayerReport[]> {
  const params = new URLSearchParams();
  if (filter?.status) params.set("status", filter.status);
  if (filter?.reportedUserId !== undefined) params.set("reported_user_id", String(filter.reportedUserId));
  if (filter?.reporterId !== undefined) params.set("reporter_id", String(filter.reporterId));
  const suffix = params.toString() ? `?${params.toString()}` : "";
  const rows = await request<WireReport[]>(`/reports${suffix}`);
  return rows.map(toReport);
}

function toReport(wire: WireReport): PlayerReport {
  return {
    id: wire.id,
    reporter_id: wire.reporter_id,
    reported_user_id: wire.reported_user_id,
    session_id: wire.session_id,
    reason: wire.reason,
    details: wire.details,
    status: wire.status,
    admin_note: wire.admin_note,
    reviewed_by: wire.reviewed_by,
    created_at: wire.created_at,
    updated_at: wire.updated_at,
    reviewed_at: wire.reviewed_at,
  };
}

async function createReport(input: {
  reporterId?: number | null;
  reportedUserId: number;
  sessionId?: number | null;
  reason: string;
  details?: string | null;
}): Promise<PlayerReport> {
  const wire = await request<WireReport>("/reports", {
    method: "POST",
    body: JSON.stringify({
      reporter_id: input.reporterId ?? null,
      reported_user_id: input.reportedUserId,
      session_id: input.sessionId ?? null,
      reason: input.reason,
      details: input.details ?? null,
    }),
  });
  notify();
  return toReport(wire);
}

async function updateReport(id: number, input: { status?: ReportStatus; adminNote?: string | null; reviewedBy?: number | null }): Promise<PlayerReport> {
  const wire = await request<WireReport>(`/reports/${encodeURIComponent(String(id))}`, {
    method: "PATCH",
    body: JSON.stringify({
      status: input.status,
      admin_note: input.adminNote,
      reviewed_by: input.reviewedBy,
    }),
  });
  notify();
  return toReport(wire);
}

async function deleteReport(id: number): Promise<void> {
  await request(`/reports/${encodeURIComponent(String(id))}`, { method: "DELETE" });
  notify();
}

function toReportOverview(wire: WireReportOverview): ReportOverview {
  return {
    scope: wire.scope,
    total: wire.total,
    by_status: wire.by_status,
    submitted: wire.submitted,
    received: wire.received,
    by_reason: wire.by_reason,
    by_month: wire.by_month,
    top_reported: wire.top_reported,
  };
}

async function getReportOverview(): Promise<ReportOverview> {
  const wire = await request<WireReportOverview>("/reports/visualisation");
  return toReportOverview(wire);
}

function toRating(wire: WireRating): PlayerRating {
  return {
    userId: wire.user_id,
    username: wire.username,
    role: wire.role,
    rating: wire.rating,
    gamesPlayed: wire.games_played,
    wins: wire.wins,
    losses: wire.losses,
    draws: wire.draws,
    updatedAt: wire.updated_at,
  };
}

async function getRatings(): Promise<PlayerRating[]> {
  return (await request<WireRating[]>("/ratings")).map(toRating);
}

async function getRating(userId: number): Promise<PlayerRating> {
  return toRating(await request<WireRating>(`/ratings/${encodeURIComponent(String(userId))}`));
}

async function resetRating(userId: number, input: ResetRatingInput = {}): Promise<PlayerRating> {
  const wire = await request<WireRating>(`/admin/ratings/${encodeURIComponent(String(userId))}/reset`, {
    method: "POST",
    body: JSON.stringify({
      rating: input.rating,
      reason: input.reason ?? null,
      reset_stats: input.resetStats,
    }),
  });
  notify();
  return toRating(wire);
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
  getUser,
  getFriends,
  sendFriendRequest,
  acceptFriendRequest,
  declineFriendRequest,
  cancelFriendRequest,
  removeFriend,
  login,
  register,
  logout,
  getGameTypes,
  getGameType,
  createGameType,
  updateGameType,
  deleteGameType,
  listSessions,
  getSession,
  createSession,
  pauseSession,
  resumeSession,
  abortSession,
  surrenderSession,
  recordConnectFourGame,
  recordGame,
  listGames,
  clearDemoData,
  getReports,
  createReport,
  updateReport,
  deleteReport,
  getReportOverview,
  getRatings,
  getRating,
  resetRating,
  subscribe,
};

/** Einziger Zugriff der Oberflaeche: alles laeuft ueber das Backend. */
export const api: Api = httpApi;
