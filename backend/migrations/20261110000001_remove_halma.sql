-- Halma aus dem Katalog entfernen.
--
-- 20261110000000_seed_all_game_types.sql hat den Spieltyp angelegt. Da
-- Migrationen nachtraeglich nicht geaendert werden, raeumt diese Migration
-- den Eintrag wieder auf: zuerst die zugehoerigen Sitzungen (und damit
-- kaskadierend deren Zuege), dann den Spieltyp selbst.

DELETE FROM game_sessions
WHERE game_type_id IN (SELECT id FROM game_types WHERE name = 'halma');

DELETE FROM game_types WHERE name = 'halma';
