/**
 * Minimaler Router – die App hat wenige Ansichten, dafür lohnt keine
 * zusätzliche Abhängigkeit.
 *
 *   /                    Spielekatalog
 *   /games/:name         Einstellungen eines Spiels
 *   /sessions            Sitzungen und Spielverläufe
 *   /reports             Meldungen und rollenabhängige Visualisierung
 *   /admin/games         Spiele im Katalog anlegen und löschen (Admin)
 *   /ratings             Rangliste der Spieler-Ratings
 *   /play                Auswahl für eine Partie ohne Sitzung
 *   /play/:name          Partie eines Spiels ohne Sitzung, direkt im Tab
 *   /camera              Physisches Brett per Laptop-Kamera tracken
 *   /:spiel/:id          Spielfeld-Fenster (wird als Pop-up geöffnet)
 */

import { useCallback, useEffect, useState } from "react";

export type Route =
  | { name: "catalog" }
  | { name: "login" }
  | { name: "profile" }
  | { name: "setup"; gameName: string }
  | { name: "sessions" }
  | { name: "reports" }
  | { name: "adminGames" }
  | { name: "ratings" }
  | { name: "play"; gameName?: string }
  | { name: "camera" }
  | { name: "game"; sessionId: string }
  | { name: "notFound"; path: string };

/**
 * Kurze, stabile Fenster-Adressen der eingebauten Spiele. Neue Spiele aus der
 * Administration verwenden direkt ihre Kennung (`/backgammon/12`), damit keine
 * Liste im Frontend gepflegt werden muss.
 */
const WINDOW_ROUTES: Record<string, string> = {
  connectfour: "connect-four",
  tictactoe: "tictactoe",
  memory: "memory",
  schach: "schach",
  "mensch-aergere-dich-nicht": "mensch-aergere-dich-nicht",
};

/** Kennung eines Spiels, wie `game_types.name` sie erlaubt. */
const GAME_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function parseRoute(pathname: string): Route {
  const path = pathname.replace(/\/+$/, "") || "/";

  if (path === "/") return { name: "catalog" };
  if (path === "/login") return { name: "login" };
  if (path === "/profile") return { name: "profile" };
  if (path === "/sessions") return { name: "sessions" };
  if (path === "/reports") return { name: "reports" };
  if (path === "/admin/games") return { name: "adminGames" };
  if (path === "/ratings") return { name: "ratings" };
  if (path === "/play") return { name: "play" };
  if (path === "/camera") return { name: "camera" };

  const direct = /^\/play\/([A-Za-z0-9_-]+)$/.exec(path);
  if (direct) return { name: "play", gameName: direct[1] };

  const setup = /^\/games\/([A-Za-z0-9_-]+)$/.exec(path);
  if (setup) return { name: "setup", gameName: setup[1] };

  const windowRoute = /^\/([A-Za-z0-9_-]+)\/([A-Za-z0-9_-]+)$/.exec(path);
  if (windowRoute && (windowRoute[1] in WINDOW_ROUTES || GAME_SLUG.test(windowRoute[1]))) {
    return { name: "game", sessionId: windowRoute[2] };
  }

  return { name: "notFound", path };
}

export function setupPath(gameName: string): string {
  return `/games/${gameName}`;
}

/**
 * Pfad des Spielfeld-Fensters. Eingebaute Spiele behalten ihre kurze Adresse;
 * von der Administration angelegte Spiele verwenden ihre Kennung direkt.
 */
export function windowPath(gameName: string, sessionId: string): string | null {
  const entry = Object.entries(WINDOW_ROUTES).find(([, name]) => name === gameName);
  if (entry) return `/${entry[0]}/${sessionId}`;
  return GAME_SLUG.test(gameName) ? `/${gameName}/${sessionId}` : null;
}

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parseRoute(window.location.pathname));

  useEffect(() => {
    const onPopState = () => setRoute(parseRoute(window.location.pathname));
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  return route;
}

export function navigate(path: string): void {
  if (window.location.pathname === path) return;
  window.history.pushState(null, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

export function useNavigate(): (path: string) => void {
  return useCallback((path: string) => navigate(path), []);
}