/**
 * Live-Anzeige der Gewinnchancen über dem Spielbrett.
 *
 * Die Bewertung kommt aus `lib/connectFourOdds.ts`; diese Komponente ist nur
 * Darstellung. Sie zeigt die drei Anteile als Balken, die genauen Prozentwerte
 * als Legende und – solange die Partie läuft – einen Zugtipp für die Person am
 * Zug. Farbe allein trägt keine Information: die Beschriftung steht daneben.
 */

import { useMemo } from "react";
import { Gauge, Lightbulb } from "lucide-react";

import { estimateWinningOdds, oddsHeadline } from "../lib/connectFourOdds";
import { SIDE_LABEL, type Side } from "../types";
import "../ConnectFour.css";

type OddsTone = "red" | "yellow" | "green";

interface Props {
  board: readonly (readonly (Side | null)[])[];
  currentPlayer: Side;
  winner: Side | "draw" | null;
  /** Abweichende Beschriftung, z. B. „Grün“ in der Kamera-Ansicht. */
  labels?: Partial<Record<Side, string>>;
  /** Abweichende Farbe, z. B. Grün für die Kamera-Seite „red“. */
  tones?: Partial<Record<Side, OddsTone>>;
}

export function WinOdds({ board, currentPlayer, winner, labels, tones }: Props) {
  const odds = useMemo(() => estimateWinningOdds(board, currentPlayer), [board, currentPlayer]);

  const labelOf = (side: Side): string => labels?.[side] ?? SIDE_LABEL[side];
  const toneOf = (side: Side): OddsTone => tones?.[side] ?? side;
  const headline = oddsHeadline(odds, { red: labelOf("red"), yellow: labelOf("yellow") });
  const running = winner === null;

  const barLabel =
    `Gewinnchancen: ${labelOf("red")} ${odds.red} Prozent, ` +
    `Unentschieden ${odds.draw} Prozent, ${labelOf("yellow")} ${odds.yellow} Prozent.`;

  const advice =
    winner === null
      ? odds.bestColumn === null
        ? null
        : `Tipp für ${labelOf(currentPlayer)}: Spalte ${odds.bestColumn + 1} · ${odds.bestChance} % Siegchance mit diesem Zug`
      : winner === "draw"
        ? "Das Brett ist voll – Unentschieden."
        : `${labelOf(winner)} hat gewonnen.`;

  return (
    <section className="c4-odds" aria-label="Gewinnchancen">
      <header className="c4-odds__head">
        <span className="c4-odds__title">
          <Gauge aria-hidden="true" size={15} />
          Gewinnchancen
        </span>
        <span className={`c4-odds__state${running ? " c4-odds__state--live" : ""}`}>
          {running ? <span className="pulse" aria-hidden="true" /> : null}
          {running ? "live" : "Endstand"}
        </span>
      </header>

      <div className="c4-odds__bar" role="img" aria-label={barLabel}>
        {odds.red > 0 ? (
          <span
            className={`c4-odds__part c4-odds__part--${toneOf("red")}`}
            style={{ width: `${odds.red}%` }}
            aria-hidden="true"
          >
            {odds.red >= 12 ? `${odds.red}%` : null}
          </span>
        ) : null}
        {odds.draw > 0 ? (
          <span
            className="c4-odds__part c4-odds__part--draw"
            style={{ width: `${odds.draw}%` }}
            aria-hidden="true"
          >
            {odds.draw >= 12 ? `${odds.draw}%` : null}
          </span>
        ) : null}
        {odds.yellow > 0 ? (
          <span
            className={`c4-odds__part c4-odds__part--${toneOf("yellow")}`}
            style={{ width: `${odds.yellow}%` }}
            aria-hidden="true"
          >
            {odds.yellow >= 12 ? `${odds.yellow}%` : null}
          </span>
        ) : null}
      </div>

      <ul className="c4-odds__legend">
        <li>
          <i className={`c4-odds__dot c4-odds__dot--${toneOf("red")}`} aria-hidden="true" />
          {labelOf("red")} <strong>{odds.red} %</strong>
        </li>
        <li>
          <i className="c4-odds__dot c4-odds__dot--draw" aria-hidden="true" />
          Unentschieden <strong>{odds.draw} %</strong>
        </li>
        <li>
          <i className={`c4-odds__dot c4-odds__dot--${toneOf("yellow")}`} aria-hidden="true" />
          {labelOf("yellow")} <strong>{odds.yellow} %</strong>
        </li>
      </ul>

      <p className="c4-odds__headline">{headline}</p>

      {advice ? (
        <p className="c4-odds__advice">
          <Lightbulb aria-hidden="true" size={14} />
          <span>{advice}</span>
        </p>
      ) : null}

      {odds.finished ? null : (
        <p className="c4-odds__hint">
          Geschätzt aus {odds.samples} zufälligen Fortsetzungen – eine Orientierung, keine Garantie.
        </p>
      )}

      <p className="sr-only" aria-live="polite">
        {barLabel} {headline}
      </p>
    </section>
  );
}
