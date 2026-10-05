use axum::extract::rejection::{JsonRejection, PathRejection};
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
const ROWS: usize = 6;
const COLS: usize = 7;
const SIDES: [&str; 2] = ["red", "yellow"];

/// Brett als [Zeile][Spalte]; der Wert ist der Index in `SIDES`.
type Board = [[Option<usize>; COLS]; ROWS];

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

fn bad<T>(message: String) -> Result<T, ApiError> {
    Err(ApiError::BadRequest(message))
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

fn side_index(player: &str) -> Option<usize> {
    SIDES.iter().position(|s| *s == player)
}

/// Bildet der Stein auf (row, col) mit `side` eine Viererreihe?
fn makes_four(board: &Board, row: usize, col: usize, side: usize) -> bool {
    const DIRS: [(i32, i32); 4] = [(0, 1), (1, 0), (1, 1), (1, -1)];
    for (dr, dc) in DIRS {
        let mut count = 1;
        for sign in [1i32, -1] {
            let mut r = row as i32 + dr * sign;
            let mut c = col as i32 + dc * sign;
            while r >= 0
                && r < ROWS as i32
                && c >= 0
                && c < COLS as i32
                && board[r as usize][c as usize] == Some(side)
            {
                count += 1;
                r += dr * sign;
                c += dc * sign;
            }
        }
        if count >= 4 {
            return true;
        }
    }
    false
}

/// Spielt die Partie nach und prueft, dass sie regelkonform ist und zum
/// gemeldeten Ergebnis passt. Erwartet bereits geprueftes `turn`, `player`
/// und Positionen im Brett (siehe `record_connect_four_game`).
///
/// Welche Zeile "unten" ist, wird aus dem ersten Stein abgeleitet (Zeile 0
/// oder Zeile ROWS-1), damit es egal ist, ob das Frontend von oben oder
/// von unten zaehlt.
fn validate_moves(
    moves: &[MoveDto],
    outcome: &str,
    winner: Option<&str>,
) -> Result<(), ApiError> {
    let mut board: Board = [[None; COLS]; ROWS];
    let mut filled = [0usize; COLS];
    let mut bottom_is_zero = true;
    let mut winning_move: Option<usize> = None;
    let mut prev_side: Option<usize> = None;

    for (i, m) in moves.iter().enumerate() {
        if winning_move.is_some() {
            return bad(format!(
                "moves[{i}] comes after the game was already won"
            ));
        }
        let Some(side) = side_index(&m.player) else {
            return bad(format!(
                "moves[{i}].player '{}' is not a connect-four side",
                m.player
            ));
        };
        if prev_side == Some(side) {
            return bad(format!("moves[{i}]: '{}' moved twice in a row", m.player));
        }

        let col = m.location.x as usize;
        let row = m.location.y as usize;

        if i == 0 {
            bottom_is_zero = match row {
                0 => true,
                r if r == ROWS - 1 => false,
                _ => {
                    return bad(
                        "moves[0]: the first disc must land on the bottom row".into(),
                    )
                }
            };
        }

        let stacked = filled[col];
        if stacked >= ROWS {
            return bad(format!("moves[{i}]: column {col} is already full"));
        }
        let expected_row = if bottom_is_zero {
            stacked
        } else {
            ROWS - 1 - stacked
        };
        if row != expected_row {
            return bad(format!(
                "moves[{i}]: a disc in column {col} lands on row {expected_row}, not {row}"
            ));
        }

        board[row][col] = Some(side);
        filled[col] += 1;
        prev_side = Some(side);

        if makes_four(&board, row, col, side) {
            winning_move = Some(i);
        }
    }

    let last = moves.len() - 1;
    match outcome {
        "win" => {
            if winning_move != Some(last) {
                return bad("the last move does not complete four in a row".into());
            }
            if prev_side.map(|s| SIDES[s]) != winner {
                return bad(
                    "the winner must be the side that played the last move".into(),
                );
            }
        }
        "draw" => {
            if winning_move.is_some() {
                return bad("a game with four in a row is not a draw".into());
            }
        }
        _ => {
            if winning_move.is_some() {
                return bad("a game that was won cannot be aborted".into());
            }
        }
    }
    Ok(())
}

pub async fn record_connect_four_game(
    State(pool): State<MySqlPool>,
    payload: Result<Json<GameResultDto>, JsonRejection>,
) -> Result<(StatusCode, Json<Value>), ApiError> {
    let Json(dto) = payload.map_err(|e| ApiError::BadRequest(e.body_text()))?;
    let cells = ROWS * COLS;

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
        if side_index(&m.player).is_none() {
            return Err(ApiError::BadRequest(format!(
                "moves[{i}].player '{}' is not a connect-four side",
                m.player
            )));
        }
        if m.location.x < 0
            || m.location.x >= COLS as i64
            || m.location.y < 0
            || m.location.y >= ROWS as i64
        {
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

    if outcome == "draw" && dto.moves.len() != cells {
        return Err(ApiError::BadRequest(format!(
            "a draw needs a full board, got {} of {cells} moves",
            dto.moves.len()
        )));
    }

    // Partie nachspielen: Reihenfolge, Schwerkraft, belegte Felder und
    // ob das gemeldete Ergebnis wirklich zu den Zuegen passt.
    validate_moves(&dto.moves, outcome, winner)?;

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

    // `winner_id` bleibt NULL (es gibt noch keine Benutzer); die Siegerseite
    // steht stattdessen in `metadata_json`.
    let insert = sqlx::query(
        "INSERT INTO game_sessions (game_type_id, session_source, outcome, finished_at, metadata_json)
         VALUES (?, 'digital', ?, UTC_TIMESTAMP(), ?)",
    )
        .bind(game_type_id)
        .bind(outcome)
        .bind(json!({ "winner_side": winner }))
        .execute(&mut *tx)
        .await
        .map_err(|e| ApiError::Internal(e.into()))?;
    let session_id = insert.last_insert_id();

    // Beide Sitzplaetze immer anlegen, auch wenn eine Seite nie gezogen hat.
    for (seat, side) in SIDES.iter().enumerate() {
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
            .bind(json!({ "col": m.location.x, "row": m.location.y, "side": m.player }))
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
    session_id: Result<Path<u64>, PathRejection>,
) -> Result<Json<Value>, ApiError> {
    let Path(session_id) = session_id.map_err(|e| ApiError::BadRequest(e.body_text()))?;

    // Nur Connect-Four-Partien: sonst liefert die Route auch Sitzungen
    // anderer Spieltypen zurueck.
    let session = sqlx::query_as::<_, GameSession>(
        "SELECT id, game_type_id, host_id, session_source, outcome, winner_id,
                started_at, finished_at, duration_ms, confidence_score, metadata_json
         FROM game_sessions
         WHERE id = ?
           AND game_type_id = (SELECT id FROM game_types WHERE name = ?)",
    )
        .bind(session_id)
        .bind(CONNECT_FOUR)
        .fetch_optional(&pool)
        .await
        .map_err(|e| ApiError::Internal(e.into()))?
        .ok_or_else(|| ApiError::NotFound(format!("no connect-four session with id {session_id}")))?;

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

#[cfg(test)]
mod tests {
    use super::*;

    fn mv(turn: i64, player: &str, x: i64, y: i64) -> MoveDto {
        MoveDto {
            turn,
            player: player.into(),
            location: Location { x, y },
        }
    }

    /// Rot gewinnt senkrecht in Spalte 0 (Zeile 0 = unten).
    fn red_vertical_win() -> Vec<MoveDto> {
        vec![
            mv(1, "red", 0, 0),
            mv(2, "yellow", 1, 0),
            mv(3, "red", 0, 1),
            mv(4, "yellow", 1, 1),
            mv(5, "red", 0, 2),
            mv(6, "yellow", 1, 2),
            mv(7, "red", 0, 3),
        ]
    }

    #[test]
    fn accepts_a_real_vertical_win() {
        assert!(validate_moves(&red_vertical_win(), "win", Some("red")).is_ok());
    }

    #[test]
    fn accepts_the_same_win_counted_from_the_top() {
        let moves = vec![
            mv(1, "red", 0, 5),
            mv(2, "yellow", 1, 5),
            mv(3, "red", 0, 4),
            mv(4, "yellow", 1, 4),
            mv(5, "red", 0, 3),
            mv(6, "yellow", 1, 3),
            mv(7, "red", 0, 2),
        ];
        assert!(validate_moves(&moves, "win", Some("red")).is_ok());
    }

    #[test]
    fn rejects_a_win_the_moves_do_not_support() {
        let moves = vec![mv(1, "red", 0, 0)];
        assert!(validate_moves(&moves, "win", Some("red")).is_err());
    }

    #[test]
    fn rejects_the_wrong_winner() {
        assert!(validate_moves(&red_vertical_win(), "win", Some("yellow")).is_err());
    }

    #[test]
    fn rejects_a_floating_disc() {
        let moves = vec![mv(1, "red", 0, 0), mv(2, "yellow", 0, 2)];
        assert!(validate_moves(&moves, "aborted", None).is_err());
    }

    #[test]
    fn rejects_the_same_player_twice() {
        let moves = vec![mv(1, "red", 0, 0), mv(2, "red", 1, 0)];
        assert!(validate_moves(&moves, "aborted", None).is_err());
    }

    #[test]
    fn rejects_moves_after_the_game_was_won() {
        let mut moves = red_vertical_win();
        moves.push(mv(8, "yellow", 2, 0));
        assert!(validate_moves(&moves, "win", Some("red")).is_err());
    }

    #[test]
    fn rejects_an_aborted_game_that_was_already_won() {
        assert!(validate_moves(&red_vertical_win(), "aborted", None).is_err());
    }
}