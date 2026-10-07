import { useEffect, useState } from "react";
import { Ban, Flag, LayoutGrid, Pause, Play, RotateCcw, Trophy } from "lucide-react";

import ConnectFour from "./ConnectFour";
import { GamePreview } from "./components/GamePreview";
import { Logo } from "./components/Logo";
import { Avatar, Badge, Notice, Spinner } from "./components/ui";
import { useLiveData } from "./hooks/useLiveData";
import { useNow } from "./hooks/useNow";
import { usePausedTime } from "./hooks/usePausedTime";
import { ApiError, api } from "./lib/api";
import { formatDateTime, formatDuration } from "./lib/format";
import { installGameResultEndpoint } from "./lib/gameResultEndpoint";
import { useNavigate } from "./router";
import {
  SIDE_LABEL,
  opponent,
  outcomeLabel,
  playedMs,
  sessionStatus,
  statusLabel,
  type GameSession,
  type RecordedGame,
  type Side,
  type User,
} from "./types";

interface Props {
  sessionId: string;
}

const STATUS_TONE: Record<ReturnType<typeof sessionStatus>, string> = {
  running: "live",
  paused: "paused",
  finished: "done",
  aborted: "stopped",
};

function nameOf(users: Map<number, User>, id: number): string {
  return users.get(id)?.username ?? `#${id}`;
}

/**
 * Spielfeld-Fenster, geöffnet als Pop-up unter `/connectfour/:id`.
 *
 * Die Komponente wird vom Router mit `key={sessionId}` eingebunden, damit ein
 * Wechsel zu einer anderen Sitzung (Neue Partie) den Brettzustand neu aufbaut.
 */
export const GameSessionWindow: React.FC<Props> = ({ sessionId }) => {
  const users = useLiveData(() => api.getUsers());
  const session = useLiveData(() => api.getSession(sessionId));
  const navigate = useNavigate();

  const userMap = new Map((users.data ?? []).map((user) => [user.id, user]));
  const loaded = session.data ?? null;

  return (
    <div className="window">
      <header className="window__header">
        <div className="window__brand">
          <Logo size={24} />
          <div>
            <p className="window__title">Vier Gewinnt</p>
            <p className="window__subtitle">
              Sitzung <code>{sessionId}</code>
            </p>
          </div>
        </div>
        {loaded ? (
          <Badge tone={STATUS_TONE[sessionStatus(loaded)]}>
            {sessionStatus(loaded) === "running" ? <span className="pulse" aria-hidden="true" /> : null}
            {sessionStatus(loaded) === "paused" ? <Pause aria-hidden="true" size={12} /> : null}
            {statusLabel(sessionStatus(loaded))}
          </Badge>
        ) : null}
      </header>

      <main className="window__main">
        {session.loading ? (
          <div className="window__center">
            <Spinner label="Sitzung wird geladen …" />
          </div>
        ) : session.error ? (
          <Notice tone="danger" title="Sitzung konnte nicht geladen werden">
            {session.error}
          </Notice>
        ) : !loaded ? (
          <Notice
            tone="warn"
            title={`Sitzung ${sessionId} ist unbekannt`}
            action={
              <button type="button" className="btn btn--sm btn--primary" onClick={() => navigate("/")}>
                Zur Übersicht
              </button>
            }
          >
            Sitzung <code>{sessionId}</code> gibt es nicht (mehr). Vielleicht wurde sie
            entfernt, oder die Adresse stammt aus einem anderen System.
          </Notice>
        ) : (
          <SessionBody session={loaded} users={userMap} />
        )}
      </main>
    </div>
  );
};

interface SessionBodyProps {
  session: GameSession;
  users: Map<number, User>;
}

/**
 * Brett plus Sitzungsverwaltung. Solange die Sitzung läuft, steuert
 * `ConnectFour` (und damit der eingefrorene `useConnectFour`) das Spiel; sobald
 * die Sitzung einen Ausgang hat, zeigt das Fenster das Endergebnis.
 */
function SessionBody({ session, users }: SessionBodyProps) {
  const games = useLiveData(() => api.listGames());
  const navigate = useNavigate();
  const [feedback, setFeedback] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const open = session.outcome === null;
  const paused = session.pausedAt !== null;
  const running = open && !paused;
  const game: RecordedGame | undefined = (games.data ?? []).find((candidate) => candidate.id === session.gameId);
  const now = useNow(running ? 1000 : 60_000);

  // Pausen, die vor diesem Fenster liefen, kennt nur die Datenbank. Die Brücke
  // braucht sie, um beim Speichern die echte Spielzeit zu berechnen.
  const pausedTotal = usePausedTime(session, now);

  // `useConnectFour` meldet das fertige Spiel per POST an
  // /api/connect-four/games. Die Brücke ergänzt Sitzungs-Id und Spielzeit, der
  // Auftrag landet in der Datenbank.
  useEffect(
    () =>
      installGameResultEndpoint({
        sessionId: session.id,
        players: { ...session.players },
        startedAt: Date.parse(session.createdAt),
        pausedMs: pausedTotal,
      }),
    [session.id, session.createdAt, session.players, pausedTotal],
  );

  async function run(action: () => Promise<unknown>, failure: string): Promise<void> {
    setBusy(true);
    try {
      await action();
      setFeedback(null);
    } catch (cause) {
      setFeedback(cause instanceof ApiError ? cause.message : failure);
    } finally {
      setBusy(false);
    }
  }

  const handlePause = () => {
    void run(() => api.pauseSession(session.id), "Sitzung konnte nicht pausiert werden.");
  };

  const handleResume = () => {
    void run(() => api.resumeSession(session.id), "Sitzung konnte nicht fortgesetzt werden.");
  };

  const handleAbort = () => {
    if (window.confirm(`Sitzung ${session.id} beenden?`)) {
      void run(() => api.abortSession(session.id), "Sitzung konnte nicht beendet werden.");
    }
  };

  const handleSurrender = (side: Side) => {
    const userId = session.players[side];
    if (window.confirm(`${nameOf(users, userId)} gibt auf – ${SIDE_LABEL[opponent(side)]} gewinnt. Fortfahren?`)) {
      void run(() => api.surrenderSession(session.id, userId), "Aufgabe konnte nicht registriert werden.");
    }
  };

  const handleRematch = () => {
    void run(async () => {
      const next = await api.createSession({
        gameType: session.gameType,
        hostId: session.hostId,
        players: { ...session.players },
      });
      navigate(`/connectfour/${next.id}`);
    }, "Neue Sitzung konnte nicht angelegt werden.");
  };

  const elapsed = playedMs(session, now);

  return (
    <>
      <section className="window__players" aria-label="Teilnehmende">
        {(["red", "yellow"] as const).map((side) => {
          const user = users.get(session.players[side]);
          return (
            <div className={`player player--${side}`} key={side}>
              {user ? <Avatar user={user} /> : <span className="avatar">?</span>}
              <div>
                <p className="player__name">{nameOf(users, session.players[side])}</p>
                <p className="player__player-side">
                  <span className={`side__dot side__dot--${side}`} aria-hidden="true" />
                  {SIDE_LABEL[side]} · {side === "red" ? "beginnt" : "antwortet"}
                </p>
              </div>
            </div>
          );
        })}
      </section>

      {feedback ? <Notice tone="danger">{feedback}</Notice> : null}

      {/* Das Brett gehört zur offenen Sitzung. Ist sie beendet, zeigt
          `ResultPanel` stattdessen die Endposition – sonst stünden hier Brett
          (inkl. „New Game“) und Ergebnis nebeneinander. */}
      {open ? (
        <>
          {paused ? (
            <Notice tone="warn" title="Sitzung pausiert">
              Das Brett ist gesperrt, bis sie fortgesetzt wird. Die Spielzeit läuft nicht weiter.
            </Notice>
          ) : (
            <p className="window__hint">
              Beide Personen spielen abwechselnd in diesem Fenster · läuft seit{" "}
              <strong>{formatDuration(elapsed)}</strong>
            </p>
          )}

          {/* `ConnectFour` ist eingefroren und bietet keine Sperre. Solange
              pausiert ist, wird das Brett gar nicht erst eingebunden – sonst
              könnten weiter Züge fallen, die niemand sehen kann. Beim
              Fortsetzen kommt es mit `key` neu und verliert seinen Stand;
              deshalb bleibt die Sitzung hier bewusst bestehen und wir bitten um
              einen Neustart statt um einen leeren Brettzustand. */}
          {/* `ConnectFour` ist eingefroren: es kennt weder Pause noch Sperre,
              und der Brettzustand liegt in `useConnectFour`. Deshalb bleibt das
              Brett eingebunden – sonst ginge der Spielstand verloren – und wird
              von außen gesperrt:
              `inert` nimmt Tastatur- und Zeigereingaben vollständig zurück
              (die Zellen sind echte Buttons, ein Blende allein genügt nicht),
              die Deckschicht macht den Zustand sichtbar. */}
          <div className="board" data-paused={paused}>
            <div className="board__panel" inert={paused || undefined}>
              <ConnectFour key={session.id} />
            </div>
            {paused ? (
              <div className="board__veil" aria-hidden="true">
                <span className="board__veil-label">
                  <Pause size={15} />
                  Pausiert
                </span>
              </div>
            ) : null}
          </div>

          <div className="window__controls">
            {paused ? (
              <button type="button" className="btn btn--primary btn--sm" onClick={handleResume} disabled={busy}>
                <Play aria-hidden="true" size={15} />
                Fortsetzen
              </button>
            ) : (
              <button type="button" className="btn btn--ghost btn--sm" onClick={handlePause} disabled={busy}>
                <Pause aria-hidden="true" size={15} />
                Pausieren
              </button>
            )}

            <button type="button" className="btn btn--danger-ghost btn--sm" onClick={handleAbort} disabled={busy}>
              <Ban aria-hidden="true" size={15} />
              Sitzung beenden
            </button>

            {(["red", "yellow"] as const).map((side) => (
              <button
                key={side}
                type="button"
                className="btn btn--ghost btn--sm"
                onClick={() => handleSurrender(side)}
                disabled={busy}
              >
                <Flag aria-hidden="true" size={15} />
                {SIDE_LABEL[side]} gibt auf
              </button>
            ))}
          </div>
        </>
      ) : (
        <ResultPanel
          session={session}
          game={game}
          users={users}
          elapsed={elapsed}
          busy={busy}
          onRematch={handleRematch}
          onBack={() => navigate("/")}
        />
      )}
    </>
  );
}

interface ResultPanelProps {
  session: GameSession;
  game: RecordedGame | undefined;
  users: Map<number, User>;
  elapsed: number;
  busy: boolean;
  onRematch: () => void;
  onBack: () => void;
}

function ResultPanel({ session, game, users, elapsed, busy, onRematch, onBack }: ResultPanelProps) {
  return (
    <section className="result" aria-label="Ergebnis">
      <p className="result__headline">
        <Trophy aria-hidden="true" size={18} />
        {outcomeLabel(session.outcome ?? "draw")}
      </p>

      <div className="result__body">
        {game ? (
          <GamePreview moves={game.moves} size="md" />
        ) : (
          <p className="result__note">
            {session.abortReason === "surrender" && session.surrenderedBy !== null
              ? `${nameOf(users, session.surrenderedBy)} hat aufgegeben.`
              : "Die Sitzung wurde beendet, bevor eine Partie abgeschlossen war."}
          </p>
        )}

        <dl className="result__stats">
          <div>
            <dt>Gestartet</dt>
            <dd>{formatDateTime(session.createdAt)}</dd>
          </div>
          <div>
            <dt>Dauer</dt>
            <dd>{formatDuration(elapsed)}</dd>
          </div>
          {game ? (
            <div>
              <dt>Züge</dt>
              <dd>{game.moves.length}</dd>
            </div>
          ) : null}
        </dl>
      </div>

      <div className="result__actions">
        <button type="button" className="btn btn--primary btn--sm" onClick={onRematch} disabled={busy}>
          <RotateCcw aria-hidden="true" size={15} />
          Neue Partie
        </button>
        <button type="button" className="btn btn--ghost btn--sm" onClick={onBack}>
          <LayoutGrid aria-hidden="true" size={15} />
          Zur Übersicht
        </button>
      </div>
    </section>
  );
}

export default GameSessionWindow;
