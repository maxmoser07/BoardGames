import type { ReactNode } from "react";
import { Dice5, ShieldCheck, Sparkles, Users } from "lucide-react";

import { Logo } from "../components/Logo";

/**
 * Gemeinsamer Rahmen für Anmeldung und Registrierung.
 * Links das Formular, rechts die Markenfläche – auf kleinen Geräten entfällt
 * die Markenfläche, das Formular bleibt vollständig bedienbar.
 */
export function AuthLayout({
  title,
  lead,
  children,
  footer,
}: {
  title: string;
  lead: string;
  children: ReactNode;
  footer: ReactNode;
}) {
  return (
    <div className="auth">
      <main className="auth__main">
        <div className="auth__panel">
          <header className="auth__brand">
            <Logo />
            <span className="auth__brand-text">
              <span className="auth__brand-name">BoardGames</span>
              <span className="auth__brand-tag">Spielabend-Zentrale</span>
            </span>
          </header>

          <section className="card auth__card" aria-labelledby="auth-title">
            <div className="auth__intro">
              <h1 id="auth-title" className="auth__title">
                {title}
              </h1>
              <p className="auth__lead">{lead}</p>
            </div>

            {children}

            <p className="auth__switch">{footer}</p>
          </section>

          <p className="auth__security">
            <ShieldCheck aria-hidden="true" size={14} />
            Zugang nur über dein Konto – alle Partien liegen auf dem Server.
          </p>
        </div>
      </main>

      <aside className="auth__aside" aria-label="Über BoardGames">
        <div className="auth__aside-glow" aria-hidden="true" />
        <div className="auth__aside-inner">
          <span className="auth__aside-mark" aria-hidden="true">
            <Dice5 size={22} />
          </span>

          <div className="auth__aside-copy">
            <p className="auth__aside-eyebrow">
              <Sparkles aria-hidden="true" size={13} />
              Fünf Spiele, eine Bühne
            </p>
            <h2 className="auth__aside-title">
              Der Spielabend,
              <br />
              organisiert.
            </h2>
            <p className="auth__aside-lead">
              Sitzungen hosten, live mitspielen, Verläufe nachspielen und Ratings pflegen – alles an
              einem Ort.
            </p>

            <ul className="auth__features">
              <li>
                <span className="auth__feature-icon">
                  <Users aria-hidden="true" size={15} />
                </span>
                Sitzungen für Vier Gewinnt, Tic Tac Toe, Memory, Schach und Mensch ärgere dich nicht
              </li>
              <li>
                <span className="auth__feature-icon">
                  <Sparkles aria-hidden="true" size={15} />
                </span>
                Live-Gewinnchancen und Zugtipp direkt im Brett
              </li>
              <li>
                <span className="auth__feature-icon">
                  <ShieldCheck aria-hidden="true" size={15} />
                </span>
                Rollen, Freundschaften und Elo-Ratings sauber getrennt
              </li>
            </ul>
          </div>

          <div className="auth__aside-foot">
            <div className="auth__avatars" aria-hidden="true">
              {["H", "A", "B", "M"].map((letter) => (
                <span key={letter}>{letter}</span>
              ))}
            </div>
            <p>Beispielkonten: HostUser, Alice, Bob und Mara – Passwort „password“.</p>
          </div>
        </div>
      </aside>
    </div>
  );
}

/* --------------------------------------------------------------- Brand icons */

export function GoogleIcon() {
  return (
    <svg aria-hidden="true" focusable="false" viewBox="0 0 48 48" className="auth__oauth-icon">
      <path
        fill="#FFC107"
        d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z"
      />
      <path
        fill="#FF3D00"
        d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z"
      />
      <path
        fill="#4CAF50"
        d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238C29.211 35.091 26.715 36 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z"
      />
      <path
        fill="#1976D2"
        d="M43.611 20.083H42V20H24v8h11.303a12.04 12.04 0 0 1-4.087 5.571l6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z"
      />
    </svg>
  );
}

export function GitHubIcon() {
  return (
    <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" className="auth__oauth-icon">
      <path
        fill="currentColor"
        d="M12 .5C5.73.5.73 5.5.73 11.77c0 4.99 3.24 9.22 7.74 10.72.57.1.78-.25.78-.55 0-.27-.01-1.16-.02-2.1-3.15.68-3.82-1.34-3.82-1.34-.51-1.3-1.26-1.65-1.26-1.65-1.03-.7.08-.69.08-.69 1.14.08 1.74 1.17 1.74 1.17 1.01 1.73 2.65 1.23 3.3.94.1-.73.4-1.23.72-1.51-2.51-.29-5.15-1.26-5.15-5.6 0-1.24.44-2.25 1.17-3.04-.12-.29-.51-1.44.11-3 0 0 .95-.3 3.11 1.16a10.8 10.8 0 0 1 5.66 0c2.16-1.46 3.11-1.16 3.11-1.16.62 1.56.23 2.71.11 3 .73.79 1.17 1.8 1.17 3.04 0 4.35-2.65 5.31-5.17 5.59.41.35.77 1.05.77 2.12 0 1.53-.01 2.76-.01 3.14 0 .3.2.66.79.55a11.28 11.28 0 0 0 7.73-10.72C23.27 5.5 18.27.5 12 .5z"
      />
    </svg>
  );
}
