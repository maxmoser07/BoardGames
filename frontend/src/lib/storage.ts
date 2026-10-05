/**
 * Dünne Schicht über `localStorage`.
 *
 * Warum nicht einfach `localStorage` direkt benutzen? Der Spielstand muss in
 * mehreren Fenstern desselben Browsers sichtbar sein – das Popup mit dem
 * Spielfeld und das Dashboard. `localStorage` ist zwar origin- und damit
 * fensterübergreifend, benachrichtigt aber nur *andere* Fenster (per
 * `storage`-Event), nie das schreibende Fenster selbst.
 *
 * Deshalb: jeder Schreibvorgang bekommt eine eigene Revision, damit sich der
 * gespeicherte String garantiert ändert (sonst feuert der Browser kein Event)
 * und alle Abonnenten werden zusätzlich lokal aufgerufen.
 */

const PREFIX = "boardgames:v1:";

export type Listener = () => void;

interface Envelope<T> {
  rev: number;
  data: T;
}

const listeners = new Set<Listener>();
const memory = new Map<string, string>();
let storageChecked = false;
let storageWorks = false;

function hasLocalStorage(): boolean {
  if (storageChecked) return storageWorks;
  storageChecked = true;
  try {
    const probe = `${PREFIX}__probe`;
    window.localStorage.setItem(probe, "1");
    window.localStorage.removeItem(probe);
    storageWorks = true;
  } catch {
    // Privater Modus / blockierte Cookies: im Speicher weiterarbeiten.
    storageWorks = false;
  }
  return storageWorks;
}

function rawGet(key: string): string | null {
  return hasLocalStorage() ? window.localStorage.getItem(key) : memory.get(key) ?? null;
}

function rawSet(key: string, value: string): void {
  if (hasLocalStorage()) window.localStorage.setItem(key, value);
  else memory.set(key, value);
}

function rawRemove(key: string): void {
  if (hasLocalStorage()) window.localStorage.removeItem(key);
  else memory.delete(key);
}

function notifyLocal(): void {
  for (const listener of [...listeners]) listener();
}

if (typeof window !== "undefined") {
  window.addEventListener("storage", (event) => {
    if (event.key === null || event.key.startsWith(PREFIX)) notifyLocal();
  });
}

export function read<T>(key: string, fallback: T): T {
  const raw = rawGet(PREFIX + key);
  if (raw === null) return fallback;
  try {
    return (JSON.parse(raw) as Envelope<T>).data;
  } catch {
    return fallback;
  }
}

export function write<T>(key: string, data: T): void {
  const envelope: Envelope<T> = { rev: Date.now() + Math.random(), data };
  rawSet(PREFIX + key, JSON.stringify(envelope));
  notifyLocal();
}

export function remove(key: string): void {
  rawRemove(PREFIX + key);
  notifyLocal();
}

/** Meldet jede Änderung im eigenen Fenster und in allen anderen Tabs. */
export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
