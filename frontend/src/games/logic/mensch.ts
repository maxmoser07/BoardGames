import { opponent, type Side } from "../../types.ts";

/**
 * Mensch aergere dich nicht ohne Browser.
 *
 * Ein gemeinsamer Rundkurs mit 40 Feldern. Rot startet auf Feld 0, Gelb auf
 * Feld 20. Eine Figur merkt sich ihren Fortschritt ab dem eigenen Startfeld;
 * bei 40 ist sie im Haus. Damit ist der Weg genau eine Runde, und nur ein
 * exakter Wurf bringt sie hinein.
 */

export const MENSCH_TRACK = 40;
export const MENSCH_TOKENS = 4;

export const MENSCH_START: Record<Side, number> = { red: 0, yellow: 20 };

export type MenschTokenState = "bank" | "track" | "home";

export interface MenschToken {
  id: number;
  state: MenschTokenState;
  /** Schritte ab dem eigenen Startfeld, nur bei `state === "track"`. */
  progress: number;
}

export interface MenschState {
  tokens: Record<Side, MenschToken[]>;
  turn: Side;
  /** Augenzahl des letzten Wurfs, `null` wenn gerade nicht gewuerfelt wurde. */
  dice: number | null;
  /** true = es wurde gewuerfelt und eine Figur muss gewaehlt werden. */
  awaitingMove: boolean;
  winner: Side | null;
}

export interface MenschMoveInfo {
  token: number;
  dice: number;
  from: "bank" | "home" | number;
  to: "home" | number;
  /** Figuren der Gegenseite, die durch diesen Zug in die Bank zurueckgingen. */
  captured: number[];
}

function tokensOf(): MenschToken[] {
  return Array.from({ length: MENSCH_TOKENS }, (_, id) => ({
    id,
    state: "bank" as const,
    progress: 0,
  }));
}

export function initialMenschState(): MenschState {
  return {
    tokens: { red: tokensOf(), yellow: tokensOf() },
    turn: "red",
    dice: null,
    awaitingMove: false,
    winner: null,
  };
}

/** Wuerfel 1..6. `rng` ist fuer Tests austauschbar. */
export function rollMenschDie(rng: () => number = Math.random): number {
  return Math.floor(rng() * 6) + 1;
}

/** Absolute Position einer Figur auf dem Rundkurs. */
export function trackSquare(side: Side, progress: number): number {
  return (MENSCH_START[side] + progress) % MENSCH_TRACK;
}

/**
 * Position eines Rundkursfeldes im 11x11-Raster. Die 40 Randfelder laufen
 * im Uhrzeigersinn: oben 11, rechts 10, unten 10, links 9.
 */
export function menschRingPosition(index: number): { row: number; col: number } {
  if (index <= 10) return { row: 0, col: index };
  if (index <= 20) return { row: index - 10, col: 10 };
  if (index <= 30) return { row: 10, col: 10 - (index - 20) };
  return { row: 10 - (index - 30), col: 0 };
}

/** Figuren, die mit dieser Augenzahl ziehen duerfen. */
export function menschLegalTokens(state: MenschState, dice: number): number[] {
  if (state.winner !== null || dice < 1 || dice > 6) return [];

  return state.tokens[state.turn]
    .filter((token) => {
      if (token.state === "bank") return dice === 6;
      if (token.state === "track") return token.progress + dice <= MENSCH_TRACK;
      return false;
    })
    .map((token) => token.id);
}

/**
 * Wuerfeln. Gibt es keine ziehbare Figur, wandert der Zug sofort weiter.
 * Eine Sechs wird nicht automatisch wiederholt - sie erlaubt den zweiten Wurf
 * erst nach dem Ziehen (siehe `moveMensch`).
 */
export function rollMensch(state: MenschState, die: number): MenschState {
  if (state.winner !== null || state.awaitingMove) return state;
  if (die < 1 || die > 6) return state;

  if (menschLegalTokens(state, die).length === 0) {
    return { ...state, dice: null, awaitingMove: false, turn: opponent(state.turn) };
  }
  return { ...state, dice: die, awaitingMove: true };
}

/** Zieht eine Figur; `null`, wenn der Zug nicht erlaubt ist. */
export function moveMensch(
  state: MenschState,
  tokenId: number,
): { state: MenschState; move: MenschMoveInfo } | null {
  if (state.winner !== null || !state.awaitingMove || state.dice === null) return null;

  const side = state.turn;
  const dice = state.dice;
  if (!menschLegalTokens(state, dice).includes(tokenId)) return null;

  const tokens = state.tokens[side].map((token) => ({ ...token }));
  const token = tokens.find((candidate) => candidate.id === tokenId);
  if (!token) return null;

  const from: "bank" | "home" | number =
    token.state === "bank" ? "bank" : token.state === "home" ? "home" : token.progress;

  if (token.state === "bank") {
    token.state = "track";
    token.progress = 0;
  } else if (token.state === "track") {
    token.progress += dice;
    if (token.progress === MENSCH_TRACK) {
      token.state = "home";
      token.progress = 0;
    }
  }

  const captured: number[] = [];
  if (token.state === "track") {
    const square = trackSquare(side, token.progress);
    const enemy = opponent(side);
    for (const other of state.tokens[enemy]) {
      if (other.state === "track" && trackSquare(enemy, other.progress) === square) {
        captured.push(other.id);
      }
    }
  }

  const enemy = opponent(side);
  const enemyTokens = state.tokens[enemy].map((other) =>
    captured.includes(other.id)
      ? { ...other, state: "bank" as const, progress: 0 }
      : { ...other },
  );

  const nextTokens = { ...state.tokens, [side]: tokens, [enemy]: enemyTokens };
  const won = nextTokens[side].every((candidate) => candidate.state === "home");
  const nextTurn = won || dice === 6 ? side : enemy;

  return {
    state: {
      tokens: nextTokens,
      turn: nextTurn,
      dice: null,
      awaitingMove: false,
      winner: won ? side : null,
    },
    move: {
      token: tokenId,
      dice,
      from,
      to: token.state === "home" ? "home" : token.progress,
      captured,
    },
  };
}

/** Spielt einen gespeicherten Verlauf nach - fuer die Miniaturansicht. */
export function replayMenschMoves(
  moves: readonly { player: Side; payload?: Record<string, unknown> }[],
): MenschState {
  let state = initialMenschState();

  for (const recorded of moves) {
    const dice = Number(recorded.payload?.dice);
    const token = Number(recorded.payload?.token);
    if (!Number.isInteger(dice) || !Number.isInteger(token)) break;

    state = { ...state, turn: recorded.player, dice, awaitingMove: true };
    const result = moveMensch(state, token);
    if (!result) break;
    state = result.state;
  }

  return state;
}
