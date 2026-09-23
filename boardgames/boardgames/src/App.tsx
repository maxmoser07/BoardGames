import React from "react";
import ConnectFour from "./ConnectFour";

const games = [
  { id: "connect-four", name: "Connect Four", component: <ConnectFour /> },
  // ...more games later
];

const App: React.FC = () => {
  const [activeGameId, setActiveGameId] = React.useState(games[0].id);
  const activeGame = games.find((g) => g.id === activeGameId)!;

  return (
    <div style={{ fontFamily: "system-ui", padding: 24 }}>
      <nav style={{ display: "flex", gap: 12, marginBottom: 24 }}>
        {games.map((game) => (
          <button
            key={game.id}
            onClick={() => setActiveGameId(game.id)}
            style={{
              padding: "8px 16px",
              borderRadius: 8,
              border: "1px solid #ccc",
              background: game.id === activeGameId ? "#1e3a8a" : "white",
              color: game.id === activeGameId ? "white" : "black",
              cursor: "pointer",
            }}
          >
            {game.name}
          </button>
        ))}
      </nav>

      {activeGame.component}
    </div>
  );
};

export default App;