import { useState } from "react";
import { AlertTriangle, Flag, ShieldCheck, Trash2 } from "lucide-react";

import { AppShell } from "./components/AppShell";
import { EmptyState, Notice, Skeleton } from "./components/ui";
import { useLiveData } from "./hooks/useLiveData";
import { usePersistentState } from "./hooks/usePersistentState";
import { api } from "./lib/api";
import type { PlayerReport, ReportStatus, User } from "./types";

const STATUS_LABEL: Record<ReportStatus, string> = {
  open: "Offen",
  reviewed: "Geprüft",
  resolved: "Erledigt",
  dismissed: "Verworfen",
};

const ReportsView: React.FC = () => {
  const users = useLiveData(() => api.getUsers());
  const reports = useLiveData(() => api.getReports());

  const [currentUserId, setCurrentUserId] = usePersistentState("currentUserId", 1);
  const [statusFilter, setStatusFilter] = useState<ReportStatus | "all">("all");
  const [reportedUserId, setReportedUserId] = useState<number | "">("");
  const [reason, setReason] = useState("");
  const [details, setDetails] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const userList = users.data ?? [];
  const userMap = new Map(userList.map((user) => [user.id, user]));
  const currentUser = userList.find((user) => user.id === currentUserId) ?? userList[0];
  const isAdmin = currentUser?.role === "admin";

  const allReports = reports.data ?? [];
  const visibleReports =
    statusFilter === "all" ? allReports : allReports.filter((report) => report.status === statusFilter);

  async function run(action: () => Promise<unknown>): Promise<void> {
    setBusy(true);
    try {
      await action();
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Aktion fehlgeschlagen.");
    } finally {
      setBusy(false);
    }
  }

  async function handleStatus(report: PlayerReport, status: ReportStatus): Promise<void> {
    await run(() => api.updateReport(report.id, { status, reviewedBy: currentUserId }));
  }

  async function handleDelete(report: PlayerReport): Promise<void> {
    if (!window.confirm(`Meldung ${report.id} wirklich löschen?`)) return;
    await run(() => api.deleteReport(report.id));
  }

  async function handleCreate(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    if (reportedUserId === "" || reason.trim() === "") return;
    await run(() =>
      api.createReport({
        reporterId: currentUserId,
        reportedUserId: Number(reportedUserId),
        reason: reason.trim(),
        details: details.trim() || null,
      }),
    );
    setReason("");
    setDetails("");
    setReportedUserId("");
  }

  const loadError = users.error ?? reports.error;

  return (
    <AppShell users={userList} currentUserId={currentUserId} onCurrentUserChange={setCurrentUserId} active="reports">
      {loadError ? (
        <Notice tone="danger" title="Daten konnten nicht geladen werden">
          {loadError}
        </Notice>
      ) : null}
      {error ? (
        <Notice tone="danger" action={<button type="button" className="btn btn--sm btn--ghost" onClick={() => setError(null)}>Schließen</button>}>
          {error}
        </Notice>
      ) : null}

      <section className="hero">
        <div className="hero__text">
          <p className="hero__eyebrow">
            <Flag aria-hidden="true" size={15} />
            Verwaltung
          </p>
          <h1 className="hero__title">Spieler-Meldungen</h1>
          <p className="hero__lead">
            Meldungen über Spieler einsehen, prüfen und mit einer Aktion versehen.
          </p>
        </div>
      </section>

      {!isAdmin ? (
        <Notice tone="warn" title="Nur für Admins">
          Diese Ansicht ist für Administratoren reserviert.
        </Notice>
      ) : null}

      {isAdmin ? (
        <section className="card panel" aria-labelledby="panel-create">
          <header className="panel__head">
            <h2 className="panel__title" id="panel-create">
              Neue Meldung
            </h2>
          </header>
          <form className="form" onSubmit={(event) => void handleCreate(event)}>
            <label className="field">
              <span>Gemeldeter Spieler</span>
              <select
                className="select"
                value={reportedUserId}
                onChange={(event) => setReportedUserId(event.target.value === "" ? "" : Number(event.target.value))}
                required
              >
                <option value="">Bitte wählen</option>
                {userList.map((user: User) => (
                  <option key={user.id} value={user.id}>
                    {user.username}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Grund</span>
              <input className="input" value={reason} onChange={(event) => setReason(event.target.value)} required />
            </label>
            <label className="field">
              <span>Details</span>
              <textarea className="input" value={details} onChange={(event) => setDetails(event.target.value)} />
            </label>
            <button type="submit" className="btn btn--primary" disabled={busy}>
              Meldung anlegen
            </button>
          </form>
        </section>
      ) : null}

      <section className="card panel" aria-labelledby="panel-reports">
        <header className="panel__head">
          <span className="panel__icon" aria-hidden="true">
            <ShieldCheck size={18} />
          </span>
          <div>
            <h2 className="panel__title" id="panel-reports">
              Meldungen
            </h2>
            <p className="panel__subtitle">{visibleReports.length} Einträge</p>
          </div>
          <select
            className="select select--compact"
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value as ReportStatus | "all")}
            aria-label="Status filtern"
          >
            <option value="all">Alle</option>
            <option value="open">Offen</option>
            <option value="reviewed">Geprüft</option>
            <option value="resolved">Erledigt</option>
            <option value="dismissed">Verworfen</option>
          </select>
        </header>

        {reports.loading ? (
          <Skeleton rows={3} />
        ) : visibleReports.length > 0 ? (
          <ul className="list">
            {visibleReports.map((report) => {
              const reported = userMap.get(report.reported_user_id);
              const reporter = report.reporter_id !== null ? userMap.get(report.reporter_id) : null;
              return (
                <li key={report.id} className="list__item">
                  <div className="list__main">
                    <strong>
                      {reported?.username ?? `#${report.reported_user_id}`} – {report.reason}
                    </strong>
                    <span className="list__meta">
                      {STATUS_LABEL[report.status]} · Melder: {reporter?.username ?? "anonym"} ·{" "}
                      {new Date(report.created_at).toLocaleString()}
                    </span>
                    {report.details ? <p className="list__detail">{report.details}</p> : null}
                    {report.admin_note ? <p className="list__detail">Notiz: {report.admin_note}</p> : null}
                  </div>
                  <div className="list__actions">
                    <button
                      type="button"
                      className="btn btn--sm btn--ghost"
                      disabled={busy || !isAdmin}
                      onClick={() => void handleStatus(report, "reviewed")}
                    >
                      Prüfen
                    </button>
                    <button
                      type="button"
                      className="btn btn--sm btn--primary"
                      disabled={busy || !isAdmin}
                      onClick={() => void handleStatus(report, "resolved")}
                    >
                      Erledigen
                    </button>
                    <button
                      type="button"
                      className="btn btn--sm btn--ghost"
                      disabled={busy || !isAdmin}
                      onClick={() => void handleStatus(report, "dismissed")}
                    >
                      Verwerfen
                    </button>
                    <button
                      type="button"
                      className="btn btn--sm btn--danger"
                      disabled={busy || !isAdmin}
                      onClick={() => void handleDelete(report)}
                    >
                      <Trash2 aria-hidden="true" size={14} />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <EmptyState icon={AlertTriangle} title="Keine Meldungen">
            Für den gewählten Filter gibt es keine Einträge.
          </EmptyState>
        )}
      </section>
    </AppShell>
  );
};

export default ReportsView;
