use crate::Game::Game;
use crate::Player::Player;

pub struct Games{
    game: Game,
    g_id: i8,
    moves: Vec<String>,
    players: Vec<Player>,
}