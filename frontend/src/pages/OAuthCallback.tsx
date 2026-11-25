import { useEffect, useRef, useState } from "react";
import { AlertCircle, LoaderCircle } from "lucide-react";

import { Logo } from "@/components/Logo";
import { api } from "@/lib/api";
import { signIn } from "@/lib/auth";
import { useNavigate } from "@/router";

/**
 * Rückkehr von Google oder GitHub.
 *
 * Das Backend hängt das Anmelde-Token als Fragment an diese Adresse
 * (`/auth/callback#token=…&redirect=…`). Das Fragment wird sofort aus der
 * Adresszeile entfernt, damit es nicht im Verlauf oder in Logs bleibt; danach
 * wird das Profil mit dem Token geladen und die Sitzung gespeichert.
 *
 * Der `useRef`-Wächter verhindert den doppelten Lauf im StrictMode, der das
 * Token sonst ein zweites Mal verarbeiten und fälschlich als fehlend melden
 * würde.
 */
export function OAuthCallbackPage() {
  const navigate = useNavigate();
  const started = useRef(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    const params = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const token = params.get("token");
    const failure = params.get("error");
    const redirect = params.get("redirect");

    // Token aus der Adresszeile nehmen, bevor irgendetwas anderes passiert.
    window.history.replaceState(null, "", "/auth/callback");

    void (async () => {
      if (failure !== null && failure !== "") {
        setError(failure);
        return;
      }
      if (token === null || token === "") {
        setError("Die Anmeldung wurde ohne Token beendet. Bitte versuche es erneut.");
        return;
      }
      try {
        const user = await api.me(token);
        signIn(user, token);
        navigate(safePath(redirect));
      } catch (cause) {
        setError(
          cause instanceof Error
            ? cause.message
            : "Die Anmeldung konnte nicht abgeschlossen werden.",
        );
      }
    })();
  }, [navigate]);

  const failed = error !== null;

  return (
    <div className="auth auth--solo">
      <main className="auth__main">
        <div className="auth__panel">
          <header className="auth__brand">
            <Logo />
            <span className="auth__brand-text">
              <span className="auth__brand-name">BoardGames</span>
              <span className="auth__brand-tag">Spielabend-Zentrale</span>
            </span>
          </header>

          <section
            className="card auth__card auth__card--center"
            aria-labelledby="oauth-title"
            aria-live="polite"
          >
            <span className="auth__status-icon" data-tone={failed ? "danger" : "info"} aria-hidden="true">
              {failed ? <AlertCircle size={22} /> : <LoaderCircle className="auth__spin" size={22} />}
            </span>

            <div className="auth__intro">
              <h1 id="oauth-title" className="auth__title">
                {failed ? "Anmeldung fehlgeschlagen" : "Anmeldung wird abgeschlossen …"}
              </h1>
              <p className="auth__lead">
                {failed
                  ? "Der Anmeldedienst hat die Sitzung nicht bestätigt."
                  : "Einen Moment bitte – wir prüfen dein Konto und öffnen den Katalog."}
              </p>
            </div>

            {failed ? (
              <>
                <p className="field__error field__error--box" role="alert">
                  <AlertCircle aria-hidden="true" size={15} />
                  {error}
                </p>
                <button
                  type="button"
                  className="btn btn--primary auth__submit"
                  onClick={() => navigate("/login")}
                >
                  Zurück zur Anmeldung
                </button>
              </>
            ) : (
              <p className="auth__waiting">
                <LoaderCircle aria-hidden="true" className="auth__spin" size={16} />
                Verbindung wird hergestellt …
              </p>
            )}
          </section>

          <p className="auth__security">
            <AlertCircle aria-hidden="true" size={14} />
            Das Token wird sofort aus der Adresszeile entfernt und nicht gespeichert.
          </p>
        </div>
      </main>
    </div>
  );
}

/** Nur interne Pfade; alles andere landet im Katalog. */
function safePath(raw: string | null): string {
  return raw !== null && raw.startsWith("/") && !raw.startsWith("//") ? raw : "/";
}

export default OAuthCallbackPage;
