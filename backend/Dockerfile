# syntax=docker/dockerfile:1
#
# BoardGames-Backend (Rust, axum, sqlx/MySQL).
#
# Bauen:  docker compose build backend
# Starten: docker compose up -d backend
#
# Edition 2024 setzt Rust 1.85 voraus, deshalb das Image "rust:1-bookworm".
# sqlx laeuft mit rustls (tls-rustls-ring), OpenSSL wird nicht gebraucht.

# ---------------------------------------------------------------------------
# Build
# ---------------------------------------------------------------------------
FROM rust:1-bookworm AS builder

WORKDIR /usr/src/app

# Abhaengigkeiten zuerst und in einem eigenen Layer: aendert sich nur Code,
# bleibt der kompilierte Dependency-Stack im Cache.
COPY Cargo.toml Cargo.lock ./
RUN mkdir -p src \
    && echo 'fn main() {}' > src/main.rs \
    && cargo build --release --locked \
    && rm -rf src

# sqlx::migrate!() bindet die Migrationen zur Bauzeit ein (migrations/ muss da
# sein, wird zur Laufzeit aber aus der Binary gelesen, nicht als Datei).
COPY migrations ./migrations
COPY src ./src

# Der Platzhalter-Build wird verworfen, der echte ueberschreibt ihn.
RUN touch src/main.rs \
    && cargo build --release --locked \
    && install -m 0755 target/release/BoardGames /usr/local/bin/boardgames

# ---------------------------------------------------------------------------
# Laufzeit
# ---------------------------------------------------------------------------
FROM debian:bookworm-slim AS runtime

# curl nur fuer den Healthcheck, ca-certificates fuer HTTPS-Ausgaenge (z. B.
# spaeeter OAuth oder Abrechnung).
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --system --create-home --uid 10001 boardgames

COPY --from=builder /usr/local/bin/boardgames /usr/local/bin/boardgames

# 0.0.0.0, sonst ist der Port nur im Container erreichbar.
ENV BIND_ADDR=0.0.0.0:3000
EXPOSE 3000
USER boardgames

# /api/health fragt die DB-Verbindung ab (backend/src/api.rs).
HEALTHCHECK --interval=10s --timeout=3s --start-period=20s --retries=5 \
    CMD curl -fsS http://127.0.0.1:3000/api/health || exit 1

ENTRYPOINT ["/usr/local/bin/boardgames"]

# ---------------------------------------------------------------------------
# Entwicklung: Quelltext gemountet, cargo baut beim Start.
# Verwendet compose.dev.yml - nicht fuer den Regelbetrieb.
# ---------------------------------------------------------------------------
FROM builder AS dev

ENV BIND_ADDR=0.0.0.0:3000 \
    CARGO_TERM_COLOR=never
WORKDIR /usr/src/app
EXPOSE 3000

CMD ["cargo", "run", "--locked"]
