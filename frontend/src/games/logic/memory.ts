import type { Side } from "../../types";

export const MEMORY_COLS = 4;
export const MEMORY_ROWS = 4;
export const MEMORY_CARDS = MEMORY_COLS * MEMORY_ROWS;
export const MEMORY_SYMBOLS = ["A", "B", "C", "D", "E", "F", "G", "H"] as const;

export interface MemoryState {
  deck: string[];
  /** Indizes bereits gefundener Paare. */
  matched: number[];
  /** Aktuell aufgedeckte Karten (0, 1 oder 2). */
  flipped: number[];
  scores: Record<Side, number>;
  turn: Side;
}

export interface MemoryFlipResult {
  state: MemoryState;
  /** true, wenn der zweite Flip ein Paar vervollständigt hat. */
  matchedNow: boolean;
  /** true, wenn dies der zweite Flip des Zuges war. */
  secondCard: boolean;
  /** Gesetzt, sobald alle Paare gefunden sind. */
  finished: Side | "draw" | null;
}

/** Gemischtes 4x4-Deck aus acht Paaren. */
export function createMemoryDeck(rng: () => number = Math.random): string[] {
  const deck = MEMORY_SYMBOLS.flatMap((symbol) => [symbol, symbol]);
  for (let i = deck.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

export function initialMemoryState(deck: string[] = createMemoryDeck()): MemoryState {
  return {
    deck,
    matched: [],
    flipped: [],
    scores: { red: 0, yellow: 0 },
    turn: "red",
  };
}

export function memoryWinner(scores: Record<Side, number>): Side | "draw" {
  if (scores.red === scores.yellow) return "draw";
  return scores.red > scores.yellow ? "red" : "yellow";
}

/**
 * Deckt eine Karte auf. Beim zweiten Flip wird verglichen; bei einem Paar
 * bleibt die Person am Zug, sonst wechselt sie. Bei zwei verschiedenen Karten
 * bleiben beide bis zum Aufruf von `hideMemoryCards` sichtbar.
 */
export function flipMemoryCard(state: MemoryState, index: number): MemoryFlipResult | null {
  if (index < 0 || index >= state.deck.length) return null;
  if (state.matched.includes(index) || state.flipped.includes(index)) return null;
  if (state.flipped.length >= 2) return null;

  const flipped = [...state.flipped, index];
  const secondCard = flipped.length === 2;

  if (!secondCard) {
    return {
      state: { ...state, flipped },
      matchedNow: false,
      secondCard: false,
      finished: null,
    };
  }

  const [first, second] = flipped;
  const matchedNow = state.deck[first] === state.deck[second];

  if (!matchedNow) {
    return {
      state: { ...state, flipped, turn: state.turn === "red" ? "yellow" : "red" },
      matchedNow: false,
      secondCard: true,
      finished: null,
    };
  }

  const matched = [...state.matched, first, second];
  const scores = { ...state.scores, [state.turn]: state.scores[state.turn] + 1 };
  const finished = matched.length === state.deck.length ? memoryWinner(scores) : null;

  return {
    state: { ...state, flipped: [], matched, scores },
    matchedNow: true,
    secondCard: true,
    finished,
  };
}

/** Blendet zwei nicht passende Karten wieder aus. */
export function hideMemoryCards(state: MemoryState): MemoryState {
  if (state.flipped.length !== 2) return state;
  return { ...state, flipped: [] };
}
