-- =============================================================================
--  BoardGames - Freundschaften und Freundschaftsanfragen
--
--  Eine Zeile beschreibt genau eine gerichtete Anfrage. Nach dem Annehmen steht
--  `status = 'accepted'`; die Freundschaft gilt dann fuer beide Personen, weil
--  die Leserouten immer beide Richtungen abfragen.
--
--  `responded_at` haelt fest, wann angenommen oder abgelehnt wurde. Abgelehnte
--  Anfragen bleiben zunaechst stehen, duerfen aber spaeter erneut gestellt
--  werden; die API ersetzt sie dann durch eine neue Anfrage.
--
--  `chk_friend_not_self` verhindert Anfragen an sich selbst. Das Paar
--  (requester, addressee) ist eindeutig, damit dieselbe Richtung nicht doppelt
--  angelegt werden kann.
-- =============================================================================

CREATE TABLE friendships (
    id            BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    requester_id  BIGINT UNSIGNED NOT NULL,
    addressee_id  BIGINT UNSIGNED NOT NULL,
    status        ENUM('pending','accepted','declined') NOT NULL DEFAULT 'pending',
    message       VARCHAR(255) NULL,
    created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    responded_at  DATETIME NULL,

    CONSTRAINT fk_friend_requester
        FOREIGN KEY (requester_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_friend_addressee
        FOREIGN KEY (addressee_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT chk_friend_not_self
        CHECK (requester_id <> addressee_id),

    UNIQUE KEY uq_friend_direction (requester_id, addressee_id),
    INDEX idx_friend_addressee_status (addressee_id, status),
    INDEX idx_friend_requester_status (requester_id, status)
) ENGINE=InnoDB;
