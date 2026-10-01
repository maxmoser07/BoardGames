import { useCallback, useEffect, useRef, useState } from "react";

import { api } from "../lib/api";

export interface LiveData<T> {
  data: T | undefined;
  error: string | null;
  loading: boolean;
  /** Erneut laden, mit Ladezustand – für Fehlerbehandlung in Aktionen gedacht. */
  reload: () => void;
}

function messageOf(cause: unknown): string {
  if (cause instanceof Error) return cause.message;
  return "Unbekannter Fehler beim Laden der Daten.";
}

/**
 * Lädt Daten über `api` und hält sie automatisch aktuell.
 *
 * Alle Ansichten lesen aus derselben lokalen Datenhaltung, die jede Änderung
 * meldet – ein Abonnement genügt also, kein Polling und kein `setInterval`.
 * `setState` passiert ausschließlich im Promise-Callback: der Effekt selbst
 * bleibt synchron und löst keine Render-Kaskade aus.
 */
export function useLiveData<T>(loader: () => Promise<T>): LiveData<T> {
  const [data, setData] = useState<T>();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const apply = useCallback((value: T) => {
    setData(value);
    setError(null);
    setLoading(false);
  }, []);

  const fail = useCallback((cause: unknown) => {
    setError(messageOf(cause));
    setLoading(false);
  }, []);

  // Der Loader wird bei jedem Render als neue Funktion übergeben; gespeichert
  // wird er nur, damit der Effekt nicht bei jeder Änderung neu läuft.
  const loaderRef = useRef(loader);
  useEffect(() => {
    loaderRef.current = loader;
  });

  useEffect(() => {
    let cancelled = false;

    const run = () => {
      loaderRef.current().then(
        (value) => {
          if (!cancelled) apply(value);
        },
        (cause: unknown) => {
          if (!cancelled) fail(cause);
        },
      );
    };

    run();
    const unsubscribe = api.subscribe(run);

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [apply, fail]);

  const reload = useCallback(() => {
    setLoading(true);
    loaderRef.current().then(apply, fail);
  }, [apply, fail]);

  return { data, error, loading, reload };
}
