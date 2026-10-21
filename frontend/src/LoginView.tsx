import { useState } from "react";

import { useNavigate } from "./router";
import { usePersistentState } from "./hooks/usePersistentState";
import { api } from "./lib/api";

export const LoginView: React.FC = () => {
  const navigate = useNavigate();
  const [, setCurrentUserId] = usePersistentState("currentUserId", 0);
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const user =
        mode === "login"
          ? await api.login(username.trim(), password)
          : await api.register({ username: username.trim(), password, email: email.trim() || null });
      setCurrentUserId(user.id);
      navigate("/");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Anmeldung fehlgeschlagen.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="shell">
      <main className="shell__main">
        <section className="hero">
          <div className="hero__text">
            <h1 className="hero__title">{mode === "login" ? "Anmelden" : "Konto erstellen"}</h1>
            <p className="hero__lead">
              Melde dich an, um dein Profil und personalisierte Funktionen zu nutzen.
            </p>
          </div>
        </section>

        <form className="card" onSubmit={submit} style={{ maxWidth: 420, margin: "0 auto" }}>
          <label className="field">
            <span>Benutzername</span>
            <input className="input" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" />
          </label>
          {mode === "register" ? (
            <label className="field">
              <span>E-Mail (optional)</span>
              <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
            </label>
          ) : null}
          <label className="field">
            <span>Passwort</span>
            <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === "login" ? "current-password" : "new-password"} />
          </label>
          {error ? <p className="notice notice--danger">{error}</p> : null}
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <button type="submit" className="btn btn--primary" disabled={busy}>
              {busy ? "…" : mode === "login" ? "Anmelden" : "Registrieren"}
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => setMode(mode === "login" ? "register" : "login")}
            >
              {mode === "login" ? "Konto erstellen" : "Zur Anmeldung"}
            </button>
          </div>
        </form>
      </main>
    </div>
  );
};

export default LoginView;
