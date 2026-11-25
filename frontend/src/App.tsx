import { GameSessionWindow } from "./GameSessionWindow";
import { Login, type LoginFormValues } from "./pages/Login";
import { SignUp, type SignUpFormValues } from "./pages/SignUp";
import { OAuthCallbackPage } from "./pages/OAuthCallback";
import ProfileView from "./ProfileView";
import CameraView from "./CameraView";
import { Notice } from "./components/ui";
import Catalog from "./Catalog";
import GamesAdminView from "./GamesAdminView";
import GameSetup from "./GameSetup";
import PlayView from "./PlayView";
import RatingsView from "./RatingsView";
import ReplaysView from "./ReplaysView";
import ReplayView from "./ReplayView";
import ReportsView from "./ReportsView";
import SessionsView from "./SessionsView";
import { api } from "./lib/api";
import { useAuth } from "./lib/auth";
import { canManageGames, canViewCamera, canViewReports, canViewSessions } from "./lib/permissions";
import { useNavigate, useRoute } from "./router";

/**
 * Wurzel der App: verteilt die Ansichten. Bewusst ohne Router-Bibliothek,
 * die Pfade sind in `router.ts` festgelegt.
 *
 * Vor jeder Ansicht steht die Rollenpruefung: `player` kommt an Katalog,
 * Spielansicht, eigenes Profil, `/play` und das eigene Rating; `host`
 * zusaetzlich an Sitzungsverwaltung, Kamera und Rangliste; `admin` zusaetzlich
 * an Meldungen, Spieleverwaltung und Benutzerverwaltung. Die API prueft
 * dieselben Regeln noch einmal.
 */
export const App: React.FC = () => {
  const route = useRoute();
  const navigate = useNavigate();
  const { user, token } = useAuth();

  async function handleLogin(values: LoginFormValues): Promise<void> {
    // Die Anmeldung akzeptiert E-Mail oder Benutzername; das Formular nutzt die E-Mail.
    await api.login({ email: values.email, password: values.password });
    navigate("/");
  }

  async function handleSignUp(values: SignUpFormValues): Promise<void> {
    await api.register({
      username: values.username,
      password: values.password,
      email: values.email === "" ? null : values.email,
    });
    navigate("/");
  }

  if (route.name === "login") return <Login onSubmit={handleLogin} />;

  // Die Registrierung ist auch ohne Anmeldung erreichbar; `api.register`
  // speichert Token und Profil, danach greift die Rollenpruefung unten.
  if (route.name === "signup") return <SignUp onSubmit={handleSignUp} />;

  // Rückkehr von Google/GitHub: das Token liegt im URL-Fragment und wird
  // hier geprüft und gespeichert. Läuft unabhängig vom gespeicherten Profil.
  if (route.name === "oauthCallback") return <OAuthCallbackPage />;

  // Kein Token oder kein gespeichertes Profil: kein Zugriff auf die App.
  if (token === null || user === null) return <Login onSubmit={handleLogin} />;

  switch (route.name) {
    case "profile":
      return <ProfileView />;
    case "catalog":
      return <Catalog />;
    case "setup":
      return <GameSetup key={route.gameName} gameName={route.gameName} />;
    case "sessions":
      return canViewSessions(user.role) ? (
        <SessionsView />
      ) : (
        <NoAccess message="Die Sitzungsverwaltung ist Hosts und Admins vorbehalten." />
      );
    case "reports":
      return canViewReports(user.role) ? (
        <ReportsView />
      ) : (
        <NoAccess message="Meldungen sind der Administration vorbehalten." />
      );
    case "adminGames":
      return canManageGames(user.role) ? (
        <GamesAdminView />
      ) : (
        <NoAccess message="Die Spieleverwaltung ist der Administration vorbehalten." />
      );
    case "ratings":
      return <RatingsView />;
    case "play":
      return <PlayView key={route.gameName ?? "auswahl"} gameName={route.gameName} />;
    case "replays":
      return <ReplaysView />;
    case "replay":
      return <ReplayView key={route.gameId} gameId={route.gameId} />;
    case "camera":
      return canViewCamera(user.role) ? (
        <CameraView />
      ) : (
        <NoAccess message="Die Kamera-/Brettverfolgung ist Hosts und Admins vorbehalten." />
      );
    case "game":
      // `key` sorgt dafür, dass beim Wechsel auf eine andere Sitzung das Brett
      // neu aufgebaut wird (Zustand liegt in useConnectFour bzw. im jeweiligen Spiel).
      return <GameSessionWindow key={route.sessionId} sessionId={route.sessionId} />;
    case "notFound":
      return (
        <div className="shell">
          <main className="shell__main">
            <Notice
              tone="warn"
              title={`Seite nicht gefunden: ${route.path}`}
              action={
                <button type="button" className="btn btn--sm btn--primary" onClick={() => navigate("/")}>
                  Zum Katalog
                </button>
              }
            >
              Erlaubt sind <code>/</code>, <code>/games/&lt;name&gt;</code>, <code>/play</code>,{" "}
              <code>/play/&lt;name&gt;</code>, <code>/replays</code>,{" "}
              <code>/replays/&lt;id&gt;</code>, <code>/camera</code>, <code>/sessions</code>,{" "}
              <code>/reports</code>, <code>/admin/games</code>, <code>/ratings</code>,{" "}
              <code>/profile</code> und{" "}
              <code>/&lt;spiel&gt;/&lt;id&gt;</code>.
            </Notice>
          </main>
        </div>
      );
  }
};

function NoAccess({ message }: { message: string }) {
  const navigate = useNavigate();
  return (
    <div className="shell">
      <main className="shell__main">
        <Notice
          tone="warn"
          title="Kein Zugriff"
          action={
            <button type="button" className="btn btn--sm btn--primary" onClick={() => navigate("/")}>
              Zum Katalog
            </button>
          }
        >
          {message}
        </Notice>
      </main>
    </div>
  );
}

export default App;