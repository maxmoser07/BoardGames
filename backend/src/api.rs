use std::collections::HashMap;

use axum::extract::rejection::{JsonRejection, PathRejection};
use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::routing::{delete, get, post};
use axum::{Json, Router};
use chrono::{Datelike, Timelike, Utc};
use serde::Deserialize;
use serde_json::{json, Value};
use sqlx::mysql::MySqlPool;
use sqlx::{MySql, QueryBuilder, Transaction};

use crate::db::{GameMove, GameType, Session, SessionPlayer, User};

pub const CONNECT_FOUR: &str = "connect-four";
const ROWS: usize = 6;
const COLS: usize = 7;
const SIDES: [&str; 2] = ["red", "yellow"];

/// Brett als [Zeile][Spalte]; der Wert ist der Index in `SIDES`.
type Board = [[Option<usize>; COLS]; ROWS];

/// Spalten einer Sitzung fuer [`Session`].
///
/// `metadata_json` traegt die Felder, fuer die es keine Spalte gibt: Pausen,
/// Abbruchgrund, Siegerseite sowie die Kennzeichen `demo` und `ad_hoc`.
/// `JSON_EXTRACT` liefert SQL NULL, wenn der Schluessel fehlt - genau das
/// brauchen die Leserouten, um "kein Pausenbeginn" von "Pause vor 0 ms" zu
/// unterscheiden.
///
/// `DATE_FORMAT(..., '%Y-%m-%dT%H:%i:%sZ')` haengt das `Z` an: die Spalten sind
/// `DATETIME` (UTC via `UTC_TIMESTAMP()`), und ohne Zone wuerde der Browser die
/// UTC-Zeit als Ortszeit lesen.
///
/// Die `CAST(... AS CHAR)` sind noetig, weil `JSON_EXTRACT` und `DATE_FORMAT`
/// bei MySQL einen JSON- bzw. BLOB-Typ melden, den sqlx nicht in `String`
/// umwandeln kann.
const SESSION_COLUMNS: &str = "
    SELECT s.id,
           gt.name AS game_type,
           s.host_id,
           s.outcome,
           CAST(JSON_UNQUOTE(JSON_EXTRACT(s.metadata_json, '$.winner_side')) AS CHAR)
               AS winner_side,
           CAST(DATE_FORMAT(s.started_at, '%Y-%m-%dT%H:%i:%sZ') AS CHAR) AS started_at,
           CAST(DATE_FORMAT(s.finished_at, '%Y-%m-%dT%H:%i:%sZ') AS CHAR) AS finished_at,
           s.duration_ms,
           CAST(JSON_UNQUOTE(JSON_EXTRACT(s.metadata_json, '$.paused_at')) AS CHAR)
               AS paused_at,
           COALESCE(CAST(JSON_UNQUOTE(JSON_EXTRACT(s.metadata_json, '$.paused_ms')) AS SIGNED), 0)
               AS paused_ms,
           CAST(JSON_UNQUOTE(JSON_EXTRACT(s.metadata_json, '$.abort_reason')) AS CHAR)
               AS abort_reason,
           CAST(JSON_UNQUOTE(JSON_EXTRACT(s.metadata_json, '$.surrendered_by')) AS UNSIGNED)
               AS surrendered_by,
           -- Bools als Zahl: `CAST('true' AS SIGNED)` waere 0, deshalb der
           -- Vergleich mit TRUE statt eines Casts.
           IF(JSON_EXTRACT(s.metadata_json, '$.demo') = TRUE, 1, 0) AS demo,
           IF(JSON_EXTRACT(s.metadata_json, '$.ad_hoc') = TRUE, 1, 0) AS ad_hoc,
           s.metadata_json
    FROM game_sessions s
    JOIN game_types gt ON gt.id = s.game_type_id
";

/* ------------------------------------------------------------------- Fehler */

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

fn internal(e: impl Into<anyhow::Error>) -> ApiError {
    ApiError::Internal(e.into())
}

/* -------------------------------------------------------------------- Routen */

pub fn router() -> Router<MySqlPool> {
    Router::new()
        .route("/api/health", get(health))
        .route("/api/users", get(list_users))
        .route("/api/games", get(list_game_types))
        .route("/api/sessions", get(list_sessions))
        .route("/api/sessions", post(create_session))
        .route("/api/sessions/{id}", get(read_session))
        .route("/api/sessions/{id}/pause", post(pause_session))
        .route("/api/sessions/{id}/resume", post(resume_session))
        .route("/api/sessions/{id}/abort", post(abort_session))
        .route("/api/sessions/{id}/surrender", post(surrender_session))
        .route("/api/connect-four/games", get(list_connect_four_games))
        .route(
            "/api/connect-four/games",
            post(record_connect_four_game),
        )
        .route(
            "/api/connect-four/games/{session_id}",
            get(read_connect_four_game),
        )
        .route("/api/demo-data", delete(delete_demo_data))
}

pub async fn health(State(pool): State<MySqlPool>) -> Result<Json<Value>, ApiError> {
    sqlx::query_scalar::<_, i32>("SELECT 1")
        .fetch_one(&pool)
        .await
        .map_err(|e| ApiError::Internal(e.into()))?;
    Ok(Json(json!({ "status": "ok" })))
}

/* ------------------------------------------------------------ Abfragen, Lesen */

/// Aktuelle Zeit als `2026-10-07T06:40:40Z`.
///
/// Von Hand zusammengesetzt statt ueber `format!`: chronos `format` gibt ein
/// `Display`, das beim Umwandeln in `String` panicken kann, wenn die Formatierung
/// scheitert. Hier gibt es nichts zu scheitern, und `now_iso_is_utc` haelt das
/// Format fest.
fn now_iso() -> String {
    let now = Utc::now();
    format!(
        "{:04}-{:02}-{:02}T{:02}:{:02}:{:02}Z",
        now.year(),
        now.month(),
        now.day(),
        now.hour(),
        now.minute(),
        now.second()
    )
}

async fn fetch_session(pool: &MySqlPool, id: u64) -> Result<Option<Session>, ApiError> {
    let sql = format!("{SESSION_COLUMNS} WHERE s.id = ?");
    sqlx::query_as::<_, Session>(&sql)
        .bind(id)
        .fetch_optional(pool)
        .await
        .map_err(|e| ApiError::Internal(e.into()))
}

/// Sitzung oder 404 - fuer Routen, die eine bestimmte Sitzung brauchen.
async fn require_session(pool: &MySqlPool, id: u64) -> Result<Session, ApiError> {
    fetch_session(pool, id)
        .await?
        .ok_or_else(|| ApiError::NotFound(format!("no session with id {id}")))
}

/// Sitzung, die noch laeuft - also `outcome IS NULL`. Beendet heisst hier
/// wirklich beendet: `chk_session_outcome` erlaubt keinen Zustand dazwischen.
async fn require_open_session(pool: &MySqlPool, id: u64) -> Result<Session, ApiError> {
    let session = require_session(pool, id).await?;
    if session.outcome.is_some() {
        return bad(format!("session {id} is already finished"));
    }
    Ok(session)
}

/// Teilnehmer mehrerer Sitzungen in einer Abfrage, gruppiert nach `session_id`.
async fn fetch_players(
    pool: &MySqlPool,
    ids: &[u64],
) -> Result<HashMap<u64, Vec<SessionPlayer>>, ApiError> {
    if ids.is_empty() {
        return Ok(HashMap::new());
    }
    let mut qb = QueryBuilder::<MySql>::new(
        "SELECT session_id, seat_index, user_id, side FROM game_session_players WHERE session_id IN (",
    );
    let mut separated = qb.separated(", ");
    for id in ids {
        separated.push_bind(*id);
    }
    qb.push(") ORDER BY session_id, seat_index");

    let rows = qb
        .build_query_as::<SessionPlayer>()
        .fetch_all(pool)
        .await
        .map_err(|e| ApiError::Internal(e.into()))?;

    let mut grouped: HashMap<u64, Vec<SessionPlayer>> = HashMap::new();
    for row in rows {
        grouped.entry(row.session_id).or_default().push(row);
    }
    Ok(grouped)
}

/// Zuege mehrerer Sitzungen in einer Abfrage, gruppiert nach `session_id`.
async fn fetch_moves(
    pool: &MySqlPool,
    ids: &[u64],
) -> Result<HashMap<u64, Vec<GameMove>>, ApiError> {
    if ids.is_empty() {
        return Ok(HashMap::new());
    }
    let mut qb = QueryBuilder::<MySql>::new(
        "SELECT session_id, move_index, player_id, move_source, payload,
                timestamp_ms, confidence, frame_ref_id, verified, created_at
         FROM moves WHERE session_id IN (",
    );
    let mut separated = qb.separated(", ");
    for id in ids {
        separated.push_bind(*id);
    }
    qb.push(") ORDER BY session_id, move_index");

    let rows = qb
        .build_query_as::<GameMove>()
        .fetch_all(pool)
        .await
        .map_err(|e| ApiError::Internal(e.into()))?;

    let mut grouped: HashMap<u64, Vec<GameMove>> = HashMap::new();
    for row in rows {
        grouped.entry(row.session_id).or_default().push(row);
    }
    Ok(grouped)
}

fn players_of<'a>(
    grouped: &'a HashMap<u64, Vec<SessionPlayer>>,
    session_id: u64,
) -> &'a [SessionPlayer] {
    grouped.get(&session_id).map(Vec::as_slice).unwrap_or(&[])
}

fn moves_of<'a>(grouped: &'a HashMap<u64, Vec<GameMove>>, session_id: u64) -> &'a [GameMove] {
    grouped.get(&session_id).map(Vec::as_slice).unwrap_or(&[])
}

/// Sitzung als JSON, inklusive Teilnehmenden.
///
/// `demo` und `ad_hoc` sind abgeleitete Kennzeichen aus `metadata_json`: das
/// Fronteninterkennt sie nur als Verweis - Beispieldaten loescht es ueber
/// DELETE /api/demo-data, Ad-hoc-Partien sind solche ohne gehostete Sitzung.
fn session_json(session: &Session, players: &[SessionPlayer]) -> Value {
    json!({
        "id": session.id,
        "game_type": session.game_type,
        "host_id": session.host_id,
        "outcome": session.outcome,
        "winner_side": session.winner_side,
        "started_at": session.started_at,
        "finished_at": session.finished_at,
        "duration_ms": session.duration_ms,
        "paused_at": session.paused_at,
        "paused_ms": session.paused_ms,
        "abort_reason": session.abort_reason,
        "surrendered_by": session.surrendered_by,
        "demo": session.demo != 0,
        "ad_hoc": session.ad_hoc != 0,
        "players": players,
    })
}

async fn session_json_by_id(pool: &MySqlPool, id: u64) -> Result<Value, ApiError> {
    let session = require_session(pool, id).await?;
    let players = fetch_players(pool, &[id]).await?;
    Ok(session_json(&session, players_of(&players, id)))
}

/* -------------------------------------------------------- Benutzer, Spieltypen */

pub async fn list_users(State(pool): State<MySqlPool>) -> Result<Json<Value>, ApiError> {
    let users = sqlx::query_as::<_, User>(
        "SELECT id, username, role FROM users WHERE is_locked = FALSE ORDER BY id",
    )
    .fetch_all(&pool)
    .await
    .map_err(|e| ApiError::Internal(e.into()))?;
    Ok(Json(json!(users)))
}

pub async fn list_game_types(State(pool): State<MySqlPool>) -> Result<Json<Value>, ApiError> {
    let games = sqlx::query_as::<_, GameType>(
        "SELECT id, name, display_name, max_players FROM game_types ORDER BY id",
    )
    .fetch_all(&pool)
    .await
    .map_err(|e| ApiError::Internal(e.into()))?;
    Ok(Json(json!(games)))
}

/* ------------------------------------------------------------------ Sitzungen */

/// Gehostete Sitzungen, neueste zuerst.
///
/// Ad-hoc-Partien (`/play` ohne Sitzung) stehen hier nicht: sie haben weder
/// Host noch Teilnehmer und wuerden im Dashboard als leere Karten erscheinen.
pub async fn list_sessions(State(pool): State<MySqlPool>) -> Result<Json<Value>, ApiError> {
    let sql = format!(
        "{SESSION_COLUMNS}
         WHERE JSON_EXTRACT(s.metadata_json, '$.ad_hoc') IS NOT TRUE
         ORDER BY s.started_at DESC"
    );
    let sessions = sqlx::query_as::<_, Session>(&sql)
        .fetch_all(&pool)
        .await
        .map_err(|e| ApiError::Internal(e.into()))?;

    let ids: Vec<u64> = sessions.iter().map(|s| s.id).collect();
    let players = fetch_players(&pool, &ids).await?;

    Ok(Json(json!(sessions
        .iter()
        .map(|session| session_json(session, players_of(&players, session.id)))
        .collect::<Vec<Value>>())))
}

pub async fn read_session(
    State(pool): State<MySqlPool>,
    id: Result<Path<u64>, PathRejection>,
) -> Result<Json<Value>, ApiError> {
    let Path(id) = id.map_err(|e| ApiError::BadRequest(e.body_text()))?;
    Ok(Json(session_json_by_id(&pool, id).await?))
}

#[derive(Debug, Deserialize)]
pub struct CreateSessionDto {
    game_type: String,
    host_id: u64,
    players: SeatPair,
}

/// `red` und `yellow` sind Sitzplaetze, keine Farben (siehe `types.ts`).
#[derive(Debug, Deserialize)]
pub struct SeatPair {
    red: u64,
    yellow: u64,
}

#[derive(Debug, Deserialize)]
pub struct SurrenderDto {
    user_id: u64,
}

pub async fn create_session(
    State(pool): State<MySqlPool>,
    payload: Result<Json<CreateSessionDto>, JsonRejection>,
) -> Result<(StatusCode, Json<Value>), ApiError> {
    let Json(dto) = payload.map_err(|e| ApiError::BadRequest(e.body_text()))?;

    if dto.players.red == dto.players.yellow {
        return bad("Rot und Gelb brauchen zwei verschiedene Spieler:innen.".into());
    }

    let game_type_id = sqlx::query_scalar::<_, u32>("SELECT id FROM game_types WHERE name = ?")
        .bind(&dto.game_type)
        .fetch_optional(&pool)
        .await
        .map_err(|e| ApiError::Internal(e.into()))?
        .ok_or_else(|| ApiError::BadRequest(format!("unknown game type '{}'", dto.game_type)))?;

    for (role, id) in [
        ("host", dto.host_id),
        ("player", dto.players.red),
        ("player", dto.players.yellow),
    ] {
        let known = sqlx::query_scalar::<_, u64>("SELECT id FROM users WHERE id = ?")
            .bind(id)
            .fetch_optional(&pool)
            .await
            .map_err(|e| ApiError::Internal(e.into()))?;
        if known.is_none() {
            return bad(format!("unknown {role} with id {id}"));
        }
    }

    // Die Oberflaeche blockt das ebenso. Hier wird es noch einmal geprueft, weil
    // das Backend sonst mehrere offene Sitzungen zulasse.
    let open = sqlx::query_scalar::<_, i64>(
        "SELECT COUNT(*) FROM game_sessions WHERE outcome IS NULL",
    )
    .fetch_one(&pool)
    .await
    .map_err(|e| ApiError::Internal(e.into()))?;
    if open > 0 {
        return bad("Es laeuft bereits eine Partie.".into());
    }

    let mut tx = pool.begin().await.map_err(|e| ApiError::Internal(e.into()))?;
    let session_id = insert_session(&mut tx, game_type_id, Some(dto.host_id), None).await?;

    // Sitzplatz 0 beginnt, Sitzplatz 1 antwortet (siehe `SIDES`).
    for (seat, (side, user_id)) in SIDES
        .iter()
        .zip([(dto.players.red), (dto.players.yellow)])
        .enumerate()
    {
        sqlx::query(
            "INSERT INTO game_session_players (session_id, seat_index, user_id, side)
             VALUES (?, ?, ?, ?)",
        )
        .bind(session_id)
        .bind(seat as u8)
        .bind(user_id)
        .bind(*side)
        .execute(&mut *tx)
        .await
        .map_err(|e| ApiError::Internal(e.into()))?;
    }
    tx.commit().await.map_err(|e| ApiError::Internal(e.into()))?;

    Ok((StatusCode::CREATED, Json(session_json_by_id(&pool, session_id).await?)))
}

/// Legt eine Zeile in `game_sessions` an und gibt die neue id zurueck.
///
/// `finished_at` bleibt NULL, das verlangt `chk_session_outcome`.
async fn insert_session(
    tx: &mut Transaction<'_, MySql>,
    game_type_id: u32,
    host_id: Option<u64>,
    metadata: Option<Value>,
) -> Result<u64, ApiError> {
    let insert = sqlx::query(
        "INSERT INTO game_sessions (game_type_id, host_id, session_source, metadata_json)
         VALUES (?, ?, 'digital', ?)",
    )
    .bind(game_type_id)
    .bind(host_id)
    .bind(metadata)
    .execute(&mut **tx)
    .await
    .map_err(|e| ApiError::Internal(e.into()))?;
    Ok(insert.last_insert_id())
}

pub async fn pause_session(
    State(pool): State<MySqlPool>,
    id: Result<Path<u64>, PathRejection>,
) -> Result<Json<Value>, ApiError> {
    let Path(id) = id.map_err(|e| ApiError::BadRequest(e.body_text()))?;
    let session = require_open_session(&pool, id).await?;
    if session.paused_at.is_some() {
        return bad("Diese Sitzung ist bereits pausiert.".into());
    }

    // Eine Pause aendert weder `outcome` noch `finished_at`; `chk_session_outcome`
    // erlaubt beides nur zusammen.
    sqlx::query(
        "UPDATE game_sessions
         SET metadata_json = JSON_SET(COALESCE(metadata_json, JSON_OBJECT()), '$.paused_at', ?)
         WHERE id = ? AND outcome IS NULL",
    )
    .bind(now_iso())
    .bind(id)
    .execute(&pool)
    .await
    .map_err(|e| ApiError::Internal(e.into()))?;

    Ok(Json(session_json_by_id(&pool, id).await?))
}

pub async fn resume_session(
    State(pool): State<MySqlPool>,
    id: Result<Path<u64>, PathRejection>,
) -> Result<Json<Value>, ApiError> {
    let Path(id) = id.map_err(|e| ApiError::BadRequest(e.body_text()))?;
    let session = require_open_session(&pool, id).await?;
    let Some(paused_at) = session.paused_at.clone() else {
        return bad("Diese Sitzung laeuft bereits.".into());
    };

    // Die abgeschlossene Pause wird festgeschrieben, damit die Spielzeit auch
    // nach einem Neuladen des Fensters stimmt.
    let spent = elapsed_ms_since(&paused_at);
    let total = session.paused_ms + spent;

    sqlx::query(
        "UPDATE game_sessions
         SET metadata_json = JSON_SET(
                 JSON_REMOVE(COALESCE(metadata_json, JSON_OBJECT()), '$.paused_at'),
                 '$.paused_ms', ?)
         WHERE id = ? AND outcome IS NULL",
    )
    .bind(total)
    .bind(id)
    .execute(&pool)
    .await
    .map_err(|e| ApiError::Internal(e.into()))?;

    Ok(Json(session_json_by_id(&pool, id).await?))
}

/// Millisekunden seit einem Zeitstempel aus `metadata_json.paused_at`.
fn elapsed_ms_since(iso: &str) -> i64 {
    chrono::DateTime::parse_from_rfc3339(iso)
        .map(|then| {
            (Utc::now() - then.with_timezone(&Utc))
                .num_milliseconds()
                .max(0)
        })
        .unwrap_or(0)
}

pub async fn abort_session(
    State(pool): State<MySqlPool>,
    id: Result<Path<u64>, PathRejection>,
) -> Result<Json<Value>, ApiError> {
    let Path(id) = id.map_err(|e| ApiError::BadRequest(e.body_text()))?;
    require_open_session(&pool, id).await?;

    sqlx::query(
        "UPDATE game_sessions
         SET outcome = 'aborted',
             finished_at = UTC_TIMESTAMP(),
             metadata_json = JSON_SET(
                 JSON_REMOVE(COALESCE(metadata_json, JSON_OBJECT()), '$.paused_at'),
                 '$.abort_reason', 'host')
         WHERE id = ? AND outcome IS NULL",
    )
    .bind(id)
    .execute(&pool)
    .await
    .map_err(|e| ApiError::Internal(e.into()))?;

    Ok(Json(session_json_by_id(&pool, id).await?))
}

pub async fn surrender_session(
    State(pool): State<MySqlPool>,
    id: Result<Path<u64>, PathRejection>,
    payload: Result<Json<SurrenderDto>, JsonRejection>,
) -> Result<Json<Value>, ApiError> {
    let Path(id) = id.map_err(|e| ApiError::BadRequest(e.body_text()))?;
    let Json(dto) = payload.map_err(|e| ApiError::BadRequest(e.body_text()))?;
    require_open_session(&pool, id).await?;

    // Der Aufgebende sitzt auf dem Platz, der verliert.
    let loser = sqlx::query_scalar::<_, String>(
        "SELECT side FROM game_session_players WHERE session_id = ? AND user_id = ?",
    )
    .bind(id)
    .bind(dto.user_id)
    .fetch_optional(&pool)
    .await
    .map_err(|e| ApiError::Internal(e.into()))?
    .ok_or_else(|| {
        ApiError::BadRequest("Diese Person sitzt in dieser Sitzung nicht am Brett.".into())
    })?;

    let winner = other_side(&loser)
        .ok_or_else(|| ApiError::Internal(anyhow::anyhow!("unknown side '{loser}'")))?;

    sqlx::query(
        "UPDATE game_sessions
         SET outcome = 'win',
             finished_at = UTC_TIMESTAMP(),
             metadata_json = JSON_SET(
                 JSON_REMOVE(COALESCE(metadata_json, JSON_OBJECT()), '$.paused_at'),
                 '$.winner_side', ?,
                 '$.abort_reason', 'surrender',
                 '$.surrendered_by', ?)
         WHERE id = ? AND outcome IS NULL",
    )
    .bind(&winner)
    .bind(dto.user_id)
    .bind(id)
    .execute(&pool)
    .await
    .map_err(|e| ApiError::Internal(e.into()))?;

    Ok(Json(session_json_by_id(&pool, id).await?))
}

fn other_side(side: &str) -> Option<&'static str> {
    SIDES.iter().copied().find(|s| *s != side)
}

/* ------------------------------------------------------------------ Connect Four */

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
    /// Tatsaechliche Spielzeit ohne Pausen. Kommt aus dem Fenster, das das Brett
    /// bedient - der Server kann sie nicht selbst messen.
    #[serde(default)]
    pub duration_ms: Option<i64>,
    /// Gehostete Sitzung, die mit dieser Partie endet. Ohne Wert legt der Server
    /// eine eigene Zeile an (Partie aus `/play` ohne Sitzung).
    #[serde(default)]
    pub session_id: Option<u64>,
}

/// Speichert eine beendete Connect-Four-Partie.
///
/// Zwei Faelle:
///  * mit `session_id`: die gehostete Sitzung wird geschlossen - `outcome`,
///    `finished_at`, `duration_ms` und `metadata_json.winner_side` kommen in
///    dieselbe Zeile, die Zuege gehoeren dazu. Sitzung und Partie sind damit
///    ein Datensatz.
///  * ohne `session_id`: eine eigene Zeile mit `metadata_json.ad_hoc`, ohne
///    Host und ohne Teilnehmer.
///
/// Beide Wege schreiben in `game_sessions`, `game_session_players` und `moves` in
/// einer Transaktion.
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

    validate_moves(&dto.moves, outcome, winner)?;

    let game_type_id = sqlx::query_scalar::<_, u32>("SELECT id FROM game_types WHERE name = ?")
        .bind(CONNECT_FOUR)
        .fetch_optional(&pool)
        .await
        .map_err(internal)?
        .ok_or_else(|| {
            ApiError::Internal(anyhow::anyhow!(
                "game_types has no row '{CONNECT_FOUR}' - are the migrations applied?"
            ))
        })?;

    let duration_ms = dto
        .duration_ms
        .filter(|ms| *ms >= 0)
        .map(|ms| ms as u64);

    let mut tx = pool.begin().await.map_err(internal)?;

    let (session_id, ad_hoc) = match dto.session_id {
        // Gehostete Sitzung schliessen.
        Some(session_id) => {
            let session = sqlx::query_as::<_, Session>(&format!("{SESSION_COLUMNS} WHERE s.id = ?"))
                .bind(session_id)
                .fetch_optional(&mut *tx)
                .await
                .map_err(internal)?
                .ok_or_else(|| {
                    ApiError::NotFound(format!("no session with id {session_id}"))
                })?;
            if session.game_type != CONNECT_FOUR {
                return Err(ApiError::BadRequest(format!(
                    "session {session_id} is not a connect-four session"
                )));
            }
            if session.outcome.is_some() {
                return Err(ApiError::BadRequest(format!(
                    "session {session_id} is already finished"
                )));
            }

            // Die Pausenzeit steht schon in metadata_json, sie wird beim
            // Fortsetzen fortgeschrieben - hier bleibt sie unangetastet.
            sqlx::query(
                "UPDATE game_sessions
                 SET outcome = ?,
                     finished_at = UTC_TIMESTAMP(),
                     duration_ms = ?,
                     metadata_json = ? 
                 WHERE id = ? AND outcome IS NULL",
            )
            .bind(outcome)
            .bind(duration_ms)
            .bind(finished_metadata(session.metadata_json.as_ref(), winner))
            .bind(session_id)
            .execute(&mut *tx)
            .await
            .map_err(internal)?;

            (session_id, false)
        }
        // Partie ohne Sitzung: eigene Zeile, anonym.
        None => {
            let mut metadata = json!({ "ad_hoc": true });
            if let Some(side) = winner {
                metadata["winner_side"] = json!(side);
            }

            // Fertig in einem Rutsch: `chk_session_outcome` verlangt `outcome`
            // und `finished_at` zusammen - eine offene Sitzung waere hier falsch.
            let insert = sqlx::query(
                "INSERT INTO game_sessions
                     (game_type_id, session_source, outcome, finished_at, duration_ms, metadata_json)
                 VALUES (?, 'digital', ?, UTC_TIMESTAMP(), ?, ?)",
            )
            .bind(game_type_id)
            .bind(outcome)
            .bind(duration_ms)
            .bind(metadata)
            .execute(&mut *tx)
            .await
            .map_err(internal)?;
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
                .map_err(internal)?;
            }

            (session_id, true)
        }
    };

    // Vorhandene Plaetze uebernehmen, damit `moves.player_id` gesetzt ist.
    let players = fetch_players_in(&mut tx, session_id).await?;
    for m in &dto.moves {
        sqlx::query(
            "INSERT INTO moves (session_id, move_index, player_id, move_source, payload)
             VALUES (?, ?, ?, 'manual', ?)",
        )
        .bind(session_id)
        .bind(m.turn as u32)
        .bind(player_id_of(&players, &m.player))
        .bind(json!({ "col": m.location.x, "row": m.location.y, "side": m.player }))
        .execute(&mut *tx)
        .await
        .map_err(internal)?;
    }

    tx.commit().await.map_err(internal)?;

    Ok((
        StatusCode::CREATED,
        Json(json!({ "session_id": session_id, "outcome": outcome, "ad_hoc": ad_hoc })),
    ))
}

/// `metadata_json` fuer eine geschlossene Sitzung: bestehende Angaben behalten,
/// `winner_side` setzen oder (bei Remise/Abbruch) entfernen.
///
/// Der Blindwert ist `{}` - MySQL behandelt NULL in JSON_EXTRACT wie einen
/// fehlenden Schluessel, das Verhalten ist also identisch.
fn finished_metadata(current: Option<&Value>, winner: Option<&str>) -> Value {
    let mut metadata = current
        .and_then(Value::as_object)
        .cloned()
        .unwrap_or_default();
    match winner {
        Some(side) => {
            metadata.insert("winner_side".into(), json!(side));
        }
        None => {
            metadata.remove("winner_side");
        }
    }
    Value::Object(metadata)
}

fn player_id_of(players: &[SessionPlayer], side: &str) -> Option<u64> {
    players
        .iter()
        .find(|player| player.side.as_deref() == Some(side))
        .and_then(|player| player.user_id)
}

async fn fetch_players_in(
    tx: &mut Transaction<'_, MySql>,
    session_id: u64,
) -> Result<Vec<SessionPlayer>, ApiError> {
    sqlx::query_as::<_, SessionPlayer>(
        "SELECT session_id, seat_index, user_id, side FROM game_session_players
         WHERE session_id = ? ORDER BY seat_index",
    )
    .bind(session_id)
    .fetch_all(&mut **tx)
    .await
    .map_err(internal)
}

/// Beendete Connect-Four-Partien, neueste zuerst - gehostete und spontane.
///
/// Eine gehostete Partie ist dieselbe Zeile wie ihre Sitzung (`session.id`);
/// `ad_hoc` unterscheidet sie von einer Partie aus `/play` ohne Sitzung.
///
/// `EXISTS` schliesst abgebrochene und aufgegebene Sitzungen aus: die haben
/// zwar ein `outcome`, aber keine Zuege. Ohne die Bedingung kaemen sie als
/// "Verlauf mit 0 Zuegen" zurueck, und die Oberflaeche zeichnete daraus ein
/// leeres Brett statt des Hinweises, dass gar nicht gespielt wurde.
pub async fn list_connect_four_games(State(pool): State<MySqlPool>) -> Result<Json<Value>, ApiError> {
    let sql = format!(
        "{SESSION_COLUMNS}
         WHERE gt.name = ? AND s.outcome IS NOT NULL
           AND EXISTS (SELECT 1 FROM moves m WHERE m.session_id = s.id)
         ORDER BY s.started_at DESC"
    );
    let sessions = sqlx::query_as::<_, Session>(&sql)
        .bind(CONNECT_FOUR)
        .fetch_all(&pool)
        .await
        .map_err(internal)?;

    let ids: Vec<u64> = sessions.iter().map(|s| s.id).collect();
    let players = fetch_players(&pool, &ids).await?;
    let moves = fetch_moves(&pool, &ids).await?;

    Ok(Json(json!(sessions
        .iter()
        .map(|session| json!({
            "session": session_json(session, players_of(&players, session.id)),
            "moves": moves_of(&moves, session.id),
        }))
        .collect::<Vec<Value>>())))
}

pub async fn read_connect_four_game(
    State(pool): State<MySqlPool>,
    session_id: Result<Path<u64>, PathRejection>,
) -> Result<Json<Value>, ApiError> {
    let Path(session_id) = session_id.map_err(|e| ApiError::BadRequest(e.body_text()))?;

    // Nur Connect-Four-Partien: sonst liefert die Route auch Sitzungen
    // anderer Spieltypen zurueck.
    let sql = format!("{SESSION_COLUMNS} WHERE s.id = ? AND gt.name = ?");
    let session = sqlx::query_as::<_, Session>(&sql)
        .bind(session_id)
        .bind(CONNECT_FOUR)
        .fetch_optional(&pool)
        .await
        .map_err(internal)?
        .ok_or_else(|| {
            ApiError::NotFound(format!("no connect-four session with id {session_id}"))
        })?;

    let players = fetch_players(&pool, &[session_id]).await?;
    let moves = fetch_moves(&pool, &[session_id]).await?;

    Ok(Json(json!({
        "session": session_json(&session, players_of(&players, session_id)),
        "moves": moves_of(&moves, session_id),
    })))
}

/// Loescht die Beispieldaten aus 20251007000001_seed_demo_session.sql.
///
/// `game_session_players` und `moves` haengen an `ON DELETE CASCADE`, die
/// Beispielpartie verschwindet also vollstaendig.
pub async fn delete_demo_data(State(pool): State<MySqlPool>) -> Result<Json<Value>, ApiError> {
    let result = sqlx::query("DELETE FROM game_sessions WHERE JSON_EXTRACT(metadata_json, '$.demo') = TRUE")
        .execute(&pool)
        .await
        .map_err(internal)?;
    Ok(Json(json!({ "deleted": result.rows_affected() })))
}

/* ------------------------------------------------------------ Brettpruefung */

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

    #[test]
    fn a_surrender_picks_the_other_side() {
        assert_eq!(other_side("red"), Some("yellow"));
        assert_eq!(other_side("yellow"), Some("red"));
    }

    #[test]
    fn finished_metadata_keeps_the_pauses_and_replaces_the_winner() {
        let current = json!({ "paused_ms": 4200, "paused_at": "2026-10-07T06:11:42Z" });
        let updated = finished_metadata(Some(&current), Some("yellow"));
        assert_eq!(updated["paused_ms"], json!(4200));
        assert_eq!(updated["paused_at"], json!("2026-10-07T06:11:42Z"));
        assert_eq!(updated["winner_side"], json!("yellow"));
    }

    #[test]
    fn finished_metadata_drops_the_winner_on_a_draw() {
        let current = json!({ "winner_side": "red" });
        let updated = finished_metadata(Some(&current), None);
        assert!(updated.get("winner_side").is_none());
    }

    #[test]
    fn finished_metadata_survives_a_missing_json_column() {
        assert_eq!(finished_metadata(None, Some("red")), json!({ "winner_side": "red" }));
    }

    #[test]
    fn now_iso_is_utc_and_readable_again() {
        let value = now_iso();
        let parsed = chrono::DateTime::parse_from_rfc3339(&value)
            .unwrap_or_else(|e| panic!("{value} ist kein RFC 3339: {e}"));
        let drift = (Utc::now() - parsed.with_timezone(&Utc)).num_seconds().abs();
        assert!(drift < 5, "{value} weicht {drift} Sekunden von jetzt ab");
    }

    #[test]
    fn elapsed_is_never_negative() {
        // Ein Zeitstempel aus der Zukunft (Uhr verrueckt) darf nicht negativ werden.
        let future = Utc::now() + chrono::Duration::seconds(30);
        let value = future.format("%Y-%m-%dT%H:%M:%SZ").to_string();
        assert_eq!(elapsed_ms_since(&value), 0);
    }
}
