import { useState } from "react";
import { ArrowLeft, ArrowRight, BookOpen, Ban, History, LayoutGrid, Lock, Play, Sparkles } from "lucide-react";

import { GameArt } from "./components/GameArt";
import { GameCard } from "./components/GameCard";
import { PlayerPicker } from "./components/PlayerPicker";
import { Avatar, Badge, EmptyState, Notice, Skeleton, Spinner } from "./components/ui";
import { useLiveData } from "./hooks/useLiveData";
import { usePersistentState } from "./hooks/usePersistentState";
import { ApiError, api } from "./lib/api";
import { formatRelative } from "./lib/format";
import { useNavigate, windowPath } from "./router";
import { SIDE_LABEL, type GameSession } from "./types";

interface Props {
  gameName: string;
}

const GAME_WINDOW = "width=980,height=880";

/**
 * Einstellungen eines Spiels – die zweite Stufe nach dem Katalog. Hier werden
 * die Personen gewählt und die Partie gestartet.
 */
const GameSetup: React.FC<Props> = ({ gameName }) => {
  const navigate = useNavigate();

  const game = useLiveData(() => api.getGameType(gameName));
  const users = useLiveData(() => api.getUsers());
  const sessions = useLiveData(() => api.listSessions());
  const games = useLiveData(() => api.listGames());

  const [currentUserId] = usePersistentState("currentUserId", 1);
  const [redId, setRedId] = useState<number | null>(null);
  const [yellowId, setYellowId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ tone: "danger" | "warn"; text: string } | null>(null);
  const [fallbackUrl, setFallbackUrl] = useState<string | null>(null);

  const gameTypes = game.data;
  const loading = users.loading || game.loading;

  const userList = users.data ?? [];
  const userMap = new Map(userList.map((user) => [user.id, user]));
  const gameSessions = (sessions.data ?? []).filter((session) => session.gameType === gameName);
  const gameGames = (games.data ?? []).filter((candidate) => candidate.gameType === gameName);
  const runningSession = gameSessions.find((session) => session.outcome === null) ?? null;
  const tally = { games: gameGames.length, sessions: gameSessions.length };

  const ready = redId !== null && yellowId !== null && redId !== yellowId;

  const openWindow = (url: string, name: string) => {
    const popup = window.open(url, name, GAME_WINDOW);
    if (!popup) setFallbackUrl(url);
    else popup.focus();
  };

  async function handleStart(): Promise<void> {
    if (!ready || !gameTypes) return;
    setBusy(true);
    setFeedback(null);
    setFallbackUrl(null);
    try {
      const session = await api.createSession({
        gameType: gameTypes.name,
        hostId: currentUserId,
        players: { red: redId, yellow: yellowId },
      });
      const path = windowPath(gameTypes.name, session.id);
      if (!path) throw new ApiError("Für dieses Spiel gibt es noch kein Spielfeld-Fenster.");

      openWindow(`${window.location.origin}${path}`, `${gameTypes.name}_${session.id}`);
      setRedId(null);
      setYellowId(null);
    } catch (cause) {
      setFeedback({
        tone: "danger",
        text: cause instanceof ApiError ? cause.message : "Sitzung konnte nicht angelegt werden.",
      });
    } finally {
      setBusy(false);
    }
  }

  if (game.loading) {
    return (
      <div className="shell">
        <main className="shell__main">
          <Skeleton rows={4} />
        </main>
      </div>
    );
  }

  if (!gameTypes) {
    return (
      <div className="shell">
        <main className="shell__main">
          <BackLink onClick={() => navigate("/")} />
          <Notice
            tone="warn"
            title={`Unbekanntes Spiel: ${gameName}`}
            action={
              <button type="button" className="btn btn--sm btn--primary" onClick={() => navigate("/")}>
                Zum Katalog
              </button>
            }
          >
            Im Katalog gibt es kein Spiel mit dieser Kennung.
          </Notice>
        </main>
      </div>
    );
  }

  if (!gameTypes.implemented) {
    return (
      <div className="shell">
        <main className="shell__main">
          <BackLink onClick={() => navigate("/")} />

          <section className="detail-head" data-accent={gameTypes.accent}>
            <GameArt game={gameTypes} size="lg" />
            <div>
              <p className="hero__eyebrow">
                <Sparkles aria-hidden="true" size={15} />
                {gameTypes.tagline}
              </p>
              <h1 className="hero__title">{gameTypes.displayName}</h1>
              <p className="hero__lead">{gameTypes.description}</p>
            </div>
          </section>

          <div className="grid">
            <section className="card panel">
              <header className="panel__head">
                <span className="panel__icon" aria-hidden="true">
                  <BookOpen size={18} />
                </span>
                <div>
                  <h2 className="panel__title">Regeln</h2>
                  <p className="panel__subtitle">Kurzfassung</p>
                </div>
              </header>
              <ul className="rules">
                {gameTypes.rules.map((rule) => (
                  <li key={rule} className="rules__item">
                    {rule}
                  </li>
                ))}
              </ul>
            </section>

            <section className="card panel">
              <header className="panel__head">
                <span className="panel__icon" aria-hidden="true">
                  <Lock size={18} />
                </span>
                <div>
                  <h2 className="panel__title">Noch nicht spielbar</h2>
                  <p className="panel__subtitle">Gehört schon zum Katalog</p>
                </div>
              </header>
              <p className="text">
                Der Eintrag liegt in der Datenbank (<code>game_types.name</code> ={" "}
                <code>{gameTypes.name}</code>), die Spielregeln werden aber noch nicht umgesetzt. Sobald das
                Brett fertig ist, erscheint hier die Auswahl der Personen.
              </p>
              <div className="panel__actions">
                <button type="button" className="btn btn--ghost" onClick={() => navigate("/")}>
                  <ArrowLeft aria-hidden="true" size={16} />
                  Anderes Spiel wählen
                </button>
              </div>
            </section>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="shell">
      <main className="shell__main">
        <BackLink onClick={() => navigate("/")} />

        <section className="detail-head" data-accent={gameTypes.accent}>
          <GameArt game={gameTypes} size="lg" />
          <div>
            <p className="hero__eyebrow">
              <Sparkles aria-hidden="true" size={15} />
              {gameTypes.tagline}
            </p>
            <h1 className="hero__title">{gameTypes.displayName}</h1>
            <p className="hero__lead">{gameTypes.description}</p>
            <p className="detail-head__facts">
              <Badge tone="live">spielbar</Badge>
              <span className="tile__fact">{gameTypes.maxPlayers} Spieler:innen</span>
              {gameTypes.board ? (
                <span className="tile__fact">
                  {gameTypes.board.cols}×{gameTypes.board.rows}
                </span>
              ) : null}
              {tally.games > 0 ? (
                <span className="tile__fact">
                  {tally.games} {tally.games === 1 ? "Partie" : "Partien"}
                </span>
              ) : null}
            </p>
          </div>
        </section>

        <div className="grid">
          {/* ------------------------------------------------ Einstellungen */}
          <section className="card panel" aria-labelledby="panel-setup">
            <header className="panel__head">
              <span className="panel__icon" aria-hidden="true">
                <Play size={18} />
              </span>
              <div>
                <h2 className="panel__title" id="panel-setup">
                  Einstellungen
                </h2>
                <p className="panel__subtitle">Wer spielt?</p>
              </div>
            </header>

            {loading ? (
              <Skeleton rows={4} />
            ) : (
              <>
                <div className="pickers">
                  <PlayerPicker
                    side="red"
                    users={userList}
                    value={redId}
                    taken={yellowId === null ? [] : [yellowId]}
                    onChange={setRedId}
                  />
                  <PlayerPicker
                    side="yellow"
                    users={userList}
                    value={yellowId}
                    taken={redId === null ? [] : [redId]}
                    onChange={setYellowId}
                  />
                </div>

                {runningSession ? (
                  <Notice tone="warn" title="Es läuft bereits eine Partie">
                    Sitzung <code>{runningSession.id}</code> ist noch offen –{" "}
                    <button
                      type="button"
                      className="link"
                      onClick={() => {
                        const path = windowPath(gameTypes.name, runningSession.id);
                        if (path) openWindow(`${window.location.origin}${path}`, `${gameTypes.name}_${runningSession.id}`);
                      }}
                    >
                      Brett öffnen
                    </button>{" "}
                    oder sie unter „Sitzungen“ beenden.
                  </Notice>
                ) : null}

                {feedback ? <Notice tone={feedback.tone}>{feedback.text}</Notice> : null}

                {fallbackUrl ? (
                  <Notice
                    tone="warn"
                    title="Pop-up wurde blockiert"
                    action={
                      <button type="button" className="btn btn--sm btn--ghost" onClick={() => setFallbackUrl(null)}>
                        Schließen
                      </button>
                    }
                  >
                    Der Browser hat das Spielfeld-Fenster unterdrückt.{" "}
                    <a className="link" href={fallbackUrl} target="_blank" rel="noreferrer">
                      Brett hier öffnen
                    </a>
                    .
                  </Notice>
                ) : null}

                <div className="panel__actions">
                  <button
                    type="button"
                    className="btn btn--primary"
                    onClick={handleStart}
                    disabled={!ready || busy || runningSession !== null}
                  >
                    {busy ? <Spinner label="wird angelegt" /> : <Play aria-hidden="true" size={16} />}
                    Partie starten
                  </button>
                  <button type="button" className="btn btn--ghost" onClick={() => navigate("/play")}>
                    Ohne Sitzung spielen
                  </button>
                </div>
                <p className="hint">
                  {ready
                    ? "Das Brett öffnet sich als eigenes Fenster – beide Personen spielen abwechselnd darin."
                    : `Wähle zwei verschiedene Personen. ${SIDE_LABEL.red} beginnt.`}
                </p>
              </>
            )}
          </section>

          {/* ------------------------------------------------------- Regeln */}
          <section className="card panel" aria-labelledby="panel-rules">
            <header className="panel__head">
              <span className="panel__icon" aria-hidden="true">
                <BookOpen size={18} />
              </span>
              <div>
                <h2 className="panel__title" id="panel-rules">
                  Regeln
                </h2>
                <p className="panel__subtitle">Kurzfassung</p>
              </div>
            </header>
            <ul className="rules">
              {gameTypes.rules.map((rule) => (
                <li key={rule} className="rules__item">
                  {rule}
                </li>
              ))}
            </ul>
          </section>
        </div>

        {/* ---------------------------------------------------- Historie */}
        <section className="card panel" aria-labelledby="panel-setup-history">
          <header className="panel__head">
            <span className="panel__icon" aria-hidden="true">
              <History size={18} />
            </span>
            <div>
              <h2 className="panel__title" id="panel-setup-history">
                Zuletzt gespielt
              </h2>
              <p className="panel__subtitle">
                {gameGames.length > 0
                  ? `${gameGames.length} ${gameGames.length === 1 ? "Verlauf" : "Verläufe"} zu ${gameTypes.displayName}`
                  : "Noch keine Partie"}
              </p>
            </div>
            {gameSessions.length > 0 ? (
              <button
                type="button"
                className="btn btn--ghost btn--sm panel__head-action"
                onClick={() => navigate("/sessions")}
              >
                <LayoutGrid aria-hidden="true" size={15} />
                Alle Sitzungen
              </button>
            ) : null}
          </header>

          {games.loading ? (
            <Skeleton rows={2} />
          ) : gameGames.length > 0 ? (
            <ul className="list list--games">
              {gameGames.slice(0, 4).map((game) => (
                <GameCard key={game.id} game={game} users={userMap} />
              ))}
            </ul>
          ) : (
            <EmptyState icon={History} title="Noch keine Partie">
              Sobald eine Partie zu Ende gespielt wurde, erscheint hier der Verlauf.
            </EmptyState>
          )}

          {runningSession ? (
            <p className="panel__foot">
              <Ban aria-hidden="true" size={14} />
              Laufende Sitzung <code>{runningSession.id}</code> seit{" "}
              {formatRelative(runningSession.createdAt)}
            </p>
          ) : null}
        </section>

        {/* ------------------------------------------- Personen im Überblick */}
        {gameSessions.length > 0 ? (
          <section className="card panel" aria-labelledby="panel-players">
            <header className="panel__head">
              <span className="panel__icon" aria-hidden="true">
                <Play size={18} />
              </span>
              <div>
                <h2 className="panel__title" id="panel-players">
                  Teilnehmende
                </h2>
                <p className="panel__subtitle">Wer hat {gameTypes.displayName} schon gespielt?</p>
              </div>
            </header>
            <PlayerStats users={userMap} sessions={gameSessions} />
          </section>
        ) : null}
      </main>
    </div>
  );
};

/** Zähler je Person aus den Sitzungen dieses Spiels. */
function PlayerStats({
  users,
  sessions,
}: {
  users: Map<number, { id: number; username: string; role: "admin" | "host" | "player" }>;
  sessions: GameSession[];
}) {
  const counts = new Map<number, number>();
  for (const session of sessions) {
    for (const side of ["red", "yellow"] as const) {
      const id = session.players[side];
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
  }

  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]);

  if (ranked.length === 0) {
    return <EmptyState icon={Play} title="Noch keine Zuordnung" />;
  }

  return (
    <ul className="leaderboard">
      {ranked.map(([userId, plays]) => {
        const user = users.get(userId);
        if (!user) return null;
        return (
          <li key={userId} className="leaderboard__row">
            {user ? <Avatar user={user} /> : null}
            <span className="leaderboard__name">{user.username}</span>
            <span className="leaderboard__count">
              {plays} {plays === 1 ? "Partie" : "Partien"}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function BackLink({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" className="backlink" onClick={onClick}>
      <ArrowLeft aria-hidden="true" size={16} />
      Alle Spiele
      <ArrowRight aria-hidden="true" className="backlink__end" size={16} />
    </button>
  );
}

export default GameSetup;