//! Anmeldung ueber Google und GitHub (OAuth 2.0, Authorization Code Flow).
//!
//! Ablauf:
//!
//!   1. Der Browser oeffnet `/api/auth/oauth/{provider}/start`. Das Backend
//!      legt einen einmaligen `state` in `oauth_login_states` ab und leitet zum
//!      Anbieter weiter.
//!   2. Der Anbieter fragt nach der Zustimmung und schickt den Browser mit
//!      `code` und `state` an `/api/auth/oauth/{provider}/callback` zurueck.
//!   3. Das Backend tauscht den Code gegen ein Anbieter-Token, liest das Profil,
//!      findet oder legt das Konto an und leitet zur Oberflaeche weiter.
//!
//! Das Anmelde-Token der App steht danach im URL-Fragment
//! (`/auth/callback#token=…`). Fragmente werden nicht an Server und Proxys
//! geschickt und von der Oberflaeche sofort aus der Adresszeile entfernt.
//!
//! Konfiguration (siehe `backend/.env.example`):
//!
//!   GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET
//!   GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET
//!   OAUTH_REDIRECT_BASE  Basis der Callback-URL, Standard http://localhost:3000
//!   FRONTEND_URL         Ziel der Weiterleitung, Standard http://localhost:5173

use std::time::Duration;

use axum::extract::{Path, Query, State};
use axum::response::{IntoResponse, Redirect, Response};
use axum::routing::get;
use axum::{Json, Router};
use chrono::Utc;
use rand::RngCore;
use serde::Deserialize;
use serde_json::json;
use sqlx::mysql::MySqlPool;
use sqlx::{MySql, Transaction};

use crate::api::{fetch_permissions, issue_token};

/// Einmaliger `state` gilt zehn Minuten - genug fuer die Zustimmung, kurz
/// genug, um vergessene Zeilen nicht lange aufzubewahren.
const STATE_TTL_MINUTES: i64 = 10;

/// Grenze fuer `redirect_path`; laengere Pfade sind in dieser App nicht sinnvoll.
const MAX_REDIRECT_LEN: usize = 255;

pub fn routes() -> Router<MySqlPool> {
    Router::new()
        .route("/api/auth/oauth/status", get(status))
        .route("/api/auth/oauth/{provider}/start", get(start))
        .route("/api/auth/oauth/{provider}/callback", get(callback))
}

/// `/api/auth/oauth/status`
///
/// Die Oberflaeche fragt das beim Laden der Anmeldung ab und zeigt nur
/// Anbieter an, die auf dem Server wirklich konfiguriert sind. Die Route ist
/// oeffentlich und nennt keine Geheimnisse, nur ob die Variablen gesetzt sind.
async fn status() -> Json<serde_json::Value> {
    Json(json!({
        "google": provider_configured("google"),
        "github": provider_configured("github"),
    }))
}

fn provider_configured(key: &str) -> bool {
    let prefix = match key {
        "google" => "GOOGLE",
        "github" => "GITHUB",
        _ => return false,
    };
    !var(&format!("{prefix}_CLIENT_ID")).is_empty()
        && !var(&format!("{prefix}_CLIENT_SECRET")).is_empty()
}

/* ------------------------------------------------------------------ Anbieter */

/// Gemeinsame Angaben eines OAuth-Anbieters. `key` ist gleichzeitig der Pfad
/// (`/api/auth/oauth/google/...`) und das Praefix der Umgebungsvariablen.
struct Provider {
    key: String,
    display_name: &'static str,
    client_id: String,
    client_secret: String,
    authorize_url: &'static str,
    token_url: &'static str,
    scope: &'static str,
}

fn provider(key: &str) -> Result<Provider, String> {
    let (display_name, authorize_url, token_url, scope, prefix) = match key {
        "google" => (
            "Google",
            "https://accounts.google.com/o/oauth2/v2/auth",
            "https://oauth2.googleapis.com/token",
            "openid email profile",
            "GOOGLE",
        ),
        "github" => (
            "GitHub",
            "https://github.com/login/oauth/authorize",
            "https://github.com/login/oauth/access_token",
            "read:user user:email",
            "GITHUB",
        ),
        _ => return Err("Unknown sign-in provider.".to_string()),
    };

    let client_id = var(&format!("{prefix}_CLIENT_ID"));
    let client_secret = var(&format!("{prefix}_CLIENT_SECRET"));
    if client_id.is_empty() || client_secret.is_empty() {
        eprintln!(
            "oauth: {display_name} is not configured ({prefix}_CLIENT_ID / {prefix}_CLIENT_SECRET)"
        );
        return Err(format!(
            "{display_name} sign-in is not configured yet. Add {prefix}_CLIENT_ID and {prefix}_CLIENT_SECRET to backend/.env."
        ));
    }

    Ok(Provider {
        key: key.to_string(),
        display_name,
        client_id,
        client_secret,
        authorize_url,
        token_url,
        scope,
    })
}

fn var(name: &str) -> String {
    std::env::var(name).unwrap_or_default().trim().to_string()
}

fn redirect_base() -> String {
    let base = var("OAUTH_REDIRECT_BASE");
    let base = if base.is_empty() {
        "http://localhost:3000".to_string()
    } else {
        base
    };
    base.trim_end_matches('/').to_string()
}

fn frontend_url() -> String {
    let url = var("FRONTEND_URL");
    let url = if url.is_empty() {
        "http://localhost:5173".to_string()
    } else {
        url
    };
    url.trim_end_matches('/').to_string()
}

/// Callback-URL beim Anbieter. Muss exakt so in der Anbieter-Konfiguration
/// eingetragen sein; deshalb steht die Basis in `OAUTH_REDIRECT_BASE`.
fn provider_callback(provider: &Provider) -> String {
    format!(
        "{}/api/auth/oauth/{}/callback",
        redirect_base(),
        provider.key
    )
}

/// Ziel nach dem Flow. Werte im Fragment sind prozentkodiert; das Fragment
/// selbst verlaesst den Browser nie.
fn frontend_callback(params: &[(&str, &str)]) -> String {
    let fragment = url::form_urlencoded::Serializer::new(String::new())
        .extend_pairs(params)
        .finish();
    format!("{}/auth/callback#{fragment}", frontend_url())
}

fn failure(message: impl Into<String>) -> Response {
    let message = message.into();
    eprintln!("oauth: {message}");
    Redirect::to(&frontend_callback(&[("error", &message)])).into_response()
}

/* --------------------------------------------------------------- Start-Route */

#[derive(Debug, Deserialize)]
struct StartQuery {
    /// Pfad, zu dem die Oberflaeche nach dem Login zurueckkehrt.
    redirect: Option<String>,
}

/// `/api/auth/oauth/{provider}/start`
async fn start(
    State(pool): State<MySqlPool>,
    Path(key): Path<String>,
    Query(query): Query<StartQuery>,
) -> Response {
    match begin(&pool, &key, query.redirect.as_deref()).await {
        Ok(url) => Redirect::to(&url).into_response(),
        Err(message) => failure(message),
    }
}

async fn begin(pool: &MySqlPool, key: &str, redirect: Option<&str>) -> Result<String, String> {
    let provider = provider(key)?;
    let redirect_path = safe_redirect(redirect);

    sqlx::query("DELETE FROM oauth_login_states WHERE expires_at <= UTC_TIMESTAMP()")
        .execute(pool)
        .await
        .map_err(|e| db_error("cleanup states", e))?;

    let mut bytes = [0u8; 32];
    rand::thread_rng().fill_bytes(&mut bytes);
    let state = hex::encode(bytes);
    let expires = Utc::now() + chrono::Duration::minutes(STATE_TTL_MINUTES);

    sqlx::query(
        "INSERT INTO oauth_login_states (state, provider, redirect_path, expires_at)
         VALUES (?, ?, ?, ?)",
    )
    .bind(&state)
    .bind(&provider.key)
    .bind(&redirect_path)
    .bind(expires.naive_utc())
    .execute(pool)
    .await
    .map_err(|e| db_error("store state", e))?;

    let mut url =
        reqwest::Url::parse(provider.authorize_url).map_err(|e| db_error("parse authorize url", e))?;
    {
        let mut pairs = url.query_pairs_mut();
        pairs.append_pair("client_id", &provider.client_id);
        pairs.append_pair("redirect_uri", &provider_callback(&provider));
        pairs.append_pair("response_type", "code");
        pairs.append_pair("scope", provider.scope);
        pairs.append_pair("state", &state);
        match provider.key.as_str() {
            // Bei Google die Kontoauswahl erzwingen, damit nicht stillschweigend
            // das zuletzt benutzte Konto gewaehlt wird.
            "google" => {
                pairs.append_pair("access_type", "online");
                pairs.append_pair("prompt", "select_account");
            }
            "github" => {
                pairs.append_pair("allow_signup", "true");
            }
            _ => {}
        }
    }

    Ok(url.into())
}

/// Nur interne Pfade sind erlaubt. `//host` wuerde als protokollrelative
/// Adresse zu einer fremden Seite fuehren (Open Redirect).
fn safe_redirect(raw: Option<&str>) -> String {
    match raw {
        Some(value)
            if value.starts_with('/')
                && !value.starts_with("//")
                && value.len() <= MAX_REDIRECT_LEN
                && !value.contains(['\r', '\n']) =>
        {
            value.to_string()
        }
        _ => "/".to_string(),
    }
}

/* ------------------------------------------------------------ Callback-Route */

#[derive(Debug, Deserialize)]
struct CallbackQuery {
    code: Option<String>,
    state: Option<String>,
    error: Option<String>,
    error_description: Option<String>,
}

/// `/api/auth/oauth/{provider}/callback`
async fn callback(
    State(pool): State<MySqlPool>,
    Path(key): Path<String>,
    Query(query): Query<CallbackQuery>,
) -> Response {
    match finish(&pool, &key, query).await {
        Ok((token, redirect_path)) => Redirect::to(&frontend_callback(&[
            ("token", &token),
            ("redirect", &redirect_path),
        ]))
        .into_response(),
        Err(message) => failure(message),
    }
}

async fn finish(
    pool: &MySqlPool,
    key: &str,
    query: CallbackQuery,
) -> Result<(String, String), String> {
    let provider = provider(key)?;

    // `state` zuerst: ohne gueltigen, unbenutzten Wert wird nichts getauscht.
    let state = query
        .state
        .as_deref()
        .filter(|value| !value.is_empty())
        .ok_or_else(|| "The sign-in response is missing its state.".to_string())?;
    let redirect_path = consume_state(pool, &provider, state).await?;

    if let Some(code) = query.error.as_deref().filter(|value| !value.is_empty()) {
        let detail = query
            .error_description
            .as_deref()
            .unwrap_or("The provider cancelled the sign-in.");
        return Err(format!("{detail} ({code})"));
    }

    let code = query
        .code
        .as_deref()
        .filter(|value| !value.is_empty())
        .ok_or_else(|| "The sign-in response is missing its code.".to_string())?;

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(20))
        .user_agent(concat!("BoardGames/", env!("CARGO_PKG_VERSION")))
        .build()
        .map_err(|e| db_error("build http client", e))?;

    let access_token = exchange_code(&client, &provider, code).await?;
    let profile = fetch_profile(&client, &provider, &access_token).await?;
    let user_id = find_or_create_user(pool, &provider, &profile).await?;

    let permissions = fetch_permissions(pool, user_id)
        .await
        .map_err(|e| db_error("load permissions", format!("{e:?}")))?;
    if !permissions.can_write {
        return Err("This account is locked.".to_string());
    }

    let (token, _expires_at) = issue_token(pool, user_id)
        .await
        .map_err(|e| db_error("issue token", format!("{e:?}")))?;
    Ok((token, redirect_path))
}

/// Prueft und entwertet den `state`. Die Bindung an den Anbieter verhindert,
/// dass ein fuer Google ausgestellter Wert bei GitHub eingeloest wird.
async fn consume_state(
    pool: &MySqlPool,
    provider: &Provider,
    state: &str,
) -> Result<String, String> {
    let row = sqlx::query_as::<_, (String, String)>(
        "SELECT provider, redirect_path FROM oauth_login_states
         WHERE state = ? AND expires_at > UTC_TIMESTAMP()",
    )
    .bind(state)
    .fetch_optional(pool)
    .await
    .map_err(|e| db_error("read state", e))?;

    let Some((stored_provider, redirect_path)) = row else {
        return Err("The sign-in request expired or was already used. Please try again.".to_string());
    };

    // Immer loeschen, auch bei falschem Anbieter: der Wert ist verbrannt.
    sqlx::query("DELETE FROM oauth_login_states WHERE state = ?")
        .bind(state)
        .execute(pool)
        .await
        .map_err(|e| db_error("delete state", e))?;

    if stored_provider != provider.key {
        return Err("The sign-in response belongs to a different provider.".to_string());
    }
    Ok(redirect_path)
}

#[derive(Debug, Deserialize)]
struct TokenResponse {
    access_token: Option<String>,
    error: Option<String>,
    error_description: Option<String>,
}

async fn exchange_code(
    client: &reqwest::Client,
    provider: &Provider,
    code: &str,
) -> Result<String, String> {
    let redirect_uri = provider_callback(provider);
    let response = client
        .post(provider.token_url)
        .header("Accept", "application/json")
        .form(&[
            ("client_id", provider.client_id.as_str()),
            ("client_secret", provider.client_secret.as_str()),
            ("code", code),
            ("redirect_uri", redirect_uri.as_str()),
            ("grant_type", "authorization_code"),
        ])
        .send()
        .await
        .map_err(|e| {
            eprintln!("oauth: token request to {}: {e}", provider.display_name);
            format!(
                "Could not reach {}. Please try again.",
                provider.display_name
            )
        })?;

    let status = response.status();
    let body = response.text().await.unwrap_or_default();
    let token: TokenResponse = serde_json::from_str(&body).map_err(|e| {
        eprintln!("oauth: token response from {}: {e}", provider.display_name);
        format!(
            "{} returned an unreadable sign-in response.",
            provider.display_name
        )
    })?;

    if let Some(error) = token.error {
        let detail = token.error_description.unwrap_or(error);
        eprintln!("oauth: {} rejected the code: {detail}", provider.display_name);
        return Err(format!("{} sign-in failed: {detail}", provider.display_name));
    }
    if !status.is_success() {
        eprintln!(
            "oauth: {} token endpoint returned {status}",
            provider.display_name
        );
        return Err(format!(
            "{} rejected the sign-in ({status}).",
            provider.display_name
        ));
    }
    token
        .access_token
        .filter(|value| !value.is_empty())
        .ok_or_else(|| format!("{} did not return an access token.", provider.display_name))
}

/* ------------------------------------------------------------------ Profile */

/// Profil in der Form, die fuer Konto und Verknuepfung gebraucht wird.
struct OAuthProfile {
    provider_user_id: String,
    email: Option<String>,
    /// Nur bestaetigte Adressen duerfen ein bestehendes Konto uebernehmen.
    email_verified: bool,
    username_hint: Option<String>,
}

#[derive(Debug, Deserialize)]
struct GoogleUserInfo {
    sub: String,
    email: Option<String>,
    #[serde(default)]
    email_verified: bool,
    name: Option<String>,
}

#[derive(Debug, Deserialize)]
struct GitHubUser {
    id: u64,
    login: String,
    email: Option<String>,
}

#[derive(Debug, Deserialize)]
struct GitHubEmail {
    email: String,
    #[serde(default)]
    primary: bool,
    #[serde(default)]
    verified: bool,
}

async fn fetch_profile(
    client: &reqwest::Client,
    provider: &Provider,
    access_token: &str,
) -> Result<OAuthProfile, String> {
    match provider.key.as_str() {
        "google" => {
            let info: GoogleUserInfo = get_json(
                client,
                provider,
                "https://openidconnect.googleapis.com/v1/userinfo",
                access_token,
            )
            .await?;
            let email = info.email.filter(|value| !value.is_empty());
            Ok(OAuthProfile {
                username_hint: email
                    .as_deref()
                    .and_then(|value| value.split('@').next())
                    .map(str::to_string)
                    .or(info.name),
                email,
                email_verified: info.email_verified,
                provider_user_id: info.sub,
            })
        }
        "github" => {
            let user: GitHubUser = get_json(
                client,
                provider,
                "https://api.github.com/user",
                access_token,
            )
            .await?;

            // GitHub liefert die oeffentliche Profiladresse nur, wenn sie
            // freigegeben ist. Fuer die Kontoverknuepfung zaehlt aber allein
            // eine bestaetigte Adresse aus `/user/emails`.
            let verified_email = github_email(client, access_token).await;
            Ok(OAuthProfile {
                provider_user_id: user.id.to_string(),
                email: verified_email.clone().or(user.email.filter(|v| !v.is_empty())),
                email_verified: verified_email.is_some(),
                username_hint: Some(user.login),
            })
        }
        _ => Err("Unknown sign-in provider.".to_string()),
    }
}

/// Primaere bestaetigte Adresse; ohne diese die erste bestaetigte. Fehlt der
/// Scope `user:email` oder ist nichts bestaetigt, bleibt das Ergebnis `None`.
async fn github_email(client: &reqwest::Client, access_token: &str) -> Option<String> {
    let response = client
        .get("https://api.github.com/user/emails")
        .header("Accept", "application/vnd.github+json")
        .bearer_auth(access_token)
        .send()
        .await
        .ok()?;
    if !response.status().is_success() {
        eprintln!(
            "oauth: GitHub emails endpoint returned {}",
            response.status()
        );
        return None;
    }
    let emails: Vec<GitHubEmail> = response.json().await.ok()?;
    emails
        .iter()
        .find(|entry| entry.primary && entry.verified)
        .or_else(|| emails.iter().find(|entry| entry.verified))
        .map(|entry| entry.email.clone())
        .filter(|value| !value.is_empty())
}

async fn get_json<T: serde::de::DeserializeOwned>(
    client: &reqwest::Client,
    provider: &Provider,
    url: &str,
    access_token: &str,
) -> Result<T, String> {
    let response = client
        .get(url)
        .header("Accept", "application/json")
        .bearer_auth(access_token)
        .send()
        .await
        .map_err(|e| {
            eprintln!("oauth: profile request to {}: {e}", provider.display_name);
            format!(
                "Could not load your {} profile. Please try again.",
                provider.display_name
            )
        })?;
    if !response.status().is_success() {
        eprintln!(
            "oauth: {} profile endpoint returned {}",
            provider.display_name,
            response.status()
        );
        return Err(format!(
            "{} did not return a profile for this sign-in.",
            provider.display_name
        ));
    }
    response.json().await.map_err(|e| {
        eprintln!("oauth: profile response from {}: {e}", provider.display_name);
        format!(
            "{} returned an unreadable profile.",
            provider.display_name
        )
    })
}

/* ------------------------------------------------------------- Konto anlegen */

/// Sucht die Verknuepfung, uebernimmt ein bestehendes Konto mit derselben
/// bestaetigten Adresse oder legt ein neues Spielerkonto an.
async fn find_or_create_user(
    pool: &MySqlPool,
    provider: &Provider,
    profile: &OAuthProfile,
) -> Result<u64, String> {
    let existing = sqlx::query_scalar::<_, u64>(
        "SELECT user_id FROM oauth_accounts WHERE provider = ? AND provider_user_id = ?",
    )
    .bind(&provider.key)
    .bind(&profile.provider_user_id)
    .fetch_optional(pool)
    .await
    .map_err(|e| db_error("lookup account", e))?;
    if let Some(user_id) = existing {
        return Ok(user_id);
    }

    let mut tx = pool.begin().await.map_err(|e| db_error("begin", e))?;

    // Zweite Pruefung innerhalb der Transaktion: zwischen den beiden Abfragen
    // kann eine parallele Anmeldung die Verknuepfung schon angelegt haben.
    let existing = sqlx::query_scalar::<_, u64>(
        "SELECT user_id FROM oauth_accounts WHERE provider = ? AND provider_user_id = ?",
    )
    .bind(&provider.key)
    .bind(&profile.provider_user_id)
    .fetch_optional(&mut *tx)
    .await
    .map_err(|e| db_error("lookup account", e))?;
    if let Some(user_id) = existing {
        return Ok(user_id);
    }

    let verified_email = profile
        .email
        .as_deref()
        .filter(|_| profile.email_verified)
        .map(str::trim)
        .filter(|value| !value.is_empty());

    if let Some(email) = verified_email {
        let existing = sqlx::query_scalar::<_, u64>("SELECT id FROM users WHERE email = ?")
            .bind(email)
            .fetch_optional(&mut *tx)
            .await
            .map_err(|e| db_error("lookup email", e))?;
        if let Some(user_id) = existing {
            link_account(&mut tx, provider, profile, user_id).await?;
            tx.commit().await.map_err(|e| db_error("commit link", e))?;
            return Ok(user_id);
        }
    }

    let username = unique_username(&mut tx, provider, profile).await?;
    let email = profile
        .email
        .clone()
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| synthetic_email(provider, &profile.provider_user_id));

    // OAuth-Konten haben kein Passwort; `verify_password` akzeptiert nur das
    // Format `sha256$…` und weist diesen Platzhalter damit zuverlaessig ab.
    let password_hash = format!("!oauth:{}:{}", provider.key, profile.provider_user_id);

    let insert = sqlx::query(
        "INSERT INTO users (username, email, password_hash, role) VALUES (?, ?, ?, 'player')",
    )
    .bind(&username)
    .bind(&email)
    .bind(&password_hash)
    .execute(&mut *tx)
    .await
    .map_err(|e| db_error("insert user", e))?;
    let user_id = insert.last_insert_id();

    // Wie bei der Registrierung: jede Person beginnt mit einem Rating.
    sqlx::query("INSERT INTO player_ratings (user_id) VALUES (?)")
        .bind(user_id)
        .execute(&mut *tx)
        .await
        .map_err(|e| db_error("insert rating", e))?;

    link_account(&mut tx, provider, profile, user_id).await?;
    tx.commit().await.map_err(|e| db_error("commit user", e))?;
    Ok(user_id)
}

async fn link_account(
    tx: &mut Transaction<'_, MySql>,
    provider: &Provider,
    profile: &OAuthProfile,
    user_id: u64,
) -> Result<(), String> {
    sqlx::query(
        "INSERT INTO oauth_accounts (user_id, provider, provider_user_id)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE user_id = user_id",
    )
    .bind(user_id)
    .bind(&provider.key)
    .bind(&profile.provider_user_id)
    .execute(&mut **tx)
    .await
    .map_err(|e| db_error("insert account", e))?;
    Ok(())
}

/// Eindeutiger Anzeigename. Zuerst der Wunsch des Anbieters, danach mit der
/// Anbieter-Kennung, zuletzt mit Zufall - so entstehen auch bei gleichen
/// Namen getrennte Konten.
async fn unique_username(
    tx: &mut Transaction<'_, MySql>,
    provider: &Provider,
    profile: &OAuthProfile,
) -> Result<String, String> {
    let base = profile
        .username_hint
        .as_deref()
        .and_then(sanitize_username)
        .unwrap_or_else(|| provider.key.to_string());

    if !username_taken(tx, &base).await? {
        return Ok(base);
    }

    let with_id = truncate(&format!("{base}-{}", profile.provider_user_id), 48);
    if !username_taken(tx, &with_id).await? {
        return Ok(with_id);
    }

    for _ in 0..5 {
        let mut bytes = [0u8; 3];
        rand::thread_rng().fill_bytes(&mut bytes);
        let candidate = truncate(&format!("{base}-{}", hex::encode(bytes)), 48);
        if !username_taken(tx, &candidate).await? {
            return Ok(candidate);
        }
    }

    Err("Could not pick a free username. Please try again.".to_string())
}

async fn username_taken(
    tx: &mut Transaction<'_, MySql>,
    username: &str,
) -> Result<bool, String> {
    let count = sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM users WHERE username = ?")
        .bind(username)
        .fetch_one(&mut **tx)
        .await
        .map_err(|e| db_error("check username", e))?;
    Ok(count > 0)
}

/// Nur Zeichen, die in Benutzernamen ueberall funktionieren. Leerzeichen
/// werden zu Bindestrichen, der Rest faellt weg.
fn sanitize_username(raw: &str) -> Option<String> {
    let mut out = String::new();
    for ch in raw.chars() {
        if ch.is_ascii_alphanumeric() || matches!(ch, '.' | '_' | '-') {
            out.push(ch);
        } else if ch.is_whitespace() && !out.ends_with('-') {
            out.push('-');
        }
        if out.len() >= 32 {
            break;
        }
    }
    let cleaned = out.trim_matches(|c| c == '.' || c == '-' || c == '_');
    if cleaned.is_empty() {
        None
    } else {
        Some(cleaned.to_string())
    }
}

fn truncate(value: &str, max: usize) -> String {
    match value.char_indices().nth(max) {
        Some((index, _)) => value[..index].to_string(),
        None => value.to_string(),
    }
}

/// Platzhalter-Adresse, wenn der Anbieter keine bestaetigte E-Mail liefert.
/// `users.email` ist UNIQUE und NOT NULL, deshalb muss sie stabil und eindeutig
/// sein.
fn synthetic_email(provider: &Provider, provider_user_id: &str) -> String {
    match provider.key.as_str() {
        "github" => format!("{provider_user_id}@users.noreply.github.com"),
        _ => format!("{}-{provider_user_id}@oauth.invalid", provider.key),
    }
}

fn db_error(context: &str, error: impl std::fmt::Display) -> String {
    eprintln!("oauth: {context}: {error}");
    "Sign-in failed. Please try again.".to_string()
}
