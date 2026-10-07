import type { ReactNode } from "react";
import { History, LayoutGrid, ShieldCheck } from "lucide-react";

import { ROLE_LABEL } from "../lib/format";
import { useNavigate } from "../router";
import type { User } from "../types";
import { Logo } from "./Logo";

export type ShellSection = "catalog" | "sessions";

interface AppShellProps {
  users: User[];
  currentUserId: number;
  onCurrentUserChange: (id: number) => void;
  /** Welcher Navigationspunkt aktiv ist. */
  active?: ShellSection;
  children: ReactNode;
}

const NAV = [
  { path: "/", label: "Spiele", icon: LayoutGrid, match: "catalog" },
  { path: "/sessions", label: "Sitzungen", icon: History, match: "sessions" },
] as const;

/** Rahmen des Katalogs und der Sitzungsübersicht. */
export function AppShell({ users, currentUserId, onCurrentUserChange, active, children }: AppShellProps) {
  const navigate = useNavigate();
  const currentUser = users.find((user) => user.id === currentUserId) ?? users[0];

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
          {NAV.map(({ path, label, icon: Icon, match }) => {
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
          })}
        </nav>

        <label className="shell__user">
          <span className="shell__user-label">
            <ShieldCheck aria-hidden="true" size={14} />
            Angemeldet als
          </span>
          <select
            className="select select--compact"
            value={currentUser?.id ?? ""}
            onChange={(event) => onCurrentUserChange(Number(event.target.value))}
          >
            {users.map((user) => (
              <option key={user.id} value={user.id}>
                {user.username} · {ROLE_LABEL[user.role]}
              </option>
            ))}
          </select>
        </label>
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
