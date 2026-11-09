import { useState } from "react";
import { Flag, ShieldCheck, Trash2 } from "lucide-react";

import { AppShell } from "./components/AppShell";
import { ReportVisualisation } from "./components/ReportVisualisation";
import { EmptyState, Notice, Skeleton } from "./components/ui";
import { useLiveData } from "./hooks/useLiveData";
import { api } from "./lib/api";
import { useAuth } from "./lib/auth";
import { REPORT_STATUS_LABEL } from "./lib/reportVisuals";
import { canManageReports } from "./lib/permissions";
import type { PlayerReport, ReportStatus, User } from "./types";

const ReportsView: React.FC = () => {
  const { user } = useAuth();
  const canManage = canManageReports(user?.role);

  const users = useLiveData(() => api.getUsers());
  const overview = useLiveData(() => api.getReportOverview());
  // Die Detailroute bleibt der Administration vorbehalten. Fuer Spieler wird
  // sie gar nicht erst aufgerufen, damit die Ansicht ohne 403 funktioniert.
  const reports = useLiveData<PlayerReport[]>(() =>
    canManage ? api.getReports() : Promise.resolve([]),
  );

  const [statusFilter, setStatusFilter] = useState<ReportStatus | "all">("all");
  const [reportedUserId, setReportedUserId] = useState<number | "">("");
  const [reason, setReason] = useState("");
  const [details, setDetails] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const userList = users.data ?? [];
  const userMap = new Map(userList.map((user) => [user.id, user]));

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
    await run(() => api.updateReport(report.id, { status }));
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
        reportedUserId: Number(reportedUserId),
        reason: reason.trim(),
        details: details.trim() || null,
      }),
    );
    setReason("");
    setDetails("");
    setReportedUserId("");
  }

  const loadError = overview.error ?? users.error ?? (canManage ? reports.error : null);

  return (
    <AppShell active="reports">
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
            {canManage ? "Verwaltung" : "Transparenz"}
          </p>
          <h1 className="hero__title">
            {canManage ? "Spieler-Meldungen" : "Meldungen im Überblick"}
          </h1>
          <p className="hero__lead">
            {canManage
              ? "Meldungen über Spieler einsehen, prüfen und mit einer Aktion versehen."
              : "Sieh, welche Meldungen dich betreffen und wie der Bearbeitungsstand ist."}
          </p>
        </div>
      </section>

      {overview.loading ? (
        <Skeleton rows={3} />
      ) : overview.data ? (
        <ReportVisualisation overview={overview.data} isAdmin={canManage} />
      ) : null}

      {canManage ? (
        <>
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
                          {REPORT_STATUS_LABEL[report.status]} · Melder: {reporter?.username ?? "anonym"} ·{" "}
                          {new Date(report.created_at).toLocaleString()}
                        </span>
                        {report.details ? <p className="list__detail">{report.details}</p> : null}
                        {report.admin_note ? <p className="list__detail">Notiz: {report.admin_note}</p> : null}
                      </div>
                      <div className="list__actions">
                        <button
                          type="button"
                          className="btn btn--sm btn--ghost"
                          disabled={busy}
                          onClick={() => void handleStatus(report, "reviewed")}
                        >
                          Prüfen
                        </button>
                        <button
                          type="button"
                          className="btn btn--sm btn--primary"
                          disabled={busy}
                          onClick={() => void handleStatus(report, "resolved")}
                        >
                          Erledigen
                        </button>
                        <button
                          type="button"
                          className="btn btn--sm btn--ghost"
                          disabled={busy}
                          onClick={() => void handleStatus(report, "dismissed")}
                        >
                          Verwerfen
                        </button>
                        <button
                          type="button"
                          className="btn btn--sm btn--danger"
                          disabled={busy}
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
              <EmptyState icon={Flag} title="Keine Meldungen">
                Für den gewählten Filter gibt es keine Einträge.
              </EmptyState>
            )}
          </section>
        </>
      ) : (
        <Notice tone="info" title="Nur eigene Beteiligungen">
          Als Spieler:in siehst du aus Datenschutzgründen nur Meldungen, an denen du
          selbst beteiligt bist. Die Administration sieht und bearbeitet alle Meldungen.
        </Notice>
      )}
    </AppShell>
  );
};

export default ReportsView;
