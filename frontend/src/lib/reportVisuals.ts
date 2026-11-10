/** Reine Aufbereitung der Meldungs-Visualisierung (ohne API-Zugriff). */

import type { ReportOverview, ReportStatus, ReportStatusCounts } from "../types";

export const REPORT_STATUS_ORDER: readonly ReportStatus[] = [
  "open",
  "reviewed",
  "resolved",
  "dismissed",
] as const;

export const REPORT_STATUS_LABEL: Record<ReportStatus, string> = {
  open: "Offen",
  reviewed: "Geprüft",
  resolved: "Erledigt",
  dismissed: "Verworfen",
};

export function emptyStatusCounts(): ReportStatusCounts {
  return { open: 0, reviewed: 0, resolved: 0, dismissed: 0 };
}

export function countTotal(counts: Partial<ReportStatusCounts> | undefined): number {
  if (!counts) return 0;
  return REPORT_STATUS_ORDER.reduce((sum, status) => sum + (counts[status] ?? 0), 0);
}

export interface StatusSegment {
  status: ReportStatus;
  label: string;
  count: number;
  /** Anteil in Prozent, gerundet. */
  percent: number;
}

/** Segmente fuer den gestapelten Statusbalken. */
export function statusSegments(counts: Partial<ReportStatusCounts> | undefined): StatusSegment[] {
  const total = countTotal(counts);
  return REPORT_STATUS_ORDER.map((status) => {
    const count = counts?.[status] ?? 0;
    return {
      status,
      label: REPORT_STATUS_LABEL[status],
      count,
      percent: total === 0 ? 0 : Math.round((count / total) * 100),
    };
  });
}

/** Breite eines Balkens relativ zum groessten Wert, in Prozent. */
export function barWidth(count: number, max: number): number {
  if (count <= 0 || max <= 0) return 0;
  return Math.max(6, Math.round((count / max) * 100));
}

/** `2026-11` -> `11/26`; unerwartete Werte bleiben lesbar. */
export function monthLabel(month: string): string {
  const match = /^(\d{4})-(\d{2})$/.exec(month);
  if (!match) return month;
  return `${match[2]}/${match[1].slice(2)}`;
}

/** Die letzten `count` Monate, aelteste zuerst. */
export function recentMonths(
  months: ReportOverview["by_month"],
  count = 6,
): ReportOverview["by_month"] {
  return months.slice(-count);
}
