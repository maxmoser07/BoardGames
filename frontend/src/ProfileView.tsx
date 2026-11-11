import { useCallback, useMemo, useState } from "react";
import {
  Check,
  CircleUser,
  Search,
  UserMinus,
  UserPlus,
  Users,
  X,
} from "lucide-react";

import { AppShell } from "./components/AppShell";
import { Avatar, Badge, EmptyState, Notice, RoleChip, Skeleton } from "./components/ui";
import { useLiveData } from "./hooks/useLiveData";
import { ApiError, api } from "./lib/api";
import { useAuth } from "./lib/auth";
import { formatDateTime, formatRelative } from "./lib/format";
import { formatRating } from "./lib/ratings";
import type { FriendRequest, PlayerRating, User } from "./types";

/**
 * Profil der angemeldeten Person inklusive Freundesliste.
 *
 * Die Kennzahlen werden aus den ohnehin vorhandenen Sitzungs- und Verlaufsdaten
 * abgeleitet. Freundschaftsanfragen liegen in `friendships` (Migration
 * 20261110000002_friends.sql); senden, annehmen, ablehnen und entfernen laufen
 * über `api` und werden durch `useLiveData` sofort nachgeladen.
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
  const friends = useLiveData(() => api.getFriends());
  const accounts = useLiveData(() => api.getUsers());

  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionNote, setActionNote] = useState<string | null>(null);

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

  const friendIds = useMemo(
    () => new Set((friends.data?.friends ?? []).map((friend) => friend.id)),
    [friends.data],
  );
  const incomingByUser = useMemo(() => {
    const map = new Map<number, FriendRequest>();
    for (const request of friends.data?.incoming ?? []) map.set(request.user.id, request);
    return map;
  }, [friends.data]);
  const outgoingByUser = useMemo(() => {
    const map = new Map<number, FriendRequest>();
    for (const request of friends.data?.outgoing ?? []) map.set(request.user.id, request);
    return map;
  }, [friends.data]);

  const candidates = useMemo(() => {
    const term = query.trim().toLowerCase();
    return (accounts.data ?? [])
      .filter((user) => user.id !== userId)
      .filter((user) => term === "" || user.username.toLowerCase().includes(term))
      .sort((a, b) => {
        const friendDelta = Number(friendIds.has(b.id)) - Number(friendIds.has(a.id));
        return friendDelta || a.username.localeCompare(b.username);
      })
      .slice(0, 12);
  }, [accounts.data, friendIds, query, userId]);

  const runAction = useCallback(
    async (key: string, action: () => Promise<unknown>, note: string) => {
      setBusy(key);
      setActionError(null);
      setActionNote(null);
      try {
        await action();
        setActionNote(note);
      } catch (cause) {
        setActionError(
          cause instanceof ApiError ? cause.message : "Die Aktion ist fehlgeschlagen.",
        );
      } finally {
        setBusy(null);
      }
    },
    [],
  );

  const loading =
    profile.loading ||
    games.loading ||
    sessions.loading ||
    rating.loading ||
    friends.loading ||
    accounts.loading;
  const loadError =
    profile.error ??
    games.error ??
    sessions.error ??
    rating.error ??
    friends.error ??
    accounts.error;
  const user = profile.data ?? authUser;
  const friendOverview = friends.data;
  const incoming = friendOverview?.incoming ?? [];
  const outgoing = friendOverview?.outgoing ?? [];
  const friendList = friendOverview?.friends ?? [];

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
                zugeordnet, sobald du angemeldet bist. Hier verwaltest du außerdem deine
                Freundschaften.
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
                <dt className="stat__value">{friendList.length}</dt>
                <dd className="stat__label">Freunde</dd>
              </div>
              <div className="stat">
                <dt className="stat__value">
                  {rating.data ? formatRating(rating.data.rating) : "–"}
                </dt>
                <dd className="stat__label">Rating</dd>
              </div>
            </dl>
          </section>

          {actionError ? (
            <Notice tone="danger" title="Aktion fehlgeschlagen">
              {actionError}
            </Notice>
          ) : null}
          <p className="sr-only" aria-live="polite">
            {actionNote ?? ""}
          </p>
          {actionNote ? <Notice tone="success" title="Erledigt">{actionNote}</Notice> : null}

          <div className="grid">
            <section
              className="card"
              aria-label="Kontodaten"
              style={{ padding: 24, display: "grid", gap: 16 }}
            >
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

            <section className="card panel friend-panel" aria-labelledby="friends-title">
              <header className="panel__head">
                <span className="panel__icon" aria-hidden="true">
                  <Users size={18} />
                </span>
                <div>
                  <h2 className="panel__title" id="friends-title">
                    Freunde
                  </h2>
                  <p className="panel__subtitle">
                    {friendList.length} Freund:innen · {incoming.length} offene Anfrage
                    {incoming.length === 1 ? "" : "n"}
                  </p>
                </div>
              </header>

              {incoming.length > 0 ? (
                <div className="friend-block">
                  <h3 className="friend-block__title">
                    Anfragen an dich <Badge tone="live">{incoming.length}</Badge>
                  </h3>
                  <ul className="friend-list">
                    {incoming.map((request) => {
                      const key = `accept-${request.id}`;
                      return (
                        <li className="friend-row" key={request.id}>
                          <span className="friend-row__identity">
                            <Avatar user={request.user} />
                            <span>
                              <strong>{request.user.username}</strong>
                              <span className="friend-row__meta">
                                möchte dich hinzufügen · {formatRelative(request.createdAt)}
                              </span>
                            </span>
                          </span>
                          <span className="friend-row__actions">
                            <button
                              type="button"
                              className="btn btn--primary btn--sm"
                              disabled={busy !== null}
                              onClick={() =>
                                void runAction(
                                  key,
                                  () => api.acceptFriendRequest(request.id),
                                  `${request.user.username} ist jetzt in deiner Freundesliste.`,
                                )
                              }
                            >
                              <Check aria-hidden="true" size={14} />
                              Annehmen
                            </button>
                            <button
                              type="button"
                              className="btn btn--ghost btn--sm"
                              disabled={busy !== null}
                              onClick={() =>
                                void runAction(
                                  `decline-${request.id}`,
                                  () => api.declineFriendRequest(request.id),
                                  "Anfrage abgelehnt.",
                                )
                              }
                            >
                              <X aria-hidden="true" size={14} />
                              Ablehnen
                            </button>
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ) : null}

              {outgoing.length > 0 ? (
                <div className="friend-block">
                  <h3 className="friend-block__title">Gesendete Anfragen</h3>
                  <ul className="friend-list">
                    {outgoing.map((request) => (
                      <li className="friend-row" key={request.id}>
                        <span className="friend-row__identity">
                          <Avatar user={request.user} />
                          <span>
                            <strong>{request.user.username}</strong>
                            <span className="friend-row__meta">
                              angefragt {formatRelative(request.createdAt)}
                            </span>
                          </span>
                        </span>
                        <span className="friend-row__actions">
                          <span className="badge">gesendet</span>
                          <button
                            type="button"
                            className="btn btn--ghost btn--sm"
                            disabled={busy !== null}
                            onClick={() =>
                              void runAction(
                                `cancel-${request.id}`,
                                () => api.cancelFriendRequest(request.id),
                                "Anfrage zurückgezogen.",
                              )
                            }
                          >
                            Zurückziehen
                          </button>
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              <div className="friend-block">
                <h3 className="friend-block__title">Deine Freund:innen</h3>
                {friendList.length === 0 ? (
                  <EmptyState icon={Users} title="Noch keine Freund:innen">
                    Suche unten nach einem Konto und schicke die erste Anfrage.
                  </EmptyState>
                ) : (
                  <ul className="friend-list">
                    {friendList.map((friend) => (
                      <li className="friend-row" key={friend.id}>
                        <span className="friend-row__identity">
                          <Avatar user={friend} />
                          <span>
                            <strong>{friend.username}</strong>
                            <span className="friend-row__meta">
                              Freund:in seit {formatDateTime(friend.friendsSince)}
                            </span>
                          </span>
                        </span>
                        <span className="friend-row__actions">
                          <RoleChip role={friend.role} />
                          <button
                            type="button"
                            className="btn btn--ghost btn--sm"
                            disabled={busy !== null}
                            onClick={() =>
                              void runAction(
                                `remove-${friend.id}`,
                                () => api.removeFriend(friend.id),
                                `${friend.username} wurde entfernt.`,
                              )
                            }
                          >
                            <UserMinus aria-hidden="true" size={14} />
                            Entfernen
                          </button>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="friend-block">
                <h3 className="friend-block__title">Personen finden</h3>
                <label className="search friend-search">
                  <Search aria-hidden="true" className="search__icon" size={16} />
                  <input
                    type="search"
                    className="input search__input"
                    placeholder="Nach Benutzername suchen"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                  />
                </label>

                {candidates.length === 0 ? (
                  <p className="hint">
                    {query.trim() === ""
                      ? "Es gibt keine weiteren aktiven Konten."
                      : "Kein Konto mit diesem Namen gefunden."}
                  </p>
                ) : (
                  <ul className="friend-list">
                    {candidates.map((candidate) => {
                      const pendingIn = incomingByUser.get(candidate.id);
                      const pendingOut = outgoingByUser.get(candidate.id);
                      const isFriend = friendIds.has(candidate.id);
                      return (
                        <li className="friend-row" key={candidate.id}>
                          <span className="friend-row__identity">
                            <Avatar user={candidate} />
                            <span>
                              <strong>{candidate.username}</strong>
                              <span className="friend-row__meta">
                                <RoleChip role={candidate.role} />
                              </span>
                            </span>
                          </span>
                          <span className="friend-row__actions">
                            {isFriend ? (
                              <Badge tone="done">Freund:in</Badge>
                            ) : pendingIn ? (
                              <>
                                <button
                                  type="button"
                                  className="btn btn--primary btn--sm"
                                  disabled={busy !== null}
                                  onClick={() =>
                                    void runAction(
                                      `accept-${pendingIn.id}`,
                                      () => api.acceptFriendRequest(pendingIn.id),
                                      `${candidate.username} ist jetzt in deiner Freundesliste.`,
                                    )
                                  }
                                >
                                  <Check aria-hidden="true" size={14} />
                                  Annehmen
                                </button>
                                <button
                                  type="button"
                                  className="btn btn--ghost btn--sm"
                                  disabled={busy !== null}
                                  onClick={() =>
                                    void runAction(
                                      `decline-${pendingIn.id}`,
                                      () => api.declineFriendRequest(pendingIn.id),
                                      "Anfrage abgelehnt.",
                                    )
                                  }
                                >
                                  <X aria-hidden="true" size={14} />
                                  Ablehnen
                                </button>
                              </>
                            ) : pendingOut ? (
                              <>
                                <Badge tone="live">Anfrage offen</Badge>
                                <button
                                  type="button"
                                  className="btn btn--ghost btn--sm"
                                  disabled={busy !== null}
                                  onClick={() =>
                                    void runAction(
                                      `cancel-${pendingOut.id}`,
                                      () => api.cancelFriendRequest(pendingOut.id),
                                      "Anfrage zurückgezogen.",
                                    )
                                  }
                                >
                                  Zurückziehen
                                </button>
                              </>
                            ) : (
                              <button
                                type="button"
                                className="btn btn--primary btn--sm"
                                disabled={busy !== null}
                                onClick={() =>
                                  void runAction(
                                    `send-${candidate.id}`,
                                    () => api.sendFriendRequest(candidate.id),
                                    `Anfrage an ${candidate.username} gesendet.`,
                                  )
                                }
                              >
                                <UserPlus aria-hidden="true" size={14} />
                                Anfrage senden
                              </button>
                            )}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </section>
          </div>
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
