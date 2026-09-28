pub mod User;
pub mod Game;
pub mod Games;
pub mod Player;

mod api;
mod db;

pub enum GamesNames {
    ConnectFour,
    TTT
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    dotenvy::dotenv().ok();

    let url = std::env::var("DATABASE_URL")
        .map_err(|_| anyhow::anyhow!("DATABASE_URL fehlt - siehe backend/.env.example"))?;

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
