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
import type { GameSession } from "./types";

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
  const [error, setError] = useState<string | null>(null);

  const userList = users.data ?? [];
  const userMap = new Map(userList.map((user) => [user.id, user]));
  const gameMap = new Map((games.data ?? []).map((game) => [game.id, game]));

  const allSessions = sessions.data ?? [];
  const allGames = games.data ?? [];
  const open = allSessions.filter((session) => session.outcome === null);
  const paused = allSessions.filter((session) => session.pausedAt !== null);
  const finished = allSessions.filter((session) => session.outcome !== null);

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

  /**
   * Eine Sitzung kann von hier aus gesteuert werden, ohne das Brett zu öffnen –
   * praktisch, wenn das Fenster mal nicht offen ist.
   */
  async function run(action: () => Promise<unknown>): Promise<void> {
    try {
      await action();
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Aktion fehlgeschlagen.");
    }
  }

  const controls = {
    onOpen: openWindow,
    onPause: (session: GameSession) => void run(() => api.pauseSession(session.id)),
    onResume: (session: GameSession) => void run(() => api.resumeSession(session.id)),
    onAbort: (session: GameSession) => {
      if (window.confirm(`Sitzung ${session.id} wirklich beenden?`)) {
        void run(() => api.abortSession(session.id));
      }
    },
  };

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

      {error ? (
        <Notice
          tone="danger"
          action={
            <button type="button" className="btn btn--sm btn--ghost" onClick={() => setError(null)}>
              Schließen
            </button>
          }
        >
          {error}
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
            <dt className="stat__value">{open.length || "–"}</dt>
            <dd className="stat__label">offen</dd>
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

      {open.length > 0 ? (
        <section className="card panel" aria-labelledby="panel-open">
          <header className="panel__head">
            <span className="panel__icon" aria-hidden="true">
              <Play size={18} />
            </span>
            <div>
              <h2 className="panel__title" id="panel-open">
                Offen
              </h2>
              <p className="panel__subtitle">
                {open.length - paused.length} laufende Partie
                {paused.length > 0 ? `, ${paused.length} pausiert` : ""}
              </p>
            </div>
          </header>
          <ul className="list">
            {open.map((session) => (
              <SessionCard
                key={session.id}
                session={session}
                game={session.gameId ? gameMap.get(session.gameId) : undefined}
                users={userMap}
                {...controls}
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
                  {...controls}
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
        Sitzungen und Verläufe liegen in der Datenbank und sind in allen Fenstern sichtbar.
      </p>
    </AppShell>
  );
};

export default SessionsView;
