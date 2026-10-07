/**
 * Ergänzung für den einen POST, den das eingefrorene `useConnectFour` macht.
 *
 * Der Hook sendet am Spielende
 *
 *   fetch("/api/connect-four/games", { method: "POST", body: { moves, winner } })
 *
 * und zeigt einen Hinweis, wenn keine 2xx-Antwort kommt. Zwei Angaben fehlen
 * darin, und beide kennt nur das Fenster, das das Brett bedient:
 *
 *  * `duration_ms` – die echte Spielzeit ohne Pausen. Der Server kann sie nicht
 *    selbst messen, also wird sie hier aus Startzeit und Pausen berechnet.
 *  * `session_id` – damit der Server die gehostete Sitzung schliesst, statt
 *    eine zweite, leere Sitzung anzulegen.
 *
 * Die Brücke leitet den Request an `api.recordConnectFourGame` weiter, das in die
 * Datenbank schreibt, und gibt dem Hook eine passende Antwort zurück. Sie
 * speichert nichts mehr nebenbei: es gibt nur eine Quelle, MySQL.
 *
 * Schlägt der Auftrag fehl – der Server lehnt die Partie ab oder ist nicht
 * erreichbar –, wird nichts geschrieben, und der Hook zeigt den Fehlschlag.
 */

import type { ConnectFourResult } from "../types";
import { api, ApiError, type RecordGameContext } from "./api";

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

export function installGameResultEndpoint(context: RecordGameContext): () => void {
  const original = window.fetch.bind(window);

  // `api.recordConnectFourGame` schickt selbst einen POST auf dieselbe Adresse -
  // und laeuft damit wieder durch diese Bruecke. Ohne die Sperre ruft sich
  // `api` endlos selbst auf, bevor ueberhaupt eine Anfrage das Fenster
  // verlaesst. Der zweite Durchlauf ist der eigene Aufruf und geht unveraendert
  // an den Server.
  let saving = false;

  const patched: typeof window.fetch = async (input, init) => {
    const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();

    if (method !== "POST" || !endpointOf(input).endsWith(ENDPOINT) || !init?.body) {
      return original(input, init);
    }

    let result: ConnectFourResult;
    try {
      result = JSON.parse(String(init.body)) as ConnectFourResult;
    } catch {
      return jsonResponse(400, { error: "Der Spielverlauf ist kein gültiges JSON." });
    }

    if (saving) return original(input, init);

    saving = true;
    try {
      const game = await api.recordConnectFourGame(result, context);
      return jsonResponse(201, {
        session_id: game.id,
        outcome: game.winner,
        linked: context.sessionId !== null,
      });
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Unbekannter Fehler beim Speichern.";
      // 400, wenn der Server die Partie inhaltlich abgelehnt hat, 502 bei
      // fehlender Erreichbarkeit - der Hook unterscheidet das nicht.
      const status = cause instanceof ApiError && cause.status !== undefined ? cause.status : 502;
      return jsonResponse(status, { error: message });
    } finally {
      saving = false;
    }
  };

  window.fetch = patched;
  return () => {
    // Nur zurueckbauen, wenn niemand anderes inzwischen etwas eingehängt hat.
    if (window.fetch === patched) window.fetch = original;
  };
}
