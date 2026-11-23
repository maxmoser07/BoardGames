import { useEffect, useRef, useState } from "react";
import { AlertCircle, Dice5, LoaderCircle } from "lucide-react";

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

    if (failure !== null && failure !== "") {
      setError(failure);
      return;
    }
    if (token === null || token === "") {
      setError("Die Anmeldung wurde ohne Token beendet. Bitte versuche es erneut.");
      return;
    }

    void (async () => {
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

  return (
    <main className="grid min-h-dvh place-items-center bg-neutral-50 px-4 text-neutral-900 antialiased dark:bg-neutral-950 dark:text-neutral-50">
      <div className="w-full max-w-sm text-center">
        <span className="mx-auto mb-5 grid size-11 place-items-center rounded-xl bg-linear-to-br from-indigo-500 to-violet-600 text-white shadow-lg shadow-indigo-600/25">
          <Dice5 aria-hidden="true" className="size-6" />
        </span>

        {error === null ? (
          <>
            <h1 className="text-xl font-semibold tracking-tight">Anmeldung wird abgeschlossen…</h1>
            <p className="mt-2 flex items-center justify-center gap-2 text-sm text-neutral-500 dark:text-neutral-400">
              <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
              Einen Moment bitte.
            </p>
          </>
        ) : (
          <>
            <h1 className="text-xl font-semibold tracking-tight">Anmeldung fehlgeschlagen</h1>
            <p
              role="alert"
              className="mt-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-left text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300"
            >
              <AlertCircle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
              <span>{error}</span>
            </p>
            <button
              type="button"
              onClick={() => navigate("/login")}
              className="mt-6 h-11 w-full rounded-lg bg-indigo-600 text-sm font-semibold text-white shadow-lg shadow-indigo-600/20 transition-colors hover:bg-indigo-500 focus-visible:ring-2 focus-visible:ring-indigo-500/60 focus-visible:outline-none"
            >
              Zurück zur Anmeldung
            </button>
          </>
        )}
      </div>
    </main>
  );
}

/** Nur interne Pfade; alles andere landet im Katalog. */
function safePath(raw: string | null): string {
  return raw !== null && raw.startsWith("/") && !raw.startsWith("//") ? raw : "/";
}

export default OAuthCallbackPage;
