use chrono::NaiveDateTime;
use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};
use serde_json::Value;

/// Zeile aus `users`, wie `GET /api/users` sie ausliefert.
#[derive(Debug, Serialize, Deserialize, sqlx::FromRow)]
pub struct User {
    pub id: u64,
    pub username: String,
    pub role: String,
}

/// Öffentliches Profil einer Person - ohne Passwort-Hash.
#[derive(Debug, Serialize, Deserialize, sqlx::FromRow)]
pub struct UserProfile {
    pub id: u64,
    pub username: String,
    pub email: String,
    pub role: String,
    /// `2026-10-07T06:40:40Z`, wie bei Sitzungen.
    pub created_at: String,
}

/// Zeile aus `users` fuer die Administration - inklusive Sperre.
#[derive(Debug, Serialize, Deserialize, sqlx::FromRow)]
pub struct AdminUser {
    pub id: u64,
    pub username: String,
    pub email: String,
    pub role: String,
    pub is_locked: bool,
    /// `2026-11-04T12:00:00Z`; `None` = keine Sperre oder unbefristet.
    pub locked_until: Option<String>,
    pub locked_reason: Option<String>,
    pub created_at: String,
}

/// Zeile aus `users` fuer die Anmeldung, inklusive Passwort-Hash und Sperre.
#[derive(Debug, sqlx::FromRow)]
pub struct AuthUser {
    pub id: u64,
    pub email: String,
    pub password_hash: String,
    pub is_locked: bool,
    pub locked_until: Option<chrono::NaiveDateTime>,
}

/// Zeile aus `game_types`.
///
/// `rules_json` traegt die Spiellogik, die die Administration in der Oberflaeche
/// bearbeitet: Engine-Vorlage, Brettgroesse, Gewinnbedingung, Texte und Farbe.
/// Die fest eingebauten Spiele haben dort `NULL` und werden im Frontend aus
/// `lib/gameTypes.ts` ergaenzt.
#[derive(Debug, Serialize, Deserialize, sqlx::FromRow)]
pub struct GameType {
    pub id: u32,
    pub name: String,
    pub display_name: String,
    pub max_players: u8,
    pub rules_json: Option<Value>,
}

/// Sitzung aus `game_sessions`, ergaenzt um `game_types.name`.
///
/// Die Zusatzfelder liegen in `metadata_json` (Pausen, Abbruchgrund, Sieger,
/// Beispiel- und Ad-hoc-Kennzeichen) und werden beim Lesen mit
/// `JSON_EXTRACT` herausgezogen. Die Zeitstempel kommen als Text mit `Z`
/// (`DATE_FORMAT`), weil die Spalten `DATETIME` sind: MySQL kennt keine
/// Zeitzone, und der Browser wuerde die UTC-Zeit sonst als Ortszeit lesen.
#[derive(Debug, Serialize, Deserialize, sqlx::FromRow)]
pub struct Session {
    pub id: u64,
    /// Technische Kennung des Spieltyps; die Wertung liegt je Spiel.
    pub game_type_id: u32,
    pub game_type: String,
    pub host_id: Option<u64>,
    /// `win`, `draw` oder `aborted`; `None`, solange die Sitzung laeuft.
    pub outcome: Option<String>,
    /// `red` oder `yellow` bei `win`. `winner_id` bleibt NULL, solange es
    /// keinen Login gibt (chk_session_winner erlaubt das ausdruecklich).
    pub winner_side: Option<String>,
    pub started_at: String,
    pub finished_at: Option<String>,
    pub duration_ms: Option<u64>,
    /// Beginn der laufenden Pause, Ende der abgeschlossenen Pausen in ms.
    pub paused_at: Option<String>,
    pub paused_ms: i64,
    /// `host` oder `surrender`.
    pub abort_reason: Option<String>,
    pub surrendered_by: Option<u64>,
    /// 1 = Beispieldatensatz aus 20251007000001_seed_demo_session.sql.
    pub demo: i64,
    /// 1 = ohne gehostete Sitzung gespielt (`/play` ohne Sitzung).
    pub ad_hoc: i64,
    /// 1 = Freundschaftsspiel (`metadata_json.friendly`), aendert keine Wertung.
    pub friendly: i64,
    /// Rohes `metadata_json`, unveraendert. Die API gibt die Einzelfelder
    /// stattdessen flach aus (`session_json`); die Schreibrouten brauchen
    /// aber den Originalwert, um den sie nicht zerstoerte Angaben zu ergaenzen.
    pub metadata_json: Option<serde_json::Value>,
}

/// Zeile aus `game_session_players`. Sitzplatz 0 ist `red`, Sitzplatz 1
/// `yellow` - die Reihenfolge steckt in `seat_index`.
#[derive(Debug, Serialize, Deserialize, sqlx::FromRow)]
pub struct SessionPlayer {
    pub session_id: u64,
    pub seat_index: u8,
    /// NULL = anonymer Platz (Partie ohne Sitzung).
    pub user_id: Option<u64>,
    pub side: Option<String>,
}

/// Zeile aus `player_ratings`, ergaenzt um Name und Rolle aus `users`.
#[derive(Debug, Serialize, Deserialize, sqlx::FromRow)]
pub struct PlayerRating {
    pub user_id: u64,
    pub username: String,
    pub role: String,
    pub rating: i32,
    // `COALESCE(r.games_played, 0)` liefert in MySQL den Typ BIGINT, daher i64.
    pub games_played: i64,
    pub wins: i64,
    pub losses: i64,
    pub draws: i64,
    /// `2026-11-09T12:00:00Z`.
    pub updated_at: String,
}

/// Freund:in einer Person aus `users`.
#[derive(Debug, Serialize, Deserialize, sqlx::FromRow)]
pub struct Friend {
    pub id: u64,
    pub username: String,
    pub role: String,
    /// `2026-11-10T12:00:00Z`; Zeitpunkt der Annahme.
    pub since: String,
}

/// Offene oder abgelehnte Anfrage samt der beteiligten Person.
#[derive(Debug, Serialize, Deserialize, sqlx::FromRow)]
pub struct FriendRequestRow {
    pub id: u64,
    /// Bei eingehenden Anfragen die Person, die gefragt hat; bei ausgehenden
    /// die Person, die gefragt wurde.
    pub user_id: u64,
    pub username: String,
    pub role: String,
    pub message: Option<String>,
    pub created_at: String,
}

/// Zeile aus `player_reports`.
#[derive(Debug, Serialize, Deserialize, sqlx::FromRow)]
pub struct PlayerReport {
    pub id: u64,
    pub reporter_id: Option<u64>,
    pub reported_user_id: u64,
    pub session_id: Option<u64>,
    pub reason: String,
    pub details: Option<String>,
    pub status: String,
    pub admin_note: Option<String>,
    pub reviewed_by: Option<u64>,
    pub created_at: NaiveDateTime,
    pub updated_at: NaiveDateTime,
    pub reviewed_at: Option<NaiveDateTime>,
}

/// Zeile aus `moves`.
///
/// `payload` ist bei Connect Four `{"col": x, "row": y, "side": "red"}`. Die
/// uebrigen Spalten (Kamera-Bezug, Konfidenz) gehoeren zur Spielererkennung und
/// werden von den Routen hier noch nicht gefuellt.
#[derive(Debug, Serialize, Deserialize, sqlx::FromRow)]
pub struct GameMove {
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
