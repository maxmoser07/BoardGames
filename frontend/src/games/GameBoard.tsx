import { Notice } from "../components/ui";
import type { GameType } from "../types";
import { ChessGame } from "./ChessGame";
import { GridGame } from "./GridGame";
import { MemoryGame } from "./MemoryGame";
import { MenschGame } from "./MenschGame";
import type { GameContext } from "./types";
import "./games.css";

interface GameBoardProps {
  game: GameType;
  context: GameContext;
}

/**
 * Waehlt das Brett anhand der Engine-Vorlage aus `game_types.rules_json`.
 * Vier Gewinnt laeuft weiter ueber die eingefrorene Komponente und kommt hier
 * nur als generische Vorlage fuer neue Spiele vor.
 */
export function GameBoard({ game, context }: GameBoardProps) {
  switch (game.engine) {
    case "grid":
    case "connect-four":
      return <GridGame game={game} context={context} />;
    case "memory":
      return <MemoryGame context={context} />;
    case "chess":
      return <ChessGame context={context} />;
    case "mensch":
      return <MenschGame context={context} />;
    default:
      return (
        <Notice tone="warn" title="Kein Brett">
          Fuer das Spiel <code>{game.name}</code> gibt es noch keine Spielflaeche. Lege im
          Spiel-Editor eine Logik-Vorlage fest.
        </Notice>
      );
  }
}
