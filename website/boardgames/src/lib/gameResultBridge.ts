/**
 * Brücke zwischen `useConnectFour.ts` und der lokalen Datenhaltung.
 *
 * `useConnectFour.ts` ist eingefroren. Am Spielende sendet der Hook
 *
 *   fetch("/api/connect-four/games", { method: "POST", body: { moves, winner } })
 *
 * und zeigt einen Hinweis, wenn keine 2xx-Antwort kommt. Damit die Oberfläche
 * ohne laufendes Backend vollständig benutzbar bleibt, beantwortet diese
 * Brücke genau diesen einen Request lokal: das Ergebnis wandert in den
 * gemeinsamen Store (Dashboard und andere Fenster sehen es sofort) und der Hook
 * bekommt eine 201-Antwort.
 *
 * Sobald das Rust-Backend läuft, wird `installLocalGameEndpoint()` nicht mehr
 * aufgerufen – dann geht der Request unverändert an das Backend und die Brücke
 * kann gelöscht werden.
 */

import type { ConnectFourResult } from "../types";
import { api, type RecordGameContext } from "./api";

const ENDPOINT = "/api/connect-four/games";

function endpointOf(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.pathname;
  return new URL(input.url, window.location.origin).pathname;
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function errorResponse(message: string): Response {
  return jsonResponse(400, { error: message });
}

export function installLocalGameEndpoint(context: RecordGameContext): () => void {
  const original = window.fetch.bind(window);

  const patched: typeof window.fetch = async (input, init) => {
    const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();

    if (method !== "POST" || !endpointOf(input).endsWith(ENDPOINT) || !init?.body) {
      return original(input, init);
    }

    let result: ConnectFourResult;
    try {
      result = JSON.parse(String(init.body)) as ConnectFourResult;
    } catch {
      return errorResponse("Der Spielverlauf ist kein gültiges JSON.");
    }

    try {
      const game = await api.recordConnectFourGame(result, context);
      return jsonResponse(201, { session_id: game.id, outcome: game.winner, linked: context.sessionId !== null });
    } catch (cause) {
      return errorResponse(cause instanceof Error ? cause.message : "Unbekannter Fehler beim Speichern.");
    }
  };

  window.fetch = patched;
  return () => {
    // Nur zurückbauen, wenn niemand anderes inzwischen etwas eingehängt hat.
    if (window.fetch === patched) window.fetch = original;
  };
}
