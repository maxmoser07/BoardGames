/**
 * Live-Feedback und Zuganalyse fuer die Kamera-Ansicht.
 *
 * Die Funktionen hier sind rein: Sie lesen die letzte `BoardObservation`, den
 * Brettzustand und die erkannten Zuege und liefern daraus Anzeigewerte. Kamera,
 * Detektor und Tracker bleiben unveraendert; die Bewertung der Zuege kommt aus
 * `connectFourOdds.ts`.
 */

import type { Side } from "../types.ts";
import { estimateMoveChances, immediateWinningColumns } from "./connectFourOdds.ts";
import { emptyBoard } from "./camera/connectFour.ts";
import type {
  BoardLayout,
  BoardObservation,
  BoardState,
  TrackedMove,
} from "./camera/types.ts";

const DEFAULT_LAYOUT: BoardLayout = { rows: 6, cols: 7 };

/* ---------------------------------------------------------- Live-Feedback */

export type DetectionState = "waiting" | "stable" | "attention" | "stale";

export interface DetectionFeedback {
  state: DetectionState;
  label: string;
  detail: string;
  /** Durchschnittliche Konfidenz der letzten Beobachtung, 0..1. */
  confidence: number | null;
  /** Zellen unterhalb der Mindestkonfidenz. */
  uncertainCells: number;
  totalCells: number;
  /** Alter des letzten ausgewerteten Frames in ms. */
  lastFrameAgoMs: number | null;
  frames: number;
  /** Konfidenz je Zelle, fuer die Markierung im erkannten Brett. */
  perCell: number[][];
}

export interface DetectionOptions {
  lowConfidence?: number;
  staleAfterMs?: number;
  /** Ab dieser Anzahl unsicherer Zellen gilt die Erkennung als pruefbeduerftig. */
  attentionCells?: number;
}

function percent(value: number): number {
  return Math.round(value * 100);
}

/**
 * Fasst die letzte Beobachtung zu einem kurzen Status zusammen. `now` kommt von
 * aussen, damit die Anzeige nicht bei jedem Render `Date.now()` braucht.
 */
export function describeDetection(
  observation: BoardObservation | null,
  frames: number,
  lastUpdateAt: number | null,
  now: number,
  options: DetectionOptions = {},
): DetectionFeedback {
  const layout = observation?.layout ?? DEFAULT_LAYOUT;
  const totalCells = layout.rows * layout.cols;
  const lastFrameAgoMs =
    lastUpdateAt === null ? null : Math.max(0, Math.round(now - lastUpdateAt));

  if (observation === null) {
    return {
      state: "waiting",
      label: "Warte auf das erste Bild",
      detail: "Starte die Kamera und uebernimm die Kalibrierung.",
      confidence: null,
      uncertainCells: 0,
      totalCells,
      lastFrameAgoMs,
      frames,
      perCell: [],
    };
  }

  const lowConfidence = options.lowConfidence ?? 0.5;
  const staleAfterMs = options.staleAfterMs ?? 3000;
  const attentionCells = options.attentionCells ?? 6;
  const perCell = observation.cells.map((line) => line.map((cell) => cell.confidence));

  let uncertainCells = 0;
  for (const line of perCell) {
    for (const confidence of line) {
      if (confidence < lowConfidence) uncertainCells += 1;
    }
  }

  if (lastFrameAgoMs !== null && lastFrameAgoMs > staleAfterMs) {
    return {
      state: "stale",
      label: "Keine neuen Bilder",
      detail: `Seit ${Math.round(lastFrameAgoMs / 1000)} s kein Frame. Pruefe Kamera und Berechtigung.`,
      confidence: observation.confidence,
      uncertainCells,
      totalCells,
      lastFrameAgoMs,
      frames,
      perCell,
    };
  }

  if (uncertainCells >= attentionCells || observation.confidence < 0.42) {
    return {
      state: "attention",
      label: "Erkennung pruefen",
      detail: `${uncertainCells} von ${totalCells} Feldern sind unsicher. Mehr Licht oder eine ruhigere Kamera helfen.`,
      confidence: observation.confidence,
      uncertainCells,
      totalCells,
      lastFrameAgoMs,
      frames,
      perCell,
    };
  }

  return {
    state: "stable",
    label: "Erkennung stabil",
    detail: `${totalCells} Felder gelesen, durchschnittlich ${percent(observation.confidence)} % Konfidenz.`,
    confidence: observation.confidence,
    uncertainCells,
    totalCells,
    lastFrameAgoMs,
    frames,
    perCell,
  };
}

/* ----------------------------------------------------------- Zuganalyse */

export type MoveGrade = "best" | "good" | "inaccuracy" | "blunder" | "unknown";

export const MOVE_GRADE_LABEL: Record<MoveGrade, string> = {
  best: "Bester Zug",
  good: "Gut",
  inaccuracy: "Ungenau",
  blunder: "Fehler",
  unknown: "Unklar",
};

export interface MoveAssessment {
  turn: number;
  side: Side;
  /** Gespielte Spalte, 0-basiert. */
  column: number;
  /** Siegchance der gespielten Spalte in Prozent. */
  playedChance: number;
  bestColumn: number | null;
  bestChance: number;
  /** Verschenkte Siegchance in Prozentpunkten. */
  loss: number;
  grade: MoveGrade;
  label: string;
}

export interface AssessMovesOptions {
  /** Nur die letzten N Zuege bewerten (aeltere nur zum Brettaufbau). */
  maxMoves?: number;
  /** Simulationen je Kandidatenspalte. */
  samples?: number;
  /**
   * Brett vor dem ersten erkannten Zug. Beim Tracking eines laufenden Bretts
   * liegen die bereits vorhandenen Steine nicht in `moves`; ohne Startbrett
   * wuerde die Bewertung von einem leeren Brett ausgehen.
   */
  startBoard?: BoardState;
}

export interface MoveSummary {
  total: number;
  best: number;
  good: number;
  inaccuracy: number;
  blunder: number;
  unknown: number;
  /** Gewichtete Genauigkeit der bewerteten Zuege, 0..100. */
  accuracy: number;
}

function isOnBoard(location: TrackedMove["location"], layout: BoardLayout): boolean {
  return (
    Number.isInteger(location.x) &&
    Number.isInteger(location.y) &&
    location.x >= 0 &&
    location.x < layout.cols &&
    location.y >= 0 &&
    location.y < layout.rows
  );
}

function gradeOf(playedColumn: number, bestColumn: number | null, loss: number): MoveGrade {
  if (bestColumn === null) return "unknown";
  if (playedColumn === bestColumn || loss <= 3) return "best";
  if (loss <= 10) return "good";
  if (loss <= 22) return "inaccuracy";
  return "blunder";
}

/**
 * Bewertet die letzten erkannten Zuege. Das Brett wird aus dem optionalen
 * Startbrett und den Zuegen neu aufgebaut, damit jede Stellung vor dem Zug
 * bewertet werden kann. Fruehere Zuege fliessen nur in den Brettaufbau ein,
 * damit lange Partien nicht bei jedem Frame dutzende Simulationen ausloesen.
 */
export function assessMoves(
  moves: readonly TrackedMove[],
  options: AssessMovesOptions = {},
): MoveAssessment[] {
  const layout = DEFAULT_LAYOUT;
  const maxMoves = Math.max(1, options.maxMoves ?? 12);
  const samples = options.samples ?? 80;
  const board: BoardState = options.startBoard
    ? options.startBoard.map((line) => [...line])
    : emptyBoard(layout);
  const start = Math.max(0, moves.length - maxMoves);
  const assessments: MoveAssessment[] = [];

  moves.forEach((move, index) => {
    if (!isOnBoard(move.location, layout)) return;

    if (index >= start) {
      const before = board.map((line) => [...line]);
      const result = estimateMoveChances(before, move.side, { samples });
      const playedChance = result.chances[move.location.x] ?? 0;
      const bestChance = result.bestChance;
      const loss = Math.max(0, bestChance - playedChance);
      const grade = gradeOf(move.location.x, result.bestColumn, loss);
      assessments.push({
        turn: move.turn,
        side: move.side,
        column: move.location.x,
        playedChance,
        bestColumn: result.bestColumn,
        bestChance,
        loss,
        grade,
        label: MOVE_GRADE_LABEL[grade],
      });
    }

    board[move.location.y][move.location.x] = move.side;
  });

  return assessments;
}

export function summariseMoves(assessments: readonly MoveAssessment[]): MoveSummary {
  const weights: Record<MoveGrade, number> = {
    best: 1,
    good: 0.85,
    inaccuracy: 0.55,
    blunder: 0.15,
    unknown: 0,
  };
  const summary: MoveSummary = {
    total: assessments.length,
    best: 0,
    good: 0,
    inaccuracy: 0,
    blunder: 0,
    unknown: 0,
    accuracy: 0,
  };
  let weighted = 0;
  let rated = 0;

  for (const assessment of assessments) {
    summary[assessment.grade] += 1;
    if (assessment.grade === "unknown") continue;
    weighted += weights[assessment.grade];
    rated += 1;
  }

  summary.accuracy = rated === 0 ? 0 : Math.round((weighted / rated) * 100);
  return summary;
}

/**
 * Drohungen beider Seiten fuer die Live-Analyse. Die Zahlen sind Spalten, in
 * denen ein Stein sofort vier in einer Reihe ergibt.
 */
export function threatColumns(
  board: BoardState,
  currentPlayer: Side,
): { mine: number[]; theirs: number[] } {
  const other: Side = currentPlayer === "red" ? "yellow" : "red";
  return {
    mine: immediateWinningColumns(board, currentPlayer),
    theirs: immediateWinningColumns(board, other),
  };
}
