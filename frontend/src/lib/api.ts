/**
 * Datenzugriff f├╝r die Oberfl├ñche.
 *
 * Aktuell liegt die Datenhaltung im Browser (`localStorage`), damit Dashboard
 * und Spielfeld-Fenster denselben Spielstand sehen. Das interface `Api` ist
 * bewusst 1:1 auf die REST-Routen des Rust-Backends zugeschnitten ÔÇô f├╝r den
 * Umstieg gen├╝gt es, `localApi` durch `httpApi` zu ersetzen, die Komponenten
 * rufen ausschlie├ƒlich `api`:
 *
 *   GET    /api/health
 *   GET    /api/users
 *   GET    /api/games
 *   GET    /api/sessions
 *   POST   /api/sessions                       { gameType, hostId, players }
 *   GET    /api/sessions/{id}
 *   POST   /api/sessions/{id}/abort
 *   POST   /api/sessions/{id}/pause
 *   POST   /api/sessions/{id}/resume
 *   POST   /api/sessions/{id}/surrender        { userId }
 *   POST   /api/connect-four/games             { moves, winner }   <- useConnectFour
 *   GET    /api/connect-four/games
 *
 * F├╝r Details siehe README.md, Abschnitt "Backend-Anbindung".
 */

import {
  opponent,
  winnerToOutcome,
  SIDE_LABEL,
  type ConnectFourResult,
  type GameSession,
  type GameType,
  type RecordedGame,
  type Side,
  type User,
} from "../types";
import { validateConnectFourResult } from "./connectFour";
import { GAME_TYPES, findGameType } from "./gameTypes";
import { createId } from "./id";
import { read, subscribe, write } from "./storage";

export interface CreateSessionInput {
  gameType: string;
  hostId: number;
  players: Record<Side, number>;
}

export interface RecordGameContext {
  sessionId: string | null;
  players: Record<Side, number | null>;
  startedAt: number;
  /** Bis zum Partieende angehaltene Zeit ÔÇô wird von der Dauer abgezogen. */
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

/* ------------------------------------------------------------------- Daten */

const KEY_USERS = "users";
const KEY_SESSIONS = "sessions";
const KEY_GAMES = "games";
const KEY_SEEDED = "seeded";

/* Kurz k├╝nstliche Latenz: sonst ist der Ladezustand nie zu sehen und die
   Oberfl├ñche wirkt wie ein kaputter Bildschirm, wenn doch einmal gewartet
   werden muss. */
const LATENCY_MS = 90;

const wait = <T,>(value: T): Promise<T> =>
  new Promise((resolve) => {
    window.setTimeout(() => resolve(value), LATENCY_MS);
  });

export class ApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ApiError";
  }
}

const SEED_USERS: User[] = [
  { id: 1, username: "HostUser", role: "host" },
  { id: 2, username: "Alice", role: "player" },
  { id: 3, username: "Bob", role: "player" },
  { id: 4, username: "Mara", role: "admin" },
];

// Der Katalog steht in `lib/gameTypes.ts`; die Datenbank liefert sp├ñter nur
// die technischen Spalten dazu.

/** Beispielpartie, damit die Historie beim ersten Aufruf nicht leer ist. */
function seedDemoData(): { sessions: GameSession[]; games: RecordedGame[] } {
  const playedAt = new Date(Date.now() - 1000 * 60 * 47).toISOString();
  const gameId = "g-demo2x4";
  const sessionId = "s-demo7f2a";

  const game: RecordedGame = {
    id: gameId,
    sessionId,
    gameType: "connect-four",
    winner: "red",
    playedAt,
    durationMs: 252_000,
    players: { red: 2, yellow: 3 },
    demo: true,
    moves: [
      { turn: 1, player: "red", location: { x: 0, y: 5 } },
      { turn: 2, player: "yellow", location: { x: 0, y: 4 } },
      { turn: 3, player: "red", location: { x: 1, y: 5 } },
      { turn: 4, player: "yellow", location: { x: 1, y: 4 } },
      { turn: 5, player: "red", location: { x: 2, y: 5 } },
      { turn: 6, player: "yellow", location: { x: 2, y: 4 } },
      { turn: 7, player: "red", location: { x: 3, y: 5 } },
    ],
  };

  const session: GameSession = {
    id: sessionId,
    gameType: "connect-four",
    hostId: 1,
    players: { red: 2, yellow: 3 },
    createdAt: new Date(new Date(playedAt).getTime() - 1000 * 30).toISOString(),
    finishedAt: new Date(new Date(playedAt).getTime() + game.durationMs).toISOString(),
    outcome: "red_win",
    abortReason: null,
    surrenderedBy: null,
    gameId,
    pausedAt: null,
    pausedMs: 0,
    demo: true,
  };

  return { sessions: [session], games: [game] };
}

function loadUsers(): User[] {
  const users = read<User[]>(KEY_USERS, []);
  if (users.length > 0) return users;
  write(KEY_USERS, SEED_USERS);
  return SEED_USERS;
}

function loadGameTypes(): GameType[] {
  const stored = read<GameType[]>("gameTypes", []);
  return stored.length > 0 ? stored : GAME_TYPES;
}

/**
 * Sitzungen aus fr├╝heren Versionen kennen `pausedAt` noch nicht. Fehlende
 * Felder werden hier erg├ñnzt, statt die Nutzerdaten zu verwerfen.
 */
function normaliseSession(session: GameSession): GameSession {
  if (session.pausedAt !== undefined && session.pausedMs !== undefined) return session;
  return {
    ...session,
    pausedAt: session.pausedAt ?? null,
    // ├ältere Datens├ñtze hatten keine Pausen, also ist nichts nachzuz├ñhlen.
    pausedMs: session.pausedMs ?? 0,
  };
}

function loadSessions(): GameSession[] {
  return read<GameSession[]>(KEY_SESSIONS, []).map(normaliseSession);
}

function loadGames(): RecordedGame[] {
  return read<RecordedGame[]>(KEY_GAMES, []);
}

function ensureSeeded(): void {
  if (read<boolean>(KEY_SEEDED, false)) return;
  const { sessions, games } = seedDemoData();
  write(KEY_SESSIONS, sessions);
  write(KEY_GAMES, games);
  write(KEY_SEEDED, true);
}

function byNewest<T extends { createdAt?: string; playedAt?: string }>(a: T, b: T): number {
  const left = a.createdAt ?? a.playedAt ?? "";
  const right = b.createdAt ?? b.playedAt ?? "";
  return right.localeCompare(left);
}

function requireSession(id: string): GameSession {
  const session = loadSessions().find((candidate) => candidate.id === id);
  if (!session) throw new ApiError(`Sitzung ${id} existiert nicht (mehr).`);
  return session;
}

/** Sitzung, die noch nicht beendet ist ÔÇô Grundlage f├╝r Pause/Fortsetzen/Abbruch. */
function requireOpen(id: string): GameSession {
  const session = requireSession(id);
  if (session.outcome !== null) throw new ApiError("Diese Sitzung ist bereits beendet.");
  return session;
}

function saveSession(session: GameSession): GameSession {
  const sessions = loadSessions();
  const index = sessions.findIndex((candidate) => candidate.id === session.id);
  if (index === -1) sessions.unshift(session);
  else sessions[index] = session;
  write(KEY_SESSIONS, sessions);
  return session;
}

/* --------------------------------------------------------------- localApi */

export const localApi: Api = {
  async getUsers() {
    ensureSeeded();
    return wait(loadUsers());
  },

  async getGameTypes() {
    return wait(loadGameTypes());
  },

  async getGameType(name) {
    return wait(findGameType(name) ?? null);
  },

  async listSessions() {
    ensureSeeded();
    return wait(loadSessions().sort(byNewest));
  },

  async getSession(id) {
    ensureSeeded();
    return wait(loadSessions().find((session) => session.id === id) ?? null);
  },

  async createSession(input) {
    ensureSeeded();

    const gameType = findGameType(input.gameType);
    if (!gameType) throw new ApiError(`Unbekanntes Spiel: ${input.gameType}`);
    if (!gameType.implemented) {
      throw new ApiError(`${gameType.displayName} ist noch nicht spielbar.`);
    }
    if (input.players.red === input.players.yellow) {
      throw new ApiError("Rot und Gelb brauchen zwei verschiedene Spieler:innen.");
    }
    const known = new Set(loadUsers().map((user) => user.id));
    for (const side of ["red", "yellow"] as const) {
      if (!known.has(input.players[side])) {
        throw new ApiError(`Unbekannter Spieler f├╝r die Seite ${SIDE_LABEL[side]}.`);
      }
    }
    // Eine angehaltene Partie blockiert ebenfalls ÔÇô sie ist noch offen.
    if (loadSessions().some((session) => session.outcome === null)) {
      throw new ApiError("Es l├ñuft bereits eine Partie. Bitte zuerst die offene Sitzung beenden.");
    }

    const session: GameSession = {
      id: createId("s"),
      gameType: input.gameType,
      hostId: input.hostId,
      players: { ...input.players },
      createdAt: new Date().toISOString(),
      finishedAt: null,
      outcome: null,
      abortReason: null,
      surrenderedBy: null,
      gameId: null,
      pausedAt: null,
      pausedMs: 0,
    };
    return wait(saveSession(session));
  },

  async pauseSession(id) {
    const session = requireOpen(id);
    if (session.pausedAt !== null) throw new ApiError("Diese Sitzung ist bereits pausiert.");
    return wait(saveSession({ ...session, pausedAt: new Date().toISOString() }));
  },

  async resumeSession(id) {
    const session = requireOpen(id);
    if (session.pausedAt === null) throw new ApiError("Diese Sitzung l├ñuft bereits.");
    // Die abgeschlossene Pause wird festgehalten, damit die Spielzeit auch nach
    // einem Neuladen des Fensters stimmt.
    const spent = Math.max(0, Date.now() - Date.parse(session.pausedAt));
    return wait(saveSession({ ...session, pausedAt: null, pausedMs: session.pausedMs + spent }));
  },

  async abortSession(id) {
    const session = requireOpen(id);
    return wait(
      saveSession({
        ...session,
        outcome: "aborted",
        abortReason: "host",
        finishedAt: new Date().toISOString(),
        // Eine offene Pause z├ñhlt nicht mehr zur Laufzeit.
        pausedAt: null,
      }),
    );
  },

  async surrenderSession(id, userId) {
    const session = requireOpen(id);
    if (session.players.red !== userId && session.players.yellow !== userId) {
      throw new ApiError("Diese Person sitzt in dieser Sitzung nicht am Brett.");
    }

    const loser: Side = session.players.red === userId ? "red" : "yellow";

    return wait(
      saveSession({
        ...session,
        outcome: winnerToOutcome(opponent(loser)),
        abortReason: "surrender",
        surrenderedBy: userId,
        finishedAt: new Date().toISOString(),
        pausedAt: null,
      }),
    );
  },

  async recordConnectFourGame(result, context) {
    ensureSeeded();
    validateConnectFourResult(result);

    const endedAt = Date.now();

    const game: RecordedGame = {
      id: createId("g"),
      sessionId: context.sessionId,
      gameType: "connect-four",
      winner: result.winner,
      moves: result.moves,
      playedAt: new Date(endedAt).toISOString(),
      // Nur die tats├ñchlich gespielte Zeit ÔÇô Pausen z├ñhlen nicht mit.
      durationMs: Math.max(0, endedAt - context.startedAt - context.pausedMs),
      players: { ...context.players },
    };
    write(KEY_GAMES, [game, ...loadGames()]);

    // Die gehostete Sitzung endet mit derselben Partie. Ist sie schon
    // beendet (Host hat vorher gestoppt), bleibt ihr Ausgang unangetastet ÔÇô
    // der Spielverlauf wird trotzdem gespeichert.
    if (context.sessionId) {
      const session = loadSessions().find((candidate) => candidate.id === context.sessionId);
      if (session && session.outcome === null) {
        saveSession({
          ...session,
          outcome: winnerToOutcome(result.winner),
          finishedAt: game.playedAt,
          gameId: game.id,
          pausedAt: null,
        });
      }
    }

    return wait(game);
  },

  async listGames() {
    ensureSeeded();
    return wait(loadGames().sort(byNewest));
  },

  async clearDemoData() {
    const sessions = loadSessions().filter((session) => !session.demo);
    const games = loadGames().filter((game) => !game.demo);
    write(KEY_SESSIONS, sessions);
    write(KEY_GAMES, games);
    return wait(undefined);
  },

  subscribe,
};

export const api: Api = localApi;
