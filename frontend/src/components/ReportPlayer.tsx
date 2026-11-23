import { useState } from "react";
import { Flag, Send, X } from "lucide-react";

import { ApiError, api } from "../lib/api";
import { SIDE_LABEL, type GameSession, type User } from "../types";
import { Notice } from "./ui";

/**
 * Vorgegebene Meldegruende. Der erste Eintrag ist vorausgewaehlt; "Sonstiges"
 * verlangt eine Beschreibung, damit die Administration den Vorfall einordnen
 * kann.
 */
export const REPORT_REASONS = [
  "Unsportliches Verhalten",
  "Beleidigung oder Belästigung",
  "Schummelverdacht",
  "Absichtliches Zeitspiel",
  "Sonstiges",
] as const;

interface Props {
  session: GameSession;
  users: Map<number, User>;
  reporterId: number;
}

/**
 * Meldeformular fuer eine laufende oder gerade beendete Sitzung.
 *
 * Gemeldet werden kann nur die andere Seite. Die Zugehoerigkeit zur Sitzung
 * prueft das Backend noch einmal (`POST /api/reports`), damit die Beschraenkung
 * nicht nur in der Oberflaeche gilt.
 */
export function ReportPlayer({ session, users, reporterId }: Props) {
  const targets = (["red", "yellow"] as const)
    .filter((side) => session.players[side] !== reporterId)
    .map((side) => ({ side, userId: session.players[side] }));

  const [open, setOpen] = useState(false);
  const [targetId, setTargetId] = useState<number | "">(targets[0]?.userId ?? "");
  const [reason, setReason] = useState<string>(REPORT_REASONS[0]);
  const [details, setDetails] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const targetName = targets.find((target) => target.userId === targetId)?.userId;
  const targetLabel = targetName !== undefined ? users.get(targetName)?.username ?? `#${targetName}` : "";

  function close(): void {
    setOpen(false);
    setError(null);
    if (done) {
      setDone(false);
      setDetails("");
      setReason(REPORT_REASONS[0]);
    }
  }

  async function handleSubmit(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    if (targetId === "") return;

    const trimmed = details.trim();
    if (reason === "Sonstiges" && trimmed === "") {
      setError("Bitte beschreibe den Vorfall kurz.");
      return;
    }

    const sessionId = Number(session.id);
    if (!Number.isFinite(sessionId)) {
      setError("Diese Sitzung kann nicht gemeldet werden.");
      return;
    }

    setBusy(true);
    setError(null);
    try {
      await api.createReport({
        reportedUserId: targetId,
        sessionId,
        reason,
        details: trimmed === "" ? null : trimmed,
      });
      setDone(true);
    } catch (cause) {
      if (cause instanceof ApiError) {
        setError(
          cause.status === 409
            ? "Du hast diese Person für diese Sitzung bereits gemeldet."
            : cause.status === 403
              ? "Nur Teilnehmende dieser Sitzung können eine Meldung abgeben."
              : cause.message,
        );
      } else {
        setError("Meldung konnte nicht gesendet werden.");
      }
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <section className="window__report">
        <button
          type="button"
          className="btn btn--danger-ghost btn--sm"
          onClick={() => {
            setOpen(true);
            setError(null);
            setDone(false);
          }}
        >
          <Flag aria-hidden="true" size={15} />
          Spieler:in melden
        </button>
      </section>
    );
  }

  return (
    <section className="window__report" aria-labelledby="report-player-title">
      <div className="card panel">
        <header className="panel__head">
          <span className="panel__icon" aria-hidden="true">
            <Flag size={18} />
          </span>
          <div>
            <h2 className="panel__title" id="report-player-title">
              Spieler:in melden
            </h2>
            <p className="panel__subtitle">Meldung zur Sitzung {session.id}</p>
          </div>
          <button
            type="button"
            className="btn btn--ghost btn--sm panel__head-action"
            onClick={close}
            disabled={busy}
            aria-label="Meldeformular schließen"
          >
            <X aria-hidden="true" size={15} />
          </button>
        </header>

        {done ? (
          <Notice tone="success" title="Meldung übermittelt">
            Die Administration prüft deine Meldung zu <strong>{targetLabel}</strong>. Du musst nichts
            weiter tun.
          </Notice>
        ) : (
          <form className="form" onSubmit={(event) => void handleSubmit(event)}>
            <label className="field">
              <span>Gemeldete Person</span>
              <select
                className="select"
                value={targetId}
                onChange={(event) => setTargetId(event.target.value === "" ? "" : Number(event.target.value))}
                required
              >
                {targets.length === 0 ? <option value="">Keine Person verfügbar</option> : null}
                {targets.map((target) => (
                  <option key={target.side} value={target.userId}>
                    {users.get(target.userId)?.username ?? `#${target.userId}`} ({SIDE_LABEL[target.side]})
                  </option>
                ))}
              </select>
            </label>

            <label className="field">
              <span>Grund</span>
              <select className="select" value={reason} onChange={(event) => setReason(event.target.value)} required>
                {REPORT_REASONS.map((entry) => (
                  <option key={entry} value={entry}>
                    {entry}
                  </option>
                ))}
              </select>
            </label>

            <label className="field">
              <span>Was ist passiert?</span>
              <textarea
                className="input"
                value={details}
                onChange={(event) => setDetails(event.target.value)}
                rows={3}
                placeholder="Kurze Beschreibung, damit die Administration den Vorfall nachvollziehen kann."
                required={reason === "Sonstiges"}
              />
            </label>

            {error ? <Notice tone="danger">{error}</Notice> : null}

            <div className="panel__actions">
              <button type="submit" className="btn btn--primary" disabled={busy || targetId === ""}>
                <Send aria-hidden="true" size={15} />
                Meldung absenden
              </button>
              <button type="button" className="btn btn--ghost" onClick={close} disabled={busy}>
                Abbrechen
              </button>
            </div>
          </form>
        )}
      </div>
    </section>
  );
}
