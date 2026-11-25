/**
 * Reine Ableitung der teilbaren URLs fuer den QR-Code.
 *
 * Die Basis ist `window.location.origin`, damit der Code hinter nginx
 * (http://localhost:5173) genauso funktioniert wie im Vite-Dev-Server.
 * Es werden keine Daten persistiert und keine Seiteneffekte ausgeloest.
 */

/**
 * Absolute URL auf die Direktpartie eines Spiels (`/play/:name`).
 * Bei leerem oder fehlendem Spielnamen wird die Katalog-URL geliefert.
 */
export function playUrlFor(gameName: string, origin: string): string {
  const name = (gameName ?? "").trim();
  if (name === "") {
    return catalogUrl(origin);
  }
  return new URL(`/play/${encodeURIComponent(name)}`, origin).toString();
}

/**
 * Absolute URL auf den Katalog (`/`).
 */
export function catalogUrl(origin: string): string {
  return new URL("/", origin).toString();
}