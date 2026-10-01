/**
 * Katalog der bekannten Spiele.
 *
 * `game_types` liefert in der Datenbank nur `id`, `name`, `display_name` und
 * `max_players` (siehe `backend/migrations/..._init_schema.sql`). Alles Weitere –
 * Kurztext, Regeln, Brettmaße, Akzentfarbe – ist Darstellung und steht daher
 * hier statt in der Datenbank. `implemented: false` bedeutet: der Eintrag
 * existiert, das Spiel ist im Frontend aber noch nicht spielbar.
 */

import type { GameType } from "../types";

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
    tagline: "Drei in einer Reihe · 3×3",
    description:
      "Zwei Personen setzen abwechselnd ihr Zeichen auf ein 3×3-Feld. Drei in einer Reihe gehören einem.",
    maxPlayers: 2,
    implemented: false,
    board: { rows: 3, cols: 3 },
    accent: "teal",
    sortOrder: 2,
    rules: [
      "Wer anfängt, ist abwechselnd",
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
      "Die Karten liegen verdeckt. Wer zweimal dieselbe Karte findet, behält sie.",
    maxPlayers: 4,
    implemented: false,
    board: { rows: 4, cols: 4 },
    accent: "violet",
    sortOrder: 3,
    rules: [
      "Zwei Personen decken pro Zug zwei Karten auf",
      "Ein Paar bleibt liegen und zählt einen Punkt",
      "Das Paar wird wieder verdeckt, danach ist die andere Person dran",
    ],
  },
  {
    id: 4,
    name: "schach",
    displayName: "Schach",
    tagline: "8×8 · zwei Personen",
    description:
      "Das vollständige Schachbrett mit allen Figurenregeln, Schach und Matt.",
    maxPlayers: 2,
    implemented: false,
    board: { rows: 8, cols: 8 },
    accent: "amber",
    sortOrder: 4,
    rules: [
      "Jede Figur hat eigene Zug- und Schlagregeln",
      "Die Partie endet bei Matt, Aufgabe oder Patt",
      "Zugfolge wird für den Verlauf protokolliert",
    ],
  },
  {
    id: 5,
    name: "mensch-aergere-dich-nicht",
    displayName: "Mensch ärgere dich nicht",
    tagline: "Lauftisch · 2–6 Personen · Bank",
    description:
      "Karten sammeln, Farben loswerden, Strafkarten vermeiden – das Klassiker-Spiel für die ganze Runde.",
    maxPlayers: 6,
    implemented: false,
    board: null,
    accent: "red",
    sortOrder: 5,
    rules: [
      "Aufgezogene Karten ablegen oder weitergeben",
      "Fünf gleiche Farben oder ein Aussetzen wird abgelegt",
      "Wer als Erste:r keine Karten mehr hat, gewinnt",
    ],
  },
  {
    id: 6,
    name: "halma",
    displayName: "Halma",
    tagline: "Sprungspiel · 6 Personen möglich",
    description:
      "Eigene Figuren sprungweise zum eigenen Zielfeld führen – ohne Sprünge über die eigenen Figuren.",
    maxPlayers: 6,
    implemented: false,
    board: { rows: 10, cols: 10 },
    accent: "rose",
    sortOrder: 6,
    rules: [
      "Figuren ziehen oder springen in gerader Linie",
      "Gegnerische Figuren werden gefangen und umgesiedelt",
      "Wer zuerst alle Figuren im Ziel hat, gewinnt",
    ],
  },
];

export const GAME_TYPES_BY_NAME = new Map(GAME_TYPES.map((game) => [game.name, game]));

export function findGameType(name: string): GameType | undefined {
  return GAME_TYPES_BY_NAME.get(name);
}

export const PLAYABLE_GAMES = GAME_TYPES.filter((game) => game.implemented).sort(bySortOrder);

export function bySortOrder(a: GameType, b: GameType): number {
  return a.sortOrder - b.sortOrder;
}