use crate::GamesNames;
use crate::user::User;

pub struct Player {
    pub user: User,
    /// Elo-Werte liegen typisch bei 100-3000, `i8` (-128..127) reicht nicht.
    pub elo: i32,
    pub allowed_games: Vec<GamesNames>,
    /// IDs der gespielten Partien. Bewusst keine `Vec<Games>`, sonst
    /// verweisen `Player` und `Games` aufeinander im Kreis.
    pub history: Vec<u64>,
}