/**
 * Live-Feedback und Zuganalyse der Kamera-Ansicht.
 *
 * Links steht das Kamerabild, hier werden die ausgewerteten Frames, die
 * Konfidenz der Erkennung, unmittelbare Drohungen und die Qualität der letzten
 * erkannten Züge gezeigt. Die Berechnung liegt in `lib/cameraAnalysis.ts`; diese
 * Komponente ist nur Darstellung.
 */

import { useMemo } from "react";
import { AlertTriangle, CheckCircle2, Gauge, ScanLine, Target, TrendingUp } from "lucide-react";

import type { BoardObservation, BoardState, TrackedMove } from "../lib/camera/types";
import {
  assessMoves,
  describeDetection,
  MOVE_GRADE_LABEL,
  summariseMoves,
  threatColumns,
  type MoveGrade,
} from "../lib/cameraAnalysis";
import { useNow } from "../hooks/useNow";
import type { Side } from "../types";

type Tone = "red" | "yellow" | "green";

interface Props {
  board: BoardState;
  /** Brett vor dem ersten erkannten Zug; `null`, solange nicht kalibriert. */
  startBoard: BoardState | null;
  moves: readonly TrackedMove[];
  observation: BoardObservation | null;
  frames: number;
  lastUpdateAt: number | null;
  currentPlayer: Side;
  winner: Side | "draw" | null;
  labels: Record<Side, string>;
  tones: Record<Side, Tone>;
}

const GRADES: readonly MoveGrade[] = ["best", "good", "inaccuracy", "blunder"];

function agoLabel(ms: number | null): string {
  if (ms === null) return "–";
  if (ms < 1000) return "jetzt";
  return `${Math.round(ms / 1000)} s`;
}

function percent(value: number | null): string {
  return value === null ? "–" : `${Math.round(value * 100)} %`;
}

export function CameraAnalysis({
  board,
  startBoard,
  moves,
  observation,
  frames,
  lastUpdateAt,
  currentPlayer,
  winner,
  labels,
  tones,
}: Props) {
  const now = useNow(1000);
  const detection = useMemo(
    () => describeDetection(observation, frames, lastUpdateAt, now),
    [observation, frames, lastUpdateAt, now],
  );
  const assessments = useMemo(
    () =>
      assessMoves(moves, {
        maxMoves: 10,
        samples: 72,
        startBoard: startBoard ?? undefined,
      }),
    [moves, startBoard],
  );
  const summary = useMemo(() => summariseMoves(assessments), [assessments]);
  const threats = useMemo(() => threatColumns(board, currentPlayer), [board, currentPlayer]);
  const latest = assessments.length === 0 ? null : assessments[assessments.length - 1];

  const threatLabel =
    winner !== null
      ? winner === "draw"
        ? "Die Partie ist mit einem Unentschieden beendet."
        : `${labels[winner]} hat die Partie gewonnen.`
      : threats.mine.length > 0
        ? `Sofortsieg für ${labels[currentPlayer]} in Spalte ${threats.mine.map((col) => col + 1).join(", ")}.`
        : threats.theirs.length > 0
          ? `${labels[currentPlayer === "red" ? "yellow" : "red"]} droht in Spalte ${threats.theirs
              .map((col) => col + 1)
              .join(", ")} – blockieren.`
          : "Keine unmittelbare Vierer-Drohung auf dem Brett.";

  return (
    <section className="card panel camera-analysis" aria-labelledby="camera-analysis-title">
      <header className="panel__head">
        <span className="panel__icon" aria-hidden="true">
          <ScanLine size={18} />
        </span>
        <div>
          <h2 className="panel__title" id="camera-analysis-title">
            Live-Feedback &amp; Analyse
          </h2>
          <p className="panel__subtitle">
            Erkennungsqualität, Drohungen und die Bewertung der letzten Züge
          </p>
        </div>
      </header>

      <div className={`camera-feedback camera-feedback--${detection.state}`} role="status">
        <span className="camera-feedback__icon" aria-hidden="true">
          {detection.state === "stable" ? (
            <CheckCircle2 size={17} />
          ) : detection.state === "waiting" ? (
            <Gauge size={17} />
          ) : (
            <AlertTriangle size={17} />
          )}
        </span>
        <div className="camera-feedback__text">
          <strong>{detection.label}</strong>
          <span>{detection.detail}</span>
        </div>
        <span className="camera-feedback__age" title="Alter des letzten ausgewerteten Frames">
          {agoLabel(detection.lastFrameAgoMs)}
        </span>
      </div>

      <dl className="camera-metrics">
        <div>
          <dt>Bilder</dt>
          <dd>{frames}</dd>
        </div>
        <div>
          <dt>Konfidenz</dt>
          <dd>{percent(detection.confidence)}</dd>
        </div>
        <div>
          <dt>Unsicher</dt>
          <dd>
            {detection.uncertainCells}/{detection.totalCells}
          </dd>
        </div>
        <div>
          <dt>Letztes Bild</dt>
          <dd>{agoLabel(detection.lastFrameAgoMs)}</dd>
        </div>
      </dl>

      <p className={`camera-threat${winner === null && (threats.mine.length > 0 || threats.theirs.length > 0) ? " is-alert" : ""}`}>
        {winner === null && (threats.mine.length > 0 || threats.theirs.length > 0) ? (
          <Target aria-hidden="true" size={15} />
        ) : (
          <TrendingUp aria-hidden="true" size={15} />
        )}
        {threatLabel}
      </p>

      <div className="camera-analysis__moves">
        <div className="camera-analysis__head">
          <h3 className="camera-moves__title">Zugqualität</h3>
          {assessments.length > 0 ? (
            <span className="badge badge--done">{summary.accuracy} % Genauigkeit</span>
          ) : null}
        </div>

        {assessments.length === 0 ? (
          <p className="camera-hint">
            Sobald der erste Stein erkannt ist, erscheint hier die Bewertung der Züge.
          </p>
        ) : (
          <>
            <div className="camera-grade-summary" aria-label="Verteilung der Zugqualität">
              {GRADES.map((grade) => (
                <span className={`camera-grade camera-grade--${grade}`} key={grade}>
                  <strong>{summary[grade]}</strong> {MOVE_GRADE_LABEL[grade]}
                </span>
              ))}
            </div>

            {latest !== null ? (
              <p className="camera-analysis__latest">
                <span
                  className={`camera-dot camera-dot--${tones[latest.side]}`}
                  aria-hidden="true"
                />
                Letzter Zug: {labels[latest.side]} in Spalte {latest.column + 1} ·{" "}
                <strong className={`camera-grade-text camera-grade-text--${latest.grade}`}>
                  {latest.label}
                </strong>
              </p>
            ) : null}

            <ol className="camera-assessments">
              {assessments
                .slice()
                .reverse()
                .map((assessment) => (
                  <li className="camera-assessment" key={assessment.turn}>
                    <span className="camera-assessment__move">
                      <span
                        className={`camera-dot camera-dot--${tones[assessment.side]}`}
                        aria-hidden="true"
                      />
                      Zug {assessment.turn} · Spalte {assessment.column + 1}
                    </span>
                    <span className="camera-assessment__odds">
                      {assessment.playedChance} %
                      {assessment.bestColumn !== null &&
                      assessment.bestColumn !== assessment.column ? (
                        <span>
                          {" "}
                          statt {assessment.bestChance} % (Spalte {assessment.bestColumn + 1})
                        </span>
                      ) : null}
                    </span>
                    <span className={`camera-grade camera-grade--${assessment.grade}`}>
                      {assessment.label}
                    </span>
                  </li>
                ))}
            </ol>
          </>
        )}
      </div>

      <p className="camera-hint">
        Bewertet mit {assessments.length > 0 ? "Monte-Carlo-Simulationen" : "Monte-Carlo"} ab der
        Stellung vor jedem Zug – eine Orientierung, keine Garantie.
      </p>
    </section>
  );
}
