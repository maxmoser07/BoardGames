import React from "react";
import { useConnectFour } from "./useConnectFour";
import "./ConnectFour.css";

const ConnectFour: React.FC = () => {
  const { board, status, dropDisc, reset } = useConnectFour();

  return (
    <div className="c4-wrapper">
      <h1>Connect Four</h1>
      <p className="c4-status">{status}</p>

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

export default ConnectFour;