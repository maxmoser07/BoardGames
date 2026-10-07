-- =============================================================================
--  BoardGames - Beispielpersonen
--
--  Wird von sqlx beim Start ausgefuehrt (sqlx::migrate! in src/main.rs).
--
--  Es gibt noch keinen Login: die Oberflaeche waehlt eine dieser Personen aus
--  ("Angemeldet als"), damit `host_id` und `game_session_players.user_id` auf
--  einen echten Fremdschluessel zeigen koennen. `password_hash` ist deshalb nur
--  ein Platzhalter - hier wird sich nie angemeldet.
--
--  Die ids 1..4 sind fest, weil das Frontend standardmaessig mit id 1
--  (HostUser) startet. Spaeter kommen echte Konten mit Auto-Increment dazu.
-- =============================================================================

INSERT INTO users (id, username, email, password_hash, role) VALUES
    (1, 'HostUser', 'hostuser@example.invalid', '!no-login-yet', 'host'),
    (2, 'Alice',    'alice@example.invalid',    '!no-login-yet', 'player'),
    (3, 'Bob',      'bob@example.invalid',      '!no-login-yet', 'player'),
    (4, 'Mara',     'mara@example.invalid',     '!no-login-yet', 'admin');
