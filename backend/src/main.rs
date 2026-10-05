use anyhow::Context;

// Noch nicht an die API angebunden - Warnungen fuer ungenutzten Code
// bis dahin ausblenden.
#[allow(dead_code)]
mod user;
#[allow(dead_code)]
mod game;
#[allow(dead_code)]
mod games;
#[allow(dead_code)]
mod player;

mod api;
mod db;

#[allow(dead_code)]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum GamesNames {
    ConnectFour,
    TTT,
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    dotenvy::dotenv().ok();

    let url = std::env::var("DATABASE_URL").context(
        "DATABASE_URL is not set - copy backend/.env.example to backend/.env",
    )?;

    let pool = sqlx::mysql::MySqlPoolOptions::new()
        .max_connections(5)
        .connect(&url)
        .await?;

    sqlx::migrate!().run(&pool).await?;

    let app = api::router()
        .layer(tower_http::cors::CorsLayer::permissive())
        .with_state(pool);

    let addr = std::env::var("BIND_ADDR").unwrap_or_else(|_| "127.0.0.1:3000".to_string());
    let listener = tokio::net::TcpListener::bind(&addr).await?;
    println!("horcht auf http://{addr}");

    axum::serve(listener, app).await?;
    Ok(())
}