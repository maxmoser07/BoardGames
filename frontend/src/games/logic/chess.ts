import type { Side } from "../../types";

/**
 * Schach ohne Browser: Brett, Zugerzeugung, Rochade, En passant, Matt und Patt.
 *
 * Reihen zählen von oben (0) nach unten (7), Spalten von links (0) nach rechts
 * (7). Rot sitzt unten und beginnt. Die Figuren werden als Buchstaben
 * dargestellt; die Farbe steckt in `color`.
 */

export type ChessPieceType = "p" | "n" | "b" | "r" | "q" | "k";
export type ChessBoard = (ChessPiece | null)[];

export interface ChessPiece {
  type: ChessPieceType;
  color: Side;
}

export interface ChessCastling {
  red: { k: boolean; q: boolean };
  yellow: { k: boolean; q: boolean };
}

export interface ChessState {
  board: ChessBoard;
  turn: Side;
  castling: ChessCastling;
  /** Zielfeld für En passant, `null` wenn nicht möglich. */
  enPassant: number | null;
  halfmove: number;
  fullmove: number;
  lastMove: { from: number; to: number } | null;
}

export interface ChessMoveInfo {
  from: number;
  to: number;
  piece: ChessPiece;
  captured: ChessPiece | null;
  promotion: ChessPieceType | null;
  castle: "k" | "q" | null;
  enPassant: boolean;
}

export interface ChessStatus {
  inCheck: boolean;
  checkmate: boolean;
  stalemate: boolean;
  winner: Side | "draw" | null;
}

const SIZE = 8;

export function otherSide(side: Side): Side {
  return side === "red" ? "yellow" : "red";
}

export function rowOf(square: number): number {
  return Math.floor(square / SIZE);
}

export function colOf(square: number): number {
  return square % SIZE;
}

export function squareAt(row: number, col: number): number {
  return row * SIZE + col;
}

function inside(row: number, col: number): boolean {
  return row >= 0 && row < SIZE && col >= 0 && col < SIZE;
}

function pieceAt(board: ChessBoard, row: number, col: number): ChessPiece | null {
  return inside(row, col) ? board[squareAt(row, col)] : null;
}

export function initialChessBoard(): ChessBoard {
  const board: ChessBoard = Array.from({ length: SIZE * SIZE }, () => null);
  const backRank: ChessPieceType[] = ["r", "n", "b", "q", "k", "b", "n", "r"];

  for (let col = 0; col < SIZE; col += 1) {
    board[squareAt(0, col)] = { type: backRank[col], color: "yellow" };
    board[squareAt(1, col)] = { type: "p", color: "yellow" };
    board[squareAt(6, col)] = { type: "p", color: "red" };
    board[squareAt(7, col)] = { type: backRank[col], color: "red" };
  }

  return board;
}

export function initialChessState(): ChessState {
  return {
    board: initialChessBoard(),
    turn: "red",
    castling: {
      red: { k: true, q: true },
      yellow: { k: true, q: true },
    },
    enPassant: null,
    halfmove: 0,
    fullmove: 1,
    lastMove: null,
  };
}

function kingSquare(board: ChessBoard, color: Side): number | null {
  for (let index = 0; index < board.length; index += 1) {
    const piece = board[index];
    if (piece && piece.type === "k" && piece.color === color) return index;
  }
  return null;
}

function isEnemy(piece: ChessPiece | null, color: Side): boolean {
  return piece !== null && piece.color !== color;
}

/**
 * Greift `byColor` das Feld `target` an? Geprüft werden Bauern, Springer,
 * König und die gleitenden Figuren; eigene Figuren blockieren die Sicht.
 */
export function isSquareAttacked(board: ChessBoard, target: number, byColor: Side): boolean {
  const row = rowOf(target);
  const col = colOf(target);

  // Bauern: Ein roter Bauer zieht nach oben und greift deshalb von unten an.
  const pawnRow = byColor === "red" ? row + 1 : row - 1;
  for (const dc of [-1, 1]) {
    const piece = pieceAt(board, pawnRow, col + dc);
    if (piece && piece.color === byColor && piece.type === "p") return true;
  }

  // Springer.
  const knightOffsets: [number, number][] = [
    [-2, -1],
    [-2, 1],
    [-1, -2],
    [-1, 2],
    [1, -2],
    [1, 2],
    [2, -1],
    [2, 1],
  ];
  for (const [dr, dc] of knightOffsets) {
    const piece = pieceAt(board, row + dr, col + dc);
    if (piece && piece.color === byColor && piece.type === "n") return true;
  }

  // König.
  for (let dr = -1; dr <= 1; dr += 1) {
    for (let dc = -1; dc <= 1; dc += 1) {
      if (dr === 0 && dc === 0) continue;
      const piece = pieceAt(board, row + dr, col + dc);
      if (piece && piece.color === byColor && piece.type === "k") return true;
    }
  }

  // Türme/Dame waagerecht und senkrecht.
  const orthogonal: [number, number][] = [
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1],
  ];
  for (const [dr, dc] of orthogonal) {
    let r = row + dr;
    let c = col + dc;
    while (inside(r, c)) {
      const piece = pieceAt(board, r, c);
      if (piece) {
        if (piece.color === byColor && (piece.type === "r" || piece.type === "q")) return true;
        break;
      }
      r += dr;
      c += dc;
    }
  }

  // Läufer/Dame diagonal.
  const diagonal: [number, number][] = [
    [-1, -1],
    [-1, 1],
    [1, -1],
    [1, 1],
  ];
  for (const [dr, dc] of diagonal) {
    let r = row + dr;
    let c = col + dc;
    while (inside(r, c)) {
      const piece = pieceAt(board, r, c);
      if (piece) {
        if (piece.color === byColor && (piece.type === "b" || piece.type === "q")) return true;
        break;
      }
      r += dr;
      c += dc;
    }
  }

  return false;
}

function inCheck(board: ChessBoard, color: Side): boolean {
  const king = kingSquare(board, color);
  return king !== null && isSquareAttacked(board, king, otherSide(color));
}

function cloneBoard(board: ChessBoard): ChessBoard {
  return board.map((piece) => (piece ? { ...piece } : null));
}

function addPawnMoves(state: ChessState, from: number, moves: number[]): void {
  const piece = state.board[from];
  if (!piece || piece.type !== "p") return;
  const direction = piece.color === "red" ? -1 : 1;
  const startRow = piece.color === "red" ? 6 : 1;
  const row = rowOf(from);
  const col = colOf(from);

  if (inside(row + direction, col) && pieceAt(state.board, row + direction, col) === null) {
    moves.push(squareAt(row + direction, col));
    if (row === startRow && pieceAt(state.board, row + direction * 2, col) === null) {
      moves.push(squareAt(row + direction * 2, col));
    }
  }

  for (const dc of [-1, 1]) {
    const targetRow = row + direction;
    const targetCol = col + dc;
    if (!inside(targetRow, targetCol)) continue;
    const target = squareAt(targetRow, targetCol);
    const occupant = state.board[target];
    if (isEnemy(occupant, piece.color)) {
      moves.push(target);
    } else if (state.enPassant === target) {
      moves.push(target);
    }
  }
}

function addKnightMoves(state: ChessState, from: number, moves: number[]): void {
  const piece = state.board[from];
  if (!piece) return;
  const row = rowOf(from);
  const col = colOf(from);
  const offsets: [number, number][] = [
    [-2, -1],
    [-2, 1],
    [-1, -2],
    [-1, 2],
    [1, -2],
    [1, 2],
    [2, -1],
    [2, 1],
  ];
  for (const [dr, dc] of offsets) {
    const target = pieceAt(state.board, row + dr, col + dc);
    if (inside(row + dr, col + dc) && (target === null || isEnemy(target, piece.color))) {
      moves.push(squareAt(row + dr, col + dc));
    }
  }
}

function addSlidingMoves(
  state: ChessState,
  from: number,
  directions: [number, number][],
  moves: number[],
): void {
  const piece = state.board[from];
  if (!piece) return;
  const row = rowOf(from);
  const col = colOf(from);
  for (const [dr, dc] of directions) {
    let r = row + dr;
    let c = col + dc;
    while (inside(r, c)) {
      const target = state.board[squareAt(r, c)];
      if (target === null) {
        moves.push(squareAt(r, c));
      } else {
        if (isEnemy(target, piece.color)) moves.push(squareAt(r, c));
        break;
      }
      r += dr;
      c += dc;
    }
  }
}

function addKingMoves(state: ChessState, from: number, moves: number[]): void {
  const piece = state.board[from];
  if (!piece) return;
  const row = rowOf(from);
  const col = colOf(from);
  const color = piece.color;
  const homeRow = color === "red" ? 7 : 0;

  for (let dr = -1; dr <= 1; dr += 1) {
    for (let dc = -1; dc <= 1; dc += 1) {
      if (dr === 0 && dc === 0) continue;
      const r = row + dr;
      const c = col + dc;
      if (!inside(r, c)) continue;
      const target = state.board[squareAt(r, c)];
      if (target === null || isEnemy(target, color)) moves.push(squareAt(r, c));
    }
  }

  // Rochade: König und Turm dürfen noch nicht gezogen sein, die Felder
  // dazwischen sind leer und der König zieht nicht durch ein Schachfeld.
  if (from !== squareAt(homeRow, 4) || inCheck(state.board, color)) return;

  const rights = state.castling[color];
  if (rights.k) {
    const rook = state.board[squareAt(homeRow, 7)];
    const empty = [5, 6].every((c) => state.board[squareAt(homeRow, c)] === null);
    const safe =
      !isSquareAttacked(state.board, squareAt(homeRow, 5), otherSide(color)) &&
      !isSquareAttacked(state.board, squareAt(homeRow, 6), otherSide(color));
    if (rook && rook.type === "r" && rook.color === color && empty && safe) {
      moves.push(squareAt(homeRow, 6));
    }
  }
  if (rights.q) {
    const rook = state.board[squareAt(homeRow, 0)];
    const empty = [1, 2, 3].every((c) => state.board[squareAt(homeRow, c)] === null);
    const safe =
      !isSquareAttacked(state.board, squareAt(homeRow, 3), otherSide(color)) &&
      !isSquareAttacked(state.board, squareAt(homeRow, 2), otherSide(color));
    if (rook && rook.type === "r" && rook.color === color && empty && safe) {
      moves.push(squareAt(homeRow, 2));
    }
  }
}

/** Alle regelhaften Züge, ohne die eigene Königssicherheit zu prüfen. */
export function pseudoMovesFrom(state: ChessState, from: number): number[] {
  const piece = state.board[from];
  if (!piece) return [];
  const moves: number[] = [];

  switch (piece.type) {
    case "p":
      addPawnMoves(state, from, moves);
      break;
    case "n":
      addKnightMoves(state, from, moves);
      break;
    case "b":
      addSlidingMoves(
        state,
        from,
        [
          [-1, -1],
          [-1, 1],
          [1, -1],
          [1, 1],
        ],
        moves,
      );
      break;
    case "r":
      addSlidingMoves(
        state,
        from,
        [
          [-1, 0],
          [1, 0],
          [0, -1],
          [0, 1],
        ],
        moves,
      );
      break;
    case "q":
      addSlidingMoves(
        state,
        from,
        [
          [-1, -1],
          [-1, 1],
          [1, -1],
          [1, 1],
          [-1, 0],
          [1, 0],
          [0, -1],
          [0, 1],
        ],
        moves,
      );
      break;
    case "k":
      addKingMoves(state, from, moves);
      break;
  }

  return moves;
}

/**
 * Führt einen Zug aus, ohne ihn auf Regelhaftigkeit zu prüfen. Die Prüfung
 * übernimmt `legalMovesFrom`; `makeMove` wird auch zum Nachspielen eines
 * gespeicherten Verlaufs benutzt.
 */
export function makeMove(
  state: ChessState,
  from: number,
  to: number,
  promotion: ChessPieceType = "q",
): { state: ChessState; move: ChessMoveInfo } | null {
  const piece = state.board[from];
  if (!piece) return null;
  const board = cloneBoard(state.board);
  const target = board[to];
  let captured = target;
  let castle: "k" | "q" | null = null;
  let enPassant = false;

  // En passant: der geschlagene Bauer steht nicht auf dem Zielfeld.
  if (piece.type === "p" && state.enPassant === to && target === null) {
    const capturedRow = rowOf(from);
    const capturedSquare = squareAt(capturedRow, colOf(to));
    captured = board[capturedSquare];
    board[capturedSquare] = null;
    enPassant = true;
  }

  board[to] = { ...piece };
  board[from] = null;

  // Bauernumwandlung.
  let promoted: ChessPieceType | null = null;
  if (piece.type === "p") {
    const lastRow = piece.color === "red" ? 0 : 7;
    if (rowOf(to) === lastRow) {
      promoted = promotion;
      board[to] = { type: promotion, color: piece.color };
    }
  }

  // Rochade: der Turm springt mit.
  if (piece.type === "k" && Math.abs(colOf(to) - colOf(from)) === 2) {
    castle = colOf(to) > colOf(from) ? "k" : "q";
    const homeRow = rowOf(from);
    if (castle === "k") {
      board[squareAt(homeRow, 5)] = board[squareAt(homeRow, 7)];
      board[squareAt(homeRow, 7)] = null;
    } else {
      board[squareAt(homeRow, 3)] = board[squareAt(homeRow, 0)];
      board[squareAt(homeRow, 0)] = null;
    }
  }

  const castling: ChessCastling = {
    red: { ...state.castling.red },
    yellow: { ...state.castling.yellow },
  };

  if (piece.type === "k") {
    castling[piece.color].k = false;
    castling[piece.color].q = false;
  }
  if (piece.type === "r") {
    const homeRow = piece.color === "red" ? 7 : 0;
    if (from === squareAt(homeRow, 0)) castling[piece.color].q = false;
    if (from === squareAt(homeRow, 7)) castling[piece.color].k = false;
  }
  // Ein geschlagener Turm auf seinem Eckfeld nimmt das Rochaderecht mit.
  if (captured && captured.type === "r") {
    const homeRow = captured.color === "red" ? 7 : 0;
    if (to === squareAt(homeRow, 0)) castling[captured.color].q = false;
    if (to === squareAt(homeRow, 7)) castling[captured.color].k = false;
  }

  let enPassantTarget: number | null = null;
  if (piece.type === "p" && Math.abs(rowOf(to) - rowOf(from)) === 2) {
    enPassantTarget = squareAt((rowOf(from) + rowOf(to)) / 2, colOf(from));
  }

  const next: ChessState = {
    board,
    turn: otherSide(state.turn),
    castling,
    enPassant: enPassantTarget,
    halfmove: piece.type === "p" || captured ? 0 : state.halfmove + 1,
    fullmove: state.turn === "yellow" ? state.fullmove + 1 : state.fullmove,
    lastMove: { from, to },
  };

  return {
    state: next,
    move: { from, to, piece, captured, promotion: promoted, castle, enPassant },
  };
}

/** Züge, nach denen der eigene König nicht im Schach steht. */
export function legalMovesFrom(state: ChessState, from: number): number[] {
  const piece = state.board[from];
  if (!piece || piece.color !== state.turn) return [];

  return pseudoMovesFrom(state, from).filter((to) => {
    const made = makeMove(state, from, to);
    if (!made) return false;
    const king = kingSquare(made.state.board, piece.color);
    return king !== null && !isSquareAttacked(made.state.board, king, otherSide(piece.color));
  });
}

export function allLegalMoves(state: ChessState): { from: number; to: number }[] {
  const moves: { from: number; to: number }[] = [];
  for (let from = 0; from < state.board.length; from += 1) {
    const piece = state.board[from];
    if (!piece || piece.color !== state.turn) continue;
    for (const to of legalMovesFrom(state, from)) moves.push({ from, to });
  }
  return moves;
}

export function chessStatus(state: ChessState): ChessStatus {
  const inCheckNow = inCheck(state.board, state.turn);
  const hasMoves = allLegalMoves(state).length > 0;
  if (hasMoves) {
    return { inCheck: inCheckNow, checkmate: false, stalemate: false, winner: null };
  }
  if (inCheckNow) {
    return {
      inCheck: true,
      checkmate: true,
      stalemate: false,
      winner: otherSide(state.turn),
    };
  }
  return { inCheck: false, checkmate: false, stalemate: true, winner: "draw" };
}

/** Spielt einen gespeicherten Verlauf nach – für die Miniaturansicht. */
export function replayChessMoves(
  moves: readonly { payload?: Record<string, unknown> }[],
): ChessState {
  let state = initialChessState();
  for (const move of moves) {
    const from = pairOf(move.payload?.from);
    const to = pairOf(move.payload?.to);
    if (from === null || to === null) break;
    const promotion = typeof move.payload?.promotion === "string" ? move.payload.promotion : "q";
    const made = makeMove(state, from, to, promotion as ChessPieceType);
    if (!made) break;
    state = made.state;
  }
  return state;
}

function pairOf(value: unknown): number | null {
  if (!Array.isArray(value) || value.length !== 2) return null;
  const row = Number(value[0]);
  const col = Number(value[1]);
  if (!Number.isInteger(row) || !Number.isInteger(col) || !inside(row, col)) return null;
  return squareAt(row, col);
}
