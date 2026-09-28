use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::routing::{get, post};
use axum::{Json, Router};
use serde::Deserialize;
use serde_json::{json, Value};
use sqlx::mysql::MySqlPool;

use crate::db::{GameMove, GameSession, SessionPlayer};

pub const CONNECT_FOUR: &str = "connect-four";
const ROWS: i64 = 6;
const COLS: i64 = 7;
const SIDES: [&str; 2] = ["red", "yellow"];

#[derive(Debug, Deserialize)]
pub struct Location {
    pub x: i64,
    pub y: i64,
}

#[derive(Debug, Deserialize)]
pub struct MoveDto {
    pub turn: i64,
    pub player: String,
    pub location: Location,
}

#[derive(Debug, Deserialize)]
pub struct GameResultDto {
    pub moves: Vec<MoveDto>,
    pub winner: String,
}

pub enum ApiError {
    BadRequest(String),
    NotFound(String),
    Internal(anyhow::Error),
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        let (status, message) = match self {
            ApiError::BadRequest(m) => (StatusCode::BAD_REQUEST, m),
            ApiError::NotFound(m) => (StatusCode::NOT_FOUND, m),
            ApiError::Internal(e) => {
                eprintln!("internal error: {e:#}");
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "internal server error".to_string(),
                )
            }
        };
        (status, Json(json!({ "error": message }))).into_response()
    }
}

pub fn router() -> Router<MySqlPool> {
    Router::new()
        .route("/api/health", get(health))
        .route(
            "/api/connect-four/games",
            post(record_connect_four_game),
        )
        .route(
            "/api/connect-four/games/{session_id}",
            get(read_connect_four_game),
        )
}

pub async fn health(State(pool): State<MySqlPool>) -> Result<Json<Value>, ApiError> {
    sqlx::query_scalar::<_, i32>("SELECT 1")
        .fetch_one(&pool)
        .await
        .map_err(|e| ApiError::Internal(e.into()))?;
    Ok(Json(json!({ "status": "ok" })))
}

pub async fn record_connect_four_game(
    State(pool): State<MySqlPool>,
    Json(dto): Json<GameResultDto>,
) -> Result<(StatusCode, Json<Value>), ApiError> {
    let cells = (ROWS * COLS) as usize;

    if dto.moves.is_empty() {
        return Err(ApiError::BadRequest("moves must not be empty".into()));
    }
    if dto.moves.len() > cells {
        return Err(ApiError::BadRequest(format!(
            "{} moves do not fit on a {ROWS}x{COLS} board",
            dto.moves.len()
        )));
    }

    for (i, m) in dto.moves.iter().enumerate() {
        let expected = i as i64 + 1;
        if m.turn != expected {
            return Err(ApiError::BadRequest(format!(
                "moves[{i}].turn is {}, expected {expected}",
                m.turn
            )));
        }
        if !SIDES.contains(&m.player.as_str()) {
            return Err(ApiError::BadRequest(format!(
                "moves[{i}].player '{}' is not a connect-four side",
                m.player
            )));
        }
        if m.location.x < 0 || m.location.x >= COLS || m.location.y < 0 || m.location.y >= ROWS {
            return Err(ApiError::BadRequest(format!(
                "moves[{i}].location is outside the board"
            )));
        }
    }

    let outcome = match dto.winner.as_str() {
        "draw" => "draw",
        "aborted" => "aborted",
        s if SIDES.contains(&s) => "win",
        other => {
            return Err(ApiError::BadRequest(format!(
                "winner '{other}' is not a side, 'draw' or 'aborted'"
            )))
        }
    };
    let winner = if outcome == "win" {
        Some(dto.winner.as_str())
    } else {
        None
    };

    if let Some(side) = winner {
        if !dto.moves.iter().any(|m| m.player == side) {
            return Err(ApiError::BadRequest(format!(
                "winner '{side}' has no move in this game"
            )));
        }
    }
    if outcome == "draw" && dto.moves.len() != cells {
        return Err(ApiError::BadRequest(format!(
            "a draw needs a full board, got {} of {cells} moves",
            dto.moves.len()
        )));
    }
    if outcome == "win" && dto.moves.len() == cells {
        return Err(ApiError::BadRequest(
            "a full board cannot end in a win".into(),
        ));
    }

    let game_type_id = sqlx::query_scalar::<_, u32>("SELECT id FROM game_types WHERE name = ?")
        .bind(CONNECT_FOUR)
        .fetch_optional(&pool)
        .await
        .map_err(|e| ApiError::Internal(e.into()))?
        .ok_or_else(|| {
            ApiError::Internal(anyhow::anyhow!(
                "game_types has no row '{CONNECT_FOUR}' - are the migrations applied?"
            ))
        })?;

    let mut tx = pool
        .begin()
        .await
        .map_err(|e| ApiError::Internal(e.into()))?;

    let insert = sqlx::query(
        "INSERT INTO game_sessions (game_type_id, session_source, outcome, finished_at)
         VALUES (?, 'digital', ?, UTC_TIMESTAMP())",
    )
    .bind(game_type_id)
    .bind(outcome)
    .execute(&mut *tx)
    .await
    .map_err(|e| ApiError::Internal(e.into()))?;
    let session_id = insert.last_insert_id();

    for (seat, side) in SIDES.iter().enumerate() {
        if !dto.moves.iter().any(|m| m.player == *side) {
            continue;
        }
        sqlx::query(
            "INSERT INTO game_session_players (session_id, seat_index, user_id, side)
             VALUES (?, ?, NULL, ?)",
        )
        .bind(session_id)
        .bind(seat as u8)
        .bind(*side)
        .execute(&mut *tx)
        .await
        .map_err(|e| ApiError::Internal(e.into()))?;
    }

    for m in &dto.moves {
        sqlx::query(
            "INSERT INTO moves (session_id, move_index, move_source, payload)
             VALUES (?, ?, 'manual', ?)",
        )
        .bind(session_id)
        .bind(m.turn as u32)
        .bind(json!({ "col": m.location.x, "row": m.location.y }))
        .execute(&mut *tx)
        .await
        .map_err(|e| ApiError::Internal(e.into()))?;
    }

    tx.commit()
        .await
        .map_err(|e| ApiError::Internal(e.into()))?;

    Ok((
        StatusCode::CREATED,
        Json(json!({ "session_id": session_id, "outcome": outcome })),
    ))
}

pub async fn read_connect_four_game(
    State(pool): State<MySqlPool>,
    Path(session_id): Path<u64>,
) -> Result<Json<Value>, ApiError> {
    let session = sqlx::query_as::<_, GameSession>(
        "SELECT id, game_type_id, host_id, session_source, outcome, winner_id,
                started_at, finished_at, duration_ms, confidence_score, metadata_json
         FROM game_sessions WHERE id = ?",
    )
    .bind(session_id)
    .fetch_optional(&pool)
    .await
    .map_err(|e| ApiError::Internal(e.into()))?
    .ok_or_else(|| ApiError::NotFound(format!("no session with id {session_id}")))?;

    let players = sqlx::query_as::<_, SessionPlayer>(
        "SELECT seat_index, user_id, side FROM game_session_players
         WHERE session_id = ? ORDER BY seat_index",
    )
    .bind(session_id)
    .fetch_all(&pool)
    .await
    .map_err(|e| ApiError::Internal(e.into()))?;

    let moves = sqlx::query_as::<_, GameMove>(
        "SELECT id, session_id, move_index, player_id, move_source, payload,
                timestamp_ms, confidence, frame_ref_id, verified, created_at
         FROM moves WHERE session_id = ? ORDER BY move_index",
    )
    .bind(session_id)
    .fetch_all(&pool)
    .await
    .map_err(|e| ApiError::Internal(e.into()))?;

    Ok(Json(json!({
        "session": session,
        "players": players,
        "moves": moves,
    })))
}
