import { useMemo, useState } from "react";
import { History, LayoutGrid, Lock, Search, Sparkles, Users } from "lucide-react";

import { AppShell } from "./components/AppShell";
import { GameTile, type GameTally } from "./components/GameTile";
import { EmptyState, Notice, Skeleton } from "./components/ui";
import { useLiveData } from "./hooks/useLiveData";
import { usePersistentState } from "./hooks/usePersistentState";
import { api } from "./lib/api";
import { emptyTally } from "./lib/tally";
import { bySortOrder } from "./lib/gameTypes";
import { useNavigate } from "./router";
import type { GameType } from "./types";

/**
 * Startseite: reine Übersicht der bekannten Spiele. Erst ein Klick auf eine
 * Kachel führt zu den Einstellungen des jeweiligen Spiels.
 */
const Catalog: React.FC = () => {
  const navigate = useNavigate();

  const users = useLiveData(() => api.getUsers());
  const gameTypes = useLiveData(() => api.getGameTypes());
  const games = useLiveData(() => api.listGames());
  const sessions = useLiveData(() => api.listSessions());

  const [currentUserId, setCurrentUserId] = usePersistentState("currentUserId", 1);
  const [query, setQuery] = useState("");

  const catalog = useMemo(
    () => (gameTypes.data ?? []).slice().sort(bySortOrder),
    [gameTypes.data],
  );

  const tallies = useMemo(() => {
    const result = new Map<string, GameTally>();
    for (const game of catalog) result.set(game.name, emptyTally());
    for (const game of games.data ?? []) {
      const tally = result.get(game.gameType);
      if (!tally) continue;
      tally.games += 1;
      if (!tally.lastPlayed || game.playedAt > tally.lastPlayed) tally.lastPlayed = game.playedAt;
    }
    for (const session of sessions.data ?? []) {
      const tally = result.get(session.gameType);
      if (tally) tally.sessions += 1;
    }
    return result;
  }, [catalog, games.data, sessions.data]);

  const needle = query.trim().toLowerCase();
  const visible = useMemo(
    () =>
      needle.length === 0
        ? catalog
        : catalog.filter((game) =>
            `${game.displayName} ${game.tagline}`.toLowerCase().includes(needle),
          ),
    [catalog, needle],
  );

  const playableCount = catalog.filter((game) => game.implemented).length;
  const loading = gameTypes.loading || games.loading || sessions.loading;
  const loadError = gameTypes.error ?? games.error ?? sessions.error ?? users.error;

  const totalGames = (games.data ?? []).length;

  return (
    <AppShell
      users={users.data ?? []}
      currentUserId={currentUserId}
      onCurrentUserChange={setCurrentUserId}
      active="catalog"
    >
      {loadError ? (
        <Notice tone="danger" title="Katalog konnte nicht geladen werden">
          {loadError}
        </Notice>
      ) : null}

      <section className="hero">
        <div className="hero__text">
          <p className="hero__eyebrow">
            <Sparkles aria-hidden="true" size={15} />
            Brettspielverwaltung
          </p>
          <h1 className="hero__title">Spiele</h1>
          <p className="hero__lead">
            Wähle ein Spiel und richte die Partie ein. Rot beginnt, Gelb zieht nach – Sitzungen und Spielverläufe
            werden für alle Spiele gemeinsam verwaltet.
          </p>
        </div>

        <dl className="hero__stats">
          <div className="stat">
            <dt className="stat__value">{catalog.length || "–"}</dt>
            <dd className="stat__label">Spiele</dd>
          </div>
          <div className="stat">
            <dt className="stat__value">{playableCount || "–"}</dt>
            <dd className="stat__label">spielbar</dd>
          </div>
          <div className="stat">
            <dt className="stat__value">{totalGames || "–"}</dt>
            <dd className="stat__label">Partien</dd>
          </div>
        </dl>
      </section>

      <section className="catalog" aria-labelledby="catalog-title">
        <div className="catalog__bar">
          <h2 className="section-title" id="catalog-title">
            <LayoutGrid aria-hidden="true" size={18} />
            Alle Spiele
          </h2>

          <label className="search">
            <Search aria-hidden="true" className="search__icon" size={16} />
            <input
              type="search"
              className="input search__input"
              value={query}
              placeholder="Spiel suchen …"
              aria-label="Spiel suchen"
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
        </div>

        {loading ? (
          <Skeleton rows={3} />
        ) : visible.length > 0 ? (
          <ul className="tiles">
            {visible.map((game) => (
              <GameTile
                key={game.name}
                game={game}
                tally={tallies.get(game.name) ?? emptyTally()}
                onOpen={(chosen: GameType) => navigate(`/games/${chosen.name}`)}
              />
            ))}
          </ul>
        ) : (
          <EmptyState icon={needle ? Search : Lock} title={needle ? "Kein Treffer" : "Noch keine Spiele"}>
            {needle
              ? `Für „${query}“ gibt es kein Spiel.`
              : "Der Katalog ist leer – der Eintrag in game_types fehlt."}
          </EmptyState>
        )}
      </section>

      <section className="catalog-notes" aria-label="Hinweise">
        <p>
          <History aria-hidden="true" size={15} />
          Sitzungen und Verläufe aller Spiele findest du unter{" "}
          <button type="button" className="link" onClick={() => navigate("/sessions")}>
            Sitzungen
          </button>
          .
        </p>
        <p>
          <Users aria-hidden="true" size={15} />
          {playableCount} von {catalog.length} Spielen sind umgesetzt. Die übrigen sind in der Datenbank angelegt
          und dienen der Übersicht.
        </p>
      </section>
    </AppShell>
  );
};

export default Catalog;