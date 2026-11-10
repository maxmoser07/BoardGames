import { useMemo } from "react";
import { CircleUser } from "lucide-react";

import { AppShell } from "./components/AppShell";
import { Avatar, Notice, RoleChip, Skeleton } from "./components/ui";
import { useLiveData } from "./hooks/useLiveData";
import { api } from "./lib/api";
import { useAuth } from "./lib/auth";
import { formatDateTime } from "./lib/format";
import { formatRating } from "./lib/ratings";
import type { PlayerRating, User } from "./types";

/**
 * Gespeichertes Profil der angemeldeten Person. Die Kennzahlen werden aus den
 * ohnehin vorhandenen Sitzungs- und Verlaufsdaten abgeleitet, damit das Profil
 * sofort zu den personalisierten Ansichten passt.
 */
const ProfileView: React.FC = () => {
  const { user: authUser } = useAuth();
  const userId = authUser?.id ?? 0;

  const profile = useLiveData<User | null>(() =>
    userId === 0 ? Promise.resolve(null) : api.getUser(userId),
  );
  const games = useLiveData(() => api.listGames());
  const sessions = useLiveData(() => api.listSessions());
  const rating = useLiveData<PlayerRating | null>(() =>
    userId === 0 ? Promise.resolve(null) : api.getRating(userId),
  );

  const stats = useMemo(() => {
    const mine = (games.data ?? []).filter(
      (game) => game.players.red === userId || game.players.yellow === userId,
    );
    const wins = mine.filter((game) => {
      if (game.players.red === userId) return game.winner === "red";
      return game.winner === "yellow";
    }).length;
    const mySessions = (sessions.data ?? []).filter(
      (session) =>
        session.hostId === userId ||
        session.players.red === userId ||
        session.players.yellow === userId,
    );
    return {
      games: mine.length,
      wins,
      sessions: mySessions.length,
      hosted: mySessions.filter((session) => session.hostId === userId).length,
    };
  }, [userId, games.data, sessions.data]);

  const loading = profile.loading || games.loading || sessions.loading || rating.loading;
  const loadError = profile.error ?? games.error ?? sessions.error ?? rating.error;
  const user = profile.data ?? authUser;

  return (
    <AppShell active="profile">
      {loadError ? (
        <Notice tone="danger" title="Profil konnte nicht geladen werden">
          {loadError}
        </Notice>
      ) : null}

      {loading ? (
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
              <div className="stat">
                <dt className="stat__value">
                  {rating.data ? formatRating(rating.data.rating) : "–"}
                </dt>
                <dd className="stat__label">Rating</dd>
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
