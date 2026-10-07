import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, History } from "lucide-react";

import ConnectFour from "./ConnectFour";
import { GameCard } from "./components/GameCard";
import { Logo } from "./components/Logo";
import { EmptyState, Notice, Skeleton } from "./components/ui";
import { useLiveData } from "./hooks/useLiveData";
import { api } from "./lib/api";
import { installGameResultEndpoint } from "./lib/gameResultEndpoint";
import { useNavigate } from "./router";
import type { User } from "./types";

/**
 * Partie ohne Sitzung: das Brett läuft direkt im Tab, der Verlauf landet
 * trotzdem in der Datenbank (`sessionId === null`, weil keine Sitzung mit
 * abgeschlossen wird).
 */
const PlayView: React.FC = () => {
  const navigate = useNavigate();
  const games = useLiveData(() => api.listGames());
  const [mountedAt] = useState(() => Date.now());
  const noUsers = useMemo(() => new Map<number, User>(), []);

  useEffect(
    () =>
      installGameResultEndpoint({
        sessionId: null,
        players: { red: null, yellow: null },
        startedAt: mountedAt,
        pausedMs: 0,
      }),
    [mountedAt],
  );

  const localGames = useMemo(() => (games.data ?? []).filter((game) => game.sessionId === null), [games.data]);

  return (
    <div className="window window--wide">
      <header className="window__header">
        <div className="window__brand">
          <Logo size={24} />
          <div>
            <p className="window__title">Direkt spielen</p>
            <p className="window__subtitle">Partie ohne Sitzung</p>
          </div>
        </div>
        <button type="button" className="btn btn--ghost btn--sm" onClick={() => navigate("/")}>
          <ArrowLeft aria-hidden="true" size={15} />
          Zur Übersicht
        </button>
      </header>

      <main className="window__main">
        <Notice tone="info">
          Diese Partie gehört zu keiner Sitzung. Der Verlauf wird trotzdem gespeichert und erscheint unter
          „Spielverläufe“.
        </Notice>

        <ConnectFour />

        <section className="panel" aria-labelledby="play-history">
          <header className="panel__head">
            <span className="panel__icon" aria-hidden="true">
              <History size={18} />
            </span>
            <div>
              <h2 className="panel__title" id="play-history">
                Partien ohne Sitzung
              </h2>
              <p className="panel__subtitle">{localGames.length} gespeicherte Verläufe</p>
            </div>
          </header>

          {games.loading ? (
            <Skeleton rows={1} />
          ) : localGames.length > 0 ? (
            <ul className="list list--games">
              {localGames.map((game) => (
                <GameCard key={game.id} game={game} session={undefined} users={noUsers} />
              ))}
            </ul>
          ) : (
            <EmptyState icon={History} title="Noch keine Partie ohne Sitzung">
              Beende oben eine Runde, dann erscheint der Verlauf hier.
            </EmptyState>
          )}
        </section>
      </main>
    </div>
  );
};

export default PlayView;
