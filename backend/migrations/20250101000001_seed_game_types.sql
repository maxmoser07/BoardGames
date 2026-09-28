-- Boardtypen, die das Backend bereits kennt. name ist der Schluessel, unter dem
-- die API sie nachlaedt (POST /api/connect-four/games -> "connect-four").
INSERT INTO game_types (name, display_name, max_players) VALUES
    ('connect-four', 'Connect Four', 2),
    ('tictactoe',    'Tic Tac Toe',   2);
