use chrono::NaiveDateTime;
use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};

/// Zeile aus `users`, wie `GET /api/users` sie ausliefert.
///
/// `password_hash` bleibt in der Datenbank und kommt nicht ins JSON; es gibt
/// noch keinen Login (siehe 20251007000000_seed_users.sql).
#[derive(Debug, Serialize, Deserialize, sqlx::FromRow)]
pub struct User {
    pub id: u64,
    pub username: String,
    pub role: String,
}

/// Zeile aus `game_types`. Regeln, Texte und Vorschaubilder stehen weiterhin im
/// Frontend (`lib/gameTypes.ts`), die Datenbank liefert die technischen Spalten.
#[derive(Debug, Serialize, Deserialize, sqlx::FromRow)]
pub struct GameType {
    pub id: u32,
    pub name: String,
    pub display_name: String,
    pub max_players: u8,
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
