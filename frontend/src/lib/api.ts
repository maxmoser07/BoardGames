/**
 * Datenzugriff für die Oberfläche.
 *
 * Aktuell liegt die Datenhaltung im Browser (`localStorage`), damit Dashboard
 * und Spielfeld-Fenster denselben Spielstand sehen. Das interface `Api` ist
 * bewusst 1:1 auf die REST-Routen des Rust-Backends zugeschnitten – für den
 * Umstieg genügt es, `localApi` durch `httpApi` zu ersetzen, die Komponenten
 * rufen ausschließlich `api`:
 *
 *   GET    /api/health
 *   GET    /api/users
 *   GET    /api/games
 *   GET    /api/sessions
 *   POST   /api/sessions                       { gameType, hostId, players }
 *   GET    /api/sessions/{id}
 *   POST   /api/sessions/{id}/abort
 *   POST   /api/sessions/{id}/surrender        { userId }
 *   POST   /api/connect-four/games             { moves, winner }   <- useConnectFour
 *   GET    /api/connect-four/games
 *
 * Für Details siehe README.md, Abschnitt "Backend-Anbindung".
 */

import {
  opponent,
  sessionStatus,
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
}

export interface Api {
  getUsers(): Promise<User[]>;
  getGameTypes(): Promise<GameType[]>;
  getGameType(name: string): Promise<GameType | null>;
  listSessions(): Promise<GameSession[]>;
  getSession(id: string): Promise<GameSession | null>;
  createSession(input: CreateSessionInput): Promise<GameSession>;
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

/* Kurz künstliche Latenz: sonst ist der Ladezustand nie zu sehen und die
   Oberfläche wirkt wie ein kaputter Bildschirm, wenn doch einmal gewartet
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

// Der Katalog steht in `lib/gameTypes.ts`; die Datenbank liefert später nur
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

function loadSessions(): GameSession[] {
  return read<GameSession[]>(KEY_SESSIONS, []);
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
        throw new ApiError(`Unbekannter Spieler für die Seite ${SIDE_LABEL[side]}.`);
      }
    }
    if (loadSessions().some((session) => sessionStatus(session) === "running")) {
      throw new ApiError("Es läuft bereits eine Partie. Bitte zuerst die laufende Sitzung beenden.");
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
    };
    return wait(saveSession(session));
  },

  async abortSession(id) {
    const session = requireSession(id);
    if (session.outcome !== null) throw new ApiError("Diese Sitzung ist bereits beendet.");
    return wait(
      saveSession({
        ...session,
        outcome: "aborted",
        abortReason: "host",
        finishedAt: new Date().toISOString(),
      }),
    );
  },

  async surrenderSession(id, userId) {
    const session = requireSession(id);
    if (session.outcome !== null) throw new ApiError("Diese Sitzung ist bereits beendet.");
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
      }),
    );
  },

  async recordConnectFourGame(result, context) {
    ensureSeeded();
    validateConnectFourResult(result);

    const game: RecordedGame = {
      id: createId("g"),
      sessionId: context.sessionId,
      gameType: "connect-four",
      winner: result.winner,
      moves: result.moves,
      playedAt: new Date().toISOString(),
      durationMs: Math.max(0, Date.now() - context.startedAt),
      players: { ...context.players },
    };
    write(KEY_GAMES, [game, ...loadGames()]);

    // Die gehostete Sitzung endet mit derselben Partie. Ist sie schon
    // abgebrochen (Host hat vorher gestoppt), bleibt ihr Ausgang unangetastet –
    // der Spielverlauf wird trotzdem gespeichert.
    if (context.sessionId) {
      const session = loadSessions().find((candidate) => candidate.id === context.sessionId);
      if (session && session.outcome === null) {
        saveSession({
          ...session,
          outcome: winnerToOutcome(result.winner),
          finishedAt: game.playedAt,
          gameId: game.id,
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
