import { useMemo, useState } from "react";
import { RotateCcw, Trophy, Users } from "lucide-react";

import { AppShell } from "./components/AppShell";
import { Avatar, EmptyState, Notice, Skeleton } from "./components/ui";
import { useLiveData } from "./hooks/useLiveData";
import { api } from "./lib/api";
import { useAuth } from "./lib/auth";
import { formatDateTime } from "./lib/format";
import { canViewLeaderboard, isAdmin } from "./lib/permissions";
import {
  DEFAULT_RATING,
  RATING_TIER_LABEL,
  formatRating,
  rankRatings,
  ratingTier,
  winRate,
} from "./lib/ratings";
import type { PlayerRating } from "./types";

const MIN_RATING = 100;
const MAX_RATING = 4000;

/**
 * Rangliste aller Spieler:innen. Admins koennen ein Rating hier zuruecksetzen,
 * wenn eine Partie falsch gewertet wurde oder ein Ergebnis rueckgaengig gemacht
 * werden soll. Der alte Wert wird im Backend protokolliert.
 *
 * Regulaere Spieler:innen sehen ausschliesslich ihr eigenes Rating; die
 * vollstaendige Rangliste ist Hosts und Admins vorbehalten.
 */
const RatingsView: React.FC = () => {
  const { user } = useAuth();
  const leaderboard = canViewLeaderboard(user?.role);
  const ratings = useLiveData<PlayerRating[]>(() => {
    if (leaderboard) return api.getRatings();
    if (!user) return Promise.resolve([]);
    return api.getRating(user.id).then((rating) => [rating]);
  });
  const canReset = isAdmin(user?.role);

  const [editing, setEditing] = useState<number | null>(null);
  const [target, setTarget] = useState(String(DEFAULT_RATING));
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const rows = useMemo(() => rankRatings(ratings.data ?? []), [ratings.data]);
  // Jede gewertete Partie erhoeht `games_played` bei beiden Konten, die Summe
  // zaehlt also doppelt.
  const games = Math.round(rows.reduce((sum, row) => sum + row.gamesPlayed, 0) / 2);
  const best = rows.reduce<PlayerRating | null>(
    (top, row) => (top === null || row.rating > top.rating ? row : top),
    null,
  );
  const own = user ? rows.find((row) => row.userId === user.id) : undefined;

  function startReset(row: PlayerRating): void {
    setEditing(row.userId);
    setTarget(String(DEFAULT_RATING));
    setReason("");
    setError(null);
  }

  async function handleReset(event: React.FormEvent, row: PlayerRating): Promise<void> {
    event.preventDefault();
    const value = Number(target);
    if (!Number.isInteger(value) || value < MIN_RATING || value > MAX_RATING) {
      setError(`Das Rating muss eine ganze Zahl zwischen ${MIN_RATING} und ${MAX_RATING} sein.`);
      return;
    }
    setBusy(true);
    try {
      await api.resetRating(row.userId, {
        rating: value,
        reason: reason.trim() || null,
        resetStats: true,
      });
      setEditing(null);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Rating konnte nicht zurückgesetzt werden.");
    } finally {
      setBusy(false);
    }
  }

  const loadError = ratings.error;
  const notices = (
    <>
      {loadError ? (
        <Notice tone="danger" title="Rating konnte nicht geladen werden">
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
    </>
  );

  if (!leaderboard) {
    const tier = own ? ratingTier(own.rating) : null;
    return (
      <AppShell active="ratings">
        {notices}

        <section className="hero">
          <div className="hero__text">
            <p className="hero__eyebrow">
              <Trophy aria-hidden="true" size={15} />
              Mein Rating
            </p>
            <h1 className="hero__title">Dein Rating</h1>
            <p className="hero__lead">
              Dein Elo-Wert aus beendeten Partien. Die vollständige Rangliste sehen Hosts und
              die Administration.
            </p>
          </div>

          <dl className="hero__stats">
            <div className="stat">
              <dt className="stat__value">{own ? formatRating(own.rating) : "–"}</dt>
              <dd className="stat__label">Rating</dd>
            </div>
            <div className="stat">
              <dt className="stat__value">{tier ? RATING_TIER_LABEL[tier] : "–"}</dt>
              <dd className="stat__label">Stufe</dd>
            </div>
            <div className="stat">
              <dt className="stat__value">{own && own.gamesPlayed > 0 ? `${winRate(own)} %` : "–"}</dt>
              <dd className="stat__label">Siegquote</dd>
            </div>
            <div className="stat">
              <dt className="stat__value">{own ? own.gamesPlayed : "–"}</dt>
              <dd className="stat__label">gewertete Partien</dd>
            </div>
          </dl>
        </section>

        <section className="card panel" aria-labelledby="panel-own-rating">
          <header className="panel__head">
            <span className="panel__icon" aria-hidden="true">
              <Trophy size={18} />
            </span>
            <div>
              <h2 className="panel__title" id="panel-own-rating">
                Mein Rating
              </h2>
              <p className="panel__subtitle">Nur dein eigener Wert</p>
            </div>
          </header>

          {ratings.loading ? (
            <Skeleton rows={4} />
          ) : own ? (
            <dl className="meta-list" style={{ margin: 0 }}>
              <div className="meta-list__row">
                <dt>Rating</dt>
                <dd>{formatRating(own.rating)}</dd>
              </div>
              <div className="meta-list__row">
                <dt>Stufe</dt>
                <dd>
                  <span className={`rating-tier rating-tier--${tier}`}>
                    {tier ? RATING_TIER_LABEL[tier] : "–"}
                  </span>
                </dd>
              </div>
              <div className="meta-list__row">
                <dt>Partien</dt>
                <dd>{own.gamesPlayed}</dd>
              </div>
              <div className="meta-list__row">
                <dt>Siege / Niederlagen / Remis</dt>
                <dd>
                  {own.wins} / {own.losses} / {own.draws}
                </dd>
              </div>
              <div className="meta-list__row">
                <dt>Siegquote</dt>
                <dd>{own.gamesPlayed > 0 ? `${winRate(own)} %` : "–"}</dd>
              </div>
              <div className="meta-list__row">
                <dt>Zuletzt gewertet</dt>
                <dd>{formatDateTime(own.updatedAt)}</dd>
              </div>
            </dl>
          ) : (
            <EmptyState icon={Trophy} title="Noch kein Rating">
              Sobald eine Partie mit zwei registrierten Konten gewertet ist, erscheint dein
              Wert hier.
            </EmptyState>
          )}
        </section>
      </AppShell>
    );
  }

  return (
    <AppShell active="ratings">
      {notices}

      <section className="hero">
        <div className="hero__text">
          <p className="hero__eyebrow">
            <Trophy aria-hidden="true" size={15} />
            Rangliste
          </p>
          <h1 className="hero__title">Spieler-Ratings</h1>
          <p className="hero__lead">
            Elo-Werte aus beendeten Partien. Ein Sieg gegen eine stärkere Person bringt
            mehr Punkte; ein Remis gibt beiden Seiten die Hälfte.
          </p>
        </div>

        <dl className="hero__stats">
          <div className="stat">
            <dt className="stat__value">{rows.length || "–"}</dt>
            <dd className="stat__label">Spieler:innen</dd>
          </div>
          <div className="stat">
            <dt className="stat__value">{best ? formatRating(best.rating) : "–"}</dt>
            <dd className="stat__label">Top-Rating</dd>
          </div>
          <div className="stat">
            <dt className="stat__value">{games || "–"}</dt>
            <dd className="stat__label">gewertete Partien</dd>
          </div>
          <div className="stat">
            <dt className="stat__value">{own ? formatRating(own.rating) : "–"}</dt>
            <dd className="stat__label">dein Rating</dd>
          </div>
        </dl>
      </section>

      <section className="card panel" aria-labelledby="panel-ratings">
        <header className="panel__head">
          <span className="panel__icon" aria-hidden="true">
            <Users size={18} />
          </span>
          <div>
            <h2 className="panel__title" id="panel-ratings">
              Rangliste
            </h2>
            <p className="panel__subtitle">
              {rows.length} Einträge
              {canReset ? " · Admins können Ratings zurücksetzen" : ""}
            </p>
          </div>
        </header>

        {ratings.loading ? (
          <Skeleton rows={4} />
        ) : rows.length > 0 ? (
          <ol className="rating-list">
            {rows.map((row, index) => {
              const tier = ratingTier(row.rating);
              const isEditing = editing === row.userId;
              return (
                <li key={row.userId} className="rating-row">
                  <span className="rating-row__rank" aria-label={`Platz ${index + 1}`}>
                    {index + 1}
                  </span>
                  <Avatar user={{ id: row.userId, username: row.username, role: row.role }} />
                  <div className="rating-row__main">
                    <div className="rating-row__head">
                      <strong className="rating-row__name">{row.username}</strong>
                      <span className={`rating-tier rating-tier--${tier}`}>
                        {RATING_TIER_LABEL[tier]}
                      </span>
                    </div>
                    <span className="rating-row__stats">
                      {row.wins} S · {row.losses} N · {row.draws} U ·{" "}
                      {row.gamesPlayed > 0 ? `${winRate(row)} % Siege` : "noch keine Partie"}
                    </span>
                    <span className="rating-row__updated">
                      zuletzt gewertet: {formatDateTime(row.updatedAt)}
                    </span>
                  </div>
                  <div className="rating-row__score">
                    <span className="rating-row__value">{formatRating(row.rating)}</span>
                    <span className="rating-row__score-label">Rating</span>
                  </div>
                  {canReset ? (
                    <div className="rating-row__actions">
                      <button
                        type="button"
                        className="btn btn--sm btn--ghost"
                        onClick={() => (isEditing ? setEditing(null) : startReset(row))}
                        aria-expanded={isEditing}
                      >
                        <RotateCcw aria-hidden="true" size={14} />
                        Zurücksetzen
                      </button>
                    </div>
                  ) : null}

                  {canReset && isEditing ? (
                    <form
                      className="rating-reset"
                      onSubmit={(event) => void handleReset(event, row)}
                    >
                      <p className="rating-reset__title">
                        Rating von <strong>{row.username}</strong> zurücksetzen
                      </p>
                      <label className="field field--inline">
                        <span>Neues Rating</span>
                        <input
                          className="input"
                          type="number"
                          min={MIN_RATING}
                          max={MAX_RATING}
                          step={1}
                          value={target}
                          onChange={(event) => setTarget(event.target.value)}
                          required
                        />
                      </label>
                      <label className="field field--inline">
                        <span>Grund (optional)</span>
                        <input
                          className="input"
                          value={reason}
                          maxLength={255}
                          placeholder="z. B. Partie versehentlich doppelt gewertet"
                          onChange={(event) => setReason(event.target.value)}
                        />
                      </label>
                      <div className="rating-reset__actions">
                        <button type="submit" className="btn btn--sm btn--danger" disabled={busy}>
                          {busy ? "Wird zurückgesetzt…" : "Zurücksetzen"}
                        </button>
                        <button
                          type="button"
                          className="btn btn--sm btn--ghost"
                          onClick={() => setEditing(null)}
                          disabled={busy}
                        >
                          Abbrechen
                        </button>
                      </div>
                      <p className="rating-reset__hint">
                        Der alte Wert bleibt im Reset-Protokoll erhalten; Siege, Niederlagen
                        und Remis werden auf 0 gesetzt.
                      </p>
                    </form>
                  ) : null}
                </li>
              );
            })}
          </ol>
        ) : (
          <EmptyState icon={Trophy} title="Noch keine Ratings">
            Sobald eine Partie gespeichert ist, erscheint hier die Rangliste.
          </EmptyState>
        )}
      </section>
    </AppShell>
  );
};

export default RatingsView;
