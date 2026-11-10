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

/** Letzte auffaellige Ereignisse fuer das Live-Feedback. */
export interface CameraTrackerLogEntry {
  id: number;
  type: "move" | "reset";
  at: number;
  move?: TrackedMove;
  reason?: "board-cleared" | "resync";
}

export interface UseCameraMoveTrackerResult {
  videoRef: RefObject<HTMLVideoElement | null>;
  status: CameraTrackerStatus;
  error: string | null;
  board: BoardState;
  moves: TrackedMove[];
  /** Letzte ausgewertete Beobachtung, inkl. Konfidenz – `null` vor dem ersten Frame. */
  observation: BoardObservation | null;
  /** Anzahl der ausgewerteten Frames seit dem letzten `reset`. */
  frames: number;
  /** Zeitpunkt des letzten Frames (ms seit Epoche); `null` vor dem ersten. */
  lastUpdateAt: number | null;
  /** Erkannte Zuege und Resets, neueste zuerst. */
  log: CameraTrackerLogEntry[];
  start: () => Promise<void>;
  stop: () => void;
  reset: () => void;
  calibrate: (corners: BoardCorners) => void;
  /** Ecken am erkannten Lochraster ausrichten; `null`, wenn das Bild nicht reicht. */
  snapCalibration: (corners: BoardCorners) => BoardCorners | null;
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
  const [frames, setFrames] = useState(0);
  const [lastUpdateAt, setLastUpdateAt] = useState<number | null>(null);
  const [log, setLog] = useState<CameraTrackerLogEntry[]>([]);
  const logIdRef = useRef(0);

  useEffect(() => {
    optionsRef.current = options;
  }, [options]);

  const appendLog = useCallback((entry: Omit<CameraTrackerLogEntry, "id" | "at">) => {
    logIdRef.current += 1;
    const next: CameraTrackerLogEntry = {
      ...entry,
      id: logIdRef.current,
      at: Date.now(),
    };
    setLog((current) => [next, ...current].slice(0, 12));
  }, []);

  const handleEvent = useCallback(
    (event: TrackerEvent) => {
      setBoard(event.board);
      if (event.type === "update") {
        setObservation(event.observation);
        setFrames((current) => current + 1);
        setLastUpdateAt(Date.now());
      } else if (event.type === "move") {
        setMoves((current) => [...current, event.move]);
        appendLog({ type: "move", move: event.move });
      } else if (event.type === "reset") {
        setMoves([]);
        setObservation(null);
        appendLog({ type: "reset", reason: event.reason });
      }
    },
    [appendLog],
  );

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
    setFrames(0);
    setLastUpdateAt(null);
    setLog([]);
    logIdRef.current = 0;
  }, []);

  const calibrate = useCallback((corners: BoardCorners): void => {
    trackerRef.current?.calibrate(corners);
  }, []);

  const snapCalibration = useCallback((corners: BoardCorners): BoardCorners | null => {
    return trackerRef.current?.snapCalibration(corners) ?? null;
  }, []);

  useEffect(
    () => () => {
      trackerRef.current?.dispose();
      trackerRef.current = null;
    },
    [],
  );

  return {
    videoRef,
    status,
    error,
    board,
    moves,
    observation,
    frames,
    lastUpdateAt,
    log,
    start,
    stop,
    reset,
    calibrate,
    snapCalibration,
  };
}
