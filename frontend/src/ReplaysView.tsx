import { useState } from "react";
import { History, LayoutGrid, Sparkles } from "lucide-react";

import { AppShell } from "./components/AppShell";
import { GameCard } from "./components/GameCard";
import { EmptyState, Notice, Skeleton } from "./components/ui";
import { useLiveData } from "./hooks/useLiveData";
import { api } from "./lib/api";
import { useNavigate } from "./router";
import type { RecordedGame } from "./types";

/**
 * Übersicht aller gespeicherten Partien unter `/replays`.
 *
 * Bewusst getrennt von der Sitzungsverwaltung: Spieler:innen dürfen hier
 * zusehen und jede beendete Partie nachspielen, ohne Sitzungen zu verwalten.
 */
const ReplaysView: React.FC = () => {
  const navigate = useNavigate();
  const games = useLiveData(() => api.listGames());
  const gameTypes = useLiveData(() => api.getGameTypes());
  const users = useLiveData(() => api.getUsers());

  const [filter, setFilter] = useState("all");

  const allGames = games.data ?? [];
  const typeList = gameTypes.data ?? [];
  const gameMap = new Map(typeList.map((game) => [game.name, game]));
  const userMap = new Map((users.data ?? []).map((user) => [user.id, user]));
  const filterGames = typeList.filter((game) => allGames.some((recorded) => recorded.gameType === game.name));

  const visible =
    filter === "all" ? allGames : allGames.filter((recorded) => recorded.gameType === filter);

  const loadError = games.error ?? gameTypes.error ?? users.error;

  function openReplay(game: RecordedGame): void {
    navigate(`/replays/${game.id}`);
  }

  return (
    <AppShell active="replays">
      {loadError ? (
        <Notice tone="danger" title="Wiedergaben konnten nicht geladen werden">
          {loadError}
        </Notice>
      ) : null}

      <section className="hero">
        <div className="hero__text">
          <p className="hero__eyebrow">
            <Sparkles aria-hidden="true" size={15} />
            Wiedergabe
          </p>
          <h1 className="hero__title">Spielverläufe</h1>
          <p className="hero__lead">
            Beendete Partien Zug für Zug nachspielen: Brett, Zugsliste und Ergebnis. Die Wiedergabe
            ist schreibgeschützt und ändert weder Sitzung noch Wertung.
          </p>
        </div>

        <dl className="hero__stats">
          <div className="stat">
            <dt className="stat__value">{allGames.length || "–"}</dt>
            <dd className="stat__label">Partien</dd>
          </div>
          <div className="stat">
            <dt className="stat__value">{filterGames.length || "–"}</dt>
            <dd className="stat__label">Spiele</dd>
          </div>
          <div className="stat">
            <dt className="stat__value">{allGames.filter((game) => game.friendly).length || "–"}</dt>
            <dd className="stat__label">Freundschaftsspiele</dd>
          </div>
        </dl>
      </section>

      <section className="card panel" aria-labelledby="replays-title">
        <header className="panel__head">
          <span className="panel__icon" aria-hidden="true">
            <History size={18} />
          </span>
          <div>
            <h2 className="panel__title" id="replays-title">
              Alle Wiedergaben
            </h2>
            <p className="panel__subtitle">
              {visible.length} {visible.length === 1 ? "Verlauf" : "Verläufe"}
              {filter === "all" ? "" : " in dieser Auswahl"}
            </p>
          </div>
          <label className="replays__filter">
            <span className="sr-only">Nach Spiel filtern</span>
            <select
              className="input"
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
            >
              <option value="all">Alle Spiele</option>
              {filterGames.map((game) => (
                <option key={game.name} value={game.name}>
                  {game.displayName}
                </option>
              ))}
            </select>
          </label>
        </header>

        {games.loading ? (
          <Skeleton rows={3} />
        ) : visible.length > 0 ? (
          <ul className="list list--games">
            {visible.map((recorded) => (
              <GameCard
                key={recorded.id}
                game={recorded}
                users={userMap}
                gameLabel={gameMap.get(recorded.gameType)?.displayName}
                onReplay={openReplay}
              />
            ))}
          </ul>
        ) : (
          <EmptyState
            icon={filter === "all" ? History : LayoutGrid}
            title={filter === "all" ? "Noch keine gespeicherte Partie" : "Keine Partie zu diesem Spiel"}
            action={
              filter === "all" ? (
                <button type="button" className="btn btn--primary btn--sm" onClick={() => navigate("/play")}>
                  Jetzt spielen
                </button>
              ) : undefined
            }
          >
            {filter === "all"
              ? "Sobald eine Partie zu Ende gespielt wurde, erscheint ihr Verlauf hier."
              : "Wähle ein anderes Spiel oder spiele zuerst eine Partie."}
          </EmptyState>
        )}
      </section>
    </AppShell>
  );
};

export default ReplaysView;
