/** Reine Ableitungen rund um die Spieler-Ratings (ohne API-Zugriff). */

import type { PlayerRating } from "../types";

export const DEFAULT_RATING = 1000;

export type RatingTier = "bronze" | "silver" | "gold" | "platinum";

export const RATING_TIER_LABEL: Record<RatingTier, string> = {
  bronze: "Bronze",
  silver: "Silber",
  gold: "Gold",
  platinum: "Platin",
};

/** Grobe Einordnung fuer die Badge-Farbe in der Rangliste. */
export function ratingTier(rating: number): RatingTier {
  if (rating >= 1600) return "platinum";
  if (rating >= 1400) return "gold";
  if (rating >= 1200) return "silver";
  return "bronze";
}

/** Siegquote in Prozent; 0, solange noch keine Partie gespielt wurde. */
export function winRate(row: Pick<PlayerRating, "wins" | "gamesPlayed">): number {
  if (row.gamesPlayed <= 0) return 0;
  return Math.round((row.wins / row.gamesPlayed) * 100);
}

/** Rangliste: hoehere Zahl zuerst, bei Gleichstand mehr Partien, dann Name. */
export function rankRatings(rows: readonly PlayerRating[]): PlayerRating[] {
  return [...rows].sort(
    (a, b) =>
      b.rating - a.rating ||
      b.gamesPlayed - a.gamesPlayed ||
      a.username.localeCompare(b.username, "de"),
  );
}

export function formatRating(rating: number): string {
  return new Intl.NumberFormat("de-DE").format(Math.round(rating));
}
