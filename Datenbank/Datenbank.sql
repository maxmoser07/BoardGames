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

    INDEX idx_users_role (role),
    INDEX idx_users_parent (parent_id),
    INDEX idx_users_locked (is_locked)
) ENGINE=InnoDB;
-- game_types
CREATE TABLE game_types (
    id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name          VARCHAR(64) NOT NULL UNIQUE,     -- "chess", "checkers", ...
    display_name  VARCHAR(128) NOT NULL,
    rules_json    JSON NULL,                       -- Spielregeln / Varianten
    created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;
-- game_sessions
CREATE TABLE game_sessions (
    id             BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    game_type_id   INT UNSIGNED NOT NULL,
    host_id        BIGINT UNSIGNED NOT NULL,        -- wer hat die Session erstellt
    player_white   BIGINT UNSIGNED NULL,            -- Teilnehmer (Rolle variiert je Spiel)
    player_black   BIGINT UNSIGNED NULL,
    result         ENUM('white_win','black_win','draw','aborted') NULL,
    winner_id      BIGINT UNSIGNED NULL,            -- NULL bei draw
    started_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    finished_at    DATETIME NULL,
    duration_ms    BIGINT UNSIGNED NULL,
    metadata_json  JSON NULL,                       -- z.B. Time-Control, Variante

    CONSTRAINT fk_session_type   FOREIGN KEY (game_type_id) REFERENCES game_types(id),
    CONSTRAINT fk_session_host   FOREIGN KEY (host_id)      REFERENCES users(id),
    CONSTRAINT fk_session_white  FOREIGN KEY (player_white) REFERENCES users(id),
    CONSTRAINT fk_session_black  FOREIGN KEY (player_black) REFERENCES users(id),
    CONSTRAINT fk_session_winner FOREIGN KEY (winner_id)    REFERENCES users(id),

    INDEX idx_session_type (game_type_id),
    INDEX idx_session_host (host_id),
    INDEX idx_session_players (player_white, player_black),
    INDEX idx_session_finished (finished_at)
) ENGINE=InnoDB;
-- moves
CREATE TABLE moves (
    id           BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    session_id   BIGINT UNSIGNED NOT NULL,
    move_index   INT UNSIGNED NOT NULL,             -- Reihenfolge
    player_id    BIGINT UNSIGNED NULL,              -- wer zog
    payload      JSON NOT NULL,                     -- z.B. {"from":"e2","to":"e4"}
    timestamp_ms BIGINT UNSIGNED NULL,              -- Zeit relativ zum Start
    created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_moves_session FOREIGN KEY (session_id) REFERENCES game_sessions(id) ON DELETE CASCADE,
    CONSTRAINT fk_moves_player  FOREIGN KEY (player_id)  REFERENCES users(id) ON DELETE SET NULL,

    UNIQUE KEY uq_session_move (session_id, move_index)
) ENGINE=InnoDB;

/* Rust mapping
#[derive(Serialize, Deserialize, sqlx::FromRow)]
pub struct GameResult {
    pub moves: Vec<Move>,
    pub winner: Winner,          // Player | "draw"
}

#[derive(Serialize, Deserialize)]
pub enum Winner {
    Player(String),
    Draw,
}

#[derive(Serialize, Deserialize, sqlx::FromRow)]
pub struct Move {
    pub move_index: u32,
    pub player_id: Option<i64>,
    pub payload: serde_json::Value,
    pub timestamp_ms: Option<u64>,
}

*/

-- kamera
ALTER TABLE game_sessions
    ADD COLUMN source ENUM('digital','camera') NOT NULL DEFAULT 'digital',
    ADD COLUMN confidence_score DECIMAL(5,4) NULL;  -- Gesamt-Konfidenz der Analyse

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
-- detected moves
ALTER TABLE moves
    ADD COLUMN source ENUM('manual','detected') NOT NULL DEFAULT 'manual',
    ADD COLUMN confidence DECIMAL(5,4) NULL,         -- 0.0000 – 1.0000
    ADD COLUMN frame_ref_id BIGINT UNSIGNED NULL,    -- Verweis auf Frame
    ADD COLUMN verified BOOLEAN NOT NULL DEFAULT FALSE; -- von Mensch bestätigt
-- permissions
CREATE VIEW v_user_permissions AS
SELECT
    u.id,
    u.username,
    u.role,
    u.is_locked,
    (u.role = 'admin')  AS can_manage_users,
    (u.role IN ('admin','host')) AS can_create_sessions,
    (u.role = 'admin')  AS can_lock_users,
    (NOT u.is_locked)   AS can_write
FROM users u;

-- migration sqlx migrate add init_schema
# → migrations/20250101000000_init_schema.sql