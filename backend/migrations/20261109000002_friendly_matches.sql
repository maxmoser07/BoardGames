-- =============================================================================
--  BoardGames - Freundschaftsspiele und Wertungen
--
--  Ob eine Sitzung gewertet wird, steht wie die uebrigen Zusatzangaben in
--  `game_sessions.metadata_json`:
--
--      {"friendly": true}  -> Freundschaftsspiel, keine Wertung
--      Schluessel fehlt    -> gewertete Partie
--
--  Der Wertungsstand liegt je Person und Spiel in `player_ratings`. Freund-
--  schaftsspiele werden dort nie fortgeschrieben; sie bleiben trotzdem in
--  `game_sessions` und `moves` erhalten. Eine Zeile entsteht erst beim ersten
--  gewerteten Ergebnis, damit neue Konten und Spieltypen keinen Seed brauchen.
--
--  Startwert ist 1200 (Elo). Der Wert wird in backend/src/api.rs berechnet.
-- =============================================================================
CREATE TABLE player_ratings (
    user_id       BIGINT UNSIGNED NOT NULL,
    game_type_id  INT UNSIGNED NOT NULL,
    rating        INT NOT NULL DEFAULT 1200,
    games_played  INT UNSIGNED NOT NULL DEFAULT 0,
    wins          INT UNSIGNED NOT NULL DEFAULT 0,
    losses        INT UNSIGNED NOT NULL DEFAULT 0,
    draws         INT UNSIGNED NOT NULL DEFAULT 0,
    updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
                  ON UPDATE CURRENT_TIMESTAMP,

    PRIMARY KEY (user_id, game_type_id),

    CONSTRAINT fk_rating_user
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_rating_game_type
        FOREIGN KEY (game_type_id) REFERENCES game_types(id) ON DELETE CASCADE,

    CONSTRAINT chk_rating_value CHECK (rating BETWEEN 100 AND 4000),
    CONSTRAINT chk_rating_counts CHECK (
        games_played = wins + losses + draws
    )
) ENGINE=InnoDB;
