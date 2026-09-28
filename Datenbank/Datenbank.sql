-- =============================================================================
--  BoardGames – Init-Schema (MySQL 8.0.16+ / InnoDB)
--
--  Ausfuehrbare Fassung: backend/migrations/20250101000000_init_schema.sql
--  Dort aendern und diese Datei danach aktualisieren, nicht umgekehrt.
--  Ausgefuehrt wird sie von sqlx beim Start (sqlx::migrate! in src/main.rs).
--
--  Spielunabhaengig: Farben/Rollen (red/yellow, white/black, x/o) stehen in
--  game_session_players.side statt in festen Spalten.
--
--  CHECK-Constraints werden ab MySQL 8.0.16 erzwungen.
-- =============================================================================

-- user
CREATE TABLE users (
    id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    parent_id       BIGINT UNSIGNED NULL,          -- Hierarchie (wer hat wen angelegt?)
    username        VARCHAR(64)  NOT NULL UNIQUE,
    email           VARCHAR(255) NOT NULL UNIQUE,
    password_hash   VARCHAR(255) NOT NULL,         -- z.B. argon2
    role            ENUM('admin','host','player') NOT NULL DEFAULT 'player',
    is_locked       BOOLEAN NOT NULL DEFAULT FALSE, -- Sperren von Schreibrechten
    locked_reason   VARCHAR(255) NULL,
    locked_until    DATETIME NULL,                  -- NULL = unbefristet
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
                    ON UPDATE CURRENT_TIMESTAMP,

    CONSTRAINT fk_users_parent
        FOREIGN KEY (parent_id) REFERENCES users(id)
        ON DELETE SET NULL,

    -- Eine Ablaufzeit ist nur bei gesperrten Usern sinnvoll.
    CONSTRAINT chk_users_lock_window CHECK (is_locked OR locked_until IS NULL)
) ENGINE=InnoDB;
-- game_types
CREATE TABLE game_types (
    id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name          VARCHAR(64) NOT NULL UNIQUE,     -- "connect-four", "tictactoe", ...
    display_name  VARCHAR(128) NOT NULL,
    max_players   TINYINT UNSIGNED NOT NULL DEFAULT 2,
    rules_json    JSON NULL,                       -- Spielregeln / Varianten
    created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;
-- game_sessions
CREATE TABLE game_sessions (
    id               BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    game_type_id     INT UNSIGNED NOT NULL,
    host_id          BIGINT UNSIGNED NULL,         -- NULL = anonyme Session
    session_source   ENUM('digital','camera') NOT NULL DEFAULT 'digital',
    outcome          ENUM('win','draw','aborted') NULL, -- NULL = laeuft noch
    winner_id        BIGINT UNSIGNED NULL,         -- gesetzt nur bei outcome='win'
    started_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    finished_at      DATETIME NULL,
    duration_ms      BIGINT UNSIGNED NULL,         -- bei Kamera: camera_recordings.duration_ms
    confidence_score DECIMAL(5,4) NULL,            -- Gesamt-Konfidenz der Analyse, 0.0000-1.0000
    metadata_json    JSON NULL,                    -- z.B. Time-Control, Variante

    CONSTRAINT fk_session_type   FOREIGN KEY (game_type_id) REFERENCES game_types(id),
    CONSTRAINT fk_session_host   FOREIGN KEY (host_id)      REFERENCES users(id),
    CONSTRAINT fk_session_winner FOREIGN KEY (winner_id)    REFERENCES users(id),

    -- fk_* erzeugen die noetigen Indizes fuer game_type_id/host_id/winner_id.
    INDEX idx_session_finished (finished_at),

    -- Lauufende Session hat kein Ergebnis und ist nicht beendet, beendete hat beides.
    CONSTRAINT chk_session_outcome CHECK (
        (finished_at IS NULL     AND outcome IS NULL) OR
        (finished_at IS NOT NULL AND outcome IS NOT NULL)
    ),
    -- winner_id nur bei einem Sieg. Bei anonymen Partien bleibt winner_id NULL;
    -- der Sieger steht dann in game_session_players.side.
    CONSTRAINT chk_session_winner CHECK (winner_id IS NULL OR outcome = 'win')
) ENGINE=InnoDB;
-- game_session_players
-- Teilnehmer + spielabhaengige Seite/Farbe. "Rolle variiert je Spiel":
-- red/yellow, white/black, x/o, first/second, ...
-- user_id ist NULL, solange es kein Login gibt (Partie gegen den Bot/lokal).
CREATE TABLE game_session_players (
    session_id  BIGINT UNSIGNED NOT NULL,
    seat_index  TINYINT UNSIGNED NOT NULL,         -- 0 = erster Spieler
    user_id     BIGINT UNSIGNED NULL,              -- NULL = anonym
    side        VARCHAR(32) NULL,                   -- z.B. "red", "white", "x"

    PRIMARY KEY (session_id, seat_index),
    -- NULL-Werte duerfen sich wiederholen: mehrere anonyme Sitze sind erlaubt.
    UNIQUE KEY uq_gsp_user (session_id, user_id),

    CONSTRAINT fk_gsp_session FOREIGN KEY (session_id) REFERENCES game_sessions(id) ON DELETE CASCADE,
    CONSTRAINT fk_gsp_user    FOREIGN KEY (user_id)    REFERENCES users(id)         ON DELETE RESTRICT,

    CONSTRAINT chk_gsp_side CHECK (side IS NULL OR CHAR_LENGTH(TRIM(side)) > 0)
) ENGINE=InnoDB;
-- kamera_snapshots
CREATE TABLE camera_recordings (
    id             BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    session_id     BIGINT UNSIGNED NOT NULL,
    storage_uri    VARCHAR(512) NOT NULL,           -- Pfad / S3-URL des Videos
    frames_uri     VARCHAR(512) NULL,               -- extrahierte Frames (Ordner/Zip)
    duration_ms    BIGINT UNSIGNED NULL,
    resolution     VARCHAR(32) NULL,                -- "1920x1080"
    started_at     DATETIME NOT NULL,
    ended_at       DATETIME NULL,

    CONSTRAINT fk_cam_session FOREIGN KEY (session_id)
        REFERENCES game_sessions(id) ON DELETE CASCADE
) ENGINE=InnoDB;
-- Einzelne Frames, damit moves.frame_ref_id aufloesbar ist. storage_uri ist
-- optional: ohne Wert liegt das Bild unter frames_uri/frame_<frame_index>.jpg.
CREATE TABLE camera_frames (
    id           BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    recording_id BIGINT UNSIGNED NOT NULL,
    frame_index  INT UNSIGNED NOT NULL,             -- 0-basiert
    offset_ms    BIGINT UNSIGNED NULL,              -- Position im Video
    storage_uri  VARCHAR(512) NULL,
    width        SMALLINT UNSIGNED NULL,
    height       SMALLINT UNSIGNED NULL,

    UNIQUE KEY uq_frame_index (recording_id, frame_index),

    CONSTRAINT fk_frame_recording FOREIGN KEY (recording_id)
        REFERENCES camera_recordings(id) ON DELETE CASCADE
) ENGINE=InnoDB;
-- moves
CREATE TABLE moves (
    id           BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    session_id   BIGINT UNSIGNED NOT NULL,
    move_index   INT UNSIGNED NOT NULL,             -- Reihenfolge
    player_id    BIGINT UNSIGNED NULL,              -- NULL = erkannt, nicht zugeordnet
    move_source  ENUM('manual','detected') NOT NULL DEFAULT 'manual',
    payload      JSON NOT NULL,                     -- z.B. {"col":3} / {"from":"e2","to":"e4"}
    timestamp_ms BIGINT UNSIGNED NULL,              -- Zeit relativ zum Start
    confidence   DECIMAL(5,4) NULL,                 -- 0.0000-1.0000, nur bei detected
    frame_ref_id BIGINT UNSIGNED NULL,              -- Verweis auf camera_frames.id
    verified     BOOLEAN NOT NULL DEFAULT FALSE,    -- von Mensch bestaetigt
    created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_moves_session FOREIGN KEY (session_id)   REFERENCES game_sessions(id) ON DELETE CASCADE,
    CONSTRAINT fk_moves_player  FOREIGN KEY (player_id)    REFERENCES users(id)         ON DELETE RESTRICT,
    CONSTRAINT fk_moves_frame   FOREIGN KEY (frame_ref_id) REFERENCES camera_frames(id)  ON DELETE SET NULL,

    UNIQUE KEY uq_session_move (session_id, move_index),

    CONSTRAINT chk_moves_confidence CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1))
) ENGINE=InnoDB;
-- permissions
-- Sperre = is_locked AND (locked_until IS NULL OR locked_until > NOW()).
-- Abgelaufene locked_until heben die Sperre automatisch auf.
CREATE VIEW v_user_permissions AS
SELECT
    u.id,
    u.username,
    u.role,
    u.is_locked,
    u.locked_until,                                                  -- NULL = unbefristet
    (u.role = 'admin')  AS can_manage_users,
    (u.role IN ('admin','host')) AS can_create_sessions,
    (u.role = 'admin')  AS can_lock_users,
    NOT (u.is_locked AND (u.locked_until IS NULL OR u.locked_until > NOW())) AS can_write
FROM users u;

/* Rust mapping

API-DTO (POST /api/connect-four/games) - wird NICHT aus der DB gelesen,
liegt als src/api.rs:
    #[derive(Deserialize)]
    pub struct GameResultDto { pub moves: Vec<MoveDto>, pub winner: String }
    #[derive(Deserialize)]
    pub struct MoveDto { pub turn: i64, pub player: String, pub location: Location }
    #[derive(Deserialize)]
    pub struct Location { pub x: i64, pub y: i64 }

    Der Endpoint nimmt nur beendete Partien an:
        "red" | "yellow"  => outcome = 'win'
        "draw"            => outcome = 'draw'    (erfordert ein volles Brett)
        "aborted"         => outcome = 'aborted'
    game_type_id kommt aus der Route (game_types.name = 'connect-four').
    host_id, player_id und winner_id bleiben NULL, solange es keinen Login gibt -
    der Sieger steht dann in game_session_players.side.
    Unbekannte Seitenfarben, falsche turn-Nummeration und Koordinaten ausserhalb
    des Brettes werden mit 400 abgelehnt.

DB-Row - benoetigt sqlx, serde, serde_json, chrono und rust_decimal (DECIMAL).
Liegt als src/db.rs:
    #[derive(Serialize, Deserialize, sqlx::FromRow)]
    pub struct GameSession { ... }
    #[derive(Serialize, Deserialize, sqlx::FromRow)]
    pub struct SessionPlayer { pub seat_index: u8, pub user_id: Option<u64>, pub side: Option<String> }
    #[derive(Serialize, Deserialize, sqlx::FromRow)]
    pub struct GameMove { ... }

    ENUM-Spalten liest sqlx als String; die Umwandlung in App-Enums an einer
    Stelle. DECIMAL braucht die rust_decimal-Feature von sqlx, nicht f32.
*/
