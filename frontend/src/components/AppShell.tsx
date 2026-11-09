import type { ReactNode } from "react";
import { Camera, CircleUser, Flag, History, LayoutGrid, Play, ShieldCheck } from "lucide-react";

import { api } from "../lib/api";
import { signOut, useAuth } from "../lib/auth";
import { ROLE_LABEL } from "../lib/format";
import { canManageReports, canViewSessions } from "../lib/permissions";
import { useNavigate } from "../router";
import type { UserRole } from "../types";
import { Logo } from "./Logo";

export type ShellSection = "catalog" | "play" | "camera" | "sessions" | "reports" | "profile";

interface AppShellProps {
  /** Welcher Navigationspunkt aktiv ist. */
  active?: ShellSection;
  children: ReactNode;
}

const NAV = [
  { path: "/", label: "Spiele", icon: LayoutGrid, match: "catalog", visible: () => true },
  { path: "/play", label: "Direkt spielen", icon: Play, match: "play", visible: () => true },
  { path: "/camera", label: "Kamera", icon: Camera, match: "camera", visible: () => true },
  {
    path: "/sessions",
    label: "Sitzungen",
    icon: History,
    match: "sessions",
    visible: (role: UserRole) => canViewSessions(role),
  },
  {
    path: "/reports",
    label: "Meldungen",
    icon: Flag,
    match: "reports",
    visible: (role: UserRole) => canManageReports(role),
  },
  { path: "/profile", label: "Profil", icon: CircleUser, match: "profile", visible: () => true },
] as const;

/** Rahmen des Katalogs, der Sitzungen und der Meldungen. */
export function AppShell({ active, children }: AppShellProps) {
  const navigate = useNavigate();
  const { user } = useAuth();

  return (
    <div className="shell">
      <header className="shell__header">
        <div className="shell__brand">
          <Logo />
          <div>
            <p className="shell__title">BoardGames</p>
            <p className="shell__subtitle">Brettspielverwaltung</p>
          </div>
        </div>

        <nav className="shell__nav" aria-label="Hauptnavigation">
          {NAV.filter(({ visible }) => (user ? visible(user.role) : false)).map(
            ({ path, label, icon: Icon, match }) => {
              const isActive = active === match;
              return (
                <button
                  key={path}
                  type="button"
                  className={`shell__nav-link${isActive ? " is-active" : ""}`}
                  aria-current={isActive ? "page" : undefined}
                  onClick={() => navigate(path)}
                >
                  <Icon aria-hidden="true" size={16} />
                  {label}
                </button>
              );
            },
          )}
        </nav>

        {user ? (
          <div className="shell__user">
            <span className="shell__user-label">
              <ShieldCheck aria-hidden="true" size={14} />
              {user.username} · {ROLE_LABEL[user.role]}
            </span>
            <button
              type="button"
              className="btn btn--sm"
              onClick={async () => {
                try {
                  await api.logout();
                } catch {
                  // Lokal abmelden reicht für die Oberfläche.
                }
                signOut();
                navigate("/login");
              }}
            >
              Abmelden
            </button>
          </div>
        ) : (
          <button type="button" className="btn btn--sm btn--primary" onClick={() => navigate("/login")}>
            Anmelden
          </button>
        )}
      </header>

      <main className="shell__main">{children}</main>

      <footer className="shell__footer">
        <p>
          Sitzungen und Verläufe liegen in der Datenbank des Backends (siehe <code>src/lib/api.ts</code>)
        </p>
      </footer>
    </div>
  );
}
