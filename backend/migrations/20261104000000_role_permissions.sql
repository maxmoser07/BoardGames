-- =============================================================================
--  BoardGames - Rollen, Rechte und Anmeldetokens
--
--  Bis hierher war die Rolle nur eine Spalte: jede Route war fuer jede Person
--  erreichbar. Diese Migration macht die Regeln verbindlich:
--
--    player  darf nur spielen (Partien aufnehmen, lesen, eigenes Profil)
--    host    darf zusaetzlich Sitzungen anlegen und eigene Sitzungen steuern
--    admin   darf zusaetzlich Benutzer, Meldungen und Beispieldaten verwalten
--
--  Die Rechte stehen in `v_user_permissions`; das Backend liest sie bei jeder
--  Anfrage neu, damit Rollen- und Sperraenderungen sofort wirken.
--
--  `auth_tokens` ersetzt den bisherigen Token `= users.id`. Gespeichert wird
--  nur der SHA-256-Hash des Tokens, nie das Token selbst.
-- =============================================================================

CREATE TABLE auth_tokens (
    token_hash  CHAR(64) NOT NULL PRIMARY KEY,      -- SHA-256 des Bearer-Tokens
    user_id     BIGINT UNSIGNED NOT NULL,
    created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at  DATETIME NOT NULL,

    CONSTRAINT fk_auth_token_user
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,

    INDEX idx_auth_token_user (user_id),
    INDEX idx_auth_token_expires (expires_at)
) ENGINE=InnoDB;

-- Rechte-Matrix. `can_write` ist die Sperre: gesperrte Konten duerfen lesen,
-- aber nichts anlegen oder aendern. `can_play` gilt fuer alle drei Rollen.
CREATE OR REPLACE VIEW v_user_permissions AS
SELECT
    u.id,
    u.username,
    u.role,
    u.is_locked,
    u.locked_until,                                                  -- NULL = unbefristet
    NOT (u.is_locked AND (u.locked_until IS NULL OR u.locked_until > UTC_TIMESTAMP()))
        AS is_active,
    NOT (u.is_locked AND (u.locked_until IS NULL OR u.locked_until > UTC_TIMESTAMP()))
        AS can_play,
    (u.role IN ('admin','host')) AS can_create_sessions,
    (u.role = 'admin')  AS can_manage_users,
    (u.role = 'admin')  AS can_lock_users,
    (u.role = 'admin')  AS can_manage_reports,
    NOT (u.is_locked AND (u.locked_until IS NULL OR u.locked_until > UTC_TIMESTAMP()))
        AS can_write
FROM users u;
