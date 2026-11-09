import { AlertTriangle, Flag, ShieldCheck, Users } from "lucide-react";

import {
  REPORT_STATUS_LABEL,
  barWidth,
  countTotal,
  monthLabel,
  recentMonths,
  statusSegments,
} from "../lib/reportVisuals";
import type { ReportOverview, ReportStatus } from "../types";
import { EmptyState } from "./ui";

const STATUS_TONE: Record<ReportStatus, string> = {
  open: "open",
  reviewed: "reviewed",
  resolved: "resolved",
  dismissed: "dismissed",
};

/**
 * Visualisierung der Meldungen: Statusverteilung, Gruende, Verlauf und – fuer
 * Admins – die am haeufigsten gemeldeten Personen. Die Daten kommen bereits
 * rollenabhaengig gefiltert aus `GET /api/reports/visualisation`.
 */
export function ReportVisualisation({
  overview,
  isAdmin,
}: {
  overview: ReportOverview;
  isAdmin: boolean;
}) {
  const total = overview.total || countTotal(overview.by_status);
  const segments = statusSegments(overview.by_status).filter((segment) => segment.count > 0);
  const reasonMax = Math.max(1, ...overview.by_reason.map((row) => row.count));
  const months = recentMonths(overview.by_month);
  const monthMax = Math.max(1, ...months.map((row) => row.count));
  const submitted = countTotal(overview.submitted);
  const received = countTotal(overview.received);
  const resolved = overview.by_status.resolved ?? 0;
  const open = overview.by_status.open ?? 0;

  return (
    <section className="card panel" aria-labelledby="panel-report-visualisation">
      <header className="panel__head">
        <span className="panel__icon" aria-hidden="true">
          <Flag size={18} />
        </span>
        <div>
          <h2 className="panel__title" id="panel-report-visualisation">
            {isAdmin ? "Meldungen im Überblick" : "Deine Meldungen im Überblick"}
          </h2>
          <p className="panel__subtitle">
            {isAdmin
              ? "Alle Meldungen nach Status, Grund und zeitlichem Verlauf."
              : "Meldungen, die du geschrieben hast oder in denen du gemeldet wurdest."}
          </p>
        </div>
      </header>

      <dl className="viz__stats">
        <div className="stat">
          <dt className="stat__value">{total}</dt>
          <dd className="stat__label">{isAdmin ? "Meldungen" : "beteiligt"}</dd>
        </div>
        <div className="stat">
          <dt className="stat__value">{open}</dt>
          <dd className="stat__label">offen</dd>
        </div>
        <div className="stat">
          <dt className="stat__value">{resolved}</dt>
          <dd className="stat__label">erledigt</dd>
        </div>
        <div className="stat">
          <dt className="stat__value">{submitted}</dt>
          <dd className="stat__label">von dir</dd>
        </div>
        <div className="stat">
          <dt className="stat__value">{received}</dt>
          <dd className="stat__label">über dich</dd>
        </div>
      </dl>

      {total === 0 ? (
        <EmptyState icon={AlertTriangle} title="Noch keine Meldungen">
          {isAdmin
            ? "Sobald Meldungen eingehen, erscheinen hier die Verteilungen."
            : "Für dich liegen aktuell keine Meldungen vor."}
        </EmptyState>
      ) : (
        <>
          <div className="viz__block">
            <div className="viz__head">
              <h3 className="viz__title">Statusverteilung</h3>
              <span className="viz__hint">{total} gesamt</span>
            </div>
            <div
              className="viz__statusbar"
              role="img"
              aria-label={`Statusverteilung: ${segments
                .map((segment) => `${segment.label} ${segment.count}`)
                .join(", ")}`}
            >
              {segments.map((segment) => (
                <span
                  key={segment.status}
                  className={`viz__segment viz__segment--${STATUS_TONE[segment.status]}`}
                  style={{ width: `${segment.percent}%` }}
                  title={`${segment.label}: ${segment.count}`}
                />
              ))}
            </div>
            <ul className="viz__legend">
              {statusSegments(overview.by_status).map((segment) => (
                <li key={segment.status} className="viz__legend-item">
                  <span
                    className={`viz__dot viz__dot--${STATUS_TONE[segment.status]}`}
                    aria-hidden="true"
                  />
                  {REPORT_STATUS_LABEL[segment.status]}
                  <strong>{segment.count}</strong>
                </li>
              ))}
            </ul>
          </div>

          <div className="viz__columns">
            <div className="viz__block">
              <div className="viz__head">
                <h3 className="viz__title">Häufigste Gründe</h3>
                <span className="viz__hint">Top {overview.by_reason.length || 0}</span>
              </div>
              {overview.by_reason.length > 0 ? (
                <ul className="viz__bars">
                  {overview.by_reason.map((row) => (
                    <li key={row.reason} className="viz__bar-row">
                      <span className="viz__bar-label" title={row.reason}>
                        {row.reason}
                      </span>
                      <span className="viz__meter" aria-hidden="true">
                        <span
                          className="viz__meter-fill"
                          style={{ width: `${barWidth(row.count, reasonMax)}%` }}
                        />
                      </span>
                      <span className="viz__bar-count">{row.count}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text">Noch keine Gründe erfasst.</p>
              )}
            </div>

            <div className="viz__block">
              <div className="viz__head">
                <h3 className="viz__title">Verlauf</h3>
                <span className="viz__hint">letzte {months.length || 0} Monate</span>
              </div>
              {months.length > 0 ? (
                <ol className="viz__months" aria-label="Meldungen je Monat">
                  {months.map((row) => (
                    <li key={row.month} className="viz__month">
                      <span className="viz__month-count">{row.count}</span>
                      <span className="viz__month-track" aria-hidden="true">
                        <span
                          className="viz__month-bar"
                          style={{ height: `${barWidth(row.count, monthMax)}%` }}
                        />
                      </span>
                      <span className="viz__month-label">{monthLabel(row.month)}</span>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="text">Noch kein zeitlicher Verlauf.</p>
              )}
            </div>
          </div>

          {isAdmin && overview.top_reported.length > 0 ? (
            <div className="viz__block">
              <div className="viz__head">
                <h3 className="viz__title">Am häufigsten gemeldet</h3>
                <span className="viz__hint">
                  <Users aria-hidden="true" size={13} /> {overview.top_reported.length} Personen
                </span>
              </div>
              <ol className="viz__people">
                {overview.top_reported.map((row, index) => (
                  <li key={row.user_id} className="viz__person">
                    <span className="viz__rank">{index + 1}</span>
                    <span className="viz__person-name">{row.username}</span>
                    <span className="viz__person-count">
                      {row.count} {row.count === 1 ? "Meldung" : "Meldungen"}
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          ) : null}

          {!isAdmin ? (
            <p className="viz__note">
              <ShieldCheck aria-hidden="true" size={14} />
              Meldungen werden von der Administration geprüft. Aus Datenschutzgründen
              siehst du nur Meldungen mit deiner Beteiligung.
            </p>
          ) : null}
        </>
      )}
    </section>
  );
}
