import { useCallback, useState } from "react";

import { read, write } from "../lib/storage";

/**
 * `useState`, das den Wert unter einem Schlüssel im gemeinsamen Store hält –
 * damit bleibt z. B. der angemeldete Benutzer über Reload und Fensterwechsel
 * hinweg erhalten.
 */
export function usePersistentState<T>(key: string, initial: T): [T, (value: T) => void] {
  const [value, setValue] = useState<T>(() => read(key, initial));

  const update = useCallback(
    (next: T) => {
      setValue(next);
      write(key, next);
    },
    [key],
  );

  return [value, update];
}
