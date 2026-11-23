import { useState } from "react";
import { LayoutGrid, Pencil, Plus, Save, Settings, Trash2, X } from "lucide-react";

import { AppShell } from "./components/AppShell";
import { Badge, EmptyState, Notice, Skeleton } from "./components/ui";
import { useLiveData } from "./hooks/useLiveData";
import { api, type UpdateGameTypeInput } from "./lib/api";
import {
  GAME_ENGINES,
  GAME_ENGINE_KEYS,
  gameEngineInfo,
  type GameRulesJson,
} from "./lib/gameTypes";
import { ACCENT_KEYS, type AccentKey, type GameEngine, type GameType } from "./types";

const MIN_PLAYERS = 2;
const MAX_PLAYERS = 16;
const MIN_BOARD = 3;
const MAX_BOARD = 20;

const ACCENT_LABEL: Record<AccentKey, string> = {
  red: "Rot",
  amber: "Bernstein",
  violet: "Violett",
  teal: "Türkis",
  blue: "Blau",
  rose: "Rosé",
};

interface GameFormState {
  name: string;
  displayName: string;
  maxPlayers: number;
  engine: GameEngine;
  accent: AccentKey;
  tagline: string;
  description: string;
  rulesText: string;
  rows: number;
  cols: number;
  winLength: number;
  gravity: boolean;
}

function emptyForm(engine: GameEngine = "grid"): GameFormState {
  const info = GAME_ENGINES[engine];
  return {
    name: "",
    displayName: "",
    maxPlayers: 2,
    engine,
    accent: "rose",
    tagline: "",
    description: "",
    rulesText: "",
    rows: info.board?.rows ?? 3,
    cols: info.board?.cols ?? 3,
    winLength: info.winLength > 0 ? info.winLength : 3,
    gravity: info.gravity,
  };
}

function formFromGame(game: GameType): GameFormState {
  const engine = game.engine ?? "grid";
  const info = gameEngineInfo(engine);
  return {
    name: game.name,
    displayName: game.displayName,
    maxPlayers: game.maxPlayers,
    engine,
    accent: game.accent,
    tagline: game.tagline,
    description: game.description,
    rulesText: game.rules.join("\n"),
    rows: game.board?.rows ?? info.board?.rows ?? 3,
    cols: game.board?.cols ?? info.board?.cols ?? 3,
    winLength: game.winLength > 0 ? game.winLength : info.winLength || 3,
    gravity: game.gravity,
  };
}

/** Aus dem Formular wird genau die Struktur, die das Backend prüft. */
function rulesFromForm(form: GameFormState): GameRulesJson {
  const info = gameEngineInfo(form.engine);
  const board =
    form.engine === "mensch" ? null : info.fixedBoard ? info.board : { rows: form.rows, cols: form.cols };
  // Feste Vorlagen bringen ihre Gewinnbedingung selbst mit; `win_length: 0`
  // wäre für das Backend kein gültiger Wert.
  const logic = info.fixedBoard
    ? { gravity: info.gravity }
    : { win_length: form.winLength, gravity: form.gravity };

  return {
    engine: form.engine,
    tagline: form.tagline.trim(),
    description: form.description.trim(),
    rules: form.rulesText
      .split("\n")
      .map((rule) => rule.trim())
      .filter((rule) => rule !== ""),
    accent: form.accent,
    board,
    ...logic,
  };
}

/**
 * Spieleverwaltung der Administration.
 *
 * Neben Anlegen und Löschen lässt sich hier die Spiellogik bearbeiten: eine
 * Engine-Vorlage, Brettgröße, Gewinnbedingung, Regeln und Darstellung. Die
 * Werte landen in `game_types.rules_json` und wirken sofort im Katalog und auf
 * dem Brett. Neue Spiele sind dadurch spielbar, ohne dass Frontend-Code
 * geändert werden muss.
 */
const GamesAdminView: React.FC = () => {
  const games = useLiveData(() => api.getGameTypes());

  const [form, setForm] = useState<GameFormState>(() => emptyForm());
  const [editingId, setEditingId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const catalog = games.data ?? [];
  const editingGame = editingId === null ? null : (catalog.find((game) => game.id === editingId) ?? null);
  const info = gameEngineInfo(form.engine);
  const boardFixed = info.fixedBoard || form.engine === "mensch";

  function update<K extends keyof GameFormState>(key: K, value: GameFormState[K]): void {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function chooseEngine(engine: GameEngine): void {
    const next = GAME_ENGINES[engine];
    setForm((current) => ({
      ...current,
      engine,
      rows: next.board?.rows ?? current.rows,
      cols: next.board?.cols ?? current.cols,
      winLength: next.winLength > 0 ? next.winLength : current.winLength,
      gravity: next.gravity,
    }));
  }

  async function run(action: () => Promise<unknown>, done?: string): Promise<boolean> {
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      await action();
      if (done) setSuccess(done);
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Aktion fehlgeschlagen.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  function resetForm(): void {
    setForm(emptyForm());
    setEditingId(null);
  }

  async function handleSubmit(event: React.FormEvent): Promise<void> {
    event.preventDefault();

    if (!boardFixed && (form.rows < MIN_BOARD || form.cols < MIN_BOARD)) {
      setError(`Das Brett braucht mindestens ${MIN_BOARD}×${MIN_BOARD} Felder.`);
      return;
    }
    if (!boardFixed && form.winLength > Math.max(form.rows, form.cols)) {
      setError("Die Gewinnbedingung passt nicht auf das Brett.");
      return;
    }

    const rules = rulesFromForm(form);
    const saved = await run(
      () =>
        editingId === null
          ? api.createGameType({
              name: form.name.trim(),
              displayName: form.displayName.trim(),
              maxPlayers: form.maxPlayers,
              rules,
            })
          : api.updateGameType(editingId, {
              displayName: form.displayName.trim(),
              maxPlayers: form.maxPlayers,
              rules,
            } satisfies UpdateGameTypeInput),
      editingId === null
        ? `„${form.displayName.trim()}“ wurde angelegt und ist spielbar.`
        : `„${form.displayName.trim()}“ wurde aktualisiert.`,
    );

    if (saved) resetForm();
  }

  async function handleDelete(game: GameType): Promise<void> {
    if (
      !window.confirm(
        `„${game.displayName}“ wirklich aus dem Katalog löschen? Vorhandene Partien verhindern das Löschen.`,
      )
    ) {
      return;
    }
    const deleted = await run(
      () => api.deleteGameType(game.id),
      `„${game.displayName}“ wurde gelöscht.`,
    );
    if (deleted && editingId === game.id) resetForm();
  }

  function edit(game: GameType): void {
    setForm(formFromGame(game));
    setEditingId(game.id);
    setError(null);
    setSuccess(null);
    document.getElementById("panel-game-form")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <AppShell active="adminGames">
      {games.error ? (
        <Notice tone="danger" title="Spiele konnten nicht geladen werden">
          {games.error}
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
      {success ? (
        <Notice
          tone="success"
          action={
            <button type="button" className="btn btn--sm btn--ghost" onClick={() => setSuccess(null)}>
              Schließen
            </button>
          }
        >
          {success}
        </Notice>
      ) : null}

      <section className="hero">
        <div className="hero__text">
          <p className="hero__eyebrow">
            <Settings aria-hidden="true" size={15} />
            Verwaltung
          </p>
          <h1 className="hero__title">Spiele &amp; Spiellogik</h1>
          <p className="hero__lead">
            Spiele zum Katalog hinzufügen, Regeln und Brettmaße bearbeiten. Welche Kacheln
            erscheinen und wie gespielt wird, steuert die Datenbank – ohne Neu-Build.
          </p>
        </div>
        <dl className="hero__stats">
          <div className="stat">
            <dt className="stat__value">{catalog.length || "–"}</dt>
            <dd className="stat__label">Spiele</dd>
          </div>
          <div className="stat">
            <dt className="stat__value">{catalog.filter((game) => game.implemented).length || "–"}</dt>
            <dd className="stat__label">spielbar</dd>
          </div>
        </dl>
      </section>

      <section className="card panel" aria-labelledby="panel-game-form" id="panel-game-form">
        <header className="panel__head">
          <span className="panel__icon" aria-hidden="true">
            {editingId === null ? <Plus size={18} /> : <Pencil size={18} />}
          </span>
          <div>
            <h2 className="panel__title" id="panel-game-form-title">
              {editingId === null ? "Neues Spiel" : `„${editingGame?.displayName ?? form.displayName}“ bearbeiten`}
            </h2>
            <p className="panel__subtitle">
              {editingId === null
                ? "Engine-Vorlage wählen – danach sofort spielbar"
                : "Änderungen wirken beim nächsten Laden des Katalogs"}
            </p>
          </div>
          {editingId !== null ? (
            <button type="button" className="btn btn--ghost btn--sm panel__head-action" onClick={resetForm}>
              <X aria-hidden="true" size={15} />
              Abbrechen
            </button>
          ) : null}
        </header>

        <form className="form game-editor" onSubmit={(event) => void handleSubmit(event)}>
          <label className="field">
            <span>Kennung</span>
            <input
              className="input"
              value={form.name}
              onChange={(event) => update("name", event.target.value)}
              placeholder="z. B. backgammon"
              pattern="[a-z0-9]+(-[a-z0-9]+)*"
              maxLength={64}
              required
              disabled={editingId !== null}
            />
            <span className="hint">Kleinbuchstaben, Ziffern und einzelne Bindestriche.</span>
          </label>

          <label className="field">
            <span>Anzeigename</span>
            <input
              className="input"
              value={form.displayName}
              onChange={(event) => update("displayName", event.target.value)}
              placeholder="z. B. Backgammon"
              maxLength={128}
              required
            />
          </label>

          <label className="field">
            <span>Spieler:innen</span>
            <input
              className="input"
              type="number"
              min={MIN_PLAYERS}
              max={MAX_PLAYERS}
              value={form.maxPlayers}
              onChange={(event) => update("maxPlayers", Number(event.target.value))}
              required
            />
          </label>

          <label className="field">
            <span>Akzentfarbe</span>
            <select
              className="select"
              value={form.accent}
              onChange={(event) => update("accent", event.target.value as AccentKey)}
            >
              {ACCENT_KEYS.map((accent) => (
                <option key={accent} value={accent}>
                  {ACCENT_LABEL[accent]}
                </option>
              ))}
            </select>
          </label>

          <label className="field game-editor__wide">
            <span>Spiellogik-Vorlage</span>
            <select
              className="select"
              value={form.engine}
              onChange={(event) => chooseEngine(event.target.value as GameEngine)}
            >
              {GAME_ENGINE_KEYS.map((engine) => (
                <option key={engine} value={engine}>
                  {GAME_ENGINES[engine].label}
                </option>
              ))}
            </select>
            <span className="hint">{info.description}</span>
          </label>

          <label className="field">
            <span>Spalten</span>
            <input
              className="input"
              type="number"
              min={MIN_BOARD}
              max={MAX_BOARD}
              value={form.cols}
              onChange={(event) => update("cols", Number(event.target.value))}
              disabled={boardFixed}
              required={!boardFixed}
            />
          </label>

          <label className="field">
            <span>Zeilen</span>
            <input
              className="input"
              type="number"
              min={MIN_BOARD}
              max={MAX_BOARD}
              value={form.rows}
              onChange={(event) => update("rows", Number(event.target.value))}
              disabled={boardFixed}
              required={!boardFixed}
            />
          </label>

          <label className="field">
            <span>Gewinnbedingung</span>
            <input
              className="input"
              type="number"
              min={MIN_BOARD}
              max={MAX_BOARD}
              value={form.winLength}
              onChange={(event) => update("winLength", Number(event.target.value))}
              disabled={info.fixedBoard}
              required={!info.fixedBoard}
            />
            <span className="hint">Zusammenhängende Felder in einer Reihe.</span>
          </label>

          <label className="field field--inline game-editor__check">
            <input
              type="checkbox"
              checked={form.gravity}
              onChange={(event) => update("gravity", event.target.checked)}
              disabled={info.fixedBoard}
            />
            <span>Steine fallen lassen</span>
          </label>

          <label className="field game-editor__wide">
            <span>Untertitel</span>
            <input
              className="input"
              value={form.tagline}
              onChange={(event) => update("tagline", event.target.value)}
              placeholder="Kurzzeile in der Katalog-Kachel"
              maxLength={160}
            />
          </label>

          <label className="field game-editor__wide">
            <span>Beschreibung</span>
            <textarea
              className="input textarea"
              value={form.description}
              onChange={(event) => update("description", event.target.value)}
              placeholder="Ein Satz für die Detailseite"
              maxLength={600}
              rows={3}
            />
          </label>

          <label className="field game-editor__wide">
            <span>Regeln</span>
            <textarea
              className="input textarea"
              value={form.rulesText}
              onChange={(event) => update("rulesText", event.target.value)}
              placeholder={"Eine Regel pro Zeile\nRot beginnt\n…"}
              rows={5}
            />
            <span className="hint">Eine Regel pro Zeile; leer lassen für keine Kurzfassung.</span>
          </label>

          <div className="game-editor__actions">
            <button type="submit" className="btn btn--primary" disabled={busy}>
              {editingId === null ? <Plus aria-hidden="true" size={16} /> : <Save aria-hidden="true" size={16} />}
              {editingId === null ? "Spiel anlegen" : "Änderungen speichern"}
            </button>
            {editingId !== null ? (
              <button type="button" className="btn btn--ghost" onClick={resetForm} disabled={busy}>
                Abbrechen
              </button>
            ) : null}
          </div>
        </form>

        <p className="hint">
          Die Kennung ist der Schlüssel, unter dem Ergebnisse gespeichert werden, und lässt sich
          später nicht ändern. Ohne Logik-Vorlage bleibt ein Spiel „in Arbeit“.
        </p>
      </section>

      <section className="card panel" aria-labelledby="panel-game-list">
        <header className="panel__head">
          <span className="panel__icon" aria-hidden="true">
            <LayoutGrid size={18} />
          </span>
          <div>
            <h2 className="panel__title" id="panel-game-list">
              Katalog
            </h2>
            <p className="panel__subtitle">{catalog.length} Einträge</p>
          </div>
        </header>

        {games.loading ? (
          <Skeleton rows={3} />
        ) : catalog.length > 0 ? (
          <ul className="list">
            {catalog.map((game) => (
              <li key={game.id} className="list__item">
                <div className="list__main">
                  <strong>{game.displayName}</strong>
                  <span className="list__meta">
                    <code>{game.name}</code> · {game.maxPlayers} Spieler:innen
                    {game.engine ? ` · ${gameEngineInfo(game.engine).label}` : ""}
                    {game.board ? ` · ${game.board.cols}×${game.board.rows}` : ""}
                  </span>
                </div>
                <div className="list__actions">
                  {game.implemented ? (
                    <Badge tone="live">spielbar</Badge>
                  ) : (
                    <Badge tone="locked">in Arbeit</Badge>
                  )}
                  <button
                    type="button"
                    className="btn btn--sm btn--ghost"
                    disabled={busy}
                    onClick={() => edit(game)}
                  >
                    <Pencil aria-hidden="true" size={15} />
                    Bearbeiten
                  </button>
                  <button
                    type="button"
                    className="btn btn--sm btn--danger-ghost"
                    disabled={busy}
                    aria-label={`${game.displayName} löschen`}
                    onClick={() => void handleDelete(game)}
                  >
                    <Trash2 aria-hidden="true" size={15} />
                    Löschen
                  </button>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState icon={LayoutGrid} title="Kein Spiel im Katalog">
            Lege oben das erste Spiel an.
          </EmptyState>
        )}

        <p className="panel__foot">
          Spiele mit gespeicherten Partien lassen sich nicht löschen, damit die Historie erhalten
          bleibt.
        </p>
      </section>
    </AppShell>
  );
};

export default GamesAdminView;
