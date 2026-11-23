/**
 * Rollenmatrix der Oberflaeche.
 *
 * Der Server prueft dieselben Regeln noch einmal in `backend/src/api.rs`.
 * Hier werden nur Wege versteckt, die fuer die Rolle nicht vorgesehen sind -
 * die eigentliche Absicherung bleibt beim Backend.
 */

import type { GameSession, UserRole } from "../types";

/** player: nur spielen; host/admin: zusaetzlich Sitzungen anlegen. */
export function canCreateSessions(role: UserRole | undefined): boolean {
  return role === "admin" || role === "host";
}

export function isAdmin(role: UserRole | undefined): boolean {
  return role === "admin";
}

/** Sitzungsuebersicht und Steuerung eigener Sitzungen. */
export function canViewSessions(role: UserRole | undefined): boolean {
  return canCreateSessions(role);
}

/**
 * Regulaere Spieler:innen sehen die Meldungsverwaltung nicht. Die Details und
 * die aggregierte Visualisierung bleiben der Administration vorbehalten.
 */
export function canViewReports(role: UserRole | undefined): boolean {
  return role === "admin";
}

/** Die Rangliste mit allen Konten ist Hosts und Admins vorbehalten. */
export function canViewLeaderboard(role: UserRole | undefined): boolean {
  return role === "admin" || role === "host";
}

/** Die Kamera-/Brettverfolgung ist ein Werkzeug fuer Hosts und Admins. */
export function canViewCamera(role: UserRole | undefined): boolean {
  return role === "admin" || role === "host";
}

/** Pruefen, kommentieren und loeschen duerfen nur Admins. */
export function canManageReports(role: UserRole | undefined): boolean {
  return role === "admin";
}

export function canManageUsers(role: UserRole | undefined): boolean {
  return role === "admin";
}

/** Spiele im Katalog anlegen und loeschen: nur die Administration. */
export function canManageGames(role: UserRole | undefined): boolean {
  return role === "admin";
}

/** Jede angemeldete, nicht gesperrte Person darf spielen. */
export function canPlay(role: UserRole | undefined): boolean {
  return role !== undefined;
}

/** Pausieren, Fortsetzen und Beenden: eigener Host oder Admin. */
export function canManageSession(
  role: UserRole | undefined,
  userId: number | undefined,
  session: Pick<GameSession, "hostId">,
): boolean {
  if (role === "admin") return true;
  return role === "host" && userId !== undefined && session.hostId === userId;
}

/** Das Brett sehen: Mitwirkende, der Host und Admins. */
export function canOpenSession(
  role: UserRole | undefined,
  userId: number | undefined,
  session: Pick<GameSession, "hostId" | "players">,
): boolean {
  if (canManageSession(role, userId, session)) return true;
  return (
    userId !== undefined &&
    (session.players.red === userId || session.players.yellow === userId)
  );
}

/** Aufgeben darf man nur selbst; Admins duerfen es erzwingen. */
export function canSurrenderSeat(
  role: UserRole | undefined,
  userId: number | undefined,
  seatUserId: number,
): boolean {
  return role === "admin" || (userId !== undefined && seatUserId === userId);
}
