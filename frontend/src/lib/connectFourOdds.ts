/**
 * Live-Einschätzung einer Connect-Four-Stellung.
 *
 * Connect Four ist gelöst, eine vollständige Suche wäre im Browser während
 * jeder Partie aber zu teuer. Für die Anzeige genügt eine Monte-Carlo-
 * Schätzung: Ab der aktuellen Stellung werden viele kurze Partien zu Ende
 * gespielt. Beide Seiten folgen dabei einer einfachen, aber vernünftigen Regel:
 *
 *   1. Ein sofortiger Sieg wird immer genommen.
 *   2. Droht der Gegner im nächsten Zug zu gewinnen, wird diese Spalte blockiert.
 *   3. Sonst wird eine Spalte mit leichter Mittepräferenz gewählt.
 *
 * Das Ergebnis ist keine perfekte Lösung, zeigt aber verlässlich, wer die
 * bessere Stellung hat. Der Zufall ist an die Stellung gekoppelt, damit
 * dieselbe Stellung immer dieselbe Anzeige ergibt.
 *
 * Die Funktion verändert das übergebene Brett nicht und ist damit auch für die
 * Kamera-Ansicht geeignet, die ihren Brettzustand direkt weiterreicht.
 */

import type { Side } from "../types";

export const ROWS = 6;
export const COLS = 7;

/** Partien für die Gesamtschätzung. */
export const DEFAULT_SAMPLES = 320;

/** Partien je Kandidatenspalte für die Zugempfehlung. */
export const DEFAULT_MOVE_SAMPLES = 48;

type Cell = Side | null;
export type OddsBoard = readonly (readonly Cell[])[];

export interface WinningOdds {
  /** Geschätzte Siegchance in Prozent. */
  red: number;
  draw: number;
  yellow: number;
  /** Empfohlene Spalte (0-basiert) für die Person am Zug, sonst null. */
  bestColumn: number | null;
  /** Geschätzte Siegchance des empfohlenen Zuges in Prozent. */
  bestChance: number;
  /** true, wenn die Partie bereits entschieden ist. */
  finished: boolean;
  /** Anzahl der simulierten Fortsetzungen hinter den Prozentwerten. */
  samples: number;
}

export interface OddsOptions {
  samples?: number;
  moveSamples?: number;
}

const CENTER_WEIGHTS = [1, 2, 3, 4, 3, 2, 1];
const DIRECTIONS: ReadonlyArray<readonly [number, number]> = [
  [0, 1],
  [1, 0],
  [1, 1],
  [1, -1],
];

const MAX_CACHE_ENTRIES = 48;
const cache = new Map<string, WinningOdds>();

function other(side: Side): Side {
  return side === "red" ? "yellow" : "red";
}

function clampSamples(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_SAMPLES;
  return Math.max(1, Math.min(2000, Math.floor(value)));
}

function normaliseBoard(board: OddsBoard): Cell[][] {
  return Array.from({ length: ROWS }, (_, row) =>
    Array.from({ length: COLS }, (_, col) => board[row]?.[col] ?? null),
  );
}

function cloneGrid(grid: Cell[][]): Cell[][] {
  return grid.map((row) => row.slice());
}

function heightsOf(grid: Cell[][]): number[] {
  return Array.from({ length: COLS }, (_, col) => {
    let height = 0;
    for (let row = ROWS - 1; row >= 0 && grid[row][col] !== null; row -= 1) {
      height += 1;
    }
    return height;
  });
}

function legalColumns(heights: number[]): number[] {
  const columns: number[] = [];
  for (let col = 0; col < COLS; col += 1) {
    if (heights[col] < ROWS) columns.push(col);
  }
  return columns;
}

/**
 * Prüft einen Stein an `row`/`col`. Das Feld selbst zählt bereits als gesetzt;
 * die Nachbarfelder kommen aus `grid`. Dadurch lässt sich auch ein *möglicher*
 * Wurf prüfen, ohne ihn vorher ins Brett zu schreiben.
 */
function winningAt(grid: Cell[][], row: number, col: number, side: Side): boolean {
  return DIRECTIONS.some(([dr, dc]) => {
    let count = 1;
    for (const sign of [1, -1]) {
      for (let step = 1; step < 4; step += 1) {
        const r = row + dr * step * sign;
        const c = col + dc * step * sign;
        if (r < 0 || r >= ROWS || c < 0 || c >= COLS) break;
        if (grid[r][c] !== side) break;
        count += 1;
      }
    }
    return count >= 4;
  });
}

function winningColumns(grid: Cell[][], heights: number[], side: Side): number[] {
  const columns: number[] = [];
  for (let col = 0; col < COLS; col += 1) {
    if (heights[col] >= ROWS) continue;
    const row = ROWS - 1 - heights[col];
    if (winningAt(grid, row, col, side)) columns.push(col);
  }
  return columns;
}

function findWinner(grid: Cell[][]): Side | null {
  for (let row = 0; row < ROWS; row += 1) {
    for (let col = 0; col < COLS; col += 1) {
      const side = grid[row][col];
      if (side !== null && winningAt(grid, row, col, side)) return side;
    }
  }
  return null;
}

function drop(grid: Cell[][], heights: number[], col: number, side: Side): number {
  const row = ROWS - 1 - heights[col];
  grid[row][col] = side;
  heights[col] += 1;
  return row;
}

function createRng(seed: number): () => number {
  let state = seed >>> 0;
  if (state === 0) state = 0x9e3779b9;
  return () => {
    state ^= state << 13;
    state >>>= 0;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    return state / 0x100000000;
  };
}

function weightedColumn(candidates: number[], rng: () => number): number {
  const total = candidates.reduce((sum, col) => sum + CENTER_WEIGHTS[col], 0);
  let target = rng() * total;
  for (const col of candidates) {
    target -= CENTER_WEIGHTS[col];
    if (target < 0) return col;
  }
  return candidates[candidates.length - 1];
}

/** Spielt eine Partie ab der Stellung mit der oben beschriebenen Regel zu Ende. */
function playOut(
  grid: Cell[][],
  heights: number[],
  current: Side,
  rng: () => number,
): Side | "draw" {
  let side = current;
  for (let turn = 0; turn < ROWS * COLS; turn += 1) {
    const legal = legalColumns(heights);
    if (legal.length === 0) return "draw";

    // Wer jetzt gewinnen kann, gewinnt in dieser Simulation sofort.
    if (winningColumns(grid, heights, side).length > 0) return side;

    const threats = winningColumns(grid, heights, other(side));
    // Eine der Drohungen blockieren. Gibt es mehrere, ist die Partie oft
    // verloren – genau das soll die Schätzung auch zeigen. Sonst wird eine
    // freie Spalte mit leichter Mittepräferenz gewählt.
    const candidates = threats.length > 0 ? threats : legal;

    const col = weightedColumn(candidates, rng);
    drop(grid, heights, col, side);
    side = other(side);
  }
  return "draw";
}

/** Schätzt die Siegchance, wenn die Person am Zug genau diese Spalte wählt. */
function estimateMove(
  grid: Cell[][],
  heights: number[],
  col: number,
  player: Side,
  seed: number,
  samples: number,
): number {
  const nextGrid = cloneGrid(grid);
  const nextHeights = heights.slice();
  drop(nextGrid, nextHeights, col, player);

  const rng = createRng(seed ^ Math.imul(col + 1, 0x9e3779b1));
  let wins = 0;
  for (let i = 0; i < samples; i += 1) {
    const outcome = playOut(cloneGrid(nextGrid), nextHeights.slice(), other(player), rng);
    if (outcome === player) wins += 1;
  }
  return wins / samples;
}

function mostCentral(columns: number[]): number {
  return columns.reduce(
    (best, col) => (Math.abs(col - 3) < Math.abs(best - 3) ? col : best),
    columns[0],
  );
}

function percentages(
  redWins: number,
  yellowWins: number,
  total: number,
): Pick<WinningOdds, "red" | "draw" | "yellow"> {
  let red = Math.round((redWins / total) * 100);
  let yellow = Math.round((yellowWins / total) * 100);
  let draw = 100 - red - yellow;

  // Durch das Runden können Rot und Gelb zusammen 101 % ergeben. Dann wird
  // der größere Anteil um das eine Prozent korrigiert, damit die Summe stimmt.
  if (draw < 0) {
    if (red >= yellow) red += draw;
    else yellow += draw;
    draw = 0;
  }

  return { red: Math.max(0, red), draw, yellow: Math.max(0, yellow) };
}

function terminalOdds(winner: Side | "draw", samples: number): WinningOdds {
  return {
    red: winner === "red" ? 100 : 0,
    yellow: winner === "yellow" ? 100 : 0,
    draw: winner === "draw" ? 100 : 0,
    bestColumn: null,
    bestChance: 0,
    finished: true,
    samples,
  };
}

function boardSeed(grid: Cell[][], currentPlayer: Side): number {
  let hash = 2166136261;
  hash = Math.imul(hash ^ (currentPlayer === "red" ? 0x9e3779b9 : 0x85ebca6b), 16777619);
  for (let row = 0; row < ROWS; row += 1) {
    for (let col = 0; col < COLS; col += 1) {
      const value = grid[row][col] === "red" ? 1 : grid[row][col] === "yellow" ? 2 : 0;
      hash ^= value + row * COLS + col;
      hash = Math.imul(hash, 16777619);
    }
  }
  return hash >>> 0;
}

function boardKey(
  grid: Cell[][],
  currentPlayer: Side,
  samples: number,
  moveSamples: number,
): string {
  let key = `${currentPlayer}|${samples}|${moveSamples}|`;
  for (const row of grid) {
    for (const cell of row) {
      key += cell === null ? "." : cell === "red" ? "r" : "y";
    }
  }
  return key;
}

function trimCache(): void {
  while (cache.size > MAX_CACHE_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
}

/**
 * Schätzt die Gewinnchancen ab der übergebenen Stellung.
 *
 * `currentPlayer` ist die Seite, die als Nächstes zieht. Die Rückgabe enthält
 * ganzzahlige Prozente, die zusammen 100 ergeben, sowie die Spalte mit der
 * höchsten geschätzten Siegchance für die Person am Zug.
 */
export function estimateWinningOdds(
  board: OddsBoard,
  currentPlayer: Side,
  options: OddsOptions = {},
): WinningOdds {
  const samples = clampSamples(options.samples ?? DEFAULT_SAMPLES);
  const moveSamples = clampSamples(options.moveSamples ?? Math.min(DEFAULT_MOVE_SAMPLES, samples));
  const grid = normaliseBoard(board);
  const key = boardKey(grid, currentPlayer, samples, moveSamples);

  const cached = cache.get(key);
  if (cached !== undefined) return cached;

  const heights = heightsOf(grid);
  const existingWinner = findWinner(grid);
  if (existingWinner !== null) {
    const result = terminalOdds(existingWinner, samples);
    cache.set(key, result);
    trimCache();
    return result;
  }
  if (heights.every((height) => height >= ROWS)) {
    const result = terminalOdds("draw", samples);
    cache.set(key, result);
    trimCache();
    return result;
  }

  const seed = boardSeed(grid, currentPlayer);
  const rng = createRng(seed);
  let redWins = 0;
  let yellowWins = 0;

  for (let i = 0; i < samples; i += 1) {
    const outcome = playOut(cloneGrid(grid), heights.slice(), currentPlayer, rng);
    if (outcome === "red") redWins += 1;
    else if (outcome === "yellow") yellowWins += 1;
  }

  const legal = legalColumns(heights);
  let bestColumn: number | null = null;
  let bestChance = 0;

  if (legal.length > 0) {
    const immediate = winningColumns(grid, heights, currentPlayer);
    if (immediate.length > 0) {
      bestColumn = mostCentral(immediate);
      bestChance = 1;
    } else {
      for (const col of legal) {
        const chance = estimateMove(grid, heights, col, currentPlayer, seed, moveSamples);
        const moreCentral = bestColumn !== null && Math.abs(col - 3) < Math.abs(bestColumn - 3);
        if (
          bestColumn === null ||
          chance > bestChance + 1e-9 ||
          (Math.abs(chance - bestChance) < 1e-9 && moreCentral)
        ) {
          bestColumn = col;
          bestChance = chance;
        }
      }
    }
  }

  const result: WinningOdds = {
    ...percentages(redWins, yellowWins, samples),
    bestColumn,
    bestChance: Math.round(bestChance * 100),
    finished: false,
    samples,
  };
  cache.set(key, result);
  trimCache();
  return result;
}

export interface OddsLabels {
  red?: string;
  yellow?: string;
}

/** Kurze Einordnung der Stellung für die Anzeige. */
export function oddsHeadline(odds: WinningOdds, labels: OddsLabels = {}): string {
  const redLabel = labels.red ?? "Rot";
  const yellowLabel = labels.yellow ?? "Gelb";

  if (odds.finished) {
    if (odds.draw === 100) return "Partie beendet: Unentschieden";
    return `Partie beendet: ${odds.red === 100 ? redLabel : yellowLabel} gewinnt`;
  }

  const margin = Math.abs(odds.red - odds.yellow);
  if (margin < 8) return "Ausgeglichene Stellung";

  const leader = odds.red > odds.yellow ? redLabel : yellowLabel;
  if (margin < 20) return `${leader} leicht im Vorteil`;
  if (margin < 40) return `${leader} deutlich im Vorteil`;
  return `${leader} klar im Vorteil`;
}
