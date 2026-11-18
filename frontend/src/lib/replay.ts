/**
 * Reine Schrittlogik der Wiedergabe gespeicherter Partien.
 *
 * Die Ansicht zählt `step` als Anzahl bereits gezeigter Züge: 0 ist die
 * Startstellung, `totalMoves` der Endstand. Alle Werte werden hier geklemmt,
 * damit Tastatur, Schieberegler und Abspiel-Timer nicht auseinanderlaufen.
 */

/** Pause zwischen zwei Zügen im automatischen Abspielen. */
export const REPLAY_INTERVAL_MS = 900;

export function clampMoveStep(step: number, totalMoves: number): number {
  const total = Number.isFinite(totalMoves) ? Math.max(0, Math.trunc(totalMoves)) : 0;
  if (!Number.isFinite(step)) return 0;
  return Math.min(Math.max(Math.trunc(step), 0), total);
}

/** Ein Schritt nach vorn oder hinten, immer innerhalb von 0..`totalMoves`. */
export function shiftMoveStep(step: number, delta: number, totalMoves: number): number {
  return clampMoveStep(step + delta, totalMoves);
}

/** Beschriftung für den aktuellen Stand der Wiedergabe. */
export function replayStepLabel(step: number, totalMoves: number): string {
  const total = clampMoveStep(totalMoves, totalMoves);
  if (total === 0) return "Keine Züge gespeichert";

  const current = clampMoveStep(step, total);
  if (current === 0) return `Startstellung - 0 von ${total}`;
  if (current === total) return `Endstand - ${total} von ${total}`;
  return `Zug ${current} von ${total}`;
}
