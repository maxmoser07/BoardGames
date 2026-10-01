/**
 * Minimaler Router – die App hat fünf Ansichten, dafür lohnt keine
 * zusätzliche Abhängigkeit.
 *
 *   /                    Spielekatalog
 *   /games/:name         Einstellungen eines Spiels
 *   /sessions            Sitzungen und Spielverläufe
 *   /play                Partie ohne Sitzung, direkt im Tab
 *   /connectfour/:id     Spielfeld-Fenster (wird als Pop-up geöffnet)
 */

import { useCallback, useEffect, useState } from "react";

export type Route =
  | { name: "catalog" }
  | { name: "setup"; gameName: string }
  | { name: "sessions" }
  | { name: "play" }
  | { name: "game"; sessionId: string }
  | { name: "notFound"; path: string };

/**
 * Fenster-Routen nach URL-Abschnitt (`/connectfour/:id`) auf den Spielnamen.
 * Nur Connect Four ist spielbar, deshalb gibt es nur diesen Eintrag; weitere
 * Spiele kommen hier dazu, sobald sie umgesetzt sind.
 */
const WINDOW_ROUTES: Record<string, string> = {
  connectfour: "connect-four",
};

export function parseRoute(pathname: string): Route {
  const path = pathname.replace(/\/+$/, "") || "/";

  if (path === "/") return { name: "catalog" };
  if (path === "/sessions") return { name: "sessions" };
  if (path === "/play") return { name: "play" };

  const setup = /^\/games\/([A-Za-z0-9_-]+)$/.exec(path);
  if (setup) return { name: "setup", gameName: setup[1] };

  const windowRoute = /^\/([A-Za-z0-9_-]+)\/([A-Za-z0-9_-]+)$/.exec(path);
  if (windowRoute && windowRoute[1] in WINDOW_ROUTES) {
    return { name: "game", sessionId: windowRoute[2] };
  }

  return { name: "notFound", path };
}

export function setupPath(gameName: string): string {
  return `/games/${gameName}`;
}

/**
 * Pfad des Spielfeld-Fensters. `null`, solange für das Spiel noch keine
 * Fenster-Route existiert – dann darf auch keine Sitzung gestartet werden.
 */
export function windowPath(gameName: string, sessionId: string): string | null {
  const entry = Object.entries(WINDOW_ROUTES).find(([, name]) => name === gameName);
  return entry ? `/${entry[0]}/${sessionId}` : null;
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