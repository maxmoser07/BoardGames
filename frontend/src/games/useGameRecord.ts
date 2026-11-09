import { useCallback, useRef, useState } from "react";

import { api } from "../lib/api";
import type { BoardGameResult } from "../types";
import type { GameContext } from "./types";

/**
 * Speichert ein fertiges Spiel genau einmal.
 *
 * Der Ref verhindert doppelte Requests durch den Strict Mode und durch
 * mehrere Effects. Schlägt der Request fehl, wird er wieder freigegeben, damit
 * ein erneuter Abschluss (z. B. nach einem Neustart) speichern kann.
 */
export function useGameRecord(context: GameContext) {
  const saved = useRef(false);
  const [error, setError] = useState<string | null>(null);

  const record = useCallback(
    async (result: BoardGameResult): Promise<void> => {
      if (saved.current) return;
      saved.current = true;
      try {
        await api.recordGame(context.gameType, result, {
          sessionId: context.sessionId,
          players: context.players,
          startedAt: context.startedAt,
          pausedMs: context.pausedMs,
          friendly: context.friendly,
        });
        setError(null);
      } catch (cause) {
        saved.current = false;
        setError(cause instanceof Error ? cause.message : "Die Partie konnte nicht gespeichert werden.");
      }
    },
    [context.gameType, context.sessionId, context.players, context.startedAt, context.pausedMs, context.friendly],
  );

  const reset = useCallback(() => {
    saved.current = false;
    setError(null);
  }, []);

  return { record, error, reset };
}
