import { useMemo } from "react";
import { CircleUser, Trophy } from "lucide-react";

import { AppShell } from "./components/AppShell";
import { Avatar, EmptyState, Notice, RoleChip, Skeleton } from "./components/ui";
import { useLiveData } from "./hooks/useLiveData";
import { api } from "./lib/api";
import { useAuth } from "./lib/auth";
import { formatDateTime } from "./lib/format";
import { findGameType } from "./lib/gameTypes";
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
  const ratings = useLiveData(() => api.listRatings());

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

  /**
   * Nur die eigene Wertung, sortiert wie der Spielkatalog. Das Backend liefert
   * für jedes Spiel eine Zeile – auch ohne gewertete Partie, dann mit dem
   * Startwert 1200.
   */
  const myRatings = useMemo<PlayerRating[]>(() => {
    return (ratings.data ?? [])
      .filter((rating) => rating.userId === userId)
      .sort((a, b) => {
        const left = findGameType(a.gameType)?.sortOrder ?? Number.MAX_SAFE_INTEGER;
        const right = findGameType(b.gameType)?.sortOrder ?? Number.MAX_SAFE_INTEGER;
        return left - right || a.gameType.localeCompare(b.gameType);
      });
  }, [ratings.data, userId]);

  /** Durchschnitt der Spielwertungen; 1200, solange nichts geladen ist. */
  const overallRating = useMemo(() => {
    if (myRatings.length === 0) return 1200;
    return Math.round(myRatings.reduce((sum, rating) => sum + rating.rating, 0) / myRatings.length);
  }, [myRatings]);

  const ratedGames = useMemo(
    () => myRatings.reduce((sum, rating) => sum + rating.gamesPlayed, 0),
    [myRatings],
  );

  const loading = profile.loading || games.loading || sessions.loading || ratings.loading;
  const loadError = profile.error ?? games.error ?? sessions.error ?? ratings.error;
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

          <section className="card rating" aria-labelledby="rating-title">
            <header className="rating__head">
              <span className="panel__icon" aria-hidden="true">
                <Trophy size={20} />
              </span>
              <div className="rating__intro">
                <h2 className="rating__title" id="rating-title">
                  Wertung
                </h2>
                <p className="rating__hint">
                  Elo-Wertung aus gewerteten Partien. Freundschaftsspiele werden gespeichert,
                  verändern die Wertung aber nicht.
                </p>
              </div>
              <div className="rating__overall">
                <span className="rating__overall-value">{overallRating}</span>
                <span className="rating__overall-label">
                  gesamt · {ratedGames} {ratedGames === 1 ? "Partie" : "Partien"}
                </span>
              </div>
            </header>

            {myRatings.length === 0 ? (
              <EmptyState icon={Trophy} title="Noch keine Wertung">
                Sobald du eine gewertete Partie spielst, erscheint hier dein Stand.
              </EmptyState>
            ) : (
              <ul className="rating__list">
                {myRatings.map((rating) => {
                  const game = findGameType(rating.gameType);
                  return (
                    <li className="rating__row" key={`${rating.userId}-${rating.gameType}`}>
                      <span className="rating__game">{game?.displayName ?? rating.gameType}</span>
                      <span className="rating__record">
                        {rating.gamesPlayed === 0
                          ? "noch keine gewertete Partie"
                          : `${rating.wins} S · ${rating.draws} U · ${rating.losses} N`}
                      </span>
                      <span className="rating__value">{rating.rating}</span>
                    </li>
                  );
                })}
              </ul>
            )}
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
