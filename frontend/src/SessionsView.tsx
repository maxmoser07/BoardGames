import { useState } from "react";
import { History, LayoutGrid, Play, Sparkles, Trash2, Users } from "lucide-react";

import { AppShell } from "./components/AppShell";
import { GameCard } from "./components/GameCard";
import { SessionCard } from "./components/SessionCard";
import { EmptyState, Notice, Skeleton } from "./components/ui";
import { useLiveData } from "./hooks/useLiveData";
import { usePersistentState } from "./hooks/usePersistentState";
import { api } from "./lib/api";
import { useNavigate } from "./router";
import { sessionStatus, type GameSession } from "./types";

/**
 * Queransicht über alle Spiele: laufende und beendete Sitzungen sowie die
 * gespeicherten Spielverläufe.
 */
const SessionsView: React.FC = () => {
  const navigate = useNavigate();

  const users = useLiveData(() => api.getUsers());
  const sessions = useLiveData(() => api.listSessions());
  const games = useLiveData(() => api.listGames());

  const [currentUserId, setCurrentUserId] = usePersistentState("currentUserId", 1);
  const [busy, setBusy] = useState(false);

  const userList = users.data ?? [];
  const userMap = new Map(userList.map((user) => [user.id, user]));
  const gameMap = new Map((games.data ?? []).map((game) => [game.id, game]));

  const allSessions = sessions.data ?? [];
  const allGames = games.data ?? [];
  const running = allSessions.filter((session) => sessionStatus(session) === "running");
  const finished = allSessions.filter((session) => sessionStatus(session) !== "running");

  const hasDemo = allSessions.some((session) => session.demo) || allGames.some((game) => game.demo);
  const loadError = users.error ?? sessions.error ?? games.error;

  async function handleClearDemo(): Promise<void> {
    setBusy(true);
    try {
      await api.clearDemoData();
    } finally {
      setBusy(false);
    }
  }

  function openWindow(session: GameSession): void {
    window.open(`${window.location.origin}/connectfour/${session.id}`, `connectfour_${session.id}`);
  }

  return (
    <AppShell
      users={userList}
      currentUserId={currentUserId}
      onCurrentUserChange={setCurrentUserId}
      active="sessions"
    >
      {loadError ? (
        <Notice tone="danger" title="Daten konnten nicht geladen werden">
          {loadError}
        </Notice>
      ) : null}

      <section className="hero">
        <div className="hero__text">
          <p className="hero__eyebrow">
            <Sparkles aria-hidden="true" size={15} />
            Verlauf
          </p>
          <h1 className="hero__title">Sitzungen &amp; Spielverläufe</h1>
          <p className="hero__lead">
            Alle Partien über alle Spiele hinweg. Laufende Sitzungen lassen sich hier öffnen oder beenden,
            beendete behalten ihren Zugverlauf.
          </p>
        </div>

        <dl className="hero__stats">
          <div className="stat">
            <dt className="stat__value">{running.length || "–"}</dt>
            <dd className="stat__label">laufend</dd>
          </div>
          <div className="stat">
            <dt className="stat__value">{finished.length || "–"}</dt>
            <dd className="stat__label">beendet</dd>
          </div>
          <div className="stat">
            <dt className="stat__value">{allGames.length || "–"}</dt>
            <dd className="stat__label">Verläufe</dd>
          </div>
        </dl>
      </section>

      {running.length > 0 ? (
        <section className="card panel" aria-labelledby="panel-running">
          <header className="panel__head">
            <span className="panel__icon" aria-hidden="true">
              <Play size={18} />
            </span>
            <div>
              <h2 className="panel__title" id="panel-running">
                Laufend
              </h2>
              <p className="panel__subtitle">{running.length} offene Partie</p>
            </div>
          </header>
          <ul className="list">
            {running.map((session) => (
              <SessionCard
                key={session.id}
                session={session}
                game={session.gameId ? gameMap.get(session.gameId) : undefined}
                users={userMap}
                onOpen={openWindow}
                onAbort={async (target) => {
                  if (window.confirm(`Sitzung ${target.id} wirklich beenden?`)) {
                    await api.abortSession(target.id);
                  }
                }}
              />
            ))}
          </ul>
        </section>
      ) : null}

      <div className="grid">
        <section className="card panel" aria-labelledby="panel-sessions">
          <header className="panel__head">
            <span className="panel__icon" aria-hidden="true">
              <LayoutGrid size={18} />
            </span>
            <div>
              <h2 className="panel__title" id="panel-sessions">
                Beendete Sitzungen
              </h2>
              <p className="panel__subtitle">mit Ausgang und Zugverlauf</p>
            </div>
          </header>

          {sessions.loading ? (
            <Skeleton rows={3} />
          ) : finished.length > 0 ? (
            <ul className="list">
              {finished.map((session) => (
                <SessionCard
                  key={session.id}
                  session={session}
                  game={session.gameId ? gameMap.get(session.gameId) : undefined}
                  users={userMap}
                  onOpen={openWindow}
                  onAbort={async (target) => {
                    await api.abortSession(target.id);
                  }}
                />
              ))}
            </ul>
          ) : (
            <EmptyState icon={LayoutGrid} title="Noch keine beendete Sitzung">
              Wähle im{" "}
              <button type="button" className="link" onClick={() => navigate("/")}>
                Katalog
              </button>{" "}
              ein Spiel aus und starte eine Partie.
            </EmptyState>
          )}
        </section>

        <section className="card panel" aria-labelledby="panel-games">
          <header className="panel__head">
            <span className="panel__icon" aria-hidden="true">
              <History size={18} />
            </span>
            <div>
              <h2 className="panel__title" id="panel-games">
                Spielverläufe
              </h2>
              <p className="panel__subtitle">jede abgeschlossene Partie</p>
            </div>
            {hasDemo ? (
              <button
                type="button"
                className="btn btn--ghost btn--sm panel__head-action"
                onClick={handleClearDemo}
                disabled={busy}
              >
                <Trash2 aria-hidden="true" size={15} />
                Beispiel entfernen
              </button>
            ) : null}
          </header>

          {games.loading ? (
            <Skeleton rows={2} />
          ) : allGames.length > 0 ? (
            <ul className="list list--games">
              {allGames.map((game) => (
                <GameCard key={game.id} game={game} session={undefined} users={userMap} />
              ))}
            </ul>
          ) : (
            <EmptyState icon={History} title="Noch keine abgeschlossene Partie">
              Der Verlauf entsteht beim Spielen und wird automatisch gespeichert.
            </EmptyState>
          )}
        </section>
      </div>

      <p className="panel__foot panel__foot--standalone">
        <Users aria-hidden="true" size={14} />
        Sitzungen und Verläufe liegen im Browser und sind in allen Fenstern sichtbar.
      </p>
    </AppShell>
  );
};

export default SessionsView;