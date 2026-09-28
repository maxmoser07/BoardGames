use chrono::NaiveDateTime;
use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};

/// Zeile aus `game_sessions` (siehe 20250101000000_init_schema.sql).
#[derive(Debug, Serialize, Deserialize, sqlx::FromRow)]
pub struct GameSession {
    pub id: u64,
    pub game_type_id: u32,
    pub host_id: Option<u64>,
    pub session_source: String,
    pub outcome: Option<String>,
    pub winner_id: Option<u64>,
    pub started_at: NaiveDateTime,
    pub finished_at: Option<NaiveDateTime>,
    pub duration_ms: Option<u64>,
    pub confidence_score: Option<Decimal>,
    pub metadata_json: Option<serde_json::Value>,
}

/// Zeile aus `game_session_players`.
#[derive(Debug, Serialize, Deserialize, sqlx::FromRow)]
pub struct SessionPlayer {
    pub seat_index: u8,
    pub user_id: Option<u64>,
    pub side: Option<String>,
}

/// Zeile aus `moves`.
#[derive(Debug, Serialize, Deserialize, sqlx::FromRow)]
pub struct GameMove {
    pub id: u64,
    pub session_id: u64,
    pub move_index: u32,
    pub player_id: Option<u64>,
    pub move_source: String,
    pub payload: serde_json::Value,
    pub timestamp_ms: Option<u64>,
    pub confidence: Option<Decimal>,
    pub frame_ref_id: Option<u64>,
    pub verified: bool,
    pub created_at: NaiveDateTime,
}
