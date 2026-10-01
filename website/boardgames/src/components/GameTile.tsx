import { ArrowRight, Lock, Users } from "lucide-react";

import { formatRelative } from "../lib/format";
import type { GameType } from "../types";
import { GameArt } from "./GameArt";
import { Badge } from "./ui";

export interface GameTally {
  games: number;
  sessions: number;
  lastPlayed: string | null;
}

interface GameTileProps {
  game: GameType;
  tally: GameTally;
  onOpen: (game: GameType) => void;
}

/** Kachel im Spielekatalog: einen Blick aufs Spiel, Klick führt zu den Einstellungen. */
export function GameTile({ game, tally, onOpen }: GameTileProps) {
  return (
    <li className="tile" data-accent={game.accent} data-playable={game.implemented}>
      <button type="button" className="tile__button" onClick={() => onOpen(game)}>
        <GameArt game={game} size="md" />

        <div className="tile__body">
          <div className="tile__head">
            <h3 className="tile__title">{game.displayName}</h3>
            {game.implemented ? (
              <Badge tone="live">spielbar</Badge>
            ) : (
              <Badge tone="locked">
                <Lock aria-hidden="true" size={12} />
                in Arbeit
              </Badge>
            )}
          </div>

          <p className="tile__tagline">{game.tagline}</p>

          <p className="tile__description">{game.description}</p>
        </div>

        <div className="tile__foot">
          <span className="tile__facts">
            <span className="tile__fact">
              <Users aria-hidden="true" size={14} />
              {game.maxPlayers} Spieler:innen
            </span>
            {game.board ? (
              <span className="tile__fact">
                {game.board.cols}×{game.board.rows}
              </span>
            ) : null}
            {tally.games > 0 ? (
              <span className="tile__fact">
                {tally.games} {tally.games === 1 ? "Partie" : "Partien"}
              </span>
            ) : null}
          </span>

          <span className="tile__cta">
            {game.implemented ? "Einrichten" : "Mehr erfahren"}
            <ArrowRight aria-hidden="true" size={16} />
          </span>
        </div>

        {tally.lastPlayed ? (
          <p className="tile__last">Zuletzt gespielt {formatRelative(tally.lastPlayed)}</p>
        ) : null}
      </button>
    </li>
  );
}