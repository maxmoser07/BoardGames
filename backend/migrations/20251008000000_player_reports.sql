-- =============================================================================
--  BoardGames - Spieler-Meldungen (player reports)
--
--  Admins koennen Meldungen ueber Spieler einsehen und ihren Status aendern
--  (open -> reviewed -> resolved/dismissed). Reporter und gemeldeter Spieler
--  zeigen auf users; session_id ist optional und verweist auf die Partie, in
--  der der Vorfall passiert ist.
-- =============================================================================
CREATE TABLE player_reports (
    id                BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    reporter_id       BIGINT UNSIGNED NULL,
    reported_user_id  BIGINT UNSIGNED NOT NULL,
    session_id        BIGINT UNSIGNED NULL,
    reason            VARCHAR(128) NOT NULL,
    details           TEXT NULL,
    status            ENUM('open','reviewed','resolved','dismissed') NOT NULL DEFAULT 'open',
    admin_note        TEXT NULL,
    reviewed_by       BIGINT UNSIGNED NULL,
    created_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
                      ON UPDATE CURRENT_TIMESTAMP,
    reviewed_at       DATETIME NULL,

    CONSTRAINT fk_report_reporter
        FOREIGN KEY (reporter_id) REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT fk_report_reported
        FOREIGN KEY (reported_user_id) REFERENCES users(id) ON DELETE RESTRICT,
    CONSTRAINT fk_report_session
        FOREIGN KEY (session_id) REFERENCES game_sessions(id) ON DELETE SET NULL,
    CONSTRAINT fk_report_reviewer
        FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE SET NULL,

    INDEX idx_report_status (status),
    INDEX idx_report_reported (reported_user_id),
    INDEX idx_report_created (created_at)
) ENGINE=InnoDB;

-- Beispielmeldungen, damit die Admin-Ansicht beim ersten Start etwas zeigt.
INSERT INTO player_reports
    (reporter_id, reported_user_id, session_id, reason, details, status)
VALUES
    (2, 3, (SELECT id FROM game_sessions WHERE JSON_EXTRACT(metadata_json, '$.demo') = TRUE LIMIT 1),
     'Unsportliches Verhalten', 'Hat mehrfach die Zeituhr ueberschritten und beleidigt.', 'open'),
    (3, 2, NULL, 'Schummelverdacht', 'Spielzuege wurden zu schnell fuer eine menschliche Reaktion gesetzt.', 'reviewed');
