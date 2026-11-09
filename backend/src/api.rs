use std::collections::HashMap;

use axum::extract::rejection::{JsonRejection, PathRejection};
use axum::extract::{FromRequestParts, Path, Query, State};
use axum::http::header::AUTHORIZATION;
use axum::http::request::Parts;
use axum::http::{HeaderMap, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::routing::{delete, get, patch, post, put};
use axum::{Json, Router};
use chrono::{Datelike, NaiveDateTime, Timelike, Utc};
use hex::encode as hex_encode;
use rand::RngCore;
use sha2::{Digest, Sha256};
use serde::Deserialize;
use serde_json::{json, Value};
use sqlx::mysql::MySqlPool;
use sqlx::{MySql, QueryBuilder, Transaction};

use crate::db::{
    AdminUser, AuthUser, GameMove, GameType, PlayerRating, PlayerReport, Session, SessionPlayer,
    User, UserProfile,
};

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
           gt.id AS game_type_id,
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
           IF(JSON_EXTRACT(s.metadata_json, '$.friendly') = TRUE, 1, 0) AS friendly,
           s.metadata_json
    FROM game_sessions s
    JOIN game_types gt ON gt.id = s.game_type_id
";

/* ------------------------------------------------------------------- Fehler */

#[derive(Debug)]
pub enum ApiError {
    BadRequest(String),
    NotFound(String),
    Unauthorized(String),
    Forbidden(String),
    Conflict(String),
    Internal(anyhow::Error),
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        let (status, message) = match self {
            ApiError::BadRequest(m) => (StatusCode::BAD_REQUEST, m),
            ApiError::NotFound(m) => (StatusCode::NOT_FOUND, m),
            ApiError::Unauthorized(m) => (StatusCode::UNAUTHORIZED, m),
            ApiError::Forbidden(m) => (StatusCode::FORBIDDEN, m),
            ApiError::Conflict(m) => (StatusCode::CONFLICT, m),
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

/* --------------------------------------------------------- Anmeldung, Rechte */

/// Laufzeit eines Tokens. Nach Ablauf muss sich die Person neu anmelden.
const TOKEN_TTL_DAYS: i64 = 7;

/// Angemeldete Person plus die Rechte aus `v_user_permissions`.
///
/// Der Extraktor liest die Rechte bei jeder Anfrage neu aus der Datenbank.
/// Dadurch wirken Rollen- und Sperraenderungen sofort, ohne dass ein Token
/// erneuert werden muss.
#[derive(Debug, Clone, sqlx::FromRow)]
pub struct CurrentUser {
    pub id: u64,
    pub username: String,
    pub role: String,
    pub can_play: bool,
    pub can_create_sessions: bool,
    pub can_manage_users: bool,
    pub can_lock_users: bool,
    pub can_manage_reports: bool,
    pub can_write: bool,
}

impl CurrentUser {
    fn is_admin(&self) -> bool {
        self.role == "admin"
    }

    /// Gesperrte Konten duerfen lesen, aber nichts schreiben.
    fn require_write(&self) -> Result<(), ApiError> {
        if self.can_write {
            Ok(())
        } else {
            Err(ApiError::Forbidden("account is locked".into()))
        }
    }

    /// Jede Rolle darf spielen - aber nur, solange das Konto nicht gesperrt ist.
    fn require_play(&self) -> Result<(), ApiError> {
        self.require_write()?;
        if self.can_play {
            Ok(())
        } else {
            Err(ApiError::Forbidden("role is not allowed to play".into()))
        }
    }

    /// Nur `host` und `admin` legen Sitzungen an.
    fn require_create_sessions(&self) -> Result<(), ApiError> {
        self.require_write()?;
        if self.can_create_sessions {
            Ok(())
        } else {
            Err(ApiError::Forbidden(
                "only hosts and admins may create sessions".into(),
            ))
        }
    }

    /// Administration von Benutzern und Meldungen.
    fn require_admin(&self) -> Result<(), ApiError> {
        self.require_write()?;
        if self.can_manage_users && self.can_lock_users {
            Ok(())
        } else {
            Err(ApiError::Forbidden("admin permission required".into()))
        }
    }

    fn require_manage_reports(&self) -> Result<(), ApiError> {
        self.require_write()?;
        if self.can_manage_reports {
            Ok(())
        } else {
            Err(ApiError::Forbidden("admin permission required".into()))
        }
    }

    /// Der Host einer Sitzung oder ein Admin darf sie steuern.
    fn require_session_manager(&self, session: &Session) -> Result<(), ApiError> {
        self.require_write()?;
        if self.is_admin() || session.host_id == Some(self.id) {
            Ok(())
        } else {
            Err(ApiError::Forbidden(
                "only the host or an admin may manage this session".into(),
            ))
        }
    }
}

/// Liest `Authorization: Bearer <token>`.
fn bearer_token(headers: &HeaderMap) -> Option<&str> {
    let value = headers.get(AUTHORIZATION)?.to_str().ok()?;
    let token = value
        .strip_prefix("Bearer ")
        .or_else(|| value.strip_prefix("bearer "))?
        .trim();
    if token.is_empty() { None } else { Some(token) }
}

fn hash_token(token: &str) -> String {
    hex_encode(Sha256::digest(token.as_bytes()))
}

/// Prueft das Bearer-Token gegen `auth_tokens` und laedt die Rechte.
impl FromRequestParts<MySqlPool> for CurrentUser {
    type Rejection = ApiError;

    async fn from_request_parts(
        parts: &mut Parts,
        pool: &MySqlPool,
    ) -> Result<Self, Self::Rejection> {
        let token = bearer_token(&parts.headers)
            .ok_or_else(|| ApiError::Unauthorized("missing or invalid bearer token".into()))?;

        sqlx::query_as::<_, CurrentUser>(
            "SELECT v.id, v.username, v.role, v.can_play, v.can_create_sessions,
                    v.can_manage_users, v.can_lock_users, v.can_manage_reports, v.can_write
             FROM auth_tokens t
             JOIN v_user_permissions v ON v.id = t.user_id
             WHERE t.token_hash = ? AND t.expires_at > UTC_TIMESTAMP()",
        )
        .bind(hash_token(token))
        .fetch_optional(pool)
        .await
        .map_err(internal)?
        .ok_or_else(|| ApiError::Unauthorized("invalid or expired token".into()))
    }
}

fn permissions_json(user: &CurrentUser) -> Value {
    json!({
        "can_play": user.can_play,
        "can_create_sessions": user.can_create_sessions,
        "can_manage_users": user.can_manage_users,
        "can_lock_users": user.can_lock_users,
        "can_manage_reports": user.can_manage_reports,
        "can_write": user.can_write,
    })
}

async fn fetch_permissions(pool: &MySqlPool, id: u64) -> Result<CurrentUser, ApiError> {
    sqlx::query_as::<_, CurrentUser>(
        "SELECT id, username, role, can_play, can_create_sessions,
                can_manage_users, can_lock_users, can_manage_reports, can_write
         FROM v_user_permissions WHERE id = ?",
    )
    .bind(id)
    .fetch_optional(pool)
    .await
    .map_err(internal)?
    .ok_or_else(|| ApiError::NotFound(format!("no user with id {id}")))
}

/// Erzeugt ein neues Bearer-Token. Zurueck kommen Token und Ablaufzeit;
/// gespeichert wird nur der Hash.
async fn issue_token(pool: &MySqlPool, user_id: u64) -> Result<(String, String), ApiError> {
    // Abgelaufene Tokens bei der Gelegenheit aufraeumen.
    sqlx::query("DELETE FROM auth_tokens WHERE expires_at <= UTC_TIMESTAMP()")
        .execute(pool)
        .await
        .map_err(internal)?;

    let mut bytes = [0u8; 32];
    rand::thread_rng().fill_bytes(&mut bytes);
    let token = hex_encode(bytes);
    let expires = Utc::now() + chrono::Duration::days(TOKEN_TTL_DAYS);

    sqlx::query("INSERT INTO auth_tokens (token_hash, user_id, expires_at) VALUES (?, ?, ?)")
        .bind(hash_token(&token))
        .bind(user_id)
        .bind(expires.naive_utc())
        .execute(pool)
        .await
        .map_err(internal)?;

    Ok((
        token,
        expires.to_rfc3339_opts(chrono::SecondsFormat::Secs, true),
    ))
}

/// Meldet eine Person samt Rollenrechten. Wird von Login, Registrierung und
/// `GET /api/me` benutzt.
fn auth_json(user: &CurrentUser, email: Option<&str>, token: Option<(&str, &str)>) -> Value {
    let mut body = json!({
        "id": user.id,
        "username": user.username,
        "role": user.role,
        "permissions": permissions_json(user),
    });
    if let Some(email) = email {
        body["email"] = json!(email);
    }
    if let Some((token, expires_at)) = token {
        body["token"] = json!(token);
        body["expires_at"] = json!(expires_at);
    }
    body["user"] = body.clone();
    body
}

/* -------------------------------------------------------------------- Routen */

pub fn router() -> Router<MySqlPool> {
    Router::new()
        .route("/api/health", get(health))
        .route("/api/users", get(list_users))
        .route("/api/users/{id}", get(read_user))
        .route("/api/profile/{id}", get(read_user))
        .route("/api/login", post(login))
        .route("/api/auth/login", post(login))
        .route("/api/users/login", post(login))
        .route("/api/register", post(register))
        .route("/api/auth/register", post(register))
        .route("/api/users/register", post(register))
        .route("/api/signup", post(register))
        .route("/api/logout", post(logout))
        .route("/api/auth/logout", post(logout))
        .route("/api/me", get(me))
        .route("/api/admin/users", get(list_admin_users))
        .route("/api/admin/users/{id}", patch(update_admin_user))
        .route("/api/admin/users/{id}", put(update_admin_user))
        .route("/api/games", get(list_game_types))
        .route("/api/ratings", get(list_ratings))
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
        .route("/api/games/results", get(list_all_games))
        .route(
            "/api/games/{game_name}/results",
            post(record_board_game),
        )
        .route("/api/demo-data", delete(delete_demo_data))
        .route("/api/reports", get(list_reports))
        .route("/api/reports", post(create_report))
        .route("/api/reports/{id}", get(read_report))
        .route("/api/reports/{id}", patch(update_report))
        .route("/api/reports/{id}", put(update_report))
        .route("/api/reports/{id}", delete(delete_report))
        .route("/api/reports/{id}/review", post(update_report))
        .route("/api/player-reports", get(list_reports))
        .route("/api/player-reports", post(create_report))
        .route("/api/player-reports/{id}", get(read_report))
        .route("/api/player-reports/{id}", patch(update_report))
        .route("/api/player-reports/{id}", put(update_report))
        .route("/api/player-reports/{id}", delete(delete_report))
        .route("/api/player-reports/{id}/review", post(update_report))
}

/// Kennung aus dem Pfad, `game_sessions.id` also eine Zahl.
///
/// Alles andere kann nicht existieren und bekommt deshalb 404 statt 400: Eine
/// unbekannte Kennung ist kein fehlerhafter Aufbau. Praktisch wichtig, weil
/// alte Lesezeichen aus der Zeit vor dem Backend Kennungen wie `s-a1b2c3` im
/// Pfad tragen.
fn session_id(path: Result<Path<String>, PathRejection>) -> Result<u64, ApiError> {
    let Path(raw) = path.map_err(|e| ApiError::BadRequest(e.body_text()))?;
    raw.parse()
        .map_err(|_| ApiError::NotFound(format!("no session with id '{raw}'")))
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
        "friendly": session.friendly != 0,
        "players": players,
    })
}

async fn session_json_by_id(pool: &MySqlPool, id: u64) -> Result<Value, ApiError> {
    let session = require_session(pool, id).await?;
    let players = fetch_players(pool, &[id]).await?;
    Ok(session_json(&session, players_of(&players, id)))
}

/* -------------------------------------------------------- Benutzer, Spieltypen */

pub async fn list_users(
    State(pool): State<MySqlPool>,
    _user: CurrentUser,
) -> Result<Json<Value>, ApiError> {
    // Gesperrte Konten verschwinden aus der Auswahl; abgelaufene Sperren
    // erscheinen automatisch wieder, weil die View neu rechnet.
    let users = sqlx::query_as::<_, User>(
        "SELECT u.id, u.username, u.role
         FROM users u
         JOIN v_user_permissions p ON p.id = u.id
         WHERE p.can_play AND p.can_write
         ORDER BY u.id",
    )
    .fetch_all(&pool)
    .await
    .map_err(|e| ApiError::Internal(e.into()))?;
    Ok(Json(json!(users)))
}

/// Öffentliches Profil einer Person.
pub async fn read_user(
    State(pool): State<MySqlPool>,
    _user: CurrentUser,
    id: Result<Path<String>, PathRejection>,
) -> Result<Json<Value>, ApiError> {
    let Path(raw) = id.map_err(|e| ApiError::BadRequest(e.body_text()))?;
    let id: u64 = raw
        .parse()
        .map_err(|_| ApiError::NotFound(format!("no user with id '{raw}'")))?;

    let user = sqlx::query_as::<_, UserProfile>(
        "SELECT id, username, email, role,
                CAST(DATE_FORMAT(created_at, '%Y-%m-%dT%H:%i:%sZ') AS CHAR) AS created_at
         FROM users WHERE id = ?",
    )
    .bind(id)
    .fetch_optional(&pool)
    .await
    .map_err(|e| ApiError::Internal(e.into()))?
    .ok_or_else(|| ApiError::NotFound(format!("no user with id {id}")))?;

    Ok(Json(json!(user)))
}

#[derive(Debug, Deserialize)]
pub struct LoginDto {
    #[serde(alias = "user", alias = "name")]
    username: Option<String>,
    #[serde(alias = "mail", alias = "email")]
    email: Option<String>,
    password: String,
}

#[derive(Debug, Deserialize)]
pub struct RegisterDto {
    username: String,
    #[serde(default)]
    email: Option<String>,
    password: String,
}

pub async fn login(
    State(pool): State<MySqlPool>,
    payload: Result<Json<LoginDto>, JsonRejection>,
) -> Result<Json<Value>, ApiError> {
    let Json(dto) = payload.map_err(|e| ApiError::BadRequest(e.body_text()))?;

    let username = dto.username.clone().unwrap_or_default().trim().to_string();
    let email = dto.email.clone().unwrap_or_default().trim().to_string();
    if username.is_empty() && email.is_empty() {
        return bad("username or email is required".into());
    }
    if dto.password.is_empty() {
        return bad("password is required".into());
    }

    let row = if !username.is_empty() {
        sqlx::query_as::<_, AuthUser>(
            "SELECT id, email, password_hash, is_locked, locked_until FROM users WHERE username = ?",
        )
        .bind(&username)
        .fetch_optional(&pool)
        .await
        .map_err(|e| ApiError::Internal(e.into()))?
    } else {
        sqlx::query_as::<_, AuthUser>(
            "SELECT id, email, password_hash, is_locked, locked_until FROM users WHERE email = ?",
        )
        .bind(&email)
        .fetch_optional(&pool)
        .await
        .map_err(|e| ApiError::Internal(e.into()))?
    };

    let user = row.ok_or_else(|| ApiError::Unauthorized("invalid credentials".into()))?;
    if user.is_locked {
        let still_locked = match user.locked_until {
            None => true,
            Some(until) => until > chrono::Utc::now().naive_utc(),
        };
        if still_locked {
            return Err(ApiError::Forbidden("account is locked".into()));
        }
    }
    if !verify_password(&dto.password, &user.password_hash) {
        return Err(ApiError::Unauthorized("invalid credentials".into()));
    }

    let permissions = fetch_permissions(&pool, user.id).await?;
    let (token, expires_at) = issue_token(&pool, user.id).await?;
    Ok(Json(auth_json(
        &permissions,
        Some(&user.email),
        Some((&token, &expires_at)),
    )))
}

pub async fn register(
    State(pool): State<MySqlPool>,
    payload: Result<Json<RegisterDto>, JsonRejection>,
) -> Result<(StatusCode, Json<Value>), ApiError> {
    let Json(dto) = payload.map_err(|e| ApiError::BadRequest(e.body_text()))?;

    let username = dto.username.trim();
    if username.is_empty() {
        return bad("username is required".into());
    }
    if dto.password.is_empty() {
        return bad("password is required".into());
    }
    let email = dto
        .email
        .clone()
        .unwrap_or_else(|| format!("{username}@example.invalid"))
        .trim()
        .to_string();
    if email.is_empty() {
        return bad("email is required".into());
    }

    let exists = sqlx::query_scalar::<_, i64>(
        "SELECT COUNT(*) FROM users WHERE username = ? OR email = ?",
    )
    .bind(username)
    .bind(&email)
    .fetch_one(&pool)
    .await
    .map_err(|e| ApiError::Internal(e.into()))?;
    if exists > 0 {
        return Err(ApiError::Conflict("username or email already exists".into()));
    }

    // Selbstregistrierung legt immer Spieler:innen an. Rollen vergibt nur die
    // Administration; so kann sich niemand selbst zum Admin machen.
    let hash = hash_password(&dto.password);

    let insert = sqlx::query(
        "INSERT INTO users (username, email, password_hash, role) VALUES (?, ?, ?, 'player')",
    )
    .bind(username)
    .bind(&email)
    .bind(&hash)
    .execute(&pool)
    .await
    .map_err(|e| ApiError::Internal(e.into()))?;
    let id = insert.last_insert_id();

    let permissions = fetch_permissions(&pool, id).await?;
    let (token, expires_at) = issue_token(&pool, id).await?;

    Ok((
        StatusCode::CREATED,
        Json(auth_json(
            &permissions,
            Some(&email),
            Some((&token, &expires_at)),
        )),
    ))
}

pub async fn logout(
    State(pool): State<MySqlPool>,
    user: CurrentUser,
    headers: HeaderMap,
) -> Result<Json<Value>, ApiError> {
    if let Some(token) = bearer_token(&headers) {
        sqlx::query("DELETE FROM auth_tokens WHERE token_hash = ? AND user_id = ?")
            .bind(hash_token(token))
            .bind(user.id)
            .execute(&pool)
            .await
            .map_err(internal)?;
    }
    Ok(Json(json!({ "ok": true })))
}

/// Die angemeldete Person samt Rechten - fuer die Oberflaeche nach einem Reload.
pub async fn me(user: CurrentUser) -> Result<Json<Value>, ApiError> {
    Ok(Json(auth_json(&user, None, None)))
}

pub async fn list_game_types(
    State(pool): State<MySqlPool>,
    _user: CurrentUser,
) -> Result<Json<Value>, ApiError> {
    let games = sqlx::query_as::<_, GameType>(
        "SELECT id, name, display_name, max_players FROM game_types ORDER BY id",
    )
    .fetch_all(&pool)
    .await
    .map_err(|e| ApiError::Internal(e.into()))?;
    Ok(Json(json!(games)))
}

/// Wertungsstand aller spielberechtigten Personen, je Spiel eine Zeile.
///
/// Die Tabelle `player_ratings` enthaelt nur Kombinationen, die schon ein
/// gewertetes Ergebnis hatten. Der `LEFT JOIN` liefert fuer alle anderen den
/// Startwert 1200 und lauter Nullen - so muss die Oberflaeche nicht selbst
/// raten, welche Zeile fehlt. Freundschaftsspiele tauchen hier nie auf, weil
/// `apply_rating` sie nicht fortschreibt.
pub async fn list_ratings(
    State(pool): State<MySqlPool>,
    _user: CurrentUser,
) -> Result<Json<Value>, ApiError> {
    let ratings = sqlx::query_as::<_, PlayerRating>(
        "SELECT u.id AS user_id,
                u.username,
                gt.name AS game_type,
                COALESCE(r.rating, 1200) AS rating,
                CAST(COALESCE(r.games_played, 0) AS UNSIGNED) AS games_played,
                CAST(COALESCE(r.wins, 0) AS UNSIGNED) AS wins,
                CAST(COALESCE(r.losses, 0) AS UNSIGNED) AS losses,
                CAST(COALESCE(r.draws, 0) AS UNSIGNED) AS draws
         FROM users u
         JOIN v_user_permissions p ON p.id = u.id
         CROSS JOIN game_types gt
         LEFT JOIN player_ratings r
                ON r.user_id = u.id AND r.game_type_id = gt.id
         WHERE p.can_play
         ORDER BY u.id, gt.id",
    )
    .fetch_all(&pool)
    .await
    .map_err(internal)?;
    Ok(Json(json!(ratings)))
}

/* ------------------------------------------------------------------ Sitzungen */

/// Gehostete Sitzungen, neueste zuerst.
///
/// Ad-hoc-Partien (`/play` ohne Sitzung) stehen hier nicht: sie haben weder
/// Host noch Teilnehmer und wuerden im Dashboard als leere Karten erscheinen.
pub async fn list_sessions(
    State(pool): State<MySqlPool>,
    _user: CurrentUser,
) -> Result<Json<Value>, ApiError> {
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
    _user: CurrentUser,
    id: Result<Path<String>, PathRejection>,
) -> Result<Json<Value>, ApiError> {
    let id = session_id(id)?;
    Ok(Json(session_json_by_id(&pool, id).await?))
}

#[derive(Debug, Deserialize)]
pub struct CreateSessionDto {
    game_type: String,
    host_id: u64,
    players: SeatPair,
    /// `true` = Freundschaftsspiel; Ergebnis und Verlauf bleiben erhalten,
    /// aber `player_ratings` wird nicht fortgeschrieben.
    #[serde(default)]
    friendly: bool,
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
    user: CurrentUser,
    payload: Result<Json<CreateSessionDto>, JsonRejection>,
) -> Result<(StatusCode, Json<Value>), ApiError> {
    let Json(dto) = payload.map_err(|e| ApiError::BadRequest(e.body_text()))?;

    user.require_create_sessions()?;
    if !user.is_admin() && dto.host_id != user.id {
        return Err(ApiError::Forbidden(
            "hosts may only create their own sessions".into(),
        ));
    }
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
        let access = sqlx::query_as::<_, (String, bool)>(
            "SELECT role, can_write FROM v_user_permissions WHERE id = ?",
        )
        .bind(id)
        .fetch_optional(&pool)
        .await
        .map_err(|e| ApiError::Internal(e.into()))?;
        let Some((actual_role, can_write)) = access else {
            return bad(format!("unknown {role} with id {id}"));
        };
        if !can_write {
            return bad(format!("{role} with id {id} is locked"));
        }
        if role == "host" && actual_role != "host" && actual_role != "admin" {
            return bad(format!("host with id {id} must have the host or admin role"));
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
    let metadata = if dto.friendly {
        Some(json!({ "friendly": true }))
    } else {
        None
    };
    let session_id = insert_session(&mut tx, game_type_id, Some(dto.host_id), metadata).await?;

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
    user: CurrentUser,
    id: Result<Path<String>, PathRejection>,
) -> Result<Json<Value>, ApiError> {
    let id = session_id(id)?;
    let session = require_open_session(&pool, id).await?;
    user.require_session_manager(&session)?;
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
    user: CurrentUser,
    id: Result<Path<String>, PathRejection>,
) -> Result<Json<Value>, ApiError> {
    let id = session_id(id)?;
    let session = require_open_session(&pool, id).await?;
    user.require_session_manager(&session)?;
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
    user: CurrentUser,
    id: Result<Path<String>, PathRejection>,
) -> Result<Json<Value>, ApiError> {
    let id = session_id(id)?;
    let session = require_open_session(&pool, id).await?;
    user.require_session_manager(&session)?;

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
    user: CurrentUser,
    id: Result<Path<String>, PathRejection>,
    payload: Result<Json<SurrenderDto>, JsonRejection>,
) -> Result<Json<Value>, ApiError> {
    let id = session_id(id)?;
    let Json(dto) = payload.map_err(|e| ApiError::BadRequest(e.body_text()))?;
    user.require_play()?;
    let session = require_open_session(&pool, id).await?;

    // Aufgeben darf nur die Person selbst; Admins duerfen eine Aufgabe erzwingen.
    if !user.is_admin() && dto.user_id != user.id {
        return Err(ApiError::Forbidden(
            "players may only surrender their own seat".into(),
        ));
    }

    let mut tx = pool.begin().await.map_err(internal)?;
    let players = fetch_players_in(&mut tx, id).await?;

    // Der Aufgebende sitzt auf dem Platz, der verliert.
    let loser = players
        .iter()
        .find(|player| player.user_id == Some(dto.user_id))
        .and_then(|player| player.side.clone())
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
    .bind(winner)
    .bind(dto.user_id)
    .bind(id)
    .execute(&mut *tx)
    .await
    .map_err(internal)?;

    // Eine Aufgabe ist ein regulaeres Ergebnis: gewertete Partien zaehlen sie
    // mit, Freundschaftsspiele nicht.
    apply_rating(
        &mut tx,
        session.game_type_id,
        &players,
        "win",
        Some(winner),
        session.friendly != 0 || session.demo != 0,
    )
    .await?;

    tx.commit().await.map_err(internal)?;

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
    /// Nur fuer Partien ohne Sitzung relevant: sie sind ohnehin ungewertet.
    /// Bei einer gehosteten Sitzung entscheidet deren `friendly`-Kennzeichen.
    #[serde(default)]
    pub friendly: Option<bool>,
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
    user: CurrentUser,
    payload: Result<Json<GameResultDto>, JsonRejection>,
) -> Result<(StatusCode, Json<Value>), ApiError> {
    let Json(dto) = payload.map_err(|e| ApiError::BadRequest(e.body_text()))?;
    user.require_play()?;
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

    let prepared: Vec<PreparedMove> = dto
        .moves
        .iter()
        .map(|m| PreparedMove {
            side: m.player.clone(),
            payload: json!({ "col": m.location.x, "row": m.location.y }),
        })
        .collect();

    let (session_id, ad_hoc) = persist_result(
        &pool,
        &user,
        game_type_id,
        CONNECT_FOUR,
        &prepared,
        outcome,
        winner,
        duration_ms,
        dto.session_id,
        dto.friendly,
    )
    .await?;

    Ok((
        StatusCode::CREATED,
        Json(json!({ "session_id": session_id, "outcome": outcome, "ad_hoc": ad_hoc })),
    ))
}

/* ------------------------------------------------------------- Brettspiele */

/// Ein Zug eines beliebigen Spiels, nach der Pruefung.
///
/// `side` landet zusaetzlich im JSON, damit die Leserouten die Person auch
/// dann kennen, wenn keine `user_id` am Zug haengt (Ad-hoc-Partie).
struct PreparedMove {
    side: String,
    payload: Value,
}

#[derive(Debug, Deserialize)]
pub struct BoardMoveDto {
    pub turn: i64,
    pub player: String,
    #[serde(default)]
    pub location: Option<Location>,
    #[serde(default)]
    pub payload: Option<Value>,
}

#[derive(Debug, Deserialize)]
pub struct BoardResultDto {
    pub moves: Vec<BoardMoveDto>,
    pub winner: String,
    #[serde(default)]
    pub duration_ms: Option<i64>,
    #[serde(default)]
    pub session_id: Option<u64>,
    #[serde(default)]
    pub friendly: Option<bool>,
}

/// Speichert eine beendete Partie eines beliebigen Spiels.
///
/// Die Route ist spielunabhaengig; die Regeln prueft `validate_board_moves`.
/// Das Speichern selbst teilt sich `record_connect_four_game` mit dieser
/// Funktion, damit Sitzung, Zuege und Metadaten ueberall gleich aussehen.
pub async fn record_board_game(
    State(pool): State<MySqlPool>,
    user: CurrentUser,
    path: Result<Path<String>, PathRejection>,
    payload: Result<Json<BoardResultDto>, JsonRejection>,
) -> Result<(StatusCode, Json<Value>), ApiError> {
    let Path(game_name) = path.map_err(|e| ApiError::BadRequest(e.body_text()))?;
    let Json(dto) = payload.map_err(|e| ApiError::BadRequest(e.body_text()))?;
    user.require_play()?;

    let game_type_id = game_type_id(&pool, &game_name).await?;
    let (outcome, winner) = outcome_of(&dto.winner)?;

    validate_board_moves(&game_name, &dto.moves, outcome, winner)?;

    let prepared: Vec<PreparedMove> = dto
        .moves
        .iter()
        .map(|m| PreparedMove {
            side: m.player.clone(),
            payload: move_payload(m),
        })
        .collect();

    let duration_ms = dto
        .duration_ms
        .filter(|ms| *ms >= 0)
        .map(|ms| ms as u64);

    let (session_id, ad_hoc) = persist_result(
        &pool,
        &user,
        game_type_id,
        &game_name,
        &prepared,
        outcome,
        winner,
        duration_ms,
        dto.session_id,
        dto.friendly,
    )
    .await?;

    Ok((
        StatusCode::CREATED,
        Json(json!({ "session_id": session_id, "outcome": outcome, "ad_hoc": ad_hoc })),
    ))
}

async fn game_type_id(pool: &MySqlPool, name: &str) -> Result<u32, ApiError> {
    sqlx::query_scalar::<_, u32>("SELECT id FROM game_types WHERE name = ?")
        .bind(name)
        .fetch_optional(pool)
        .await
        .map_err(internal)?
        .ok_or_else(|| {
            ApiError::BadRequest(format!(
                "unknown game type '{name}' - are the migrations applied?"
            ))
        })
}

/// `winner` aus dem Wire-Format in `(outcome, winner_side)` uebersetzen.
fn outcome_of(winner: &str) -> Result<(&str, Option<&str>), ApiError> {
    match winner {
        "draw" => Ok(("draw", None)),
        "aborted" => Ok(("aborted", None)),
        side if SIDES.contains(&side) => Ok(("win", Some(side))),
        other => Err(ApiError::BadRequest(format!(
            "winner '{other}' is not a side, 'draw' or 'aborted'"
        ))),
    }
}

/// Spielspezifische Angaben plus optionale Rasterposition.
fn move_payload(m: &BoardMoveDto) -> Value {
    let mut payload = m
        .payload
        .clone()
        .unwrap_or_else(|| json!({}));
    if let Value::Object(ref mut map) = payload {
        if let Some(location) = &m.location {
            map.entry("col").or_insert_with(|| json!(location.x));
            map.entry("row").or_insert_with(|| json!(location.y));
        }
    }
    payload
}

/// Speichert Zuege und schliesst entweder die gehostete Sitzung oder legt
/// eine Ad-hoc-Zeile an. Beide Wege laufen in einer Transaktion.
#[allow(clippy::too_many_arguments)]
async fn persist_result(
    pool: &MySqlPool,
    user: &CurrentUser,
    game_type_id: u32,
    game_name: &str,
    moves: &[PreparedMove],
    outcome: &str,
    winner: Option<&str>,
    duration_ms: Option<u64>,
    session_id: Option<u64>,
    friendly: Option<bool>,
) -> Result<(u64, bool), ApiError> {
    let mut tx = pool.begin().await.map_err(internal)?;

    let (session_id, ad_hoc, players) = match session_id {
        // Gehostete Sitzung schliessen.
        Some(session_id) => {
            let session = sqlx::query_as::<_, Session>(&format!("{SESSION_COLUMNS} WHERE s.id = ?"))
                .bind(session_id)
                .fetch_optional(&mut *tx)
                .await
                .map_err(internal)?
                .ok_or_else(|| ApiError::NotFound(format!("no session with id {session_id}")))?;
            if session.game_type != game_name {
                return Err(ApiError::BadRequest(format!(
                    "session {session_id} is not a {game_name} session"
                )));
            }
            if session.outcome.is_some() {
                return Err(ApiError::BadRequest(format!(
                    "session {session_id} is already finished"
                )));
            }

            // Nur Mitwirkende, der Host oder ein Admin duerfen das Ergebnis
            // dieser Sitzung speichern.
            let players = fetch_players_in(&mut tx, session_id).await?;
            let is_seated = players
                .iter()
                .any(|player| player.user_id == Some(user.id));
            if !user.is_admin() && session.host_id != Some(user.id) && !is_seated {
                return Err(ApiError::Forbidden(
                    "only participants, the host or an admin may record this session".into(),
                ));
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

            // Nur gewertete Partien veraendern die Wertung. Freundschaftsspiele
            // und Beispieldaten bleiben bewusst aussen vor.
            apply_rating(
                &mut tx,
                session.game_type_id,
                &players,
                outcome,
                winner,
                session.friendly != 0 || session.demo != 0,
            )
            .await?;

            (session_id, false, players)
        }
        // Partie ohne Sitzung: eigene Zeile, anonym.
        None => {
            let mut metadata = json!({
                "ad_hoc": true,
                "created_by": user.id,
                // Ohne feste Plaetze gibt es keine Wertung; das Kennzeichen
                // macht das auch in der Oberflaeche sichtbar.
                "friendly": friendly.unwrap_or(true),
            });
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

            let players = fetch_players_in(&mut tx, session_id).await?;
            (session_id, true, players)
        }
    };

    // Vorhandene Plaetze uebernehmen, damit `moves.player_id` gesetzt ist.
    for (index, m) in moves.iter().enumerate() {
        let mut payload = m.payload.clone();
        if let Value::Object(ref mut map) = payload {
            map.insert("side".into(), json!(m.side));
        } else {
            payload = json!({ "side": m.side, "value": payload });
        }

        sqlx::query(
            "INSERT INTO moves (session_id, move_index, player_id, move_source, payload)
             VALUES (?, ?, ?, 'manual', ?)",
        )
        .bind(session_id)
        .bind((index + 1) as u32)
        .bind(player_id_of(&players, &m.side))
        .bind(payload)
        .execute(&mut *tx)
        .await
        .map_err(internal)?;
    }

    tx.commit().await.map_err(internal)?;

    Ok((session_id, ad_hoc))
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

/* ---------------------------------------------------------------- Wertung */

/// Startwert fuer jede Person und jedes Spiel.
const START_RATING: i32 = 1200;
/// Elo-K-Faktor: 32 ist der uebliche Wert fuer Vereinsspieler:innen.
const ELO_K: f64 = 32.0;
/// Untergrenze, damit eine Pechsträhne die Wertung nicht ins Negative zieht.
const MIN_RATING: i32 = 100;

/// Erwarteter Punktwert (0..1) der Person mit `rating` gegen `opponent`.
fn expected_score(rating: i32, opponent: i32) -> f64 {
    1.0 / (1.0 + 10f64.powf((opponent - rating) as f64 / 400.0))
}

/// Elo-Aenderung fuer ein Ergebnis: `1.0` Sieg, `0.5` Remis, `0.0` Niederlage.
fn elo_delta(rating: i32, opponent: i32, score: f64) -> i32 {
    (ELO_K * (score - expected_score(rating, opponent))).round() as i32
}

/// Schreibt eine gewertete Partie in `player_ratings`.
///
/// Aufgerufen wird die Funktion nur, wenn beide Sitzplaetze einer gehosteten
/// Sitzung mit Konten besetzt sind und die Sitzung weder freundschaftlich noch
/// ein Beispieldatensatz ist. Sie laeuft in derselben Transaktion wie das
/// Schliessen der Sitzung, damit Ergebnis und Wertung nie auseinanderfallen.
async fn apply_rating(
    tx: &mut Transaction<'_, MySql>,
    game_type_id: u32,
    players: &[SessionPlayer],
    outcome: &str,
    winner: Option<&str>,
    friendly_or_demo: bool,
) -> Result<(), ApiError> {
    if friendly_or_demo || outcome == "aborted" || players.len() != 2 {
        return Ok(());
    }

    let Some(red) = players
        .iter()
        .find(|player| player.side.as_deref() == Some("red"))
    else {
        return Ok(());
    };
    let Some(yellow) = players
        .iter()
        .find(|player| player.side.as_deref() == Some("yellow"))
    else {
        return Ok(());
    };
    let (Some(red_user), Some(yellow_user)) = (red.user_id, yellow.user_id) else {
        return Ok(());
    };
    if red_user == yellow_user {
        return Ok(());
    }

    let (red_score, yellow_score) = match outcome {
        "draw" => (0.5, 0.5),
        "win" if winner == Some("red") => (1.0, 0.0),
        "win" if winner == Some("yellow") => (0.0, 1.0),
        _ => return Ok(()),
    };

    let (red_rating, yellow_rating) =
        lock_ratings(tx, game_type_id, red_user, yellow_user).await?;

    let red_new = (red_rating + elo_delta(red_rating, yellow_rating, red_score)).max(MIN_RATING);
    let yellow_new =
        (yellow_rating + elo_delta(yellow_rating, red_rating, yellow_score)).max(MIN_RATING);

    store_rating(tx, game_type_id, red_user, red_new, red_score).await?;
    store_rating(tx, game_type_id, yellow_user, yellow_new, yellow_score).await?;
    Ok(())
}

/// Legt fehlende Wertungszeilen an und liest beide Staende mit Sperre.
///
/// Die Sperre ist wichtig, wenn zwei Partien gleichzeitig enden: ohne
/// `FOR UPDATE` wuerden beide denselben alten Wert lesen und eine Aenderung
/// verlieren.
async fn lock_ratings(
    tx: &mut Transaction<'_, MySql>,
    game_type_id: u32,
    red_user: u64,
    yellow_user: u64,
) -> Result<(i32, i32), ApiError> {
    for user_id in [red_user, yellow_user] {
        sqlx::query(
            "INSERT IGNORE INTO player_ratings (user_id, game_type_id, rating)
             VALUES (?, ?, ?)",
        )
        .bind(user_id)
        .bind(game_type_id)
        .bind(START_RATING)
        .execute(&mut **tx)
        .await
        .map_err(internal)?;
    }

    let red = sqlx::query_scalar::<_, i32>(
        "SELECT rating FROM player_ratings
         WHERE user_id = ? AND game_type_id = ? FOR UPDATE",
    )
    .bind(red_user)
    .bind(game_type_id)
    .fetch_one(&mut **tx)
    .await
    .map_err(internal)?;

    let yellow = sqlx::query_scalar::<_, i32>(
        "SELECT rating FROM player_ratings
         WHERE user_id = ? AND game_type_id = ? FOR UPDATE",
    )
    .bind(yellow_user)
    .bind(game_type_id)
    .fetch_one(&mut **tx)
    .await
    .map_err(internal)?;

    Ok((red, yellow))
}

async fn store_rating(
    tx: &mut Transaction<'_, MySql>,
    game_type_id: u32,
    user_id: u64,
    rating: i32,
    score: f64,
) -> Result<(), ApiError> {
    let win = if score == 1.0 { 1 } else { 0 };
    let draw = if score == 0.5 { 1 } else { 0 };
    let loss = if score == 0.0 { 1 } else { 0 };

    sqlx::query(
        "UPDATE player_ratings
         SET rating = ?,
             games_played = games_played + 1,
             wins = wins + ?,
             draws = draws + ?,
             losses = losses + ?,
             updated_at = UTC_TIMESTAMP()
         WHERE user_id = ? AND game_type_id = ?",
    )
    .bind(rating)
    .bind(win)
    .bind(draw)
    .bind(loss)
    .bind(user_id)
    .bind(game_type_id)
    .execute(&mut **tx)
    .await
    .map_err(internal)?;
    Ok(())
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
pub async fn list_connect_four_games(
    State(pool): State<MySqlPool>,
    _user: CurrentUser,
) -> Result<Json<Value>, ApiError> {
    recorded_games(&pool, Some(CONNECT_FOUR)).await
}

/// Alle beendeten Partien, spielunabhaengig - die Historie filtert nach
/// `gameType`. Abgebrochene Sitzungen ohne Zuege bleiben aussen vor.
pub async fn list_all_games(
    State(pool): State<MySqlPool>,
    _user: CurrentUser,
) -> Result<Json<Value>, ApiError> {
    recorded_games(&pool, None).await
}

async fn recorded_games(
    pool: &MySqlPool,
    game_name: Option<&str>,
) -> Result<Json<Value>, ApiError> {
    let sessions = match game_name {
        Some(name) => {
            let sql = format!(
                "{SESSION_COLUMNS}
                 WHERE gt.name = ? AND s.outcome IS NOT NULL
                   AND EXISTS (SELECT 1 FROM moves m WHERE m.session_id = s.id)
                 ORDER BY s.started_at DESC"
            );
            sqlx::query_as::<_, Session>(&sql)
                .bind(name)
                .fetch_all(pool)
                .await
                .map_err(internal)?
        }
        None => {
            let sql = format!(
                "{SESSION_COLUMNS}
                 WHERE s.outcome IS NOT NULL
                   AND EXISTS (SELECT 1 FROM moves m WHERE m.session_id = s.id)
                 ORDER BY s.started_at DESC"
            );
            sqlx::query_as::<_, Session>(&sql)
                .fetch_all(pool)
                .await
                .map_err(internal)?
        }
    };

    let ids: Vec<u64> = sessions.iter().map(|s| s.id).collect();
    let players = fetch_players(pool, &ids).await?;
    let moves = fetch_moves(pool, &ids).await?;

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
    _user: CurrentUser,
    path: Result<Path<String>, PathRejection>,
) -> Result<Json<Value>, ApiError> {
    let session_id = session_id(path)?;

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
pub async fn delete_demo_data(
    State(pool): State<MySqlPool>,
    user: CurrentUser,
) -> Result<Json<Value>, ApiError> {
    user.require_admin()?;
    let result = sqlx::query("DELETE FROM game_sessions WHERE JSON_EXTRACT(metadata_json, '$.demo') = TRUE")
        .execute(&pool)
        .await
        .map_err(internal)?;
    Ok(Json(json!({ "deleted": result.rows_affected() })))
}

/* --------------------------------------------------------------- Meldungen */

#[derive(Debug, Deserialize)]
pub struct ReportFilter {
    status: Option<String>,
    reported_user_id: Option<u64>,
    reporter_id: Option<u64>,
}

pub async fn list_reports(
    State(pool): State<MySqlPool>,
    user: CurrentUser,
    Query(filter): Query<ReportFilter>,
) -> Result<Json<Value>, ApiError> {
    user.require_manage_reports()?;
    if let Some(status) = &filter.status {
        validate_report_status(status)?;
    }
    let mut qb = QueryBuilder::<MySql>::new(
        "SELECT id, reporter_id, reported_user_id, session_id, reason, details, status,
                admin_note, reviewed_by, created_at, updated_at, reviewed_at
         FROM player_reports WHERE 1 = 1",
    );
    if let Some(status) = &filter.status {
        qb.push(" AND status = ");
        qb.push_bind(status.clone());
    }
    if let Some(reported) = filter.reported_user_id {
        qb.push(" AND reported_user_id = ");
        qb.push_bind(reported);
    }
    if let Some(reporter) = filter.reporter_id {
        qb.push(" AND reporter_id = ");
        qb.push_bind(reporter);
    }
    qb.push(" ORDER BY created_at DESC");

    let reports = qb
        .build_query_as::<PlayerReport>()
        .fetch_all(&pool)
        .await
        .map_err(internal)?;
    Ok(Json(json!(reports)))
}

#[derive(Debug, Deserialize)]
pub struct CreateReportDto {
    reported_user_id: u64,
    session_id: Option<u64>,
    reason: String,
    details: Option<String>,
}

pub async fn create_report(
    State(pool): State<MySqlPool>,
    user: CurrentUser,
    payload: Result<Json<CreateReportDto>, JsonRejection>,
) -> Result<(StatusCode, Json<Value>), ApiError> {
    let Json(dto) = payload.map_err(|e| ApiError::BadRequest(e.body_text()))?;
    user.require_manage_reports()?;

    let reason = dto.reason.trim();
    if reason.is_empty() {
        return bad("reason must not be empty".into());
    }
    ensure_user_exists(&pool, dto.reported_user_id, "reported user").await?;
    if let Some(session_id) = dto.session_id {
        let exists = sqlx::query_scalar::<_, i64>(
            "SELECT COUNT(*) FROM game_sessions WHERE id = ?",
        )
        .bind(session_id)
        .fetch_one(&pool)
        .await
        .map_err(internal)?;
        if exists == 0 {
            return Err(ApiError::NotFound(format!("no session with id {session_id}")));
        }
    }

    // Der Melder ist immer die angemeldete Person; `reporter_id` aus dem Body
    // wird bewusst ignoriert.
    let insert = sqlx::query(
        "INSERT INTO player_reports
            (reporter_id, reported_user_id, session_id, reason, details, status)
         VALUES (?, ?, ?, ?, ?, 'open')",
    )
    .bind(user.id)
    .bind(dto.reported_user_id)
    .bind(dto.session_id)
    .bind(reason)
    .bind(dto.details)
    .execute(&pool)
    .await
    .map_err(internal)?;
    let id = insert.last_insert_id();

    let report = fetch_report(&pool, id).await?;
    Ok((StatusCode::CREATED, Json(json!(report))))
}

pub async fn read_report(
    State(pool): State<MySqlPool>,
    user: CurrentUser,
    id: Result<Path<String>, PathRejection>,
) -> Result<Json<Value>, ApiError> {
    user.require_manage_reports()?;
    let id = path_id(id)?;
    let report = fetch_report(&pool, id).await?;
    Ok(Json(json!(report)))
}

#[derive(Debug, Deserialize)]
pub struct UpdateReportDto {
    status: Option<String>,
    admin_note: Option<String>,
}

pub async fn update_report(
    State(pool): State<MySqlPool>,
    user: CurrentUser,
    id: Result<Path<String>, PathRejection>,
    payload: Result<Json<UpdateReportDto>, JsonRejection>,
) -> Result<Json<Value>, ApiError> {
    user.require_manage_reports()?;
    let id = path_id(id)?;
    let Json(dto) = payload.map_err(|e| ApiError::BadRequest(e.body_text()))?;

    // Die Meldung muss existieren, bevor etwas geaendert wird.
    let _ = fetch_report(&pool, id).await?;

    if let Some(status) = &dto.status {
        validate_report_status(status)?;
    }

    match dto.status.as_deref() {
        Some("open") => {
            sqlx::query(
                "UPDATE player_reports
                 SET status = 'open',
                     admin_note = COALESCE(?, admin_note),
                     reviewed_by = ?,
                     reviewed_at = NULL
                 WHERE id = ?",
            )
            .bind(dto.admin_note)
            .bind(user.id)
            .bind(id)
            .execute(&pool)
            .await
            .map_err(internal)?;
        }
        Some(status) => {
            sqlx::query(
                "UPDATE player_reports
                 SET status = ?,
                     admin_note = COALESCE(?, admin_note),
                     reviewed_by = ?,
                     reviewed_at = UTC_TIMESTAMP()
                 WHERE id = ?",
            )
            .bind(status)
            .bind(dto.admin_note)
            .bind(user.id)
            .bind(id)
            .execute(&pool)
            .await
            .map_err(internal)?;
        }
        None => {
            sqlx::query(
                "UPDATE player_reports
                 SET admin_note = COALESCE(?, admin_note),
                     reviewed_by = ?
                 WHERE id = ?",
            )
            .bind(dto.admin_note)
            .bind(user.id)
            .bind(id)
            .execute(&pool)
            .await
            .map_err(internal)?;
        }
    }

    let report = fetch_report(&pool, id).await?;
    Ok(Json(json!(report)))
}

pub async fn delete_report(
    State(pool): State<MySqlPool>,
    user: CurrentUser,
    id: Result<Path<String>, PathRejection>,
) -> Result<Json<Value>, ApiError> {
    user.require_manage_reports()?;
    let id = path_id(id)?;
    let _ = fetch_report(&pool, id).await?;
    let result = sqlx::query("DELETE FROM player_reports WHERE id = ?")
        .bind(id)
        .execute(&pool)
        .await
        .map_err(internal)?;
    Ok(Json(json!({ "deleted": result.rows_affected() })))
}

/* ----------------------------------------------------------- Administration */

pub async fn list_admin_users(
    State(pool): State<MySqlPool>,
    user: CurrentUser,
) -> Result<Json<Value>, ApiError> {
    user.require_admin()?;
    let users = sqlx::query_as::<_, AdminUser>(
        "SELECT id, username, email, role, is_locked,
                CAST(DATE_FORMAT(locked_until, '%Y-%m-%dT%H:%i:%sZ') AS CHAR) AS locked_until,
                locked_reason,
                CAST(DATE_FORMAT(created_at, '%Y-%m-%dT%H:%i:%sZ') AS CHAR) AS created_at
         FROM users ORDER BY id",
    )
    .fetch_all(&pool)
    .await
    .map_err(internal)?;
    Ok(Json(json!(users)))
}

#[derive(Debug, Deserialize)]
pub struct UpdateUserDto {
    role: Option<String>,
    is_locked: Option<bool>,
    /// RFC 3339; nur relevant, wenn `is_locked = true`. Fehlt der Wert, gilt
    /// die Sperre unbefristet.
    locked_until: Option<String>,
    locked_reason: Option<String>,
}

pub async fn update_admin_user(
    State(pool): State<MySqlPool>,
    user: CurrentUser,
    id: Result<Path<String>, PathRejection>,
    payload: Result<Json<UpdateUserDto>, JsonRejection>,
) -> Result<Json<Value>, ApiError> {
    user.require_admin()?;
    let id = path_id(id)?;
    let Json(dto) = payload.map_err(|e| ApiError::BadRequest(e.body_text()))?;

    let target = fetch_admin_user(&pool, id).await?;

    let role = dto.role.unwrap_or_else(|| target.role.clone());
    if !matches!(role.as_str(), "admin" | "host" | "player") {
        return bad(format!("unknown role '{role}'"));
    }

    let is_locked = dto.is_locked.unwrap_or(target.is_locked);
    // Beim Entsperren werden Ablaufzeit und Grund immer mit entfernt; sonst
    // verletzt `chk_users_lock_window` die Kombination.
    let locked_until = if !is_locked {
        None
    } else if let Some(value) = dto.locked_until.as_deref() {
        Some(parse_locked_until(value)?)
    } else if target.is_locked {
        target
            .locked_until
            .as_deref()
            .map(parse_locked_until)
            .transpose()?
    } else {
        None
    };
    let locked_reason = if is_locked {
        dto.locked_reason.or(target.locked_reason.clone())
    } else {
        None
    };

    // Admins duerfen sich nicht selbst aussperren oder degradieren - sonst
    // gibt es am Ende niemanden mehr, der Rollen vergeben kann.
    if id == user.id {
        if role != "admin" {
            return bad("admins cannot remove their own admin role".into());
        }
        if is_locked {
            return bad("admins cannot lock their own account".into());
        }
    }

    sqlx::query(
        "UPDATE users
         SET role = ?, is_locked = ?, locked_until = ?, locked_reason = ?
         WHERE id = ?",
    )
    .bind(&role)
    .bind(is_locked)
    .bind(locked_until)
    .bind(&locked_reason)
    .bind(id)
    .execute(&pool)
    .await
    .map_err(internal)?;

    Ok(Json(json!(fetch_admin_user(&pool, id).await?)))
}

fn parse_locked_until(value: &str) -> Result<NaiveDateTime, ApiError> {
    chrono::DateTime::parse_from_rfc3339(value)
        .map(|datetime| datetime.naive_utc())
        .map_err(|_| ApiError::BadRequest("locked_until must be an RFC 3339 timestamp".into()))
}

async fn fetch_admin_user(pool: &MySqlPool, id: u64) -> Result<AdminUser, ApiError> {
    sqlx::query_as::<_, AdminUser>(
        "SELECT id, username, email, role, is_locked,
                CAST(DATE_FORMAT(locked_until, '%Y-%m-%dT%H:%i:%sZ') AS CHAR) AS locked_until,
                locked_reason,
                CAST(DATE_FORMAT(created_at, '%Y-%m-%dT%H:%i:%sZ') AS CHAR) AS created_at
         FROM users WHERE id = ?",
    )
    .bind(id)
    .fetch_optional(pool)
    .await
    .map_err(internal)?
    .ok_or_else(|| ApiError::NotFound(format!("no user with id {id}")))
}

/* --------------------------------------------------------------- Meldungen */

async fn fetch_report(pool: &MySqlPool, id: u64) -> Result<PlayerReport, ApiError> {
    sqlx::query_as::<_, PlayerReport>(
        "SELECT id, reporter_id, reported_user_id, session_id, reason, details, status,
                admin_note, reviewed_by, created_at, updated_at, reviewed_at
         FROM player_reports WHERE id = ?",
    )
    .bind(id)
    .fetch_optional(pool)
    .await
    .map_err(internal)?
    .ok_or_else(|| ApiError::NotFound(format!("no report with id {id}")))
}

fn validate_report_status(status: &str) -> Result<(), ApiError> {
    match status {
        "open" | "reviewed" | "resolved" | "dismissed" => Ok(()),
        other => Err(ApiError::BadRequest(format!("unknown report status '{other}'"))),
    }
}

async fn ensure_user_exists(pool: &MySqlPool, id: u64, role: &str) -> Result<(), ApiError> {
    let exists = sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM users WHERE id = ?")
        .bind(id)
        .fetch_one(pool)
        .await
        .map_err(internal)?;
    if exists == 0 {
        return Err(ApiError::NotFound(format!("no {role} with id {id}")));
    }
    Ok(())
}

/// Kennung aus dem Pfad fuer Meldungen (Zahl).
fn path_id(path: Result<Path<String>, PathRejection>) -> Result<u64, ApiError> {
    let Path(raw) = path.map_err(|e| ApiError::BadRequest(e.body_text()))?;
    raw.parse()
        .map_err(|_| ApiError::NotFound(format!("no report with id '{raw}'")))
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

/* ---------------------------------------------------- Brettspiele: Pruefung */

fn payload_i64(m: &BoardMoveDto, key: &str) -> Option<i64> {
    m.payload.as_ref()?.get(key)?.as_i64()
}

fn payload_str<'a>(m: &'a BoardMoveDto, key: &str) -> Option<&'a str> {
    m.payload.as_ref()?.get(key)?.as_str()
}

fn payload_pair(m: &BoardMoveDto, key: &str) -> Option<(i64, i64)> {
    let pair = m.payload.as_ref()?.get(key)?.as_array()?;
    if pair.len() != 2 {
        return None;
    }
    Some((pair[0].as_i64()?, pair[1].as_i64()?))
}

fn validate_board_moves(
    game_name: &str,
    moves: &[BoardMoveDto],
    outcome: &str,
    winner: Option<&str>,
) -> Result<(), ApiError> {
    if moves.is_empty() {
        return bad("moves must not be empty".into());
    }
    if moves.len() > 4096 {
        return bad("too many moves".into());
    }

    for (i, m) in moves.iter().enumerate() {
        let expected = i as i64 + 1;
        if m.turn != expected {
            return bad(format!("moves[{i}].turn is {}, expected {expected}", m.turn));
        }
        if side_index(&m.player).is_none() {
            return bad(format!("moves[{i}].player '{}' is not a side", m.player));
        }
        if let Some(location) = &m.location {
            if location.x < 0 || location.y < 0 {
                return bad(format!("moves[{i}].location is negative"));
            }
        }
    }

    match game_name {
        "tictactoe" => validate_tictactoe(moves, outcome, winner),
        "memory" => validate_memory(moves, outcome, winner),
        "schach" => validate_coordinate_game(moves, 8, outcome, winner),
        "mensch-aergere-dich-nicht" => validate_mensch(moves, outcome, winner),
        other => bad(format!("no validator for game type '{other}'")),
    }
}

fn validate_tictactoe(
    moves: &[BoardMoveDto],
    outcome: &str,
    winner: Option<&str>,
) -> Result<(), ApiError> {
    let mut board = [None::<usize>; 9];
    let mut winning_move: Option<usize> = None;

    for (i, m) in moves.iter().enumerate() {
        if winning_move.is_some() {
            return bad(format!("moves[{i}] comes after the game was already won"));
        }
        let expected = if i % 2 == 0 { 0 } else { 1 };
        if side_index(&m.player) != Some(expected) {
            return bad(format!("moves[{i}]: '{}' is not the side to move", m.player));
        }

        let cell = payload_i64(m, "cell")
            .or_else(|| m.location.as_ref().map(|l| l.y * 3 + l.x))
            .ok_or_else(|| ApiError::BadRequest(format!("moves[{i}] has no cell")))?;
        if !(0..9).contains(&cell) {
            return bad(format!("moves[{i}].cell is outside the board"));
        }
        let cell = cell as usize;
        if board[cell].is_some() {
            return bad(format!("moves[{i}]: cell {cell} is already taken"));
        }

        board[cell] = Some(expected);
        if tictactoe_line(&board, expected) {
            winning_move = Some(i);
        }
    }

    let last = moves.len() - 1;
    match outcome {
        "win" => {
            if winning_move != Some(last) {
                return bad("the last move does not complete three in a row".into());
            }
            if side_index(&moves[last].player).map(|side| SIDES[side]) != winner {
                return bad("the winner must be the side that played the last move".into());
            }
        }
        "draw" => {
            if winning_move.is_some() {
                return bad("a game with three in a row is not a draw".into());
            }
            if moves.len() != 9 {
                return bad("a draw needs a full board".into());
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

fn tictactoe_line(board: &[Option<usize>; 9], side: usize) -> bool {
    const LINES: [[usize; 3]; 8] = [
        [0, 1, 2],
        [3, 4, 5],
        [6, 7, 8],
        [0, 3, 6],
        [1, 4, 7],
        [2, 5, 8],
        [0, 4, 8],
        [2, 4, 6],
    ];
    LINES
        .iter()
        .any(|line| line.iter().all(|&cell| board[cell] == Some(side)))
}

/// Memory: jeder Flip ist ein Zug. Bei einem Paar bleibt dieselbe Person am
/// Zug, deshalb wird hier nicht strikt abgewechselt. Der Verlauf enthaelt die
/// Karte und ihr Symbol; damit laesst sich das Deck nachspielen.
fn validate_memory(
    moves: &[BoardMoveDto],
    outcome: &str,
    winner: Option<&str>,
) -> Result<(), ApiError> {
    let mut matched = [false; 16];
    let mut card_symbol: [Option<String>; 16] = std::array::from_fn(|_| None);
    // Eine Karte darf mehrfach aufgedeckt werden, solange sie noch nicht
    // gefunden ist. Ein Symbol gehoert aber zu hoechstens zwei Karten.
    let mut symbol_cards: HashMap<String, Vec<usize>> = HashMap::new();
    let mut flipped: Vec<usize> = Vec::new();
    let mut turn = 0usize;
    let mut scores = [0usize; 2];

    for (i, m) in moves.iter().enumerate() {
        let side = side_index(&m.player)
            .ok_or_else(|| ApiError::BadRequest(format!("moves[{i}] has no side")))?;
        if side != turn {
            return bad(format!("moves[{i}]: '{}' is not the side to move", m.player));
        }

        let card = payload_i64(m, "card")
            .ok_or_else(|| ApiError::BadRequest(format!("moves[{i}] has no card")))?;
        if !(0..16).contains(&card) {
            return bad(format!("moves[{i}].card is outside the board"));
        }
        let card = card as usize;
        if matched[card] {
            return bad(format!("moves[{i}]: card {card} was already matched"));
        }
        if flipped.contains(&card) {
            return bad(format!("moves[{i}]: card {card} was flipped twice in one turn"));
        }

        let symbol = payload_str(m, "symbol")
            .ok_or_else(|| ApiError::BadRequest(format!("moves[{i}] has no symbol")))?;
        if !matches!(symbol, "A" | "B" | "C" | "D" | "E" | "F" | "G" | "H") {
            return bad(format!("moves[{i}].symbol '{symbol}' is not A-H"));
        }
        match &card_symbol[card] {
            Some(previous) if previous != symbol => {
                return bad(format!("moves[{i}]: card {card} changed its symbol"));
            }
            None => card_symbol[card] = Some(symbol.to_string()),
            _ => {}
        }

        let cards = symbol_cards.entry(symbol.to_string()).or_default();
        if !cards.contains(&card) {
            cards.push(card);
            if cards.len() > 2 {
                return bad(format!("symbol {symbol} belongs to more than two cards"));
            }
        }

        flipped.push(card);
        if flipped.len() == 2 {
            let first = flipped[0];
            let second = flipped[1];
            let first_symbol = card_symbol[first].as_deref().unwrap_or("");
            if first_symbol == symbol {
                matched[first] = true;
                matched[second] = true;
                scores[side] += 1;
            } else {
                turn = 1 - turn;
            }
            flipped.clear();
        }
    }

    match outcome {
        "win" | "draw" => {
            if flipped.len() != 0 {
                return bad("a finished memory game cannot end after one card".into());
            }
            if matched.iter().any(|value| !value) {
                return bad("a finished memory game needs all pairs".into());
            }
            for symbol in ["A", "B", "C", "D", "E", "F", "G", "H"] {
                if symbol_cards.get(symbol).map_or(0, Vec::len) != 2 {
                    return bad(format!("symbol {symbol} does not appear exactly twice"));
                }
            }
            match outcome {
                "win" => {
                    let expected = winner
                        .and_then(side_index)
                        .ok_or_else(|| ApiError::BadRequest("the winner is missing".into()))?;
                    let actual = if scores[0] == scores[1] {
                        None
                    } else if scores[0] > scores[1] {
                        Some(0)
                    } else {
                        Some(1)
                    };
                    if actual != Some(expected) {
                        return bad("the winner does not have the most pairs".into());
                    }
                }
                _ => {
                    if scores[0] != scores[1] {
                        return bad("a memory draw needs equal scores".into());
                    }
                }
            }
        }
        _ => {}
    }

    Ok(())
}

/// Schach: abwechselnd, von/nach im Brett. Die vollen Regeln
/// (Rochade, Matt) prueft das Frontend; hier zaehlt, dass der
/// gespeicherte Verlauf in sich stimmig ist.
fn validate_coordinate_game(
    moves: &[BoardMoveDto],
    size: i64,
    outcome: &str,
    winner: Option<&str>,
) -> Result<(), ApiError> {
    for (i, m) in moves.iter().enumerate() {
        let expected = if i % 2 == 0 { "red" } else { "yellow" };
        if m.player != expected {
            return bad(format!("moves[{i}]: '{}' is not the side to move", m.player));
        }
        let from = payload_pair(m, "from")
            .ok_or_else(|| ApiError::BadRequest(format!("moves[{i}] has no from")))?;
        let to = payload_pair(m, "to")
            .ok_or_else(|| ApiError::BadRequest(format!("moves[{i}] has no to")))?;

        for (label, (row, col)) in [("from", from), ("to", to)] {
            if row < 0 || row >= size || col < 0 || col >= size {
                return bad(format!(
                    "moves[{i}].{label} is outside the {size}x{size} board"
                ));
            }
        }
        if from == to {
            return bad(format!("moves[{i}]: from and to are the same square"));
        }
    }

    if outcome == "win" {
        if winner.is_none() {
            return bad("the winner is missing".into());
        }
        if moves.last().map(|m| m.player.as_str()) != winner {
            return bad("the winner must be the side that played the last move".into());
        }
    }

    Ok(())
}

/// Mensch aergere dich nicht: keine strikte Abwechslung, weil eine Sechs einen
/// weiteren Zug erlaubt. Geprueft werden Wuerfel, Figur und ein stimmiges Ende.
fn validate_mensch(
    moves: &[BoardMoveDto],
    outcome: &str,
    winner: Option<&str>,
) -> Result<(), ApiError> {
    let mut home = [0usize; 2];

    for (i, m) in moves.iter().enumerate() {
        let side = side_index(&m.player)
            .ok_or_else(|| ApiError::BadRequest(format!("moves[{i}] has no side")))?;

        let dice = payload_i64(m, "dice")
            .ok_or_else(|| ApiError::BadRequest(format!("moves[{i}] has no dice")))?;
        if !(1..=6).contains(&dice) {
            return bad(format!("moves[{i}].dice is not between 1 and 6"));
        }

        let token = payload_i64(m, "token")
            .ok_or_else(|| ApiError::BadRequest(format!("moves[{i}] has no token")))?;
        if !(0..4).contains(&token) {
            return bad(format!("moves[{i}].token is not between 0 and 3"));
        }

        if payload_str(m, "to") == Some("home") {
            home[side] += 1;
            if home[side] > 4 {
                return bad(format!("moves[{i}]: more than four tokens are home"));
            }
        }
    }

    match outcome {
        "win" => {
            let expected = winner
                .and_then(side_index)
                .ok_or_else(|| ApiError::BadRequest("the winner is missing".into()))?;
            if home[expected] != 4 {
                return bad("the winner must have all four tokens home".into());
            }
            if moves.last().map(|m| m.player.as_str()) != winner {
                return bad("the winner must be the side that played the last move".into());
            }
        }
        "draw" => return bad("Mensch aergere dich nicht has no draw".into()),
        _ => {}
    }

    Ok(())
}

const PASSWORD_ITERATIONS: u32 = 100_000;

fn hash_password(password: &str) -> String {
    let mut salt = [0u8; 16];
    rand::thread_rng().fill_bytes(&mut salt);
    let salt_hex = hex_encode(salt);
    let hash_hex = hash_with_salt(password, &salt, PASSWORD_ITERATIONS);
    format!("sha256${PASSWORD_ITERATIONS}${salt_hex}${hash_hex}")
}

fn verify_password(password: &str, stored: &str) -> bool {
    let parts: Vec<&str> = stored.split('$').collect();
    if parts.len() != 4 || parts[0] != "sha256" {
        // Alte Platzhalter (z. B. "!no-login-yet") lassen keine Anmeldung zu.
        return false;
    }
    let iterations: u32 = match parts[1].parse() {
        Ok(value) => value,
        Err(_) => return false,
    };
    let salt = match hex::decode(parts[2]) {
        Ok(value) => value,
        Err(_) => return false,
    };
    let expected = parts[3];
    let actual = hash_with_salt(password, &salt, iterations);
    // Konstanter Vergleich, um Timing-Angriffe zu erschweren.
    if actual.len() != expected.len() {
        return false;
    }
    actual
        .bytes()
        .zip(expected.bytes())
        .fold(0u8, |acc, (a, b)| acc | (a ^ b))
        == 0
}

fn hash_with_salt(password: &str, salt: &[u8], iterations: u32) -> String {
    let mut hasher = Sha256::new();
    hasher.update(salt);
    hasher.update(password.as_bytes());
    let mut out = hasher.finalize();
    for _ in 1..iterations {
        let mut hasher = Sha256::new();
        hasher.update(out);
        hasher.update(password.as_bytes());
        out = hasher.finalize();
    }
    hex_encode(out)
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
    fn equal_ratings_gain_and_lose_the_same_amount() {
        assert_eq!(elo_delta(1200, 1200, 1.0), 16);
        assert_eq!(elo_delta(1200, 1200, 0.5), 0);
        assert_eq!(elo_delta(1200, 1200, 0.0), -16);
    }

    #[test]
    fn the_underdog_gains_more_than_the_favourite() {
        assert!(elo_delta(1000, 1400, 1.0) > elo_delta(1400, 1000, 1.0));
        assert!(elo_delta(1000, 1400, 0.0) > elo_delta(1400, 1000, 0.0));
    }

    #[test]
    fn expected_scores_are_complementary() {
        let favourite = expected_score(1600, 1200);
        let underdog = expected_score(1200, 1600);
        assert!((favourite + underdog - 1.0).abs() < 1e-9);
        assert!(favourite > 0.9);
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

    #[test]
    fn a_numeric_path_is_the_session_id() {
        assert_eq!(session_id(Ok(Path("42".to_string()))).unwrap(), 42);
    }

    /// Alte Kennungen aus der Browser-Datenhaltung (`createId("s")`) koennen
    /// nicht in `game_sessions` stehen. Sie sind "unbekannt", nicht "kaputt".
    #[test]
    fn an_old_style_id_is_not_found_not_bad_request() {
        let error = session_id(Ok(Path("s-whsax5".to_string()))).unwrap_err();
        match error {
            ApiError::NotFound(message) => assert!(message.contains("s-whsax5")),
            other => panic!("erwartet NotFound, bekam {other:?}"),
        }
    }

    fn board_mv(turn: i64, player: &str, payload: Value) -> BoardMoveDto {
        BoardMoveDto {
            turn,
            player: player.into(),
            location: None,
            payload: Some(payload),
        }
    }

    fn tictactoe_red_win() -> Vec<BoardMoveDto> {
        vec![
            board_mv(1, "red", json!({ "cell": 0 })),
            board_mv(2, "yellow", json!({ "cell": 3 })),
            board_mv(3, "red", json!({ "cell": 1 })),
            board_mv(4, "yellow", json!({ "cell": 4 })),
            board_mv(5, "red", json!({ "cell": 2 })),
        ]
    }

    #[test]
    fn accepts_a_tictactoe_win() {
        assert!(
            validate_board_moves("tictactoe", &tictactoe_red_win(), "win", Some("red")).is_ok()
        );
    }

    #[test]
    fn rejects_a_tictactoe_win_without_a_line() {
        let moves = vec![
            board_mv(1, "red", json!({ "cell": 0 })),
            board_mv(2, "yellow", json!({ "cell": 3 })),
        ];
        assert!(
            validate_board_moves("tictactoe", &moves, "win", Some("red")).is_err()
        );
    }

    #[test]
    fn rejects_moves_after_a_tictactoe_win() {
        let mut moves = tictactoe_red_win();
        moves.push(board_mv(6, "yellow", json!({ "cell": 8 })));
        assert!(
            validate_board_moves("tictactoe", &moves, "win", Some("red")).is_err()
        );
    }

    #[test]
    fn memory_allows_a_card_to_be_flipped_again_later() {
        let moves = vec![
            board_mv(1, "red", json!({ "card": 0, "symbol": "A" })),
            board_mv(2, "red", json!({ "card": 1, "symbol": "B" })),
            board_mv(3, "yellow", json!({ "card": 0, "symbol": "A" })),
            board_mv(4, "yellow", json!({ "card": 2, "symbol": "A" })),
        ];
        assert!(validate_board_moves("memory", &moves, "aborted", None).is_ok());
    }

    #[test]
    fn memory_rejects_the_same_card_twice_in_one_turn() {
        let moves = vec![
            board_mv(1, "red", json!({ "card": 0, "symbol": "A" })),
            board_mv(2, "red", json!({ "card": 0, "symbol": "A" })),
        ];
        assert!(validate_board_moves("memory", &moves, "aborted", None).is_err());
    }

    #[test]
    fn accepts_coordinate_moves_for_chess() {
        let chess = vec![
            board_mv(1, "red", json!({ "from": [6, 4], "to": [4, 4] })),
            board_mv(2, "yellow", json!({ "from": [1, 4], "to": [3, 4] })),
        ];
        assert!(validate_board_moves("schach", &chess, "aborted", None).is_ok());
    }

    #[test]
    fn rejects_a_coordinate_move_outside_the_board() {
        let moves = vec![board_mv(1, "red", json!({ "from": [0, 0], "to": [8, 0] }))];
        assert!(validate_board_moves("schach", &moves, "aborted", None).is_err());
    }

    #[test]
    fn accepts_a_mensch_win_with_all_tokens_home() {
        let moves: Vec<BoardMoveDto> = (0..4)
            .map(|token| {
                board_mv(
                    token + 1,
                    "red",
                    json!({ "dice": 1, "token": token, "to": "home" }),
                )
            })
            .collect();
        assert!(
            validate_board_moves(
                "mensch-aergere-dich-nicht",
                &moves,
                "win",
                Some("red")
            )
            .is_ok()
        );
    }

    #[test]
    fn rejects_a_mensch_draw() {
        let moves = vec![board_mv(
            1,
            "red",
            json!({ "dice": 6, "token": 0, "to": "bank" }),
        )];
        assert!(
            validate_board_moves("mensch-aergere-dich-nicht", &moves, "draw", None).is_err()
        );
    }
}
