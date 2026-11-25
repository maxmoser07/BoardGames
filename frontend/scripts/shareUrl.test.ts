/**
 * Tests fuer die reine Ableitung teilbarer URLs (QR-Code).
 * Ausfuehren: `npm test` (Node 24 fuehrt TypeScript direkt aus).
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { catalogUrl, playUrlFor } from "../src/lib/shareUrl.ts";

describe("shareUrl", () => {
  it("baut die Direktpartie-URL fuer einen normalen Spielnamen", () => {
    assert.equal(
      playUrlFor("connectfour", "http://localhost:5173"),
      "http://localhost:5173/play/connectfour",
    );
  });

  it("kodiert Sonderzeichen im Spielnamen", () => {
    assert.equal(
      playUrlFor("foo bar/baz", "http://localhost:5173"),
      "http://localhost:5173/play/foo%20bar%2Fbaz",
    );
  });

  it("liefert bei leerem Namen die Katalog-URL", () => {
    assert.equal(playUrlFor("", "http://localhost:5173"), catalogUrl("http://localhost:5173"));
    assert.equal(playUrlFor("   ", "http://localhost:5173"), "http://localhost:5173/");
  });

  it("normalisiert origin mit und ohne abschliessenden Slash", () => {
    assert.equal(
      playUrlFor("tictactoe", "http://localhost:5173/"),
      "http://localhost:5173/play/tictactoe",
    );
    assert.equal(
      playUrlFor("tictactoe", "http://localhost:5173"),
      "http://localhost:5173/play/tictactoe",
    );
    assert.equal(catalogUrl("http://localhost:5173/"), "http://localhost:5173/");
    assert.equal(catalogUrl("http://localhost:5173"), "http://localhost:5173/");
  });
});