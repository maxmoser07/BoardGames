-- =============================================================================
--  BoardGames - Passwort-Hashes fuer die Beispielpersonen
--
--  Setzt fuer alle noch unveraenderten Platzhalter-Passwoerter ('!no-login-yet')
--  einen echten Hash. Passwort fuer alle vier Konten: "password".
-- =============================================================================
UPDATE users
SET password_hash = 'sha256$100000$00112233445566778899aabbccddeeff$00b57e680b5fd881795208009358adffb7151323ea12dc6c4470bef6e4e8ae03'
WHERE password_hash = '!no-login-yet';
