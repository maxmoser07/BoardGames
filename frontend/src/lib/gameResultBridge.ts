/**
 * Brücke zwischen `useConnectFour.ts` und Backend/lokaler Datenhaltung.
 *
 * `useConnectFour.ts` ist eingefroren. Am Spielende sendet der Hook
 *
 *   fetch("/api/connect-four/games", { method: "POST", body: { moves, winner } })
 *
 * und zeigt einen Hinweis, wenn keine 2xx-Antwort kommt. Diese Brücke
 * fängt genau diesen einen Request ab und geht so vor:
 *
 *  1. Der Request wird (um `duration_ms`, die echte Spielzeit ohne Pausen,
 *     ergänzt) an das Rust-Backend geschickt und dort in die Datenbank
 *     geschrieben.
 *  2. Antwortet das Backend mit 2xx, wird die Partie zusätzlich im lokalen
 *     Store gespiegelt, damit Dashboard und andere Fenster sie sofort sehen
 *     (sie lesen noch nicht aus der Datenbank). Der Hook bekommt die
 *     Antwort des Backends.
 *  3. Lehnt das Backend die Partie ab (400/422), wird nichts lokal
 *     gespeichert. Der Hook bekommt den Fehler und zeigt ihn an.
 *  4. Ist das Backend nicht erreichbar oder antwortet mit 5xx, bleibt die
 *     Oberfläche benutzbar: die Partie wird nur lokal gespeichert und in der
 *     Konsole gewarnt. In der Datenbank landet sie dann NICHT.
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

/** Das Backend hat die Partie inhaltlich abgelehnt (kein Ausfall). */
function isRejection(response: Response): boolean {
  return response.status === 400 || response.status === 422;
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

    // Nur die tatsächlich gespielte Zeit – Pausen zählen nicht mit.
    const durationMs = Math.max(0, Math.round(Date.now() - context.startedAt - context.pausedMs));

    // 1. Backend / Datenbank
    let backend: Response | null = null;
    try {
      backend = await original(input, {
        ...init,
        body: JSON.stringify({ ...result, duration_ms: durationMs }),
      });
    } catch (cause) {
      console.warn("Backend nicht erreichbar – die Partie wird nur lokal gespeichert.", cause);
    }

    // 3. Abgelehnt: Fehler durchreichen, nichts lokal speichern.
    if (backend && isRejection(backend)) return backend;

    // 2. Gespeichert: lokal spiegeln und die Antwort des Backends durchreichen.
    if (backend && backend.ok) {
      try {
        await api.recordConnectFourGame(result, context);
      } catch (cause) {
        // In der Datenbank liegt die Partie bereits; nur die lokale Kopie fehlt.
        console.error("Partie ist gespeichert, konnte aber nicht lokal gespiegelt werden.", cause);
      }
      return backend;
    }

    // 4. Backend nicht erreichbar oder 5xx: nur lokal speichern.
    if (backend) {
      console.warn(`Backend antwortete mit ${backend.status} – die Partie wird nur lokal gespeichert.`);
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
