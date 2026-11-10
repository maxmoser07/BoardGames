-- Die restlichen Katalogspiele als technische Eintraege.
--
-- Der Katalog (Regeln, Vorschau, Akzentfarbe) steht in
-- frontend/src/lib/gameTypes.ts. Hier braucht es nur den Schluessel, unter dem
-- die Ergebnisse gespeichert werden, und die Anzeige fuer das Backend.
-- `connect-four` und `tictactoe` legt bereits
-- 20250101000001_seed_game_types.sql an.

INSERT INTO game_types (name, display_name, max_players) VALUES
    ('memory',                     'Memory',                     2),
    ('schach',                     'Schach',                     2),
    ('mensch-aergere-dich-nicht',  'Mensch aergere dich nicht',  2),
    ('halma',                      'Halma',                      2)
ON DUPLICATE KEY UPDATE
    display_name = VALUES(display_name),
    max_players  = VALUES(max_players);
