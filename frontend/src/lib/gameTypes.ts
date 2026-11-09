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
    tagline: "Drei in einer Reihe · 3×3 · zwei Personen",
    description:
      "Zwei Personen setzen abwechselnd ihr Zeichen auf ein 3×3-Feld. Drei in einer Reihe gehören einem.",
    maxPlayers: 2,
    implemented: true,
    board: { rows: 3, cols: 3 },
    accent: "teal",
    sortOrder: 2,
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

export function findGameType(name: string): GameType | undefined {
  return GAME_TYPES_BY_NAME.get(name);
}

export const PLAYABLE_GAMES = GAME_TYPES.filter((game) => game.implemented).sort(bySortOrder);

export function bySortOrder(a: GameType, b: GameType): number {
  return a.sortOrder - b.sortOrder;
}