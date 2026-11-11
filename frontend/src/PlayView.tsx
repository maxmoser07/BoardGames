import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, Dices, History, Play } from "lucide-react";

import ConnectFourGame from "./ConnectFourGame";
import { GameArt } from "./components/GameArt";
import { GameCard } from "./components/GameCard";
import { Logo } from "./components/Logo";
import { EmptyState, Notice, Skeleton } from "./components/ui";
import { GameBoard } from "./games/GameBoard";
import { useLiveData } from "./hooks/useLiveData";
import { api } from "./lib/api";
import { usesClassicConnectFour } from "./lib/gameTypes";
import { installGameResultEndpoint } from "./lib/gameResultEndpoint";
import { useNavigate } from "./router";
import type { GameType, User } from "./types";

interface Props {
  /** Fehlt auf `/play`: dann wird zuerst ein Spiel ausgewählt. */
  gameName?: string;
}

/**
 * Partie ohne Sitzung: das Brett läuft direkt im Tab, der Verlauf landet
 * trotzdem in der Datenbank (`sessionId === null`, weil keine Sitzung mit
 * abgeschlossen wird).
 */
const PlayView: React.FC<Props> = ({ gameName }) => {
  if (!gameName) return <GameChooser />;
  return <PlayByName gameName={gameName} />;
};

/** Eine Partie eines bestimmten Spiels; der Katalog kommt aus der Datenbank. */
function PlayByName({ gameName }: { gameName: string }) {
  const game = useLiveData(() => api.getGameType(gameName));

  if (game.loading) {
    return (
      <PlayShell title="Spiel wird geladen" subtitle={gameName}>
        <Skeleton rows={2} />
      </PlayShell>
    );
  }
  if (game.error) {
    return (
      <PlayShell title="Spiel konnte nicht geladen werden" subtitle={gameName}>
        <Notice tone="danger" title="Das Spiel ist nicht erreichbar">
          {game.error}
        </Notice>
      </PlayShell>
    );
  }
  if (!game.data) {
    return (
      <PlayShell title="Unbekanntes Spiel" subtitle={gameName}>
        <Notice tone="warn" title={`Unbekanntes Spiel: ${gameName}`}>
          Im Katalog gibt es kein Spiel mit dieser Kennung.
        </Notice>
      </PlayShell>
    );
  }
  if (!game.data.implemented) {
    return (
      <PlayShell title={game.data.displayName} subtitle="Noch nicht spielbar">
        <Notice tone="warn" title="Noch nicht spielbar">
          Für {game.data.displayName} gibt es noch kein Brett.
        </Notice>
      </PlayShell>
    );
  }

  return <DirectPlay game={game.data} />;
}

/** Auswahl auf `/play`, wenn noch kein Spiel gewählt wurde. */
function GameChooser() {
  const navigate = useNavigate();
  const games = useLiveData(() => api.getGameTypes());
  const playable = (games.data ?? []).filter((game) => game.implemented);

  return (
    <PlayShell title="Direkt spielen" subtitle="Partie ohne Sitzung">
      <Notice tone="info">
        Wähle ein Spiel. Der Verlauf wird als Freundschaftsspiel gespeichert, ohne Sitzung und ohne
        Wirkung auf die Wertung.
      </Notice>

      {games.error ? (
        <Notice tone="danger" title="Spiele konnten nicht geladen werden">
          {games.error}
        </Notice>
      ) : null}

      {games.loading ? (
        <Skeleton rows={2} />
      ) : playable.length === 0 ? (
        <EmptyState icon={Dices} title="Kein spielbares Spiel">
          Der Katalog enthält derzeit kein Spiel mit einem Brett.
        </EmptyState>
      ) : null}

      <ul className="tiles">
        {!games.loading && playable.map((game) => (
          <li className="tile" key={game.name} data-accent={game.accent} data-playable="true">
            <button type="button" className="tile__button" onClick={() => navigate(`/play/${game.name}`)}>
              <GameArt game={game} size="md" />
              <div className="tile__body">
                <div className="tile__head">
                  <h3 className="tile__title">{game.displayName}</h3>
                </div>
                <p className="tile__tagline">{game.tagline}</p>
                <p className="tile__description">{game.description}</p>
              </div>
              <div className="tile__foot">
                <span className="tile__cta">
                  <Play aria-hidden="true" size={16} />
                  Spielen
                  <ArrowRight aria-hidden="true" size={16} />
                </span>
              </div>
            </button>
          </li>
        ))}
      </ul>
    </PlayShell>
  );
}

/** Eine Partie im Tab, inklusive der Verläufe dieses Spiels. */
function DirectPlay({ game }: { game: GameType }) {
  const games = useLiveData(() => api.listGames());
  const [mountedAt] = useState(() => Date.now());
  const noUsers = useMemo(() => new Map<number, User>(), []);

  const localGames = useMemo(
    () =>
      (games.data ?? []).filter(
        (recorded) => recorded.gameType === game.name && recorded.sessionId === null,
      ),
    [games.data, game.name],
  );

  return (
    <PlayShell title={game.displayName} subtitle="Partie ohne Sitzung">
      <Notice tone="info">
        Diese Partie gehört zu keiner Sitzung und ist ein Freundschaftsspiel: Der Verlauf wird
        gespeichert, die Wertung bleibt unverändert.
      </Notice>

      {usesClassicConnectFour(game) ? (
        <DirectConnectFour startedAt={mountedAt} />
      ) : (
        <GameBoard
          game={game}
          context={{
            gameType: game.name,
            sessionId: null,
            players: { red: null, yellow: null },
            startedAt: mountedAt,
            pausedMs: 0,
            paused: false,
            friendly: true,
          }}
        />
      )}

      <section className="panel" aria-labelledby="play-history">
        <header className="panel__head">
          <span className="panel__icon" aria-hidden="true">
            <History size={18} />
          </span>
          <div>
            <h2 className="panel__title" id="play-history">
              Partien ohne Sitzung
            </h2>
            <p className="panel__subtitle">
              {localGames.length} gespeicherte {localGames.length === 1 ? "Verlauf" : "Verläufe"} zu{" "}
              {game.displayName}
            </p>
          </div>
        </header>

        {games.loading ? (
          <Skeleton rows={1} />
        ) : localGames.length > 0 ? (
          <ul className="list list--games">
            {localGames.map((recorded) => (
              <GameCard key={recorded.id} game={recorded} session={undefined} users={noUsers} />
            ))}
          </ul>
        ) : (
          <EmptyState icon={History} title="Noch keine Partie ohne Sitzung">
            Beende oben eine Runde, dann erscheint der Verlauf hier.
          </EmptyState>
        )}
      </section>
    </PlayShell>
  );
}

/**
 * Vier Gewinnt meldet sein Ergebnis selbst per `fetch`. Der eingefrorene Hook
 * kennt die Sitzungs-Id nicht; die Brücke ergänzt sie (hier: keine Sitzung) und
 * die Spielzeit.
 */
function DirectConnectFour({ startedAt }: { startedAt: number }) {
  useEffect(
    () =>
      installGameResultEndpoint({
        sessionId: null,
        players: { red: null, yellow: null },
        startedAt,
        pausedMs: 0,
        friendly: true,
      }),
    [startedAt],
  );

  return <ConnectFourGame />;
}

function PlayShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  const navigate = useNavigate();
  return (
    <div className="window window--wide">
      <header className="window__header">
        <div className="window__brand">
          <Logo size={24} />
          <div>
            <p className="window__title">{title}</p>
            <p className="window__subtitle">{subtitle}</p>
          </div>
        </div>
        <div className="window__actions">
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => navigate("/play")}>
            <Dices aria-hidden="true" size={15} />
            Anderes Spiel
          </button>
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => navigate("/")}>
            <ArrowLeft aria-hidden="true" size={15} />
            Zur Übersicht
          </button>
        </div>
      </header>

      <main className="window__main">{children}</main>
    </div>
  );
}

export default PlayView;
