import { api } from "../lib/api";
import { useLiveData } from "./useLiveData";
import { pausedMs, type GameSession } from "../types";

/**
 * Pausenzeit einer Sitzung bis zu einem festen Zeitpunkt.
 *
 * `recordConnectFourGame` kennt nur den Startzeitpunkt des Fensters, nicht die
 * Pausen aus anderen Fenstern oder von vor einem Neuladen. Deshalb wird hier
 * aus dem gemeinsamen Store nachgeschlagen ÔÇô und f├╝r eine Sitzung ohne
 * Pausenmetadata gar nichts berechnet.
 *
 * `until` wird als Argument eingefroren, damit sich die installierte
 * fetch-Br├╝cke nicht w├ñhrend ihres Bestehens ver├ñndert.
 */
export function usePausedTime(session: GameSession, until: number): number {
  const sessions = useLiveData(() => api.listSessions());
  const stored = (sessions.data ?? []).find((candidate) => candidate.id === session.id) ?? session;

  if (stored.pausedMs === 0 && stored.pausedAt === null) return 0;
  return pausedMs(stored, until);
}
