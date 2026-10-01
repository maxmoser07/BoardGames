import { useEffect, useState } from "react";

/**
 * Aktuelle Zeit aus State statt `Date.now()` direkt im Render: React verbietet
 * Nebenwirkungen beim Rendern, und so bleibt die Anzeige "läuft seit …"
 * zuverlässig aktuell, ohne dass die ganze Liste bei jedem Frame neu rendert.
 */
export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);

  return now;
}
