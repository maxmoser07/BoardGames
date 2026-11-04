import { useMemo } from "react";
import { CircleUser, Lock } from "lucide-react";

import { AppShell } from "./components/AppShell";
import { Avatar, EmptyState, Notice, RoleChip, Skeleton } from "./components/ui";
import { useLiveData } from "./hooks/useLiveData";
import { usePersistentState } from "./hooks/usePersistentState";
import { api } from "./lib/api";
import { formatDateTime } from "./lib/format";
import { useNavigate } from "./router";
import type { User } from "./types";

/**
 * Gespeichertes Profil der angemeldeten Person. Die Kennzahlen werden aus den
 * ohnehin vorhandenen Sitzungs- und Verlaufsdaten abgeleitet, damit das Profil
 * sofort zu den personalisierten Ansichten passt.
 */
const ProfileView: React.FC = () => {
  const navigate = useNavigate();
  const [currentUserId, setCurrentUserId] = usePersistentState("currentUserId", 1);

  const users = useLiveData(() => api.getUsers());
  const profile = useLiveData<User | null>(() =>
    currentUserId === 0 ? Promise.resolve(null) : api.getUser(currentUserId),
  );
  const games = useLiveData(() => api.listGames());
  const sessions = useLiveData(() => api.listSessions());

  const stats = useMemo(() => {
    const mine = (games.data ?? []).filter(
      (game) => game.players.red === currentUserId || game.players.yellow === currentUserId,
    );
    const wins = mine.filter((game) => {
      if (game.players.red === currentUserId) return game.winner === "red";
      return game.winner === "yellow";
    }).length;
    const mySessions = (sessions.data ?? []).filter(
      (session) =>
        session.hostId === currentUserId ||
        session.players.red === currentUserId ||
        session.players.yellow === currentUserId,
    );
    return {
      games: mine.length,
      wins,
      sessions: mySessions.length,
      hosted: mySessions.filter((session) => session.hostId === currentUserId).length,
    };
  }, [currentUserId, games.data, sessions.data]);

  const loading = users.loading || profile.loading || games.loading || sessions.loading;
  const loadError = users.error ?? profile.error ?? games.error ?? sessions.error;
  const user = profile.data ?? users.data?.find((entry) => entry.id === currentUserId);

  return (
    <AppShell
      users={users.data ?? []}
      currentUserId={currentUserId}
      onCurrentUserChange={setCurrentUserId}
      active="profile"
    >
      {loadError ? (
        <Notice tone="danger" title="Profil konnte nicht geladen werden">
          {loadError}
        </Notice>
      ) : null}

      {currentUserId === 0 ? (
        <EmptyState
          icon={Lock}
          title="Nicht angemeldet"
          action={
            <button type="button" className="btn btn--sm btn--primary" onClick={() => navigate("/login")}>
              Jetzt anmelden
            </button>
          }
        >
          Melde dich an, um dein gespeichertes Profil und deine persönlichen Statistiken zu sehen.
        </EmptyState>
      ) : loading ? (
        <Skeleton rows={3} />
      ) : user ? (
        <>
          <section className="hero">
            <div className="hero__text">
              <p className="hero__eyebrow">
                <CircleUser aria-hidden="true" size={15} />
                Profil
              </p>
              <h1 className="hero__title">{user.username}</h1>
              <p className="hero__lead">
                Dein gespeichertes Konto bei BoardGames. Sitzungen und Partien werden deinem Profil
                zugeordnet, sobald du angemeldet bist.
              </p>
            </div>
            <dl className="hero__stats">
              <div className="stat">
                <dt className="stat__value">{stats.games}</dt>
                <dd className="stat__label">Partien</dd>
              </div>
              <div className="stat">
                <dt className="stat__value">{stats.wins}</dt>
                <dd className="stat__label">Siege</dd>
              </div>
              <div className="stat">
                <dt className="stat__value">{stats.sessions}</dt>
                <dd className="stat__label">Sitzungen</dd>
              </div>
              <div className="stat">
                <dt className="stat__value">{stats.hosted}</dt>
                <dd className="stat__label">gehostet</dd>
              </div>
            </dl>
          </section>

          <section className="card" aria-label="Kontodaten" style={{ padding: 24, display: "grid", gap: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              <Avatar user={user} />
              <div>
                <h2 style={{ margin: 0 }}>{user.username}</h2>
                <RoleChip role={user.role} />
              </div>
            </div>

            <dl className="meta-list" style={{ margin: 0 }}>
              {user.email ? (
                <div className="meta-list__row">
                  <dt>E-Mail</dt>
                  <dd>{user.email}</dd>
                </div>
              ) : null}
              {user.createdAt ? (
                <div className="meta-list__row">
                  <dt>Mitglied seit</dt>
                  <dd>{formatDateTime(user.createdAt)}</dd>
                </div>
              ) : null}
              <div className="meta-list__row">
                <dt>Benutzer-ID</dt>
                <dd>{user.id}</dd>
              </div>
            </dl>
          </section>
        </>
      ) : (
        <Notice tone="warn" title="Profil nicht gefunden">
          Der gespeicherte Account existiert nicht mehr. Bitte melde dich erneut an.
        </Notice>
      )}
    </AppShell>
  );
};

export default ProfileView;
