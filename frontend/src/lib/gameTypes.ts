/**
 * Katalog der bekannten Spiele und die Spiellogik aus der Datenbank.
 *
 * `game_types` liefert `id`, `name`, `display_name`, `max_players` und
 * `rules_json`. Die fest eingebauten Spiele haben dort `NULL`; ihre Regeln,
 * Brettmaße und Akzentfarbe stehen als Standard in `GAME_TYPES`. Sobald die
 * Administration im UI etwas ändert, überschreibt `rules_json` diese Werte.
 *
 * `rules_json` ist bewusst eine kleine Konfiguration statt ausführbarem Code:
 *
 *   {
 *     "engine": "grid" | "connect-four" | "memory" | "chess" | "mensch",
 *     "tagline": "…", "description": "…", "rules": ["…"],
 *     "accent": "blue",
 *     "board": { "rows": 3, "cols": 3 },
 *     "win_length": 3,
 *     "gravity": false
 *   }
 *
 * Neue Spiele wählen eine Engine-Vorlage und werden dadurch sofort spielbar.
 */

import { ACCENT_KEYS, type AccentKey, type GameEngine, type GameType } from "../types.ts";

export interface GameRulesJson {
  engine?: GameEngine;
  tagline?: string;
  description?: string;
  rules?: string[];
  accent?: AccentKey;
  board?: { rows: number; cols: number } | null;
  win_length?: number;
  gravity?: boolean;
}

export interface GameEngineInfo {
  label: string;
  description: string;
  board: { rows: number; cols: number } | null;
  winLength: number;
  gravity: boolean;
  /** true = Brettmaße und Gewinnbedingung sind fest eingebaut. */
  fixedBoard: boolean;
}

export const GAME_ENGINES: Record<GameEngine, GameEngineInfo> = {
  "connect-four": {
    label: "Vier Gewinnt (fallende Steine)",
    description: "Steine fallen in die unterste freie Zeile einer Spalte.",
    board: { rows: 6, cols: 7 },
    winLength: 4,
    gravity: true,
    fixedBoard: false,
  },
  grid: {
    label: "Raster (freie Platzierung)",
    description: "Alle Felder sind frei wählbar, z. B. Tic Tac Toe.",
    board: { rows: 3, cols: 3 },
    winLength: 3,
    gravity: false,
    fixedBoard: false,
  },
  memory: {
    label: "Memory",
    description: "Paare aufdecken; die Vorlage hat feste 4×4 Karten.",
    board: { rows: 4, cols: 4 },
    winLength: 0,
    gravity: false,
    fixedBoard: true,
  },
  chess: {
    label: "Schach",
    description: "Vollständige Schachregeln auf einem festen 8×8-Brett.",
    board: { rows: 8, cols: 8 },
    winLength: 0,
    gravity: false,
    fixedBoard: true,
  },
  mensch: {
    label: "Mensch ärgere dich nicht",
    description: "Würfelspiel mit vier Figuren je Seite und festen Regeln.",
    board: null,
    winLength: 0,
    gravity: false,
    fixedBoard: true,
  },
};

export const GAME_ENGINE_KEYS = Object.keys(GAME_ENGINES) as GameEngine[];

export function gameEngineInfo(engine: GameEngine): GameEngineInfo {
  return GAME_ENGINES[engine];
}

export const GAME_TYPES: GameType[] = [
  {
    id: 1,
    name: "connect-four",
    displayName: "Vier Gewinnt",
    tagline: "Klassiker für zwei · 6×7 · Pluszeichen",
    description:
      "Zwei Personen legen abwechselnd Steine in eine von sieben Spalten. Wer zuerst vier in einer Reihe hat, gewinnt.",
    maxPlayers: 2,
    implemented: true,
    board: { rows: 6, cols: 7 },
    accent: "blue",
    sortOrder: 1,
    engine: "connect-four",
    winLength: 4,
    gravity: true,
    rules: [
      "Rot beginnt, danach wird abwechselnd gespielt",
      "Ein Stein landet auf dem obersten freien Feld einer Spalte",
      "Vier Steine in einer Reihe – waagerecht, senkrecht oder diagonal – gewinnen",
      "Ein volles Brett ohne vierer Reihe ist ein Unentschieden",
    ],
  },
  {
    id: 2,
    name: "tictactoe",
    displayName: "Tic Tac Toe",
    tagline: "Drei in einer Reihe · 3×3 · zwei Personen",
    description:
      "Zwei Personen setzen abwechselnd ihr Zeichen auf ein 3×3-Feld. Drei in einer Reihe gehören einem.",
    maxPlayers: 2,
    implemented: true,
    board: { rows: 3, cols: 3 },
    accent: "teal",
    sortOrder: 2,
    engine: "grid",
    winLength: 3,
    gravity: false,
    rules: [
      "Rot setzt X und beginnt, Gelb setzt O",
      "Drei in einer Zeile, Spalte oder Diagonale gewinnt",
      "Keine freien Felder mehr bedeutet Unentschieden",
    ],
  },
  {
    id: 3,
    name: "memory",
    displayName: "Memory",
    tagline: "Merkspiel · 4×4 · Paarsuche",
    description:
      "Acht Paare liegen verdeckt auf einem 4×4-Feld. Wer zwei gleiche Karten aufdeckt, behält das Paar und ist noch einmal dran.",
    maxPlayers: 2,
    implemented: true,
    board: { rows: 4, cols: 4 },
    accent: "violet",
    sortOrder: 3,
    engine: "memory",
    winLength: 0,
    gravity: false,
    rules: [
      "Pro Zug werden zwei Karten aufgedeckt",
      "Ein Paar bleibt offen und zählt einen Punkt",
      "Bei zwei verschiedenen Karten ist die andere Person dran",
      "Wer am Ende die meisten Paare hat, gewinnt",
    ],
  },
  {
    id: 4,
    name: "schach",
    displayName: "Schach",
    tagline: "8×8 · zwei Personen · Matt und Patt",
    description:
      "Das vollständige Schachbrett mit Bauern, Türmen, Springern, Läufern, Dame und König – inklusive Rochade und En passant.",
    maxPlayers: 2,
    implemented: true,
    board: { rows: 8, cols: 8 },
    accent: "amber",
    sortOrder: 4,
    engine: "chess",
    winLength: 0,
    gravity: false,
    rules: [
      "Rot (unten) beginnt, danach wird abwechselnd gezogen",
      "Jede Figur hat eigene Zug- und Schlagregeln",
      "Ein König im Schach muss aus dem Schach herausziehen",
      "Schachmatt gewinnt, Patt ist ein Unentschieden",
      "Rochade und En passant sind umgesetzt, Bauern werden zur Dame",
    ],
  },
  {
    id: 5,
    name: "mensch-aergere-dich-nicht",
    displayName: "Mensch ärgere dich nicht",
    tagline: "Würfelspiel · zwei Personen · vier Figuren",
    description:
      "Mit einer Sechs aus der Bank, um den Kreis ziehen und die eigenen Figuren als Erste ins Haus bringen.",
    maxPlayers: 2,
    implemented: true,
    board: null,
    accent: "red",
    sortOrder: 5,
    engine: "mensch",
    winLength: 0,
    gravity: false,
    rules: [
      "Eine Sechs bringt eine Figur aus der Bank auf das Startfeld",
      "Figuren ziehen im Uhrzeigersinn um den Kreis",
      "Wer auf eine gegnerische Figur zieht, schickt sie zurück in die Bank",
      "Eine Sechs erlaubt einen weiteren Wurf",
      "Ins Haus kommt nur ein exakter Wurf; wer zuerst alle vier Figuren drin hat, gewinnt",
    ],
  },
];

export const GAME_TYPES_BY_NAME = new Map(GAME_TYPES.map((game) => [game.name, game]));

/** Zeile aus `game_types`, wie `GET /api/games` sie liefert. */
export interface GameTypeRow {
  id: number;
  name: string;
  display_name: string;
  max_players: number;
  rules_json?: GameRulesJson | null;
}

function isEngine(value: unknown): value is GameEngine {
  return typeof value === "string" && (GAME_ENGINE_KEYS as string[]).includes(value);
}

function isAccent(value: unknown): value is AccentKey {
  return typeof value === "string" && (ACCENT_KEYS as string[]).includes(value);
}

function isBoard(value: unknown): value is { rows: number; cols: number } {
  if (typeof value !== "object" || value === null) return false;
  const board = value as { rows?: unknown; cols?: unknown };
  return (
    Number.isInteger(board.rows) &&
    Number.isInteger(board.cols) &&
    (board.rows as number) >= 3 &&
    (board.rows as number) <= 20 &&
    (board.cols as number) >= 3 &&
    (board.cols as number) <= 20
  );
}

/** defensive Lesart: ältere oder von Hand gesetzte Regeln dürfen nichts brechen. */
function readRules(row: GameTypeRow): GameRulesJson {
  const raw = row.rules_json;
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw) as unknown;
      return typeof parsed === "object" && parsed !== null ? (parsed as GameRulesJson) : {};
    } catch {
      return {};
    }
  }
  return raw && typeof raw === "object" ? raw : {};
}

/**
 * Verbindet die technische Zeile aus der Datenbank mit der Darstellung aus
 * `GAME_TYPES`. Bekannte Spiele behalten ihre Standardwerte; `rules_json`
 * überschreibt sie. Unbekannte Einträge sind spielbar, sobald sie eine
 * Engine-Vorlage mitbringen.
 */
export function gameTypeFromRow(row: GameTypeRow): GameType {
  const known = GAME_TYPES_BY_NAME.get(row.name);
  const rules = readRules(row);

  const engine = isEngine(rules.engine) ? rules.engine : (known?.engine ?? null);
  const info = engine === null ? null : GAME_ENGINES[engine];
  const configuredBoard = rules.board === null ? null : isBoard(rules.board) ? rules.board : undefined;
  const board = configuredBoard !== undefined ? configuredBoard : (known?.board ?? info?.board ?? null);
  const winLength =
    typeof rules.win_length === "number" && Number.isInteger(rules.win_length)
      ? rules.win_length
      : (known?.winLength ?? info?.winLength ?? 0);
  const gravity = typeof rules.gravity === "boolean" ? rules.gravity : (known?.gravity ?? info?.gravity ?? false);

  const tagline =
    typeof rules.tagline === "string" && rules.tagline.trim() !== ""
      ? rules.tagline
      : (known?.tagline ?? (info ? `${info.label} · neu im Katalog` : "Neu im Katalog · noch ohne Brett"));
  const description =
    typeof rules.description === "string" && rules.description.trim() !== ""
      ? rules.description
      : (known?.description ??
        "Dieses Spiel wurde von der Administration hinzugefügt. Wähle im Spiel-Editor eine Logik-Vorlage, damit es spielbar wird.");
  const ruleList = Array.isArray(rules.rules)
    ? rules.rules.filter((rule): rule is string => typeof rule === "string" && rule.trim() !== "")
    : (known?.rules ?? []);
  const accent = isAccent(rules.accent) ? rules.accent : (known?.accent ?? "rose");

  return {
    id: row.id,
    name: row.name,
    displayName: row.display_name,
    tagline,
    description,
    maxPlayers: row.max_players,
    implemented: engine !== null,
    board,
    accent,
    rules: ruleList,
    // Hinter den bekannten Spielen einsortieren, in der Reihenfolge des Anlegens.
    sortOrder: known?.sortOrder ?? 1000 + row.id,
    engine,
    winLength,
    gravity,
  };
}

/** Katalog aus den Datenbankzeilen, in der Reihenfolge der Kacheln. */
export function mergeGameTypes(rows: GameTypeRow[]): GameType[] {
  return rows.map(gameTypeFromRow).sort(bySortOrder);
}

export function findGameType(name: string): GameType | undefined {
  return GAME_TYPES_BY_NAME.get(name);
}

export const PLAYABLE_GAMES = GAME_TYPES.filter((game) => game.implemented).sort(bySortOrder);

export function bySortOrder(a: GameType, b: GameType): number {
  return a.sortOrder - b.sortOrder;
}

/**
 * Die fest eingebaute Vier-Gewinnt-Komponente (mit Gewinnchancen und Kamera)
 * kennt nur das klassische 6×7-Brett. Sobald die Administration Brett oder
 * Gewinnbedingung ändert, übernimmt das generische Raster.
 */
export function usesClassicConnectFour(game: GameType): boolean {
  return (
    game.name === "connect-four" &&
    game.engine === "connect-four" &&
    game.board?.rows === 6 &&
    game.board.cols === 7 &&
    game.winLength === 4 &&
    game.gravity
  );
}
