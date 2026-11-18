import { useEffect, useState } from "react";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  History,
  Pause,
  Play,
  SkipBack,
  SkipForward,
  Trophy,
} from "lucide-react";

import { GamePreview } from "./components/GamePreview";
import { Logo } from "./components/Logo";
import { Avatar, Badge, Notice, Spinner } from "./components/ui";
import { useLiveData } from "./hooks/useLiveData";
import { api } from "./lib/api";
import { formatDateTime, formatDuration } from "./lib/format";
import { describeMove } from "./lib/gameMoves";
import { findGameType } from "./lib/gameTypes";
import {
  REPLAY_INTERVAL_MS,
  clampMoveStep,
  replayStepLabel,
  shiftMoveStep,
} from "./lib/replay";
import { useNavigate } from "./router";
import { SIDE_LABEL, type RecordedGame, type User } from "./types";

interface Props {
  gameId: string;
}

const WINNER_TONE: Record<RecordedGame["winner"], string> = {
  red: "red",
  yellow: "yellow",
  draw: "draw",
};

function nameOf(users: Map<number, User>, id: number | null): string {
  if (id === null) return "lokal";
  return users.get(id)?.username ?? `#${id}`;
}

/**
 * Wiedergabe einer gespeicherten Partie unter `/replays/:id`.
 *
 * `step` zählt die bereits gezeigten Züge: 0 ist die Startstellung. Das Brett
 * bekommt nur diesen Teil des Verlaufs, die Spiellogik baut daraus die Stellung
 * auf. Bedienung per Tasten, Schieberegler, Zugsliste und automatischem
 * Abspielen. Alle Rollen dürfen zusehen; geschrieben wird nichts.
 */
const ReplayView: React.FC<Props> = ({ gameId }) => {
  const games = useLiveData(() => api.listGames());
  const gameTypes = useLiveData(() => api.getGameTypes());
  const users = useLiveData(() => api.getUsers());
  const navigate = useNavigate();

  const game = (games.data ?? []).find((candidate) => candidate.id === gameId) ?? null;
  const gameType =
    (gameTypes.data ?? []).find((candidate) => candidate.name === game?.gameType) ??
    findGameType(game?.gameType ?? "");
  const userMap = new Map((users.data ?? []).map((user) => [user.id, user]));

  const total = game?.moves.length ?? 0;
  const [rawStep, setStep] = useState(0);
  const [playing, setPlaying] = useState(false);

  // Der Verlauf kann durch Polling kürzer werden; beim Lesen bleibt der Schritt
  // im Rahmen, ohne dafür im Effekt zusätzlich State zu setzen.
  const step = clampMoveStep(rawStep, total);
  const isPlaying = playing && step < total;

  useEffect(() => {
    if (!isPlaying) return;
    const timer = window.setTimeout(() => {
      setStep((current) => shiftMoveStep(current, 1, total));
    }, REPLAY_INTERVAL_MS);
    return () => window.clearTimeout(timer);
  }, [isPlaying, step, total]);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.tagName === "INPUT" || target.tagName === "SELECT" || target.tagName === "TEXTAREA")
      ) {
        return;
      }

      switch (event.key) {
        case "ArrowLeft":
          event.preventDefault();
          setPlaying(false);
          setStep((current) => shiftMoveStep(current, -1, total));
          break;
        case "ArrowRight":
          event.preventDefault();
          setPlaying(false);
          setStep((current) => shiftMoveStep(current, 1, total));
          break;
        case "Home":
          event.preventDefault();
          setPlaying(false);
          setStep(0);
          break;
        case "End":
          event.preventDefault();
          setPlaying(false);
          setStep(total);
          break;
      }
    };

    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [total]);

  function togglePlaying(): void {
    if (total === 0) return;
    if (isPlaying) {
      setPlaying(false);
      return;
    }
    if (step >= total) setStep(0);
    setPlaying(true);
  }

  function jumpTo(next: number): void {
    setPlaying(false);
    setStep(clampMoveStep(next, total));
  }

  const title = gameType?.displayName ?? game?.gameType ?? "Wiedergabe";
  const subtitle = game?.sessionId
    ? `Sitzung ${game.sessionId}`
    : "Partie ohne Sitzung";

  let body: React.ReactNode;
  if (games.loading) {
    body = (
      <div className="window__center">
        <Spinner label="Wiedergabe wird geladen …" />
      </div>
    );
  } else if (games.error) {
    body = (
      <Notice
        tone="danger"
        title="Wiedergabe konnte nicht geladen werden"
        action={
          <button type="button" className="btn btn--sm btn--primary" onClick={() => navigate("/replays")}>
            <History aria-hidden="true" size={15} />
            Alle Verläufe
          </button>
        }
      >
        {games.error}
      </Notice>
    );
  } else if (!game) {
    body = (
      <Notice
        tone="warn"
        title="Wiedergabe nicht gefunden"
        action={
          <button type="button" className="btn btn--sm btn--primary" onClick={() => navigate("/replays")}>
            <History aria-hidden="true" size={15} />
            Alle Verläufe
          </button>
        }
      >
        Zur Kennung <code>{gameId}</code> gibt es keinen gespeicherten Spielverlauf. Vielleicht wurde die
        Partie entfernt.
      </Notice>
    );
  } else {
    const currentMove = step > 0 ? game.moves[step - 1] : null;
    const visibleMoves = game.moves.slice(0, step);
    const winnerLabel =
      game.winner === "draw" ? "Unentschieden" : `${SIDE_LABEL[game.winner]} gewinnt`;

    body = (
      <div className="replay">
        <section className="card replay__stage" aria-label="Wiedergabe">
          <GamePreview
            gameType={game.gameType}
            moves={visibleMoves}
            size="lg"
            activeMove={currentMove}
          />

          <div className="replay__status" aria-live="polite">
            <p className="replay__step">{replayStepLabel(step, total)}</p>
            {currentMove ? (
              <p className="replay__step-detail">
                <span
                  className={`side__dot side__dot--${currentMove.player}`}
                  aria-hidden="true"
                />
                {SIDE_LABEL[currentMove.player]} · {describeMove(game.gameType, currentMove)}
              </p>
            ) : (
              <p className="replay__step-detail">Noch kein Zug gespielt.</p>
            )}
          </div>

          <div className="replay__controls">
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              onClick={() => jumpTo(0)}
              disabled={step === 0}
              aria-label="Zum Anfang"
              title="Zum Anfang"
            >
              <SkipBack aria-hidden="true" size={15} />
            </button>
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              onClick={() => jumpTo(step - 1)}
              disabled={step === 0}
              aria-label="Ein Zug zurück"
              title="Ein Zug zurück"
            >
              <ChevronLeft aria-hidden="true" size={16} />
            </button>
            <button
              type="button"
              className="btn btn--primary btn--sm"
              onClick={togglePlaying}
              disabled={total === 0}
            >
              {isPlaying ? (
                <Pause aria-hidden="true" size={15} />
              ) : (
                <Play aria-hidden="true" size={15} />
              )}
              {isPlaying ? "Pause" : step >= total ? "Von vorn" : "Abspielen"}
            </button>
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              onClick={() => jumpTo(step + 1)}
              disabled={step >= total}
              aria-label="Ein Zug vor"
              title="Ein Zug vor"
            >
              <ChevronRight aria-hidden="true" size={16} />
            </button>
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              onClick={() => jumpTo(total)}
              disabled={step >= total}
              aria-label="Zum Endstand"
              title="Zum Endstand"
            >
              <SkipForward aria-hidden="true" size={15} />
            </button>
          </div>

          <label className="replay__scrubber">
            <span className="sr-only">Zug auswählen</span>
            <input
              type="range"
              min={0}
              max={total}
              step={1}
              value={step}
              disabled={total === 0}
              onChange={(event) => jumpTo(Number(event.target.value))}
            />
          </label>
          <p className="hint">
            Tastatur: Pfeil links und rechts schalten einen Zug, Home und End springen an den Rand.
          </p>
        </section>

        <aside className="replay__side">
          <section className="card panel" aria-labelledby="replay-moves-title">
            <header className="panel__head">
              <span className="panel__icon" aria-hidden="true">
                <History size={18} />
              </span>
              <div>
                <h2 className="panel__title" id="replay-moves-title">
                  Züge
                </h2>
                <p className="panel__subtitle">
                  {total} {total === 1 ? "Zug" : "Züge"} gespeichert
                </p>
              </div>
            </header>

            {total === 0 ? (
              <p className="text">Für diese Partie wurden keine Züge gespeichert.</p>
            ) : (
              <ol className="replay__moves">
                {game.moves.map((move, index) => {
                  const number = index + 1;
                  const current = number === step;
                  return (
                    <li key={`${move.turn}-${index}`}>
                      <button
                        type="button"
                        className={`replay__move${current ? " is-current" : ""}`}
                        aria-current={current ? "step" : undefined}
                        onClick={() => jumpTo(number)}
                      >
                        <span className="moves__turn">{number}.</span>
                        <span
                          className={`side__dot side__dot--${move.player}`}
                          aria-hidden="true"
                        />
                        <span className="moves__side">{SIDE_LABEL[move.player]}</span>
                        <span className="moves__cell">{describeMove(game.gameType, move)}</span>
                      </button>
                    </li>
                  );
                })}
              </ol>
            )}
          </section>

          <section className="card panel" aria-labelledby="replay-info-title">
            <header className="panel__head">
              <span className="panel__icon" aria-hidden="true">
                <Trophy size={18} />
              </span>
              <div>
                <h2 className="panel__title" id="replay-info-title">
                  Ergebnis
                </h2>
                <p className="panel__subtitle">{formatDateTime(game.playedAt)}</p>
              </div>
            </header>

            <p className="replay__winner">
              <Badge tone={WINNER_TONE[game.winner]}>{winnerLabel}</Badge>
              {game.demo ? <span className="chip chip--demo">Beispiel</span> : null}
              {game.friendly ? <span className="chip chip--friendly">Freundschaftsspiel</span> : null}
            </p>

            <ul className="replay__players">
              {(["red", "yellow"] as const).map((side) => {
                const id = game.players[side];
                const user = id === null ? undefined : userMap.get(id);
                return (
                  <li key={side}>
                    {user ? <Avatar user={user} /> : null}
                    <span className={`side__dot side__dot--${side}`} aria-hidden="true" />
                    <span className="replay__player-name">{nameOf(userMap, id)}</span>
                    <span className="replay__player-side">{SIDE_LABEL[side]}</span>
                  </li>
                );
              })}
            </ul>

            <dl className="game__stats">
              <div>
                <dt>Dauer</dt>
                <dd>{formatDuration(game.durationMs)}</dd>
              </div>
              <div>
                <dt>Züge</dt>
                <dd>{total}</dd>
              </div>
              <div>
                <dt>Sitzung</dt>
                <dd>
                  {game.sessionId ? <code>{game.sessionId}</code> : <span className="muted">ohne</span>}
                </dd>
              </div>
            </dl>
          </section>
        </aside>
      </div>
    );
  }

  return (
    <div className="window window--wide">
      <header className="window__header">
        <div className="window__brand">
          <Logo size={24} />
          <div>
            <p className="window__title">{title}</p>
            <p className="window__subtitle">Wiedergabe · {subtitle}</p>
          </div>
        </div>
        <div className="window__actions">
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => navigate("/replays")}>
            <History aria-hidden="true" size={15} />
            Alle Verläufe
          </button>
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => navigate("/")}>
            <ArrowLeft aria-hidden="true" size={15} />
            Zur Übersicht
          </button>
        </div>
      </header>

      <main className="window__main">{body}</main>
    </div>
  );
};

export default ReplayView;
