import { Ban, ChevronRight, Flag, Pause, Play, Trophy } from "lucide-react";

import { formatDuration, formatRelative } from "../lib/format";
import { useNow } from "../hooks/useNow";
import {
  SIDE_LABEL,
  outcomeLabel,
  playedMs,
  sessionStatus,
  statusLabel,
  type GameSession,
  type RecordedGame,
  type Side,
  type User,
} from "../types";
import { GamePreview } from "./GamePreview";
import { Avatar, Badge } from "./ui";

interface SessionCardProps {
  session: GameSession;
  game: RecordedGame | undefined;
  users: Map<number, User>;
  onOpen: (session: GameSession) => void;
  onAbort: (session: GameSession) => void;
  onPause: (session: GameSession) => void;
  onResume: (session: GameSession) => void;
}

const STATUS_TONE: Record<ReturnType<typeof sessionStatus>, string> = {
  running: "live",
  paused: "paused",
  finished: "done",
  aborted: "stopped",
};

function nameOf(users: Map<number, User>, id: number | null | undefined): string {
  if (id === null || id === undefined) return "offen";
  return users.get(id)?.username ?? `#${id}`;
}

function Seat({ side, userId, users }: { side: Side; userId: number; users: Map<number, User> }) {
  const user = users.get(userId);
  return (
    <span className="seat">
      <span className={`side__dot side__dot--${side}`} aria-hidden="true" />
      {user ? <Avatar user={user} /> : null}
      <span className="seat__name">{nameOf(users, userId)}</span>
      <span className="seat__side">{SIDE_LABEL[side]}</span>
    </span>
  );
}

export function SessionCard({ session, game, users, onOpen, onAbort, onPause, onResume }: SessionCardProps) {
  const status = sessionStatus(session);
  const running = status === "running";
  const paused = status === "paused";
  const open = session.outcome === null;
  const host = users.get(session.hostId);
  // Läuft die Sitzung noch, wandert die Uhr im Viertelminutentakt mit.
  const now = useNow(running ? 15_000 : 60_000);
  const elapsed = playedMs(session, now);

  return (
    <li className="card session">
      <div className="session__top">
        <div>
          <p className="session__id">
            <code>{session.id}</code>
            {session.demo ? <span className="chip chip--demo">Beispiel</span> : null}
          </p>
          <p className="session__meta">
            {host ? `Host: ${host.username}` : "Host: unbekannt"} · {formatRelative(session.createdAt)}
          </p>
        </div>
        <Badge tone={STATUS_TONE[status]}>
          {running ? <span className="pulse" aria-hidden="true" /> : null}
          {paused ? <Pause aria-hidden="true" size={12} /> : null}
          {statusLabel(status)}
        </Badge>
      </div>

      <div className="session__seats">
        <Seat side="red" userId={session.players.red} users={users} />
        <span className="session__versus" aria-hidden="true">
          gegen
        </span>
        <Seat side="yellow" userId={session.players.yellow} users={users} />
      </div>

      {session.outcome !== null ? (
        <p className={`session__outcome session__outcome--${session.outcome}`}>
          <Trophy aria-hidden="true" size={15} />
          {outcomeLabel(session.outcome)}
          {session.abortReason === "surrender" && session.surrenderedBy !== null ? (
            <span className="session__reason">Aufgabe von {nameOf(users, session.surrenderedBy)}</span>
          ) : null}
          {session.abortReason === "host" ? <span className="session__reason">vom Host beendet</span> : null}
        </p>
      ) : null}

      {game ? (
        <details className="session__details">
          <summary>
            <Flag aria-hidden="true" size={14} />
            Spielverlauf ({game.moves.length} Züge)
            <ChevronRight aria-hidden="true" className="session__chevron" size={15} />
          </summary>
          <div className="session__details-body">
            <GamePreview moves={game.moves} size="md" />
            <ol className="moves">
              {game.moves.map((move) => (
                <li key={move.turn} className={`moves__item moves__item--${move.player}`}>
                  <span className="moves__turn">{move.turn}.</span>
                  <span className={`side__dot side__dot--${move.player}`} aria-hidden="true" />
                  <span className="moves__side">{SIDE_LABEL[move.player]}</span>
                  <span className="moves__cell">
                    Spalte {move.location.x + 1}, Reihe {move.location.y + 1}
                  </span>
                </li>
              ))}
            </ol>
          </div>
        </details>
      ) : null}

      <div className="session__footer">
        <p className="session__duration">
          Dauer {formatDuration(elapsed)}
          {paused ? " · pausiert" : ""}
        </p>
        <div className="session__actions">
          {open ? (
            <>
              <button type="button" className="btn btn--primary btn--sm" onClick={() => onOpen(session)}>
                <Play aria-hidden="true" size={15} />
                Spielfeld öffnen
              </button>
              {paused ? (
                <button type="button" className="btn btn--ghost btn--sm" onClick={() => onResume(session)}>
                  <Play aria-hidden="true" size={15} />
                  Fortsetzen
                </button>
              ) : (
                <button type="button" className="btn btn--ghost btn--sm" onClick={() => onPause(session)}>
                  <Pause aria-hidden="true" size={15} />
                  Pausieren
                </button>
              )}
              <button type="button" className="btn btn--danger-ghost btn--sm" onClick={() => onAbort(session)}>
                <Ban aria-hidden="true" size={15} />
                Beenden
              </button>
            </>
          ) : null}
        </div>
      </div>
    </li>
  );
}
