import React from "react";

import { WinOdds } from "./components/WinOdds";
import { useConnectFour } from "./useConnectFour";
import "./ConnectFour.css";

/**
 * Aktive Brettansicht mit Live-Gewinnchancen.
 *
 * `ConnectFour.tsx` und `useConnectFour.ts` sind aus früheren Aufgaben
 * eingefroren. Diese Ansicht übernimmt deshalb nur das unveränderte Markup des
 * Bretts, bindet aber den eingefrorenen Hook direkt ein, um an den Spielstand
 * für die Auswertung zu kommen. Die Klassen bleiben identisch, damit die
 * bestehenden Brett-Regeln aus `ConnectFour.css` weiter greifen.
 */
const ConnectFourGame: React.FC = () => {
  const { board, currentPlayer, winner, status, dropDisc, reset } = useConnectFour();

  return (
    <div className="c4-wrapper">
      <h1>Connect Four</h1>
      <p className="c4-status">{status}</p>

      <WinOdds board={board} currentPlayer={currentPlayer} winner={winner} />

      <div className="c4-board" role="grid" aria-label="Connect Four board">
        {board.map((row, rowIndex) =>
          row.map((cell, colIndex) => (
            <button
              key={`${rowIndex}-${colIndex}`}
              className={`c4-cell ${cell ?? ""}`}
              onClick={() => dropDisc(colIndex)}
              aria-label={`Row ${rowIndex + 1}, Column ${colIndex + 1}`}
              disabled={cell !== null}
            />
          ))
        )}
      </div>

      <button className="c4-reset" onClick={reset}>
        New Game
      </button>
    </div>
  );
};

export default ConnectFourGame;
