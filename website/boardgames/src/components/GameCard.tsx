import { Dices } from "lucide-react";

import { formatDateTime, formatDuration } from "../lib/format";
import { summariseMoves } from "../lib/connectFour";
import { SIDE_LABEL, type GameSession, type RecordedGame, type User } from "../types";
import { GamePreview } from "./GamePreview";
import { Badge } from "./ui";

interface GameCardProps {
  game: RecordedGame;
  /** Sitzung, aus der die Partie stammt – optional, wenn nur der Verlauf zählt. */
  session?: GameSession;
  users: Map<number, User>;
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

/** Ein abgeschlossener Spielverlauf in der Ergebnishistorie. */
export function GameCard({ game, session, users }: GameCardProps) {
  const counts = summariseMoves(game.moves);
  const label = game.winner === "draw" ? "Unentschieden" : `${SIDE_LABEL[game.winner]} gewinnt`;

  return (
    <li className="card game">
      <GamePreview moves={game.moves} />

      <div className="game__body">
        <p className="game__headline">
          <Badge tone={WINNER_TONE[game.winner]}>{label}</Badge>
          {game.demo ? <span className="chip chip--demo">Beispiel</span> : null}
        </p>

        <p className="game__players">
          <span className="seat">
            <span className="side__dot side__dot--red" aria-hidden="true" />
            {nameOf(users, game.players.red)}
          </span>
          <span className="session__versus" aria-hidden="true">
            gegen
          </span>
          <span className="seat">
            <span className="side__dot side__dot--yellow" aria-hidden="true" />
            {nameOf(users, game.players.yellow)}
          </span>
        </p>

        <dl className="game__stats">
          <div>
            <dt>Züge</dt>
            <dd>
              {game.moves.length} · {counts.red}/{counts.yellow}
            </dd>
          </div>
          <div>
            <dt>Dauer</dt>
            <dd>{formatDuration(game.durationMs)}</dd>
          </div>
          <div>
            <dt>Wann</dt>
            <dd>{formatDateTime(game.playedAt)}</dd>
          </div>
          <div>
            <dt>Sitzung</dt>
            <dd>{session ? <code>{session.id}</code> : <span className="muted">direkt gespielt</span>}</dd>
          </div>
        </dl>
      </div>

      {session ? (
        <span className="game__link" title={`Sitzung ${session.id}`}>
          <Dices aria-hidden="true" size={15} />
        </span>
      ) : null}
    </li>
  );
}
