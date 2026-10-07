use crate::game::Game;
use crate::player::Player;

/// Eine gespielte Partie (Zeile in `game_sessions`).
pub struct Games {
    pub game: Game,
    pub session_id: u64,
    pub moves: Vec<String>,
    pub players: Vec<Player>,
}