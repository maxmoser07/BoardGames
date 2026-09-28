import React, { useState } from "react";
import ConnectFour from "./ConnectFour";

interface Game {
  id: string;
  name: string;
  category: string;
  description: string;
  component: React.ReactNode;
}

const games: Game[] = [
  {
    id: "connect-four",
    name: "Connect Four",
    category: "Strategie",
    description: "Klassisches Vier Gewinnt Spiel für 2 Spieler.",
    component: <ConnectFour />,
  },
  // Weitere Spiele können hier später hinzugefügt werden
];

export const App: React.FC = () => {
  const [activeGameId, setActiveGameId] = useState<string>(games[0].id);
  const activeGame = games.find((g) => g.id === activeGameId) || games[0];

  return (
    <div style={styles.dashboardContainer}>
      {/* Header */}
      <header style={styles.header}>
        <div style={styles.logoGroup}>
          <span style={styles.logoIcon}>🎮</span>
          <h1 style={styles.title}>Game Hub Dashboard</h1>
        </div>
        <div style={styles.userInfo}>
          <span>Willkommen, Spieler!</span>
        </div>
      </header>

      {/* Main Content Layout */}
      <div style={styles.mainContent}>
        {/* Navigation / Spiele-Auswahl (Sidebar) */}
        <aside style={styles.sidebar}>
          <h2 style={styles.sectionTitle}>Spieleübersicht</h2>
          <nav style={styles.gameList}>
            {games.map((game) => {
              const isActive = game.id === activeGameId;
              return (
                <button
                  key={game.id}
                  onClick={() => setActiveGameId(game.id)}
                  style={{
                    ...styles.gameCard,
                    ...(isActive ? styles.activeGameCard : {}),
                  }}
                >
                  <div style={styles.gameCardHeader}>
                    <span style={styles.gameName}>{game.name}</span>
                    <span style={styles.badge}>{game.category}</span>
                  </div>
                  <p style={styles.gameDescription}>{game.description}</p>
                </button>
              );
            })}
          </nav>
        </aside>

        {/* Spielbereich */}
        <main style={styles.gameArea}>
          <div style={styles.gameHeader}>
            <div>
              <h2 style={{ margin: 0, fontSize: "1.5rem", color: "#0f172a" }}>
                {activeGame.name}
              </h2>
              <span style={{ fontSize: "0.875rem", color: "#64748b" }}>
                Kategorie: {activeGame.category}
              </span>
            </div>
          </div>

          <div style={styles.canvasArea}>
            {activeGame.component}
          </div>
        </main>
      </div>
    </div>
  );
};

// Inline-Styling
const styles: Record<string, React.CSSProperties> = {
  dashboardContainer: {
    fontFamily: "Inter, system-ui, -apple-system, sans-serif",
    backgroundColor: "#f8fafc",
    minHeight: "100vh",
    display: "flex",
    flexDirection: "column",
    color: "#334155",
  },
  header: {
    backgroundColor: "#1e293b",
    color: "#ffffff",
    padding: "16px 32px",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
  },
  logoGroup: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
  },
  logoIcon: {
    fontSize: "1.8rem",
  },
  title: {
    margin: 0,
    fontSize: "1.25rem",
    fontWeight: 600,
  },
  userInfo: {
    fontSize: "0.9rem",
    color: "#cbd5e1",
  },
  mainContent: {
    display: "flex",
    flex: 1,
    padding: "24px",
    gap: "24px",
    maxWidth: "1400px",
    margin: "0 auto",
    width: "100%",
    boxSizing: "border-box",
  },
  sidebar: {
    width: "300px",
    display: "flex",
    flexDirection: "column",
    gap: "16px",
  },
  sectionTitle: {
    fontSize: "1.1rem",
    margin: "0 0 8px 0",
    color: "#475569",
  },
  gameList: {
    display: "flex",
    flexDirection: "column",
    gap: "12px",
  },
  gameCard: {
    padding: "16px",
    borderRadius: "12px",
    border: "1px solid #e2e8f0",
    backgroundColor: "#ffffff",
    textAlign: "left",
    cursor: "pointer",
    transition: "all 0.2s ease",
    boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
  },
  activeGameCard: {
    borderColor: "#2563eb",
    backgroundColor: "#eff6ff",
    boxShadow: "0 0 0 2px #2563eb",
  },
  gameCardHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "6px",
  },
  gameName: {
    fontWeight: 600,
    color: "#0f172a",
  },
  badge: {
    fontSize: "0.75rem",
    backgroundColor: "#e2e8f0",
    padding: "2px 8px",
    borderRadius: "12px",
    color: "#475569",
  },
  gameDescription: {
    margin: 0,
    fontSize: "0.85rem",
    color: "#64748b",
  },
  gameArea: {
    flex: 1,
    backgroundColor: "#ffffff",
    borderRadius: "16px",
    border: "1px solid #e2e8f0",
    padding: "24px",
    display: "flex",
    flexDirection: "column",
    gap: "20px",
    boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
  },
  gameHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    borderBottom: "1px solid #f1f5f9",
    paddingBottom: "16px",
  },
  canvasArea: {
    flex: 1,
    backgroundColor: "#f8fafc",
    borderRadius: "12px",
    padding: "20px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    minHeight: "400px",
  },
};

export default App;