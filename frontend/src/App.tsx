import { GameSessionWindow } from "./GameSessionWindow";
import { Notice } from "./components/ui";
import Catalog from "./Catalog";
import GameSetup from "./GameSetup";
import PlayView from "./PlayView";
import SessionsView from "./SessionsView";
import { useNavigate, useRoute } from "./router";

/**
 * Wurzel der App: verteilt die Ansichten. Bewusst ohne Router-Bibliothek,
 * die Pfade sind in `router.ts` festgelegt.
 */
export const App: React.FC = () => {
  const route = useRoute();
  const navigate = useNavigate();

  switch (route.name) {
    case "catalog":
      return <Catalog />;
    case "setup":
      return <GameSetup key={route.gameName} gameName={route.gameName} />;
    case "sessions":
      return <SessionsView />;
    case "play":
      return <PlayView />;
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
              Erlaubt sind <code>/</code>, <code>/games/&lt;name&gt;</code>, <code>/sessions</code> und{" "}
              <code>/connectfour/&lt;id&gt;</code>.
            </Notice>
          </main>
        </div>
      );
  }
};

export default App;