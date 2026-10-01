import type { GameSession, RecordedGame, Side } from "../types";

export interface GameTally {
  games: number;
  sessions: number;
  lastPlayed: string | null;
  /** Siege je Seite, für Connect Four. */
  wins: Record<Side, number>;
  draws: number;
}

export function emptyTally(): GameTally {
  return { games: 0, sessions: 0, lastPlayed: null, wins: { red: 0, yellow: 0 }, draws: 0 };
}

/** Die zuletzt gespielten Verläufe eines Spiels, neueste zuerst. */
export function recentGames(games: RecordedGame[], gameType: string, limit = 5): RecordedGame[] {
  return games.filter((game) => game.gameType === gameType).slice(0, limit);
}

/** Sitzungen eines Spiels. */
export function sessionsOf(sessions: GameSession[], gameType: string): GameSession[] {
  return sessions.filter((session) => session.gameType === gameType);
}