import { useMemo } from "react";

import { buildGrid } from "../lib/connectFour";
import { SIDE_LABEL, type ConnectFourMove, type Side } from "../types";

interface GamePreviewProps {
  moves: ConnectFourMove[];
  /** CSS-Klasse für die Größe, Standard ist die kleine Variante. */
  size?: "sm" | "md";
}

/**
 * Miniaturbrett aus einem gespeicherten Spielverlauf. Rein lesend – die
 * eigentliche Spielfeldlogik liegt ausschließlich in `useConnectFour.ts`.
 */
export function GamePreview({ moves, size = "sm" }: GamePreviewProps) {
  const grid = useMemo(() => buildGrid(moves), [moves]);
  const counts: Record<Side, number> = {
    red: moves.filter((move) => move.player === "red").length,
    yellow: moves.filter((move) => move.player === "yellow").length,
  };

  return (
    <div className={`preview preview--${size}`}>
      <div
        className="preview__grid"
        role="img"
        aria-label={`Spielstand nach ${moves.length} Zügen: ${SIDE_LABEL.red} ${counts.red}, ${SIDE_LABEL.yellow} ${counts.yellow}`}
      >
        {grid.map((row, y) =>
          row.map((cell, x) => (
            // Rasterposition ist hier die Identität – die Zellen ändern sich nie.
            <span key={`${x}-${y}`} className={`preview__cell${cell ? ` preview__cell--${cell}` : ""}`} />
          )),
        )}
      </div>
      <p className="preview__legend">
        <span className={`side__dot side__dot--red`} aria-hidden="true" />
        {counts.red}
        <span className={`side__dot side__dot--yellow`} aria-hidden="true" />
        {counts.yellow}
      </p>
    </div>
  );
}
