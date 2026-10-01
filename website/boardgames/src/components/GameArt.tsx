import type { SVGProps } from "react";
import { LayoutGrid } from "lucide-react";

import type { GameType } from "../types";

/**
 * Symbol eines Spiels im Katalog. Bewusst schematisch statt fotorealistisch:
 * die Kacheln sollen auf einen Blick unterscheidbar sein, ohne dass hier
 * Bildmaterial für sechs Spiele gepflegt werden muss.
 */

type MarkProps = SVGProps<SVGSVGElement>;

function ConnectFourMark(props: MarkProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" {...props}>
      <rect x="2" y="3" width="20" height="18" rx="3" strokeWidth="1.6" />
      <circle cx="8" cy="9" r="2.6" strokeWidth="1.6" />
      <circle cx="16" cy="9" r="2.6" strokeWidth="1.6" />
      <circle cx="8" cy="15" r="2.6" strokeWidth="1.6" />
      <circle cx="16" cy="15" r="2.6" strokeWidth="1.6" />
    </svg>
  );
}

function TicTacToeMark(props: MarkProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" {...props}>
      <rect x="3" y="3" width="18" height="18" rx="2.5" strokeWidth="1.6" />
      <path d="M9 3v18M15 3v18M3 9h18M3 15h18" strokeWidth="1.4" />
    </svg>
  );
}

function MemoryMark(props: MarkProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" {...props}>
      <rect x="3" y="5" width="8" height="14" rx="2" strokeWidth="1.6" />
      <rect x="13" y="5" width="8" height="14" rx="2" strokeWidth="1.6" />
      <circle cx="7" cy="12" r="1.7" strokeWidth="1.5" />
      <path d="M15 10.5l1.6 1.6 2.8-2.8" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ChessMark(props: MarkProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" {...props}>
      <path
        d="M12 3v3M9 6h6M10 6v4l-3 4v5h10v-5l-3-4V6"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M6 21h12" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function AngryOrangeMark(props: MarkProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" {...props}>
      <rect x="3" y="4" width="8" height="14" rx="2" strokeWidth="1.6" />
      <rect x="13" y="6" width="8" height="12" rx="2" strokeWidth="1.6" />
      <path d="M5.5 8.5h3" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function HalmaMark(props: MarkProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" {...props}>
      <path d="M12 3l4 5-4 4-4-4z" strokeWidth="1.6" strokeLinejoin="round" />
      <circle cx="6" cy="17" r="2.4" strokeWidth="1.6" />
      <circle cx="12" cy="17" r="2.4" strokeWidth="1.6" />
      <circle cx="18" cy="17" r="2.4" strokeWidth="1.6" />
      <path d="M8.4 17h1.2M14.4 17h1.2" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

const MARKS: Record<string, (props: MarkProps) => React.JSX.Element> = {
  "connect-four": ConnectFourMark,
  tictactoe: TicTacToeMark,
  memory: MemoryMark,
  schach: ChessMark,
  "mensch-aergere-dich-nicht": AngryOrangeMark,
  halma: HalmaMark,
};

/** Kachel-Symbol eines Spiels; unbekannte Spiele bekommen ein Raster. */
export function GameArt({ game, size = "md" }: { game: GameType; size?: "sm" | "md" | "lg" }) {
  const Mark = MARKS[game.name];

  return (
    <span className={`art art--${size}`} data-accent={game.accent} aria-hidden="true">
      <span
        className="art__field"
        style={
          game.board
            ? ({
                "--cols": String(game.board.cols),
                "--rows": String(game.board.rows),
              } as React.CSSProperties)
            : undefined
        }
      />
      {Mark ? <Mark className="art__mark" /> : <LayoutGrid className="art__mark" />}
    </span>
  );
}