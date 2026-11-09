/**
 * Tests für die reine Logik – ohne Browser, ohne Test-Framework.
 * Ausführen: `npm test`  (Node 24 kann TypeScript direkt ausführen)
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { COLS, ROWS, buildGrid, summariseMoves, validateConnectFourResult } from "../src/lib/connectFour.ts";
import {
  DEFAULT_SAMPLES,
  estimateWinningOdds,
  oddsHeadline,
} from "../src/lib/connectFourOdds.ts";
import { GAME_TYPES, bySortOrder, findGameType } from "../src/lib/gameTypes.ts";
import {
  DEFAULT_RATING,
  formatRating,
  rankRatings,
  ratingTier,
  winRate,
} from "../src/lib/ratings.ts";
import {
  barWidth,
  countTotal,
  emptyStatusCounts,
  monthLabel,
  recentMonths,
  statusSegments,
} from "../src/lib/reportVisuals.ts";
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
  type PlayerRating,
  type Side,
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

/** Rot hat drei Steine in der untersten Reihe und kann in Spalte 3 gewinnen. */
const redThreat: ConnectFourMove[] = [
  { turn: 1, player: "red", location: { x: 0, y: 5 } },
  { turn: 2, player: "yellow", location: { x: 0, y: 4 } },
  { turn: 3, player: "red", location: { x: 1, y: 5 } },
  { turn: 4, player: "yellow", location: { x: 1, y: 4 } },
  { turn: 5, player: "red", location: { x: 2, y: 5 } },
  { turn: 6, player: "yellow", location: { x: 6, y: 5 } },
];

/** Volles Brett ohne Viererreihe – für den Unentschieden-Fall. */
const drawBoard: Side[][] = [
  ["red", "red", "yellow", "red", "red", "yellow", "yellow"],
  ["yellow", "red", "yellow", "yellow", "red", "red", "red"],
  ["red", "red", "red", "yellow", "red", "yellow", "red"],
  ["yellow", "yellow", "red", "yellow", "yellow", "red", "red"],
  ["red", "yellow", "yellow", "red", "yellow", "red", "yellow"],
  ["yellow", "yellow", "red", "yellow", "yellow", "red", "yellow"],
];

function rejects(result: Parameters<typeof validateConnectFourResult>[0]): void {
  assert.throws(() => validateConnectFourResult(result));
}

describe("Router", () => {
  it("erkennt Katalog, Einstellungen und Sitzungen", () => {
    assert.deepEqual(parseRoute("/"), { name: "catalog" });
    assert.deepEqual(parseRoute(""), { name: "catalog" });
    assert.deepEqual(parseRoute("/sessions"), { name: "sessions" });
    assert.deepEqual(parseRoute("/sessions/"), { name: "sessions" });
    assert.deepEqual(parseRoute("/reports"), { name: "reports" });
    assert.deepEqual(parseRoute("/ratings"), { name: "ratings" });
    assert.deepEqual(parseRoute("/play"), { name: "play" });
    assert.deepEqual(parseRoute("/camera"), { name: "camera" });
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

  it("akzeptiert einen Sieg mit dem letzten Stein auf dem vollen Brett", () => {
    validateConnectFourResult({ moves: fullBoard, winner: "red" });
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
  });
});

describe("Gewinnchancen", () => {
  it("verteilt 100 Prozent und liefert einen gültigen Zugtipp", () => {
    const odds = estimateWinningOdds(buildGrid(redThreat), "red");

    assert.equal(odds.red + odds.draw + odds.yellow, 100);
    assert.ok(odds.red >= 0 && odds.red <= 100);
    assert.ok(odds.draw >= 0 && odds.draw <= 100);
    assert.ok(odds.yellow >= 0 && odds.yellow <= 100);
    assert.ok(odds.bestColumn !== null);
    assert.ok(odds.bestColumn >= 0 && odds.bestColumn < COLS);
    assert.equal(odds.samples, DEFAULT_SAMPLES);
    assert.equal(odds.finished, false);
  });

  it("ist für dieselbe Stellung reproduzierbar", () => {
    const grid = buildGrid(redThreat);
    assert.deepEqual(estimateWinningOdds(grid, "yellow"), estimateWinningOdds(grid, "yellow"));
  });

  it("verändert das übergebene Brett nicht", () => {
    const grid = buildGrid(redThreat);
    const before = JSON.stringify(grid);
    estimateWinningOdds(grid, "red");
    assert.equal(JSON.stringify(grid), before);
  });

  it("erkennt einen sofortigen Sieg", () => {
    const odds = estimateWinningOdds(buildGrid(redThreat), "red");

    assert.equal(odds.red, 100);
    assert.equal(odds.draw, 0);
    assert.equal(odds.yellow, 0);
    assert.equal(odds.bestColumn, 3);
    assert.equal(odds.bestChance, 100);
    assert.equal(odds.finished, false);
  });

  it("empfiehlt die Blockade einer gegnerischen Drohung", () => {
    const odds = estimateWinningOdds(buildGrid(redThreat), "yellow");

    assert.equal(odds.bestColumn, 3);
    assert.ok(odds.yellow > 0);
  });

  it("meldet eine entschiedene Partie", () => {
    const won = estimateWinningOdds(buildGrid(redWins), "yellow");

    assert.deepEqual(
      {
        red: won.red,
        draw: won.draw,
        yellow: won.yellow,
        finished: won.finished,
        bestColumn: won.bestColumn,
      },
      { red: 100, draw: 0, yellow: 0, finished: true, bestColumn: null },
    );
    assert.match(oddsHeadline(won), /Rot gewinnt/);
  });

  it("erkennt ein volles Brett als Unentschieden", () => {
    const odds = estimateWinningOdds(drawBoard, "red");

    assert.equal(odds.red, 0);
    assert.equal(odds.yellow, 0);
    assert.equal(odds.draw, 100);
    assert.equal(odds.finished, true);
    assert.equal(odds.bestColumn, null);
  });

  it("beschreibt die Stellung in Worten", () => {
    assert.equal(oddsHeadline(estimateWinningOdds(buildGrid(redThreat), "red")), "Rot klar im Vorteil");
    assert.equal(
      oddsHeadline(estimateWinningOdds(buildGrid(redThreat), "red"), { red: "Grün" }),
      "Grün klar im Vorteil",
    );
  });
});

describe("Spieler-Ratings", () => {
  const row = (overrides: Partial<PlayerRating>): PlayerRating => ({
    userId: 1,
    username: "Alice",
    role: "player",
    rating: 1000,
    gamesPlayed: 0,
    wins: 0,
    losses: 0,
    draws: 0,
    updatedAt: new Date(0).toISOString(),
    ...overrides,
  });

  it("sortiert nach Rating, dann nach Partien und Name", () => {
    const sorted = rankRatings([
      row({ userId: 1, username: "Bob", rating: 1200, gamesPlayed: 4 }),
      row({ userId: 2, username: "Alice", rating: 1200, gamesPlayed: 8 }),
      row({ userId: 3, username: "Cara", rating: 1400, gamesPlayed: 1 }),
    ]);
    assert.deepEqual(sorted.map((entry) => entry.username), ["Cara", "Alice", "Bob"]);
  });

  it("ordnet Ratings in Stufen ein", () => {
    assert.equal(ratingTier(1000), "bronze");
    assert.equal(ratingTier(1200), "silver");
    assert.equal(ratingTier(1400), "gold");
    assert.equal(ratingTier(1600), "platinum");
  });

  it("berechnet die Siegquote ohne Division durch null", () => {
    assert.equal(winRate(row({ wins: 0, gamesPlayed: 0 })), 0);
    assert.equal(winRate(row({ wins: 3, gamesPlayed: 4 })), 75);
    assert.equal(formatRating(1234), "1.234");
    assert.equal(DEFAULT_RATING, 1000);
  });
});

describe("Meldungs-Visualisierung", () => {
  it("zaehlt alle Status und ignoriert fehlende Werte", () => {
    assert.equal(countTotal(emptyStatusCounts()), 0);
    assert.equal(countTotal({ open: 2, resolved: 1 }), 3);
  });

  it("verteilt die Statussegmente auf 100 Prozent", () => {
    const segments = statusSegments({ open: 2, reviewed: 1, resolved: 1, dismissed: 0 });
    assert.deepEqual(
      segments.map((segment) => segment.count),
      [2, 1, 1, 0],
    );
    assert.equal(
      segments.reduce((sum, segment) => sum + segment.percent, 0),
      100,
    );
    assert.equal(segments[0].label, "Offen");
  });

  it("meldet bei leerer Liste keine Division durch null", () => {
    assert.deepEqual(
      statusSegments(emptyStatusCounts()).map((segment) => segment.percent),
      [0, 0, 0, 0],
    );
  });

  it("begrenzt Balkenbreiten und formatiert Monate", () => {
    assert.equal(barWidth(0, 10), 0);
    assert.equal(barWidth(10, 10), 100);
    assert.equal(barWidth(1, 10), 10);
    assert.equal(barWidth(1, 1000), 6);
    assert.equal(monthLabel("2026-11"), "11/26");
    assert.equal(monthLabel("kaputt"), "kaputt");
  });

  it("zeigt nur die letzten Monate in alter Reihenfolge", () => {
    const months = [
      { month: "2026-06", count: 1 },
      { month: "2026-07", count: 2 },
      { month: "2026-08", count: 3 },
      { month: "2026-09", count: 4 },
      { month: "2026-10", count: 5 },
      { month: "2026-11", count: 6 },
      { month: "2026-12", count: 7 },
    ];
    assert.deepEqual(recentMonths(months, 3).map((entry) => entry.month), [
      "2026-10",
      "2026-11",
      "2026-12",
    ]);
  });
});
