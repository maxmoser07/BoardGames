import { useEffect, useState, type ReactNode } from "react";
import {
  Camera,
  CircleUser,
  Flag,
  History,
  LayoutGrid,
  LogOut,
  Menu,
  Play,
  Settings,
  ShieldCheck,
  Trophy,
  X,
} from "lucide-react";

import { api } from "../lib/api";
import { signOut, useAuth } from "../lib/auth";
import { ROLE_LABEL, initials } from "../lib/format";
import { canManageGames, canViewCamera, canViewReports, canViewSessions } from "../lib/permissions";
import { useNavigate } from "../router";
import type { UserRole } from "../types";
import { Logo } from "./Logo";

export type ShellSection =
  | "catalog"
  | "play"
  | "replays"
  | "camera"
  | "sessions"
  | "reports"
  | "adminGames"
  | "ratings"
  | "profile";

interface AppShellProps {
  /** Welcher Navigationspunkt aktiv ist. */
  active?: ShellSection;
  children: ReactNode;
}

const NAV = [
  { path: "/", label: "Spiele", icon: LayoutGrid, match: "catalog", visible: () => true },
  { path: "/play", label: "Direkt spielen", icon: Play, match: "play", visible: () => true },
  { path: "/replays", label: "Verläufe", icon: History, match: "replays", visible: () => true },
  {
    path: "/camera",
    label: "Kamera",
    icon: Camera,
    match: "camera",
    visible: (role: UserRole) => canViewCamera(role),
  },
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
    visible: (role: UserRole) => canViewReports(role),
  },
  {
    path: "/admin/games",
    label: "Spiele verwalten",
    icon: Settings,
    match: "adminGames",
    visible: (role: UserRole) => canManageGames(role),
  },
  {
    path: "/ratings",
    label: "Rangliste",
    icon: Trophy,
    match: "ratings",
    visible: () => true,
  },
  { path: "/profile", label: "Profil", icon: CircleUser, match: "profile", visible: () => true },
] as const;

/** Rahmen aller angemeldeten Ansichten: Kopfzeile, Navigation, Inhalt, Fuß. */
export function AppShell({ active, children }: AppShellProps) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);

  // Escape schließt das Mobilmenü, damit die Tastatur nicht darin gefangen ist.
  useEffect(() => {
    if (!menuOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [menuOpen]);

  const go = (path: string) => {
    setMenuOpen(false);
    navigate(path);
  };

  return (
    <div className="shell">
      <header className="shell__header" data-menu-open={menuOpen}>
        <button
          type="button"
          className="shell__brand"
          onClick={() => go("/")}
          aria-label="BoardGames – zum Katalog"
        >
          <Logo />
          <span className="shell__brand-text">
            <span className="shell__title">BoardGames</span>
            <span className="shell__subtitle">Spielabend-Zentrale</span>
          </span>
        </button>

        <nav className="shell__nav" id="shell-nav" aria-label="Hauptnavigation">
          {NAV.filter(({ visible }) => (user ? visible(user.role) : false)).map(
            ({ path, label, icon: Icon, match }) => {
              const isActive = active === match;
              // Spieler:innen sehen auf /ratings nur ihr eigenes Rating.
              const text = match === "ratings" && user?.role === "player" ? "Mein Rating" : label;
              return (
                <button
                  key={path}
                  type="button"
                  className={`shell__nav-link${isActive ? " is-active" : ""}`}
                  aria-current={isActive ? "page" : undefined}
                  onClick={() => go(path)}
                >
                  <Icon aria-hidden="true" size={16} />
                  {text}
                </button>
              );
            },
          )}
        </nav>

        {user ? (
          <div className="shell__user">
            <span className="shell__user-label" title={`${user.username} · ${ROLE_LABEL[user.role]}`}>
              <span className="avatar" data-role={user.role} aria-hidden="true">
                {initials(user.username)}
              </span>
              <span className="shell__user-name">{user.username}</span>
              <span className="chip chip--admin" hidden={user.role !== "admin"}>
                <ShieldCheck aria-hidden="true" size={11} />
                {ROLE_LABEL[user.role]}
              </span>
            </span>
            <button
              type="button"
              className="btn btn--ghost btn--sm shell__logout"
              aria-label="Abmelden"
              title="Abmelden"
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
              <LogOut aria-hidden="true" size={14} />
              <span className="shell__logout-label">Abmelden</span>
            </button>
            <button
              type="button"
              className="btn btn--ghost btn--sm shell__menu-btn"
              aria-expanded={menuOpen}
              aria-controls="shell-nav"
              onClick={() => setMenuOpen((open) => !open)}
            >
              {menuOpen ? <X aria-hidden="true" size={16} /> : <Menu aria-hidden="true" size={16} />}
              Menü
            </button>
          </div>
        ) : (
          <button type="button" className="btn btn--primary btn--sm" onClick={() => go("/login")}>
            Anmelden
          </button>
        )}
      </header>

      <main className="shell__main">{children}</main>

      <footer className="shell__footer">
        <p>
          Sitzungen, Verläufe und Ratings liegen in der Datenbank des Backends – nicht im Browser.
        </p>
      </footer>
    </div>
  );
}
