/**
 * Tests für die reine Logik – ohne Browser, ohne Test-Framework.
 * Ausführen: `npm test`  (Node 24 kann TypeScript direkt ausführen)
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { COLS, ROWS, buildGrid, summariseMoves, validateConnectFourResult } from "../src/lib/connectFour.ts";
import { GAME_TYPES, bySortOrder, findGameType } from "../src/lib/gameTypes.ts";
import { parseRoute, setupPath, windowPath } from "../src/router.ts";
import {
  isPlayable,
  isRunning,
  opponent,
  pausedMs,
  playedMs,
  sessionStatus,
  statusLabel,
  winnerToOutcome,
  type ConnectFourMove,
  type GameSession,
} from "../src/types.ts";

/** Rot gewinnt waagerecht in der untersten Reihe. */
const redWins: ConnectFourMove[] = [
  { turn: 1, player: "red", location: { x: 0, y: 5 } },
  { turn: 2, player: "yellow", location: { x: 0, y: 4 } },
  { turn: 3, player: "red", location: { x: 1, y: 5 } },
  { turn: 4, player: "yellow", location: { x: 1, y: 4 } },
  { turn: 5, player: "red", location: { x: 2, y: 5 } },
  { turn: 6, player: "yellow", location: { x: 2, y: 4 } },
  { turn: 7, player: "red", location: { x: 3, y: 5 } },
];

/** Gefülltes Brett: 21 Züge je Seite, abwechselnd die Spalten 0..6. */
const fullBoard: ConnectFourMove[] = Array.from({ length: ROWS * COLS }, (_, i) => ({
  turn: i + 1,
  player: i % 2 === 0 ? ("red" as const) : ("yellow" as const),
  location: { x: i % COLS, y: ROWS - 1 - Math.floor(i / COLS) },
}));

function rejects(result: Parameters<typeof validateConnectFourResult>[0]): void {
  assert.throws(() => validateConnectFourResult(result));
}

describe("Router", () => {
  it("erkennt Katalog, Einstellungen und Sitzungen", () => {
    assert.deepEqual(parseRoute("/"), { name: "catalog" });
    assert.deepEqual(parseRoute(""), { name: "catalog" });
    assert.deepEqual(parseRoute("/sessions"), { name: "sessions" });
    assert.deepEqual(parseRoute("/sessions/"), { name: "sessions" });
    assert.deepEqual(parseRoute("/play"), { name: "play" });
  });

  it("erkennt die Einstellungsseite eines Spiels", () => {
    assert.deepEqual(parseRoute("/games/connect-four"), { name: "setup", gameName: "connect-four" });
    assert.deepEqual(parseRoute("/games/tictactoe"), { name: "setup", gameName: "tictactoe" });
    assert.deepEqual(parseRoute("/games/mensch-aergere-dich-nicht"), {
      name: "setup",
      gameName: "mensch-aergere-dich-nicht",
    });
  });

  it("erkennt das Spielfeld-Fenster", () => {
    assert.deepEqual(parseRoute("/connectfour/s-a1b2c3"), { name: "game", sessionId: "s-a1b2c3" });
    assert.deepEqual(parseRoute("/connectfour/g-demo2x4"), { name: "game", sessionId: "g-demo2x4" });
  });

  it("meldet unbekannte Pfade und fremde Fenster", () => {
    assert.deepEqual(parseRoute("/quatsch"), { name: "notFound", path: "/quatsch" });
    assert.deepEqual(parseRoute("/games/"), { name: "notFound", path: "/games" });
    assert.deepEqual(parseRoute("/games/a/b"), { name: "notFound", path: "/games/a/b" });
    assert.deepEqual(parseRoute("/connectfour/"), { name: "notFound", path: "/connectfour" });
    assert.deepEqual(parseRoute("/connectfour/a/b"), { name: "notFound", path: "/connectfour/a/b" });
    // Nur Connect Four hat eine Fenster-Route.
    assert.deepEqual(parseRoute("/tictactoe/s-abc"), { name: "notFound", path: "/tictactoe/s-abc" });
  });

  it("baut Pfade für Einstellungen und Fenster", () => {
    assert.equal(setupPath("connect-four"), "/games/connect-four");
    assert.equal(windowPath("connect-four", "s-a1b2c3"), "/connectfour/s-a1b2c3");
    assert.equal(windowPath("tictactoe", "s-a1b2c3"), null);
  });
});

describe("Spielekatalog", () => {
  it("enthält Connect Four als spielbares Spiel", () => {
    const connectFour = findGameType("connect-four");
    assert.ok(connectFour);
    assert.equal(connectFour.implemented, true);
    assert.equal(connectFour.maxPlayers, 2);
    assert.deepEqual(connectFour.board, { rows: 6, cols: 7 });
    assert.ok(connectFour.rules.length > 0);
  });

  it("markiert alle übrigen Spiele als in Arbeit", () => {
    const others = GAME_TYPES.filter((game) => game.name !== "connect-four");
    assert.ok(others.length > 0, "der Katalog braucht weitere Spiele als Visualisierung");
    for (const game of others) {
      assert.equal(game.implemented, false, `${game.name} sollte noch nicht spielbar sein`);
    }
  });

  it("gibt jedes Spiel nur einmal und mit allen Feldern aus", () => {
    const names = new Set<string>();
    for (const game of GAME_TYPES) {
      assert.ok(!names.has(game.name), `doppelter Name: ${game.name}`);
      names.add(game.name);
      assert.ok(game.displayName.length > 0, `${game.name} braucht einen Namen`);
      assert.ok(game.tagline.length > 0, `${game.name} braucht einen Untertitel`);
      assert.ok(game.description.length > 0, `${game.name} braucht eine Beschreibung`);
      assert.ok(game.maxPlayers >= 2, `${game.name} braucht mindestens zwei Spieler:innen`);
      assert.ok(game.sortOrder > 0, `${game.name} braucht eine Reihenfolge`);
    }
  });

  it("sortiert den Katalog nach sortOrder", () => {
    const sorted = GAME_TYPES.slice().sort(bySortOrder);
    for (let i = 1; i < sorted.length; i += 1) {
      assert.ok(sorted[i - 1].sortOrder < sorted[i].sortOrder, "sortOrder muss aufsteigend sein");
    }
  });
});

describe("Sitzungsstatus", () => {
  const base = {
    id: "s-test",
    gameType: "connect-four",
    hostId: 1,
    players: { red: 2, yellow: 3 },
    createdAt: new Date(1_000_000).toISOString(),
    finishedAt: null,
    outcome: null,
    abortReason: null,
    surrenderedBy: null,
    gameId: null,
    pausedAt: null,
    pausedMs: 0,
  } as const;

  const at = (iso: string): GameSession => ({ ...base, createdAt: new Date(iso).toISOString() });
  const T0 = new Date("2026-01-01T10:00:00.000Z").getTime();

  it("erkennt die vier Zustände", () => {
    assert.equal(sessionStatus(base as unknown as GameSession), "running");
    assert.equal(sessionStatus({ ...base, pausedAt: base.createdAt } as unknown as GameSession), "paused");
    assert.equal(sessionStatus({ ...base, outcome: "red_win" } as unknown as GameSession), "finished");
    assert.equal(sessionStatus({ ...base, outcome: "aborted" } as unknown as GameSession), "aborted");
  });

  it("behandelt eine beendete Sitzung nie als pausiert", () => {
    // Der Ausgang hat Vorrang – sonst bliebe eine beendete Partie pausiert.
    const session = { ...base, outcome: "red_win", pausedAt: base.createdAt } as unknown as GameSession;
    assert.equal(sessionStatus(session), "finished");
    assert.equal(isRunning(session), false);
    assert.equal(isPlayable(session), false);
  });

  it("gibt das Brett nur bei laufender Sitzung frei", () => {
    assert.equal(isPlayable(base as unknown as GameSession), true);
    assert.equal(isPlayable({ ...base, pausedAt: base.createdAt } as unknown as GameSession), false);
    assert.equal(isPlayable({ ...base, outcome: "draw" } as unknown as GameSession), false);
  });

  it("rechnet abgeschlossene Pausen aus der Spielzeit heraus", () => {
    // 100 s vergangen, davon 20 s pausiert und längst beendet.
    const session = { ...at(new Date(T0).toISOString()), pausedMs: 20_000 } as GameSession;
    assert.equal(playedMs(session, T0 + 100_000), 80_000);
    assert.equal(pausedMs(session, T0 + 100_000), 20_000);
  });

  it("zieht eine noch offene Pause bis jetzt ab", () => {
    // Seit 100 s offen, die letzten 30 s sind Pause.
    const session = {
      ...at(new Date(T0).toISOString()),
      pausedAt: new Date(T0 + 70_000).toISOString(),
    } as GameSession;
    assert.equal(playedMs(session, T0 + 100_000), 70_000);
    assert.equal(pausedMs(session, T0 + 100_000), 30_000);
  });

  it("zählt abgeschlossene und offene Pausen zusammen", () => {
    // 20 s vorher pausiert, jetzt seit 30 s pausiert, 100 s vergangen.
    const session = {
      ...at(new Date(T0).toISOString()),
      pausedMs: 20_000,
      pausedAt: new Date(T0 + 70_000).toISOString(),
    } as GameSession;
    assert.equal(pausedMs(session, T0 + 100_000), 50_000);
    assert.equal(playedMs(session, T0 + 100_000), 50_000);
  });

  it("friert die Dauer bei einer beendeten Sitzung ein", () => {
    // 100 s vergangen, 20 s davon vor dem Ende pausiert. Die Anzeige darf danach
    // nicht weiterlaufen, auch wenn die Seite lange offen bleibt.
    const session = {
      ...at(new Date(T0).toISOString()),
      pausedMs: 20_000,
      outcome: "red_win" as const,
      finishedAt: new Date(T0 + 100_000).toISOString(),
    } as GameSession;
    assert.equal(playedMs(session, T0 + 100_000), 80_000);
    assert.equal(playedMs(session, T0 + 999_999), 80_000);
    assert.equal(pausedMs(session, T0 + 999_999), 20_000);
  });

  it("liefert nie eine negative Dauer", () => {
    // Pausenzeit kann nie größer sein als die verstrichene Zeit.
    const session = { ...at(new Date(T0).toISOString()), pausedMs: 999_999 } as GameSession;
    assert.equal(playedMs(session, T0), 0);
  });
});

describe("Ableitungen", () => {
  it("vertauscht die Seiten", () => {
    assert.equal(opponent("red"), "yellow");
    assert.equal(opponent("yellow"), "red");
  });

  it("bildet Sieger auf Ergebnisse ab", () => {
    assert.equal(winnerToOutcome("red"), "red_win");
    assert.equal(winnerToOutcome("yellow"), "yellow_win");
    assert.equal(winnerToOutcome("draw"), "draw");
  });

  it("beschriftet alle Zustände", () => {
    assert.equal(statusLabel("running"), "Laufend");
    assert.equal(statusLabel("paused"), "Pausiert");
    assert.equal(statusLabel("finished"), "Beendet");
    assert.equal(statusLabel("aborted"), "Abgebrochen");
  });
});

describe("Connect-Four-Verlauf", () => {
  it("akzeptiert einen gewonnenen Lauf", () => {
    validateConnectFourResult({ moves: redWins, winner: "red" });
    validateConnectFourResult({ moves: fullBoard, winner: "draw" });
  });

  it("spielt Züge korrekt aufs Brett", () => {
    const grid = buildGrid(redWins);
    assert.equal(grid.length, ROWS);
    assert.equal(grid[0].length, COLS);
    assert.equal(grid[5][3], "red");
    assert.equal(grid[4][3], null);
    assert.equal(grid[4][2], "yellow");
  });

  it("zählt die Züge je Seite", () => {
    assert.deepEqual(summariseMoves(redWins), { red: 4, yellow: 3, lastTurn: 7 });
  });

  it("weist ungültige Verläufe ab", () => {
    rejects({ moves: [], winner: "draw" });
    rejects({ moves: [{ turn: 2, player: "red", location: { x: 0, y: 5 } }], winner: "red" });
    rejects({ moves: [{ turn: 1, player: "gruen", location: { x: 0, y: 5 } } as never], winner: "red" });
    rejects({ moves: [{ turn: 1, player: "yellow", location: { x: 0, y: 5 } }], winner: "red" });
    rejects({ moves: [{ turn: 1, player: "red", location: { x: COLS, y: 5 } }], winner: "red" });
    rejects({ moves: [{ turn: 1, player: "red", location: { x: 0, y: 3 } }], winner: "red" });
    rejects({ moves: [{ turn: 1, player: "red", location: { x: 0, y: 5 } }], winner: "yellow" });
    rejects({ moves: redWins, winner: "draw" });
    rejects({ moves: fullBoard, winner: "red" });
  });
});
