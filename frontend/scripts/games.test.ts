/**
 * Tests fuer die reinen Spiellogiken der neuen Brettspiele.
 * Ausfuehren: `npm test` (Node 24 fuehrt TypeScript direkt aus).
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { describeMove } from "../src/lib/gameMoves.ts";
import {
  emptyGridBoard,
  gridWinner,
  placeGridMove,
  type GridBoard,
  type GridRules,
} from "../src/games/logic/grid.ts";
import { emptyTicTacToeBoard, ticTacToeMove, ticTacToeWinner } from "../src/games/logic/tictactoe.ts";
import {
  flipMemoryCard,
  initialMemoryState,
  memoryWinner,
} from "../src/games/logic/memory.ts";
import {
  initialChessState,
  legalMovesFrom,
  makeMove,
  rowOf,
  colOf,
} from "../src/games/logic/chess.ts";
import {
  initialMenschState,
  moveMensch,
  rollMensch,
  trackSquare,
} from "../src/games/logic/mensch.ts";

describe("Tic Tac Toe", () => {
  it("erkennt eine Reihe und ein volles Brett", () => {
    let board = emptyTicTacToeBoard();
    for (const [index, side] of [
      [0, "red"],
      [3, "yellow"],
      [1, "red"],
      [4, "yellow"],
      [2, "red"],
    ] as const) {
      const next = ticTacToeMove(board, index, side);
      assert.ok(next);
      board = next;
    }
    assert.equal(ticTacToeWinner(board), "red");
  });

  it("erkennt ein Unentschieden", () => {
    const board = ["red", "yellow", "red", "red", "yellow", "yellow", "yellow", "red", "red"] as const;
    assert.equal(ticTacToeWinner([...board]), "draw");
  });

  it("verhindert einen Zug auf ein belegtes Feld", () => {
    const board = emptyTicTacToeBoard();
    const next = ticTacToeMove(board, 0, "red");
    assert.ok(next);
    assert.equal(ticTacToeMove(next, 0, "yellow"), null);
  });
});

describe("Konfigurierbares Raster", () => {
  const rules: GridRules = { rows: 5, cols: 5, winLength: 4, gravity: false };

  it("erkennt vier in einer Reihe auf einem größeren Brett", () => {
    let board = emptyGridBoard(rules);
    let last = 0;
    for (const [row, col, side] of [
      [0, 0, "red"],
      [1, 0, "yellow"],
      [0, 1, "red"],
      [1, 1, "yellow"],
      [0, 2, "red"],
      [1, 2, "yellow"],
      [0, 3, "red"],
    ] as const) {
      const placed = placeGridMove(board, rules, side, col, row);
      assert.ok(placed);
      board = placed.board;
      last = placed.index;
    }
    assert.equal(gridWinner(board, rules, last), "red");
  });

  it("lässt Steine in der Vier-Gewinnt-Vorlage fallen", () => {
    const gravity: GridRules = { rows: 6, cols: 7, winLength: 4, gravity: true };
    const placed = placeGridMove(emptyGridBoard(gravity), gravity, "red", 3, 0);
    assert.ok(placed);
    assert.equal(placed.row, 5);
    assert.equal(placed.index, 5 * 7 + 3);
  });

  it("meldet ein volles Brett ohne Reihe als Unentschieden", () => {
    const small: GridRules = { rows: 3, cols: 3, winLength: 3, gravity: false };
    const cells: Array<[number, number]> = [
      [0, 0],
      [0, 1],
      [0, 2],
      [1, 1],
      [1, 0],
      [1, 2],
      [2, 1],
      [2, 0],
      [2, 2],
    ];
    let board: GridBoard = emptyGridBoard(small);
    let last = 0;
    cells.forEach(([row, col], index) => {
      const placed = placeGridMove(board, small, index % 2 === 0 ? "red" : "yellow", col, row);
      assert.ok(placed);
      board = placed.board;
      last = placed.index;
    });
    assert.equal(gridWinner(board, small, last), "draw");
  });
});

describe("Memory", () => {
  it("behaelt bei einem Paar den Zug und wechselt sonst", () => {
    const deck = ["A", "A", "B", "C", "B", "C", "D", "D", "E", "E", "F", "F", "G", "G", "H", "H"];
    let state = initialMemoryState(deck);

    let result = flipMemoryCard(state, 0);
    assert.ok(result);
    assert.equal(result.state.turn, "red");
    state = result.state;

    result = flipMemoryCard(state, 1);
    assert.ok(result);
    assert.equal(result.matchedNow, true);
    assert.equal(result.state.turn, "red");
    state = result.state;

    result = flipMemoryCard(state, 2);
    assert.ok(result);
    state = result.state;

    result = flipMemoryCard(state, 3);
    assert.ok(result);
    assert.equal(result.matchedNow, false);
    assert.equal(result.state.turn, "yellow");
  });

  it("beendet das Spiel nach allen Paaren", () => {
    const deck = ["A", "A", "B", "B", "C", "C", "D", "D", "E", "E", "F", "F", "G", "G", "H", "H"];
    let state = initialMemoryState(deck);
    let finished: "red" | "yellow" | "draw" | null = null;

    for (let pair = 0; pair < 8; pair += 1) {
      let result = flipMemoryCard(state, pair * 2);
      assert.ok(result);
      state = result.state;
      result = flipMemoryCard(state, pair * 2 + 1);
      assert.ok(result);
      state = result.state;
      finished = result.finished;
    }

    assert.equal(finished, "red");
    assert.equal(memoryWinner(state.scores), "red");
  });
});

describe("Schach", () => {
  it("erlaubt den Doppelschritt eines Bauern", () => {
    const state = initialChessState();
    const from = 6 * 8 + 4; // e2
    const moves = legalMovesFrom(state, from);
    assert.ok(moves.includes(4 * 8 + 4)); // e4
    assert.ok(moves.includes(5 * 8 + 4)); // e3
  });

  it("fuehrt einen Zug aus und wechselt die Seite", () => {
    const state = initialChessState();
    const from = 6 * 8 + 4;
    const to = 4 * 8 + 4;
    const made = makeMove(state, from, to);
    assert.ok(made);
    assert.equal(made.state.board[to]?.type, "p");
    assert.equal(made.state.board[to]?.color, "red");
    assert.equal(made.state.board[from], null);
    assert.equal(made.state.turn, "yellow");
    assert.equal(rowOf(to), 4);
    assert.equal(colOf(to), 4);
  });
});

describe("Mensch aergere dich nicht", () => {
  it("passt, wenn keine Figur ziehen kann", () => {
    let state = initialMenschState();
    state = rollMensch(state, 3);
    assert.equal(state.turn, "yellow");
    assert.equal(state.awaitingMove, false);
  });

  it("bringt mit einer Sechs eine Figur aus der Bank und gibt einen weiteren Zug", () => {
    let state = initialMenschState();
    state = rollMensch(state, 6);
    assert.equal(state.turn, "red");
    assert.equal(state.awaitingMove, true);

    const moved = moveMensch(state, 0);
    assert.ok(moved);
    assert.equal(moved.state.tokens.red[0].state, "track");
    assert.equal(moved.state.tokens.red[0].progress, 0);
    assert.equal(moved.state.turn, "red");
    assert.equal(moved.move.to, 0);
  });

  it("zieht nur mit exakter Augenzahl ins Haus", () => {
    const state = initialMenschState();
    state.tokens.red[0] = { id: 0, state: "track", progress: 39 };
    state.dice = 1;
    state.awaitingMove = true;

    const moved = moveMensch(state, 0);
    assert.ok(moved);
    assert.equal(moved.state.tokens.red[0].state, "home");
    assert.equal(moved.move.to, "home");
  });

  it("schickt eine gegnerische Figur in die Bank", () => {
    const state = initialMenschState();
    state.tokens.red[0] = { id: 0, state: "track", progress: 0 };
    state.tokens.yellow[0] = { id: 0, state: "track", progress: 21 };
    assert.equal(trackSquare("yellow", 21), 1);
    state.dice = 1;
    state.awaitingMove = true;

    const moved = moveMensch(state, 0);
    assert.ok(moved);
    assert.deepEqual(moved.move.captured, [0]);
    assert.equal(moved.state.tokens.yellow[0].state, "bank");
  });
});

describe("Zugbeschreibungen", () => {
  it("beschreibt Zuege aller Spiele", () => {
    assert.equal(
      describeMove("connect-four", { turn: 1, player: "red", location: { x: 2, y: 5 } }),
      "Spalte 3, Reihe 6",
    );
    assert.equal(describeMove("tictactoe", { turn: 1, player: "red", payload: { cell: 4 } }), "Feld 5");
    assert.equal(
      describeMove("memory", { turn: 1, player: "red", payload: { card: 2, symbol: "A" } }),
      "Karte 3: A",
    );
    assert.equal(
      describeMove("schach", {
        turn: 1,
        player: "red",
        payload: { from: [6, 4], to: [4, 4] },
      }),
      "e2 - e4",
    );
    assert.equal(
      describeMove("mensch-aergere-dich-nicht", {
        turn: 1,
        player: "red",
        payload: { dice: 6, token: 0, from: "bank", to: 0 },
      }),
      "Wurf 6, Figur 1: Bank -> Feld 1",
    );
  });
});
