use crate::Games::Games;
use crate::GamesNames;
use crate::User::User;

pub struct Player{
    user: User,
    elo: i8,
    allowed_games: Vec<GamesNames>,
    history: Vec<Games>
}