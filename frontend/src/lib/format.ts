/** Formatierung für die Oberfläche – durchgehend deutsche Notation. */

import type { UserRole } from "../types";

const dateTimeFormat = new Intl.DateTimeFormat("de-DE", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});
const relativeFormat = new Intl.RelativeTimeFormat("de-DE", { numeric: "auto" });

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export function formatDateTime(iso: string): string {
  return dateTimeFormat.format(new Date(iso));
}

export function formatRelative(iso: string, now = Date.now()): string {
  const diff = new Date(iso).getTime() - now;
  const magnitude = Math.abs(diff);
  if (magnitude < MINUTE) return "gerade eben";
  if (magnitude < HOUR) return relativeFormat.format(Math.round(diff / MINUTE), "minute");
  if (magnitude < DAY) return relativeFormat.format(Math.round(diff / HOUR), "hour");
  return relativeFormat.format(Math.round(diff / DAY), "day");
}

/** `4:12 min` bzw. `38 s` – kompakt genug für Listen. */
export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "–";
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds} s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, "0")} min`;
}

export function initials(username: string): string {
  const parts = username.trim().split(/[\s._-]+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export const ROLE_LABEL: Record<UserRole, string> = {
  admin: "Admin",
  host: "Host",
  player: "Spieler:in",
};
