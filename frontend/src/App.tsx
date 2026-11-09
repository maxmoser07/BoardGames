import { GameSessionWindow } from "./GameSessionWindow";
import LoginView from "./LoginView";
import ProfileView from "./ProfileView";
import CameraView from "./CameraView";
import { Notice } from "./components/ui";
import Catalog from "./Catalog";
import GameSetup from "./GameSetup";
import PlayView from "./PlayView";
import ReportsView from "./ReportsView";
import SessionsView from "./SessionsView";
import { useAuth } from "./lib/auth";
import { canManageReports, canViewSessions } from "./lib/permissions";
import { useNavigate, useRoute } from "./router";

/**
 * Wurzel der App: verteilt die Ansichten. Bewusst ohne Router-Bibliothek,
 * die Pfade sind in `router.ts` festgelegt.
 *
 * Vor jeder Ansicht steht die Rollenpruefung: `player` kommt nur an Katalog,
 * Spielansicht, eigenes Profil und `/play`; `host` zusaetzlich an die
 * Sitzungsverwaltung; `admin` zusaetzlich an Meldungen. Die API prueft
 * dieselben Regeln noch einmal.
 */
export const App: React.FC = () => {
  const route = useRoute();
  const navigate = useNavigate();
  const { user, token } = useAuth();

  if (route.name === "login") return <LoginView />;

  // Kein Token oder kein gespeichertes Profil: kein Zugriff auf die App.
  if (token === null || user === null) return <LoginView />;

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
      return canManageReports(user.role) ? (
        <ReportsView />
      ) : (
        <NoAccess message="Meldungen und Benutzerverwaltung sind nur für Admins." />
      );
    case "play":
      return <PlayView />;
    case "camera":
      return <CameraView />;
    case "game":
      // `key` sorgt dafür, dass beim Wechsel auf eine andere Sitzung das Brett
      // neu aufgebaut wird (Zustand liegt in useConnectFour).
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
              <code>/camera</code>, <code>/sessions</code>, <code>/reports</code>,{" "}
              <code>/profile</code> und <code>/connectfour/&lt;id&gt;</code>.
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