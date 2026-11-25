import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  AlertCircle,
  CircleCheckBig,
  Eye,
  EyeOff,
  LoaderCircle,
  Lock,
  Mail,
  User as UserIcon,
} from "lucide-react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { AuthLayout, GitHubIcon, GoogleIcon } from "./AuthLayout";

/* ------------------------------------------------------------------ Schema */

const signUpSchema = z
  .object({
    username: z
      .string()
      .min(1, "Bitte gib einen Benutzernamen ein.")
      .min(3, "Der Benutzername braucht mindestens 3 Zeichen.")
      .max(32, "Der Benutzername darf höchstens 32 Zeichen haben.")
      .regex(/^[A-Za-z0-9_.-]+$/, "Erlaubt sind Buchstaben, Zahlen, Punkte, Bindestriche und Unterstriche."),
    email: z
      .string()
      .email("Bitte gib eine gültige E-Mail-Adresse ein.")
      .or(z.literal(""))
      .transform((value) => value.trim()),
    password: z
      .string()
      .min(1, "Bitte gib ein Passwort ein.")
      .min(8, "Dein Passwort muss mindestens 8 Zeichen lang sein."),
    confirmPassword: z.string().min(1, "Bitte bestätige dein Passwort."),
  })
  .refine((values) => values.password === values.confirmPassword, {
    message: "Die Passwörter stimmen nicht überein.",
    path: ["confirmPassword"],
  });

export type SignUpFormValues = z.infer<typeof signUpSchema>;

/* -------------------------------------------------------------------- Types */

export interface SignUpProps {
  /** Wird mit den geprüften Werten aufgerufen. */
  onSubmit?: (values: SignUpFormValues) => Promise<void>;
  /**
   * Öffnet die Zustimmungsseite des Anbieters. Der Browser wird auf
   * `/api/auth/oauth/{provider}/start` umgeleitet.
   */
  onOAuthSignUp?: (provider: "google" | "github") => void;
  /** Anbieter im Backend nicht konfiguriert? Dann bleiben die Knöpfe deaktiviert. */
  oAuthAvailable?: boolean;
}

const DEFAULT_VALUES: SignUpFormValues = {
  username: "",
  email: "",
  password: "",
  confirmPassword: "",
};

async function simulatedSignUp(values: SignUpFormValues): Promise<void> {
  await new Promise<void>((resolve) => {
    window.setTimeout(resolve, 1000);
  });
  console.log("[sign-up] payload", values);
}

/* --------------------------------------------------------------- OAuth start */

function startOAuth(provider: "google" | "github"): void {
  window.location.assign(`/api/auth/oauth/${provider}/start`);
}

/* ----------------------------------------------------------------- Component */

export function SignUp({
  onSubmit = simulatedSignUp,
  onOAuthSignUp = startOAuth,
  oAuthAvailable = true,
}: SignUpProps) {
  const [showPassword, setShowPassword] = useState(false);
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle");
  const [submitError, setSubmitError] = useState<string | null>(null);

  const form = useForm<SignUpFormValues>({
    resolver: zodResolver(signUpSchema),
    defaultValues: DEFAULT_VALUES,
    mode: "onTouched",
  });

  const isSubmitting = form.formState.isSubmitting;
  const errors = form.formState.errors;

  async function handleSubmit(values: SignUpFormValues): Promise<void> {
    setStatus("idle");
    setSubmitError(null);

    try {
      await onSubmit(values);
      setStatus("success");
    } catch (error) {
      setStatus("error");
      setSubmitError(
        error instanceof Error
          ? error.message
          : "Das Konto konnte nicht angelegt werden. Bitte erneut versuchen.",
      );
    }
  }

  function handleSocialSignUp(provider: "Google" | "GitHub"): void {
    onOAuthSignUp(provider.toLowerCase() as "google" | "github");
  }

  return (
    <AuthLayout
      title="Konto erstellen"
      lead="Spiele speichern, Statistiken sammeln und mit Freund:innen spielen – ab dem ersten Zug."
      footer={
        <>
          Schon dabei?{" "}
          <a href="/login" className="auth__link">
            Anmelden
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
          onClick={() => handleSocialSignUp("Google")}
        >
          <GoogleIcon />
          Weiter mit Google
        </button>
        <button
          type="button"
          className="btn btn--ghost auth__oauth"
          disabled={isSubmitting || !oAuthAvailable}
          title={oAuthAvailable ? undefined : "GitHub ist auf dem Server noch nicht eingerichtet."}
          onClick={() => handleSocialSignUp("GitHub")}
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
          <label className="label" htmlFor="signup-username">
            Benutzername
          </label>
          <div className="input-wrap">
            <UserIcon aria-hidden="true" className="input-wrap__icon" size={16} />
            <input
              {...form.register("username")}
              id="signup-username"
              type="text"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              placeholder="dein-name"
              className="input input--with-icon"
              disabled={isSubmitting}
              aria-invalid={errors.username ? true : undefined}
              aria-describedby={errors.username ? "signup-username-error" : undefined}
            />
          </div>
          {errors.username ? (
            <p className="field__error" id="signup-username-error" role="alert">
              <AlertCircle aria-hidden="true" size={13} />
              {errors.username.message}
            </p>
          ) : null}
        </div>

        <div className="field">
          <label className="label" htmlFor="signup-email">
            E-Mail <span className="label__optional">optional</span>
          </label>
          <div className="input-wrap">
            <Mail aria-hidden="true" className="input-wrap__icon" size={16} />
            <input
              {...form.register("email")}
              id="signup-email"
              type="email"
              autoComplete="email"
              autoCapitalize="none"
              spellCheck={false}
              inputMode="email"
              placeholder="du@beispiel.de"
              className="input input--with-icon"
              disabled={isSubmitting}
              aria-invalid={errors.email ? true : undefined}
              aria-describedby={errors.email ? "signup-email-error" : "signup-email-hint"}
            />
          </div>
          {errors.email ? (
            <p className="field__error" id="signup-email-error" role="alert">
              <AlertCircle aria-hidden="true" size={13} />
              {errors.email.message}
            </p>
          ) : (
            <p className="hint" id="signup-email-hint">
              Nur nötig, wenn du die Anmeldung per E-Mail nutzen willst.
            </p>
          )}
        </div>

        <div className="field">
          <label className="label" htmlFor="signup-password">
            Passwort
          </label>
          <div className="input-wrap">
            <Lock aria-hidden="true" className="input-wrap__icon" size={16} />
            <input
              {...form.register("password")}
              id="signup-password"
              type={showPassword ? "text" : "password"}
              autoComplete="new-password"
              autoCapitalize="none"
              spellCheck={false}
              placeholder="Mindestens 8 Zeichen"
              className="input input--with-icon input--with-action"
              disabled={isSubmitting}
              aria-invalid={errors.password ? true : undefined}
              aria-describedby={errors.password ? "signup-password-error" : undefined}
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
            <p className="field__error" id="signup-password-error" role="alert">
              <AlertCircle aria-hidden="true" size={13} />
              {errors.password.message}
            </p>
          ) : null}
        </div>

        <div className="field">
          <label className="label" htmlFor="signup-confirm">
            Passwort bestätigen
          </label>
          <div className="input-wrap">
            <Lock aria-hidden="true" className="input-wrap__icon" size={16} />
            <input
              {...form.register("confirmPassword")}
              id="signup-confirm"
              type={showPassword ? "text" : "password"}
              autoComplete="new-password"
              autoCapitalize="none"
              spellCheck={false}
              placeholder="Noch einmal eingeben"
              className="input input--with-icon"
              disabled={isSubmitting}
              aria-invalid={errors.confirmPassword ? true : undefined}
              aria-describedby={errors.confirmPassword ? "signup-confirm-error" : undefined}
            />
          </div>
          {errors.confirmPassword ? (
            <p className="field__error" id="signup-confirm-error" role="alert">
              <AlertCircle aria-hidden="true" size={13} />
              {errors.confirmPassword.message}
            </p>
          ) : null}
        </div>

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
              Konto wird erstellt …
            </>
          ) : (
            "Konto erstellen"
          )}
        </button>

        <p className="hint">
          Neue Konten starten immer als Spieler:in. Rollen vergibt ausschließlich die Administration.
        </p>
      </form>

      <div aria-live="polite" role="status">
        {status === "success" ? (
          <p className="auth__ok">
            <CircleCheckBig aria-hidden="true" size={15} />
            Konto erstellt – willkommen!
          </p>
        ) : null}
      </div>
    </AuthLayout>
  );
}

export default SignUp;
