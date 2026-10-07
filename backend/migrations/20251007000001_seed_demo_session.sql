-- =============================================================================
--  BoardGames - Beispielpartie
--
--  Wird von sqlx beim Start ausgefuehrt (sqlx::migrate! in src/main.rs).
--
--  Damit die Oberflaeche beim ersten Aufruf etwas zeigt, gibt es eine
--  abgeschlossene Sitzung mit sieben Zuegen. `metadata_json.demo` markiert sie;
--  "Beispiel entfernen" in der Oberflaeche loescht genau diese Zeilen
--  (DELETE /api/demo-data, Kaskade auf moves und game_session_players).
--
--  Rot gewinnt senkrecht in Spalte 0, auf den unteren vier Zeilen. Das ist
--  zugleich der Beleg fuer das Koordinatenformat aus `useConnectFour.ts`:
--  x = Spalte, y = Zeile, y = 5 ist die unterste Zeile. Der Verlauf ist
--  regelkonform - `validate_moves` in backend/src/api.rs lehnt ihn sonst
--  genauso ab wie eine erfundene Partie aus dem Browser.
-- =============================================================================

INSERT INTO game_sessions (
    game_type_id, host_id, session_source, outcome, started_at, finished_at,
    duration_ms, metadata_json
) VALUES (
    (SELECT id FROM game_types WHERE name = 'connect-four'),
    1,
    'digital',
    'win',
    UTC_TIMESTAMP() - INTERVAL 51 MINUTE,
    UTC_TIMESTAMP() - INTERVAL 47 MINUTE,
    252000,
    JSON_OBJECT('winner_side', 'red', 'demo', TRUE)
);

SET @demo_session = LAST_INSERT_ID();

INSERT INTO game_session_players (session_id, seat_index, user_id, side) VALUES
    (@demo_session, 0, 2, 'red'),
    (@demo_session, 1, 3, 'yellow');

INSERT INTO moves (session_id, move_index, move_source, player_id, payload) VALUES
    (@demo_session, 1, 'manual', NULL, JSON_OBJECT('col', 0, 'row', 5, 'side', 'red')),
    (@demo_session, 2, 'manual', NULL, JSON_OBJECT('col', 1, 'row', 5, 'side', 'yellow')),
    (@demo_session, 3, 'manual', NULL, JSON_OBJECT('col', 0, 'row', 4, 'side', 'red')),
    (@demo_session, 4, 'manual', NULL, JSON_OBJECT('col', 1, 'row', 4, 'side', 'yellow')),
    (@demo_session, 5, 'manual', NULL, JSON_OBJECT('col', 0, 'row', 3, 'side', 'red')),
    (@demo_session, 6, 'manual', NULL, JSON_OBJECT('col', 1, 'row', 3, 'side', 'yellow')),
    (@demo_session, 7, 'manual', NULL, JSON_OBJECT('col', 0, 'row', 2, 'side', 'red'));
