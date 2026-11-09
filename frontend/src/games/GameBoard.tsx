import { Notice } from "../components/ui";
import { ChessGame } from "./ChessGame";
import { MemoryGame } from "./MemoryGame";
import { MenschGame } from "./MenschGame";
import { TicTacToeGame } from "./TicTacToeGame";
import type { GameContext } from "./types";
import "./games.css";

interface GameBoardProps {
  gameType: string;
  context: GameContext;
}

/**
 * Waehlt das Brett zum Spielnamen. Connect Four laeuft weiter ueber die
 * eingefrorene Komponente und kommt hier nicht vor.
 */
export function GameBoard({ gameType, context }: GameBoardProps) {
  switch (gameType) {
    case "tictactoe":
      return <TicTacToeGame context={context} />;
    case "memory":
      return <MemoryGame context={context} />;
    case "schach":
      return <ChessGame context={context} />;
    case "mensch-aergere-dich-nicht":
      return <MenschGame context={context} />;
    default:
      return (
        <Notice tone="warn" title="Kein Brett">
          Fuer das Spiel <code>{gameType}</code> gibt es noch keine Spielflaeche.
        </Notice>
      );
  }
}
