-- =============================================================================
--  BoardGames - Anmeldung ueber Google und GitHub
--
--  `oauth_accounts` verknuepft ein Konto der Anbieter mit einer Zeile aus
--  `users`. Die Verknuepfung ist die stabile Kennung: die E-Mail kann sich
--  beim Anbieter aendern, die `sub`/`id` nicht.
--
--  `oauth_login_states` haelt den CSRF-`state` des Authorization-Code-Flows.
--  Er ist einmalig verwendbar und laeuft nach zehn Minuten ab; das Backend
--  loescht abgelaufene Zeilen beim naechsten Startversuch.
-- =============================================================================

CREATE TABLE oauth_accounts (
    id                BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id           BIGINT UNSIGNED NOT NULL,
    provider          VARCHAR(32)  NOT NULL,          -- 'google' | 'github'
    provider_user_id  VARCHAR(255) NOT NULL,          -- Google `sub`, GitHub `id`
    created_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
                      ON UPDATE CURRENT_TIMESTAMP,

    -- Ein Konto je Anbieter und Anbieter-Kennung sowie hoechstens eine
    -- Verknuepfung derselben Person zu demselben Anbieter.
    UNIQUE KEY uq_oauth_provider_user (provider, provider_user_id),
    UNIQUE KEY uq_oauth_user_provider (user_id, provider),

    CONSTRAINT fk_oauth_user
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE oauth_login_states (
    state         CHAR(64)     NOT NULL PRIMARY KEY,  -- 32 Zufallsbytes als Hex
    provider      VARCHAR(32)  NOT NULL,
    redirect_path VARCHAR(255) NOT NULL DEFAULT '/',  -- Pfad nach dem Login
    expires_at    DATETIME     NOT NULL,

    INDEX idx_oauth_state_expires (expires_at)
) ENGINE=InnoDB;
