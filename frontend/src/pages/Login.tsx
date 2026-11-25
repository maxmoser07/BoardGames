import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { AlertCircle, CircleCheckBig, Eye, EyeOff, LoaderCircle, Lock, Mail } from "lucide-react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { AuthLayout, GitHubIcon, GoogleIcon } from "./AuthLayout";

/* ------------------------------------------------------------------ Schema */

const loginSchema = z.object({
  email: z
    .string()
    .min(1, "Bitte gib deine E-Mail-Adresse ein.")
    .email("Bitte gib eine gültige E-Mail-Adresse ein."),
  password: z
    .string()
    .min(1, "Bitte gib dein Passwort ein.")
    .min(8, "Dein Passwort muss mindestens 8 Zeichen lang sein."),
  remember: z.boolean(),
});

export type LoginFormValues = z.infer<typeof loginSchema>;

/* -------------------------------------------------------------------- Types */

export interface LoginProps {
  /** Wird mit den geprüften Werten aufgerufen. */
  onSubmit?: (values: LoginFormValues) => Promise<void>;
  /**
   * Öffnet die Zustimmungsseite des Anbieters. Der Browser wird auf
   * `/api/auth/oauth/{provider}/start` umgeleitet; das Backend kehrt nach der
   * Anmeldung zu `/auth/callback#token=…` zurück.
   */
  onOAuthLogin?: (provider: "google" | "github") => void;
  /**
   * Ist der Anbieter im Backend nicht konfiguriert, bleiben die Schaltflächen
   * sichtbar, aber deaktiviert; der Tooltip erklärt warum.
   */
  oAuthAvailable?: boolean;
}

const DEFAULT_VALUES: LoginFormValues = {
  email: "",
  password: "",
  remember: true,
};

async function simulatedLogin(values: LoginFormValues): Promise<void> {
  await new Promise<void>((resolve) => {
    window.setTimeout(resolve, 1000);
  });
  console.log("[login] payload", values);
}

/* --------------------------------------------------------------- OAuth start */

function startOAuth(provider: "google" | "github"): void {
  window.location.assign(`/api/auth/oauth/${provider}/start`);
}

/* ----------------------------------------------------------------- Component */

export function Login({
  onSubmit = simulatedLogin,
  onOAuthLogin = startOAuth,
  oAuthAvailable = true,
}: LoginProps) {
  const [showPassword, setShowPassword] = useState(false);
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle");
  const [submitError, setSubmitError] = useState<string | null>(null);

  const form = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: DEFAULT_VALUES,
    mode: "onTouched",
  });

  const isSubmitting = form.formState.isSubmitting;
  const errors = form.formState.errors;

  async function handleSubmit(values: LoginFormValues): Promise<void> {
    setStatus("idle");
    setSubmitError(null);

    try {
      await onSubmit(values);
      setStatus("success");
    } catch (error) {
      setStatus("error");
      setSubmitError(
        error instanceof Error ? error.message : "Die Anmeldung hat nicht geklappt. Bitte erneut versuchen.",
      );
    }
  }

  function handleSocialLogin(provider: "Google" | "GitHub"): void {
    onOAuthLogin(provider.toLowerCase() as "google" | "github");
  }

  return (
    <AuthLayout
      title="Willkommen zurück"
      lead="Melde dich an und setze deine Partien, Statistiken und Freundschaften dort fort, wo du aufgehört hast."
      footer={
        <>
          Noch kein Konto?{" "}
          <a href="/signup" className="auth__link">
            Konto erstellen
          </a>
        </>
      }
    >
      <div className="auth__social">
        <button
          type="button"
          className="btn btn--ghost auth__oauth"
          disabled={isSubmitting || !oAuthAvailable}
          title={oAuthAvailable ? undefined : "Google ist auf dem Server noch nicht eingerichtet."}
          onClick={() => handleSocialLogin("Google")}
        >
          <GoogleIcon />
          Weiter mit Google
        </button>
        <button
          type="button"
          className="btn btn--ghost auth__oauth"
          disabled={isSubmitting || !oAuthAvailable}
          title={oAuthAvailable ? undefined : "GitHub ist auf dem Server noch nicht eingerichtet."}
          onClick={() => handleSocialLogin("GitHub")}
        >
          <GitHubIcon />
          Weiter mit GitHub
        </button>
      </div>

      <div className="auth__divider">
        <span aria-hidden="true" />
        <span className="auth__divider-label">oder mit E-Mail</span>
        <span aria-hidden="true" />
      </div>

      <form noValidate className="auth__form" onSubmit={form.handleSubmit(handleSubmit)}>
        <div className="field">
          <label className="label" htmlFor="login-email">
            E-Mail
          </label>
          <div className="input-wrap">
            <Mail aria-hidden="true" className="input-wrap__icon" size={16} />
            <input
              {...form.register("email")}
              id="login-email"
              type="email"
              autoComplete="email"
              autoCapitalize="none"
              spellCheck={false}
              inputMode="email"
              placeholder="du@beispiel.de"
              className="input input--with-icon"
              disabled={isSubmitting}
              aria-invalid={errors.email ? true : undefined}
              aria-describedby={errors.email ? "login-email-error" : undefined}
            />
          </div>
          {errors.email ? (
            <p className="field__error" id="login-email-error" role="alert">
              <AlertCircle aria-hidden="true" size={13} />
              {errors.email.message}
            </p>
          ) : null}
        </div>

        <div className="field">
          <label className="label" htmlFor="login-password">
            Passwort
          </label>
          <div className="input-wrap">
            <Lock aria-hidden="true" className="input-wrap__icon" size={16} />
            <input
              {...form.register("password")}
              id="login-password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              autoCapitalize="none"
              spellCheck={false}
              placeholder="Mindestens 8 Zeichen"
              className="input input--with-icon input--with-action"
              disabled={isSubmitting}
              aria-invalid={errors.password ? true : undefined}
              aria-describedby={errors.password ? "login-password-error" : undefined}
            />
            <button
              type="button"
              className="input-wrap__action"
              onClick={() => setShowPassword((visible) => !visible)}
              aria-label={showPassword ? "Passwort verbergen" : "Passwort anzeigen"}
              aria-pressed={showPassword}
            >
              {showPassword ? <EyeOff aria-hidden="true" size={16} /> : <Eye aria-hidden="true" size={16} />}
            </button>
          </div>
          {errors.password ? (
            <p className="field__error" id="login-password-error" role="alert">
              <AlertCircle aria-hidden="true" size={13} />
              {errors.password.message}
            </p>
          ) : null}
        </div>

        <label className="checkbox">
          <input type="checkbox" {...form.register("remember")} />
          <span>Angemeldet bleiben</span>
        </label>

        {submitError ? (
          <p className="field__error field__error--box" role="alert">
            <AlertCircle aria-hidden="true" size={15} />
            {submitError}
          </p>
        ) : null}

        <button type="submit" className="btn btn--primary auth__submit" disabled={isSubmitting} aria-busy={isSubmitting}>
          {isSubmitting ? (
            <>
              <LoaderCircle aria-hidden="true" size={16} className="auth__spin" />
              Anmelden …
            </>
          ) : (
            "Anmelden"
          )}
        </button>
      </form>

      <div aria-live="polite" role="status">
        {status === "success" ? (
          <p className="auth__ok">
            <CircleCheckBig aria-hidden="true" size={15} />
            Angemeldet – willkommen zurück!
          </p>
        ) : null}
      </div>
    </AuthLayout>
  );
}

export default Login;
