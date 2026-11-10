import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent, SyntheticEvent } from "react";
import {
  Camera,
  CameraOff,
  CheckCircle2,
  Crosshair,
  RefreshCw,
  RotateCcw,
  Save,
  Trophy,
} from "lucide-react";

import { AppShell } from "./components/AppShell";
import { Badge, EmptyState, Notice, Spinner } from "./components/ui";
import { WinOdds } from "./components/WinOdds";
import { useCameraMoveTracker } from "./hooks/useCameraMoveTracker";
import { ApiError, api } from "./lib/api";
import {
  cellCenter,
  cellSizeAt,
  cornersFromRect,
  createHomography,
  flipCorners,
  scaleCorners,
  toConnectFourMoves,
  winnerOf,
} from "./lib/camera";
import type { BoardCorners, BoardState, Point, Side } from "./lib/camera";
import { useNavigate } from "./router";
import "./CameraView.css";

const BOARD_LAYOUT = { rows: 6, cols: 7 };

/** Wird nur benutzt, bis die echte Videoauflösung bekannt ist. */
const INITIAL_CORNERS = cornersFromRect({ x: 0, y: 0, width: 1, height: 1 });

const CORNER_HANDLES = [
  { key: "topLeft", label: "Oben links" },
  { key: "topRight", label: "Oben rechts" },
  { key: "bottomRight", label: "Unten rechts" },
  { key: "bottomLeft", label: "Unten links" },
] as const;

type CornerKey = (typeof CORNER_HANDLES)[number]["key"];

type ChipPalette = "yellow-green" | "red-yellow";

interface SideDisplay {
  label: string;
  tone: "red" | "yellow" | "green";
}

/**
 * Physische Steinfarben. Intern bleibt es bei den Seiten "red"/"yellow", weil
 * Datenhaltung und Spiel-Logik nur diese kennen. Grün wird auf "red" abgebildet
 * und in der Kamera-Ansicht als Grün dargestellt.
 */
const CHIP_PALETTES: Record<ChipPalette, { sides: Record<Side, SideDisplay> }> = {
  "yellow-green": {
    sides: {
      red: { label: "Grün", tone: "green" },
      yellow: { label: "Gelb", tone: "yellow" },
    },
  },
  "red-yellow": {
    sides: {
      red: { label: "Rot", tone: "red" },
      yellow: { label: "Gelb", tone: "yellow" },
    },
  },
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Ein mittiges 7:6-Rechteck als Startpunkt für die Kalibrierung. */
function defaultCorners(width: number, height: number): BoardCorners {
  const aspect = BOARD_LAYOUT.cols / BOARD_LAYOUT.rows;
  let boardWidth = width * 0.72;
  let boardHeight = boardWidth / aspect;

  if (boardHeight > height * 0.82) {
    boardHeight = height * 0.82;
    boardWidth = boardHeight * aspect;
  }

  return cornersFromRect({
    x: (width - boardWidth) / 2,
    y: (height - boardHeight) / 2,
    width: boardWidth,
    height: boardHeight,
  });
}

function isEmptyBoard(board: BoardState): boolean {
  return board.every((line) => line.every((cell) => cell === null));
}

/**
 * Kamera-Ansicht für ein physisches Vier-Gewinnt-Brett.
 *
 * Die Kamera liefert laufend Bilder, der Detektor liest die Zellmitten und der
 * MoveTracker macht daraus Züge. Vor dem Tracking werden die vier Ecken des
 * Rasters im Kamerabild gesetzt; das ist die einzige Einrichtung, die das Brett
 * braucht.
 */
const CameraView: React.FC = () => {
  const navigate = useNavigate();
  const {
    videoRef,
    status,
    error,
    board,
    moves,
    observation,
    start,
    stop,
    reset,
    calibrate,
    snapCalibration,
  } = useCameraMoveTracker({
    calibration: INITIAL_CORNERS,
    intervalMs: 500,
  });

  const stageRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const sizeRef = useRef<{ width: number; height: number } | null>(null);

  const [videoSize, setVideoSize] = useState<{ width: number; height: number } | null>(null);
  const [corners, setCorners] = useState<BoardCorners | null>(null);
  const [editing, setEditing] = useState(true);
  const [calibrated, setCalibrated] = useState(false);
  const [flipX, setFlipX] = useState(false);
  const [flipY, setFlipY] = useState(false);
  const [dragging, setDragging] = useState<CornerKey | null>(null);
  const [palette, setPalette] = useState<ChipPalette>("yellow-green");
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [snapNotice, setSnapNotice] = useState<string | null>(null);

  const winner = useMemo(() => winnerOf(board), [board]);
  const counts = useMemo(() => {
    let red = 0;
    let yellow = 0;
    for (const line of board) {
      for (const cell of line) {
        if (cell === "red") red += 1;
        else if (cell === "yellow") yellow += 1;
      }
    }
    return { red, yellow };
  }, [board]);

  const nextSide: Side = counts.red === counts.yellow ? "red" : "yellow";
  const sideDisplay = CHIP_PALETTES[palette].sides;

  // Der Tracker speichert den Startzustand und legt erkannte Züge darauf. Um zu
  // erkennen, ob die Partie auf einem leeren Brett begann, werden die Züge
  // wieder abgezogen. Nur dann ist der Verlauf vollständig speicherbar.
  const baselineEmpty = useMemo(() => {
    if (!calibrated) return null;
    const baseline = board.map((line) => [...line]);
    for (const move of moves) {
      baseline[move.location.y][move.location.x] = null;
    }
    return isEmptyBoard(baseline);
  }, [board, calibrated, moves]);

  const canSave =
    calibrated &&
    winner !== null &&
    moves.length > 0 &&
    startedAt !== null &&
    baselineEmpty !== false;

  const handleMetadata = useCallback((event: SyntheticEvent<HTMLVideoElement>) => {
    const video = event.currentTarget;
    const width = video.videoWidth;
    const height = video.videoHeight;
    if (width === 0 || height === 0) return;

    const previous = sizeRef.current;
    sizeRef.current = { width, height };
    setVideoSize({ width, height });
    setCorners((current) => {
      if (current !== null && previous !== null) {
        return scaleCorners(current, width / previous.width, height / previous.height);
      }
      return current ?? defaultCorners(width, height);
    });
  }, []);

  const applyCalibration = useCallback(() => {
    if (corners === null) return;

    // Die von Hand gesetzten Ecken am Lochmuster ausrichten. Das korrigiert
    // typische Verschiebungen von ein paar Pixeln, ohne dass der Benutzer
    // pixelgenau ziehen muss.
    const snapped = snapCalibration(corners);
    const aligned = snapped ?? corners;
    if (snapped !== null) setCorners(snapped);
    setSnapNotice(
      snapped === null
        ? "Raster konnte nicht automatisch ausgerichtet werden. Prüfe die Ecken von Hand."
        : "Raster automatisch am Lochmuster ausgerichtet.",
    );

    calibrate(flipCorners(aligned, flipX, flipY));
    reset();
    setCalibrated(true);
    setEditing(false);
    setStartedAt(Date.now());
    setSavedId(null);
    setSaveError(null);
  }, [calibrate, corners, flipX, flipY, reset, snapCalibration]);

  /** Raster auch während der Partie neu am Brett ausrichten. */
  const handleSnapCalibration = useCallback(() => {
    if (corners === null) return;
    const snapped = snapCalibration(corners);
    if (snapped === null) {
      setSnapNotice("Raster konnte nicht automatisch ausgerichtet werden.");
      return;
    }

    setCorners(snapped);
    calibrate(flipCorners(snapped, flipX, flipY));
    setSnapNotice("Raster am Lochmuster ausgerichtet.");
  }, [calibrate, corners, flipX, flipY, snapCalibration]);

  const beginEditing = useCallback(() => {
    reset();
    setEditing(true);
    setCalibrated(false);
    setStartedAt(null);
    setSavedId(null);
    setSaveError(null);
    setSnapNotice(null);
  }, [reset]);

  const handleStart = useCallback(async () => {
    setSavedId(null);
    setSaveError(null);
    setSnapNotice(null);
    await start();
  }, [start]);

  const handleStop = useCallback(() => {
    stop();
    reset();
    setEditing(true);
    setCalibrated(false);
    setStartedAt(null);
    setSavedId(null);
    setSaveError(null);
    setSnapNotice(null);
  }, [reset, stop]);

  const handleResetCorners = useCallback(() => {
    if (videoSize === null) return;
    setCorners(defaultCorners(videoSize.width, videoSize.height));
  }, [videoSize]);

  const restartTracking = useCallback(() => {
    reset();
    setStartedAt(Date.now());
    setSavedId(null);
    setSaveError(null);
  }, [reset]);

  const handleSave = useCallback(async () => {
    if (!canSave || winner === null || startedAt === null) return;

    setSaving(true);
    setSaveError(null);
    try {
      const game = await api.recordConnectFourGame(
        { moves: toConnectFourMoves(moves), winner },
        {
          sessionId: null,
          players: { red: null, yellow: null },
          startedAt,
          pausedMs: 0,
        },
      );
      setSavedId(game.id);
    } catch (cause) {
      setSaveError(
        cause instanceof ApiError
          ? cause.message
          : "Die Partie konnte nicht gespeichert werden.",
      );
    } finally {
      setSaving(false);
    }
  }, [canSave, moves, startedAt, winner]);

  const handleCornerDown =
    (key: CornerKey) => (event: ReactPointerEvent<HTMLButtonElement>) => {
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      setDragging(key);
    };

  const handleCornerMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (dragging === null || videoSize === null || stageRef.current === null) return;

    const rect = stageRef.current.getBoundingClientRect();
    const x = clamp(
      ((event.clientX - rect.left) / rect.width) * videoSize.width,
      0,
      videoSize.width,
    );
    const y = clamp(
      ((event.clientY - rect.top) / rect.height) * videoSize.height,
      0,
      videoSize.height,
    );

    setCorners((current) =>
      current === null ? current : { ...current, [dragging]: { x, y } },
    );
  };

  const handleCornerUp = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    setDragging(null);
  };

  // Kalibrierraster und erkannte Steine direkt über das Kamerabild zeichnen.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null || videoSize === null || corners === null) return;

    const context = canvas.getContext("2d");
    if (context === null) return;

    const { width, height } = videoSize;
    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;
    context.clearRect(0, 0, width, height);

    let transform;
    try {
      transform = createHomography(corners);
    } catch {
      return;
    }

    const { topLeft, topRight, bottomRight, bottomLeft } = corners;
    const lineWidth = Math.max(1, Math.min(width, height) * 0.0022);
    const outlineWidth = Math.max(2, Math.min(width, height) * 0.0045);

    // Alles außerhalb des Bretts abdunkeln.
    context.save();
    context.beginPath();
    context.rect(0, 0, width, height);
    context.moveTo(topLeft.x, topLeft.y);
    context.lineTo(topRight.x, topRight.y);
    context.lineTo(bottomRight.x, bottomRight.y);
    context.lineTo(bottomLeft.x, bottomLeft.y);
    context.closePath();
    context.fillStyle = "rgba(4, 8, 18, 0.38)";
    context.fill("evenodd");
    context.restore();

    // 6×7-Raster.
    context.beginPath();
    for (let col = 0; col <= BOARD_LAYOUT.cols; col += 1) {
      const from = transform.pointAt(col / BOARD_LAYOUT.cols, 0);
      const to = transform.pointAt(col / BOARD_LAYOUT.cols, 1);
      context.moveTo(from.x, from.y);
      context.lineTo(to.x, to.y);
    }
    for (let row = 0; row <= BOARD_LAYOUT.rows; row += 1) {
      const from = transform.pointAt(0, row / BOARD_LAYOUT.rows);
      const to = transform.pointAt(1, row / BOARD_LAYOUT.rows);
      context.moveTo(from.x, from.y);
      context.lineTo(to.x, to.y);
    }
    context.strokeStyle = editing
      ? "rgba(255, 255, 255, 0.42)"
      : "rgba(255, 255, 255, 0.58)";
    context.lineWidth = lineWidth;
    context.stroke();

    context.beginPath();
    context.moveTo(topLeft.x, topLeft.y);
    context.lineTo(topRight.x, topRight.y);
    context.lineTo(bottomRight.x, bottomRight.y);
    context.lineTo(bottomLeft.x, bottomLeft.y);
    context.closePath();
    context.strokeStyle = editing ? "#a5abff" : "#35c48c";
    context.lineWidth = outlineWidth;
    context.stroke();

    if (!calibrated) return;

    for (let row = 0; row < BOARD_LAYOUT.rows; row += 1) {
      for (let col = 0; col < BOARD_LAYOUT.cols; col += 1) {
        const side = board[row]?.[col];
        if (!side) continue;

        const center = cellCenter(BOARD_LAYOUT, row, col);
        const point = transform.pointAt(center.x, center.y);
        const size = cellSizeAt(transform, BOARD_LAYOUT, row, col);
        const radius = Math.max(2, Math.min(size.width, size.height) * 0.36);

        const tone = sideDisplay[side].tone;
        context.beginPath();
        context.arc(point.x, point.y, radius, 0, Math.PI * 2);
        context.fillStyle =
          tone === "green"
            ? "rgba(47, 191, 98, 0.82)"
            : tone === "red"
              ? "rgba(224, 68, 75, 0.82)"
              : "rgba(232, 164, 23, 0.85)";
        context.fill();
        context.lineWidth = Math.max(1, radius * 0.14);
        context.strokeStyle = "rgba(255, 255, 255, 0.72)";
        context.stroke();
      }
    }
  }, [board, calibrated, corners, editing, sideDisplay, status, videoSize]);

  const winnerLabel =
    winner === null
      ? null
      : winner === "draw"
        ? "Unentschieden"
        : `${sideDisplay[winner].label} gewinnt`;

  const stageStyle =
    videoSize === null ? undefined : { aspectRatio: `${videoSize.width} / ${videoSize.height}` };

  return (
    <AppShell active="camera">
      <section className="hero">
        <div>
          <p className="hero__eyebrow">
            <Camera aria-hidden="true" size={15} />
            Kamera-Tracking
          </p>
          <h1 className="hero__title">Vier Gewinnt mit der Laptop-Kamera</h1>
          <p className="hero__lead">
            Richte die eingebaute Kamera auf das physische Brett. Nach dem Setzen der vier
            Ecken erkennt die App jeden Stein und schreibt den Verlauf in die Datenbank.
          </p>
        </div>

        <div className="camera-head__actions">
          {status === "running" ? (
            <button type="button" className="btn btn--ghost" onClick={handleStop}>
              <CameraOff aria-hidden="true" size={16} />
              Kamera stoppen
            </button>
          ) : (
            <button
              type="button"
              className="btn btn--primary"
              onClick={() => void handleStart()}
              disabled={status === "starting"}
            >
              {status === "starting" ? (
                <Spinner label="Kamera startet" />
              ) : (
                <>
                  <Camera aria-hidden="true" size={16} />
                  Kamera starten
                </>
              )}
            </button>
          )}
        </div>
      </section>

      {typeof window !== "undefined" && !window.isSecureContext ? (
        <Notice tone="warn" title="Kamera braucht HTTPS oder localhost">
          Der Browser gibt die Kamera nur in einem sicheren Kontext frei. Öffne die Seite über{" "}
          <code>https://…</code> oder lokal über <code>http://localhost:5173</code>.
        </Notice>
      ) : null}

      {error ? (
        <Notice tone="danger" title="Kamera konnte nicht gestartet werden">
          {error}
        </Notice>
      ) : null}

      <div className="camera-layout">
        <section className="card panel camera-panel" aria-labelledby="camera-preview-title">
          <header className="panel__head">
            <span className="panel__icon" aria-hidden="true">
              <Crosshair size={18} />
            </span>
            <div>
              <h2 className="panel__title" id="camera-preview-title">
                Kamerabild
              </h2>
              <p className="panel__subtitle">
                {editing
                  ? "Ecken auf das 6×7-Raster ziehen"
                  : "Raster und erkannte Steine werden eingeblendet"}
              </p>
            </div>
          </header>

          <div
            className="camera-stage"
            ref={stageRef}
            style={stageStyle}
            data-editing={editing || undefined}
          >
            <video
              ref={videoRef}
              className="camera-stage__video"
              muted
              playsInline
              autoPlay
              onLoadedMetadata={handleMetadata}
            />

            {status === "running" && videoSize !== null ? (
              <canvas ref={canvasRef} className="camera-stage__overlay" aria-hidden="true" />
            ) : null}

            {status !== "running" || videoSize === null ? (
              <div className="camera-stage__placeholder">
                <CameraOff aria-hidden="true" size={34} />
                <p>
                  {status === "starting"
                    ? "Kamera startet …"
                    : status === "error"
                      ? "Kamera nicht verfügbar"
                      : "Kamera ist aus"}
                </p>
                <span>
                  {status === "error"
                    ? "Prüfe die Browser-Berechtigung und versuche es erneut."
                    : "Starte die Kamera, um das Brett zu kalibrieren."}
                </span>
              </div>
            ) : null}

            {status === "running" && editing && videoSize !== null && corners !== null
              ? CORNER_HANDLES.map(({ key, label }) => {
                  const point: Point = corners[key];
                  return (
                    <button
                      key={key}
                      type="button"
                      className="camera-corner"
                      style={{
                        left: `${(point.x / videoSize.width) * 100}%`,
                        top: `${(point.y / videoSize.height) * 100}%`,
                      }}
                      aria-label={`${label}: Ecke des Bretts verschieben`}
                      title={label}
                      onPointerDown={handleCornerDown(key)}
                      onPointerMove={handleCornerMove}
                      onPointerUp={handleCornerUp}
                      onPointerCancel={handleCornerUp}
                    />
                  );
                })
              : null}
          </div>

          <div className="camera-toolbar">
            <span className={`camera-status camera-status--${calibrated ? "live" : status}`}>
              {status === "running"
                ? calibrated
                  ? "Tracking läuft"
                  : "Kalibrierung"
                : status === "starting"
                  ? "Startet"
                  : status === "error"
                    ? "Fehler"
                    : "Kamera aus"}
            </span>

            <label className="camera-palette">
              <span>Steine</span>
              <select
                value={palette}
                onChange={(event) => setPalette(event.target.value as ChipPalette)}
              >
                <option value="yellow-green">Gelb / Grün</option>
                <option value="red-yellow">Rot / Gelb</option>
              </select>
            </label>

            {status === "running" ? (
              <>
                {editing ? (
                  <button
                    type="button"
                    className="btn btn--primary btn--sm"
                    onClick={applyCalibration}
                    disabled={corners === null}
                  >
                    <CheckCircle2 aria-hidden="true" size={15} />
                    Kalibrierung übernehmen
                  </button>
                ) : (
                  <button
                    type="button"
                    className="btn btn--ghost btn--sm"
                    onClick={beginEditing}
                  >
                    <Crosshair aria-hidden="true" size={15} />
                    Ecken anpassen
                  </button>
                )}

                <button
                  type="button"
                  className="btn btn--ghost btn--sm"
                  onClick={handleSnapCalibration}
                  disabled={corners === null}
                >
                  <Crosshair aria-hidden="true" size={15} />
                  Raster einrasten
                </button>

                <button
                  type="button"
                  className="btn btn--ghost btn--sm"
                  onClick={handleResetCorners}
                  disabled={videoSize === null}
                >
                  <RotateCcw aria-hidden="true" size={15} />
                  Ecken zurücksetzen
                </button>
              </>
            ) : null}
          </div>

          {snapNotice !== null ? <p className="camera-hint">{snapNotice}</p> : null}

          {editing && status === "running" ? (
            <>
              <div className="camera-orientation">
                <label>
                  <input
                    type="checkbox"
                    checked={flipX}
                    onChange={(event) => setFlipX(event.target.checked)}
                  />
                  Spalten spiegeln (X)
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={flipY}
                    onChange={(event) => setFlipY(event.target.checked)}
                  />
                  Reihen spiegeln (Y)
                </label>
                <span>Nur nötig, wenn die Kamera auf der Gegenseite steht.</span>
              </div>
              <p className="camera-hint">
                Ziehe die vier Punkte auf die äußeren Ecken des Rasters, nicht auf den Rahmen
                des Bretts. Beim Übernehmen richtet die App das Raster zusätzlich automatisch
                am Lochmuster aus – ein paar Pixel Ungenauigkeit sind also kein Problem. Die
                Vorschau ist bewusst nicht gespiegelt, damit die Erkennung dieselben Pixel wie
                das Kamerabild nutzt.
              </p>
            </>
          ) : null}
        </section>

        <section className="card panel camera-side" aria-labelledby="camera-tracking-title">
          <header className="panel__head">
            <span className="panel__icon" aria-hidden="true">
              <Trophy size={18} />
            </span>
            <div>
              <h2 className="panel__title" id="camera-tracking-title">
                Erkannte Partie
              </h2>
              <p className="panel__subtitle">
                {calibrated ? `${moves.length} erkannte Züge` : "Noch nicht kalibriert"}
              </p>
            </div>
          </header>

          {!calibrated ? (
            <EmptyState icon={Crosshair} title="Kalibrierung fehlt">
              Starte die Kamera, ziehe die vier Ecken auf das Brett und übernimm die
              Kalibrierung. Danach zählt die App jeden neuen Stein.
            </EmptyState>
          ) : (
            <>
              <div className="camera-summary">
                <Badge tone={winner === null ? "live" : "done"}>
                  {winnerLabel ?? "Tracking läuft"}
                </Badge>
                <span>{moves.length} Züge</span>
                {observation !== null ? (
                  <span>Erkennung {Math.round(observation.confidence * 100)} %</span>
                ) : null}
              </div>

              <div className="camera-board" role="grid" aria-label="Erkanntes Vier-Gewinnt-Brett">
                {board.map((line, row) =>
                  line.map((cell, col) => (
                    <span
                      key={`${row}-${col}`}
                      className={`camera-board__cell ${cell === null ? "" : sideDisplay[cell].tone}`}
                      aria-hidden="true"
                    />
                  )),
                )}
              </div>

              <p className="camera-turn">
                {winner === null ? (
                  <>
                    <span
                      className={`camera-dot camera-dot--${sideDisplay[nextSide].tone}`}
                      aria-hidden="true"
                    />
                    {sideDisplay[nextSide].label} ist am Zug.
                  </>
                ) : winner === "draw" ? (
                  "Das Brett ist voll – Unentschieden."
                ) : (
                  `${sideDisplay[winner].label} hat gewonnen.`
                )}
              </p>

              <WinOdds
                board={board}
                currentPlayer={nextSide}
                winner={winner}
                labels={{ red: sideDisplay.red.label, yellow: sideDisplay.yellow.label }}
                tones={{ red: sideDisplay.red.tone, yellow: sideDisplay.yellow.tone }}
              />

              {baselineEmpty === false ? (
                <Notice tone="warn" title="Tracking ab laufendem Brett">
                  Beim Start lagen bereits Steine auf dem Brett. Die erkannten Züge lassen sich
                  deshalb nicht als vollständiger Verlauf speichern. Räume das Brett leer und
                  starte eine neue Partie.
                </Notice>
              ) : null}

              {saveError ? (
                <Notice tone="danger" title="Partie konnte nicht gespeichert werden">
                  {saveError}
                </Notice>
              ) : null}

              {savedId ? (
                <Notice
                  tone="success"
                  title="Partie gespeichert"
                  action={
                    <button
                      type="button"
                      className="btn btn--ghost btn--sm"
                      onClick={() => navigate("/play")}
                    >
                      Zu den Verläufen
                    </button>
                  }
                >
                  Der Verlauf liegt in der Datenbank.
                </Notice>
              ) : null}

              <div className="panel__actions">
                <button
                  type="button"
                  className="btn btn--primary btn--sm"
                  onClick={() => void handleSave()}
                  disabled={!canSave || saving}
                >
                  {saving ? (
                    <Spinner label="Speichert" />
                  ) : (
                    <>
                      <Save aria-hidden="true" size={15} />
                      Partie speichern
                    </>
                  )}
                </button>
                <button
                  type="button"
                  className="btn btn--ghost btn--sm"
                  onClick={restartTracking}
                >
                  <RefreshCw aria-hidden="true" size={15} />
                  Neue Partie
                </button>
              </div>

              <h3 className="camera-moves__title">Züge</h3>
              {moves.length === 0 ? (
                <p className="camera-hint">
                  Noch keine Züge erkannt. Lass einen Stein fallen – die App bestätigt ihn
                  über zwei Frames.
                </p>
              ) : (
                <ol className="camera-moves">
                  {moves
                    .slice()
                    .reverse()
                    .map((move) => (
                      <li key={move.turn} className="camera-move">
                        <span className="camera-move__side">
                          <span
                            className={`camera-dot camera-dot--${sideDisplay[move.side].tone}`}
                            aria-hidden="true"
                          />
                          {sideDisplay[move.side].label}
                        </span>
                        <span>Zug {move.turn}</span>
                        <span>Spalte {move.location.x + 1}</span>
                        <span>{Math.round(move.confidence * 100)} %</span>
                      </li>
                    ))}
                </ol>
              )}
            </>
          )}
        </section>
      </div>
    </AppShell>
  );
};

export default CameraView;
