/**
 * Zustandsmaschine, die aus aufeinanderfolgenden Brettbeobachtungen Züge macht.
 *
 * Der Tracker ist absichtlich unabhängig von Kamera und Browser: Er nimmt
 * `BoardObservation`s entgegen und meldet `move`, `reset` und `update`-Events.
 * Dadurch lässt er sich mit synthetischen Bildern vollständig testen.
 */

import { CONNECT_FOUR_BOARD, emptyBoard } from "./connectFour.ts";
import type {
  BoardLayout,
  BoardObservation,
  BoardState,
  MoveTrackerOptions,
  Side,
  TrackerEvent,
  TrackedMove,
} from "./types";

type Listener = (event: TrackerEvent) => void;

interface AddedCell {
  row: number;
  col: number;
  side: Side;
  confidence: number;
}

function observationSides(observation: BoardObservation): BoardState {
  return observation.cells.map((line) => line.map((cell) => cell.side));
}

function observationKey(observation: BoardObservation, minConfidence: number): string {
  return observation.cells
    .map((line) =>
      line
        .map((cell) => {
          // Unsichere Zellen bewusst anders kodieren als "leer": Wird dieselbe
          // Zelle später sicher erkannt, muss sich der Schlüssel ändern.
          if (cell.confidence < minConfidence) return "?";
          return cell.side ?? "-";
        })
        .join(""),
    )
    .join("/");
}

function copyBoard(board: BoardState): BoardState {
  return board.map((line) => [...line]);
}

function copyMove(move: TrackedMove): TrackedMove {
  return { ...move, location: { ...move.location } };
}

export class MoveTracker {
  private readonly layout: BoardLayout;
  private readonly minConfidence: number;
  private readonly confirmationFrames: number;
  private readonly resetThreshold: number;
  private readonly now: () => number;
  private readonly listeners = new Set<Listener>();

  private boardState: BoardState;
  private trackedMoves: TrackedMove[] = [];
  private pendingKey: string | null = null;
  private pendingCount = 0;
  private lastProcessedKey: string | null = null;
  private hasBaseline = false;

  constructor(options: MoveTrackerOptions = {}) {
    this.layout = options.layout ?? CONNECT_FOUR_BOARD;
    this.minConfidence = options.minConfidence ?? 0.5;
    this.confirmationFrames = Math.max(1, options.confirmationFrames ?? 2);
    this.resetThreshold = Math.min(1, Math.max(0, options.resetThreshold ?? 0.5));
    this.now = options.now ?? (() => Date.now());
    this.boardState = emptyBoard(this.layout);
  }

  /** Aktueller Brettzustand als Kopie; Zeile 0 ist oben. */
  get board(): BoardState {
    return copyBoard(this.boardState);
  }

  get moves(): TrackedMove[] {
    return this.trackedMoves.map(copyMove);
  }

  get turn(): number {
    return this.trackedMoves.length;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** Setzt Brett und Züge zurück; die nächste Beobachtung ist ein neuer Startpunkt. */
  reset(): void {
    this.boardState = emptyBoard(this.layout);
    this.trackedMoves = [];
    this.pendingKey = null;
    this.pendingCount = 0;
    this.lastProcessedKey = null;
    this.hasBaseline = false;
  }

  /**
   * Verarbeitet ein Bild und liefert die entstandenen Events.
   *
   * Die erste Beobachtung setzt nur den Startzustand – sie erzeugt bewusst
   * keine Züge. So kann die Erkennung auch mitten in einer Partie starten.
   */
  feed(observation: BoardObservation): TrackerEvent[] {
    if (
      observation.layout.rows !== this.layout.rows ||
      observation.layout.cols !== this.layout.cols ||
      observation.cells.length !== this.layout.rows ||
      observation.cells.some((line) => line.length !== this.layout.cols)
    ) {
      throw new Error(
        `Beobachtung passt nicht zum ${this.layout.rows}x${this.layout.cols}-Brett.`,
      );
    }

    const key = observationKey(observation, this.minConfidence);

    if (!this.hasBaseline) {
      this.hasBaseline = true;
      this.boardState = observationSides(observation);
      this.pendingKey = key;
      this.pendingCount = this.confirmationFrames;
      this.lastProcessedKey = key;
      return this.emit([{ type: "update", board: this.board, observation }]);
    }

    if (key === this.pendingKey) {
      this.pendingCount += 1;
    } else {
      this.pendingKey = key;
      this.pendingCount = 1;
    }

    if (this.pendingCount < this.confirmationFrames || key === this.lastProcessedKey) {
      return [];
    }

    const events = this.apply(observation);
    this.lastProcessedKey = key;
    return this.emit(events);
  }

  private apply(observation: BoardObservation): TrackerEvent[] {
    const events: TrackerEvent[] = [];
    const added: AddedCell[] = [];
    let removed = 0;
    let occupiedBefore = 0;

    for (let row = 0; row < this.layout.rows; row += 1) {
      for (let col = 0; col < this.layout.cols; col += 1) {
        const current = this.boardState[row][col];
        if (current !== null) occupiedBefore += 1;

        const cell = observation.cells[row][col];
        if (cell.confidence < this.minConfidence) continue;

        if (current === null && cell.side !== null) {
          added.push({ row, col, side: cell.side, confidence: cell.confidence });
        } else if (current !== null && cell.side !== current) {
          removed += 1;
        }
      }
    }

    const totalCells = this.layout.rows * this.layout.cols;
    const changed = added.length + removed;
    const boardCleared = removed > 0 && added.length === 0 && removed === occupiedBefore;
    const resync = !boardCleared && changed / totalCells >= this.resetThreshold;

    if (boardCleared || resync) {
      this.boardState = observationSides(observation);
      this.trackedMoves = [];
      events.push({
        type: "reset",
        reason: boardCleared ? "board-cleared" : "resync",
        board: this.board,
      });
      return events;
    }

    // Von unten nach oben: Mehrere gleichzeitig erkannte Steine in einer Spalte
    // werden so in der Reihenfolge übernommen, in der sie gefallen sind.
    added.sort((a, b) => b.row - a.row || a.col - b.col);

    for (const candidate of added) {
      if (this.boardState[candidate.row][candidate.col] !== null) continue;
      if (!this.isSupported(candidate.row, candidate.col)) continue;

      this.boardState[candidate.row][candidate.col] = candidate.side;
      const move: TrackedMove = {
        turn: this.trackedMoves.length + 1,
        side: candidate.side,
        location: { x: candidate.col, y: candidate.row },
        confidence: candidate.confidence,
        capturedAt: observation.capturedAt,
        detectedAt: this.now(),
        frame: observation.frame,
      };
      this.trackedMoves.push(move);
      events.push({ type: "move", move, board: this.board });
    }

    events.push({ type: "update", board: this.board, observation });
    return events;
  }

  /** Ein Stein darf nur auf dem Boden oder auf einem anderen Stein liegen. */
  private isSupported(row: number, col: number): boolean {
    for (let below = row + 1; below < this.layout.rows; below += 1) {
      if (this.boardState[below][col] === null) return false;
    }
    return true;
  }

  private emit(events: TrackerEvent[]): TrackerEvent[] {
    for (const event of events) {
      for (const listener of this.listeners) listener(event);
    }
    return events;
  }
}
