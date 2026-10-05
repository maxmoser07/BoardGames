/**
 * Kleine, wiederverwendbare Bausteine der Oberfläche.
 *
 * Bewusst ohne Framework-eigene Abstraktion: die Klassenamen stammen aus
 * `index.css`, damit Farben und Abstände zentral dort gepflegt werden.
 */

import type { ReactNode } from "react";
import { AlertTriangle, Info, LoaderCircle, type LucideIcon } from "lucide-react";

import { ROLE_LABEL, initials } from "../lib/format";
import type { User, UserRole } from "../types";

/* ------------------------------------------------------------------ Ladezustand */

export function Spinner({ label }: { label?: string }) {
  return (
    <span className="spinner" role="status">
      <LoaderCircle aria-hidden="true" className="spinner__icon" size={18} />
      {label ? <span className="spinner__label">{label}</span> : <span className="sr-only">Wird geladen</span>}
    </span>
  );
}

export function Skeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="skeleton-group" aria-hidden="true">
      {Array.from({ length: rows }, (_, index) => (
        <div className="skeleton" key={index} />
      ))}
    </div>
  );
}

/* -------------------------------------------------------------------- Hinweise */

type Tone = "info" | "warn" | "danger" | "success";

const TONE_ICON: Record<Tone, LucideIcon> = {
  info: Info,
  warn: AlertTriangle,
  danger: AlertTriangle,
  success: Info,
};

export function Notice({
  tone = "info",
  title,
  children,
  action,
}: {
  tone?: Tone;
  title?: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  const Icon = TONE_ICON[tone];
  return (
    <div className={`notice notice--${tone}`} role={tone === "danger" ? "alert" : "status"}>
      <Icon aria-hidden="true" className="notice__icon" size={18} />
      <div className="notice__body">
        {title ? <p className="notice__title">{title}</p> : null}
        {children ? <div className="notice__text">{children}</div> : null}
      </div>
      {action ? <div className="notice__action">{action}</div> : null}
    </div>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  children,
  action,
}: {
  icon: LucideIcon;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <span className="empty__icon" aria-hidden="true">
        <Icon size={22} />
      </span>
      <p className="empty__title">{title}</p>
      {children ? <p className="empty__text">{children}</p> : null}
      {action ? <div className="empty__action">{action}</div> : null}
    </div>
  );
}

/* ------------------------------------------------------------------- Auszeichnung */

export function Avatar({ user, title }: { user: User; title?: string }) {
  return (
    <span className="avatar" data-role={user.role} title={title ?? `${user.username} · ${ROLE_LABEL[user.role]}`}>
      {initials(user.username)}
    </span>
  );
}

export function RoleChip({ role }: { role: UserRole }) {
  return <span className={`chip chip--${role}`}>{ROLE_LABEL[role]}</span>;
}

/** Status-Marker mit eigener Farbe, z. B. „Laufend“ oder „Rot gewinnt“. */
export function Badge({ tone, children }: { tone: string; children: ReactNode }) {
  return <span className={`badge badge--${tone}`}>{children}</span>;
}
