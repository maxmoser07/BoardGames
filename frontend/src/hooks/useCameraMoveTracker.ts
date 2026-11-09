/**
 * React-Hook um die Kamera-Bibliothek.
 *
 * Der Hook erzeugt den `CameraMoveTracker` beim ersten `start()` und räumt ihn
 * beim Unmount wieder auf. Das <video>-Element kommt aus der Oberfläche, damit
 * Vorschau und Erkennung dieselbe Quelle benutzen.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { RefObject } from "react";

import { CameraMoveTracker } from "../lib/camera/cameraTracker";
import { emptyBoard } from "../lib/camera/connectFour";
import type {
  BoardCorners,
  BoardObservation,
  BoardState,
  CameraMoveTrackerOptions,
  TrackerEvent,
  TrackedMove,
} from "../lib/camera/types";

export type CameraTrackerStatus = "idle" | "starting" | "running" | "error";

export interface UseCameraMoveTrackerResult {
  videoRef: RefObject<HTMLVideoElement | null>;
  status: CameraTrackerStatus;
  error: string | null;
  board: BoardState;
  moves: TrackedMove[];
  /** Letzte ausgewertete Beobachtung, inkl. Konfidenz – `null` vor dem ersten Frame. */
  observation: BoardObservation | null;
  start: () => Promise<void>;
  stop: () => void;
  reset: () => void;
  calibrate: (corners: BoardCorners) => void;
}

export function useCameraMoveTracker(
  options: CameraMoveTrackerOptions,
): UseCameraMoveTrackerResult {
  const optionsRef = useRef(options);
  const trackerRef = useRef<CameraMoveTracker | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const [status, setStatus] = useState<CameraTrackerStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [board, setBoard] = useState<BoardState>(() => emptyBoard(options.layout));
  const [moves, setMoves] = useState<TrackedMove[]>([]);
  const [observation, setObservation] = useState<BoardObservation | null>(null);

  useEffect(() => {
    optionsRef.current = options;
  }, [options]);

  const handleEvent = useCallback((event: TrackerEvent) => {
    setBoard(event.board);
    if (event.type === "update") {
      setObservation(event.observation);
    } else if (event.type === "move") {
      setMoves((current) => [...current, event.move]);
    } else if (event.type === "reset") {
      setMoves([]);
      setObservation(null);
    }
  }, []);

  const ensureTracker = useCallback((): CameraMoveTracker => {
    if (trackerRef.current === null) {
      trackerRef.current = new CameraMoveTracker({
        ...optionsRef.current,
        onError: (cause) => {
          setError(cause.message);
          setStatus("error");
          optionsRef.current.onError?.(cause);
        },
      });
      trackerRef.current.subscribe(handleEvent);
    }
    return trackerRef.current;
  }, [handleEvent]);

  const start = useCallback(async (): Promise<void> => {
    setStatus("starting");
    setError(null);
    try {
      const tracker = ensureTracker();
      await tracker.start(videoRef.current ?? undefined);
      setStatus("running");
    } catch (cause) {
      const normalized = cause instanceof Error ? cause : new Error(String(cause));
      setError(normalized.message);
      setStatus("error");
    }
  }, [ensureTracker]);

  const stop = useCallback((): void => {
    trackerRef.current?.stop();
    setStatus("idle");
  }, []);

  const reset = useCallback((): void => {
    trackerRef.current?.reset();
    setBoard(emptyBoard(optionsRef.current.layout));
    setMoves([]);
    setObservation(null);
  }, []);

  const calibrate = useCallback((corners: BoardCorners): void => {
    trackerRef.current?.calibrate(corners);
  }, []);

  useEffect(
    () => () => {
      trackerRef.current?.dispose();
      trackerRef.current = null;
    },
    [],
  );

  return { videoRef, status, error, board, moves, observation, start, stop, reset, calibrate };
}
