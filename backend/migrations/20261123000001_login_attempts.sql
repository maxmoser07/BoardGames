-- =============================================================================
--  BoardGames - Fehlversuche bei der Anmeldung
--
--  Nach mehreren falschen Passwoertern wird das Konto voruebergehend gesperrt.
--  Die Spalten sind additiv: bestehende Datenbanken behalten ihre Konten, die
--  werte werden von `login()` in `backend/src/api.rs` gepflegt.
-- =============================================================================

ALTER TABLE users
    ADD COLUMN failed_attempts INT UNSIGNED NOT NULL DEFAULT 0,
    ADD COLUMN last_failed_at DATETIME NULL;