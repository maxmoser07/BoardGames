-- =============================================================================
--  BoardGames - Spieler-Ratings (Elo) und Reset-Protokoll
--
--  Jede Person hat genau eine Rating-Zeile. Neue Konten bekommen sie beim
--  Registrieren; die Migration legt sie fuer die bestehenden Konten an.
--
--  `rating_resets` haelt fest, wer wann welches Rating auf welchen Wert
--  zurueckgesetzt hat. Die Zeile bleibt auch dann erhalten, wenn das Konto
--  spaeter geloescht wird (`admin_id`/`user_id` ON DELETE SET NULL waere hier
--  falsch, weil das Protokoll die Nummern behalten soll). Deshalb sind beide
--  Spalten ohne Fremdschluessel und nur indiziert.
-- =============================================================================

CREATE TABLE player_ratings (
    user_id       BIGINT UNSIGNED NOT NULL PRIMARY KEY,
    rating        INT NOT NULL DEFAULT 1000,
    games_played  INT UNSIGNED NOT NULL DEFAULT 0,
    wins          INT UNSIGNED NOT NULL DEFAULT 0,
    losses        INT UNSIGNED NOT NULL DEFAULT 0,
    draws         INT UNSIGNED NOT NULL DEFAULT 0,
    updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
                  ON UPDATE CURRENT_TIMESTAMP,

    CONSTRAINT fk_rating_user
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT chk_rating_range CHECK (rating BETWEEN 100 AND 4000)
) ENGINE=InnoDB;

INSERT INTO player_ratings (user_id, rating)
SELECT id, 1000 FROM users;

CREATE TABLE rating_resets (
    id          BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id     BIGINT UNSIGNED NOT NULL,
    admin_id    BIGINT UNSIGNED NOT NULL,
    old_rating  INT NOT NULL,
    new_rating  INT NOT NULL,
    reason      VARCHAR(255) NULL,
    created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    INDEX idx_rating_reset_user (user_id),
    INDEX idx_rating_reset_created (created_at)
) ENGINE=InnoDB;
