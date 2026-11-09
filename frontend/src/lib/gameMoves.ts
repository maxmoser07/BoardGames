import type { GameMove } from "../types";

/**
 * Kurze Beschreibung eines gespeicherten Zuges fuer die Verlaufsliste.
 * Die Details stecken spielabhaengig im `payload`; unbekannte Spiele bleiben
 * bei einem neutralen "Zug".
 */

function square(value: unknown, size: number): string | null {
  if (!Array.isArray(value) || value.length !== 2) return null;
  const row = Number(value[0]);
  const col = Number(value[1]);
  if (!Number.isInteger(row) || !Number.isInteger(col)) return null;
  if (row < 0 || row >= size || col < 0 || col >= size) return null;
  return `${String.fromCharCode(97 + col)}${size - row}`;
}

function tokenLabel(value: unknown): string {
  if (value === "bank") return "Bank";
  if (value === "home") return "Haus";
  if (typeof value === "number") return `Feld ${value + 1}`;
  return "?";
}

export function describeMove(gameType: string, move: GameMove): string {
  const payload = move.payload ?? {};

  switch (gameType) {
    case "connect-four": {
      if (!move.location) return "Zug";
      return `Spalte ${move.location.x + 1}, Reihe ${move.location.y + 1}`;
    }

    case "tictactoe": {
      const cell = Number(payload.cell);
      if (Number.isInteger(cell) && cell >= 0 && cell < 9) {
        return `Feld ${cell + 1}`;
      }
      return "Feld";
    }

    case "memory": {
      const card = Number(payload.card);
      const symbol = typeof payload.symbol === "string" ? payload.symbol : "?";
      if (Number.isInteger(card)) return `Karte ${card + 1}: ${symbol}`;
      return `Karte: ${symbol}`;
    }

    case "schach": {
      const from = square(payload.from, 8);
      const to = square(payload.to, 8);
      if (from === null || to === null) return "Zug";
      const extra =
        payload.castle === "k"
          ? " (Rochade kurz)"
          : payload.castle === "q"
            ? " (Rochade lang)"
            : payload.en_passant === true
              ? " (En passant)"
              : payload.promotion === "q"
                ? " (Dame)"
                : "";
      return `${from} - ${to}${extra}`;
    }

    case "mensch-aergere-dich-nicht": {
      const dice = Number(payload.dice);
      const token = Number(payload.token);
      const from = tokenLabel(payload.from);
      const to = tokenLabel(payload.to);
      if (Number.isInteger(dice) && Number.isInteger(token)) {
        return `Wurf ${dice}, Figur ${token + 1}: ${from} -> ${to}`;
      }
      return "Zug";
    }

    default:
      return "Zug";
  }
}
