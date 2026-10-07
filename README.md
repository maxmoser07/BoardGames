# BoardGames

Sitzungen fuer Brettspiele hosten, Spielfelder in eigenen Fenstern oeffnen und
Spielverlaeufe sammeln. Connect Four ist die erste umgesetzte Partie, das
Datenmodell ist bereits Spielunabhaengig.

```
BoardGames/
  frontend/                  React-/Vite-Oberflaeche (siehe frontend/README.md)
    Dockerfile               Bau (Vite) und Auslieferung (nginx)
    nginx.conf               statische Dateien, SPA-Fallback, /api-Proxy
  backend/                   Rust-API mit axum, Datenbankzugriff mit sqlx
    Dockerfile               Release-Binary und schlankes Laufzeit-Image
    migrations/              ausfuehrbares MySQL-Schema, einzige Quelle
    src/                     API-Routen, DB-Zeilen, Domänenmodelle
  docker-compose.yml         MySQL + API + Oberflaeche
  docker-compose.dev.yml     Ueberlagerung mit gemountetem Quelltext
  .env.example               Ports und Datenbank-Zugangsdaten fuer Compose
  scripts/api-smoke.ps1      Durchlauf durch alle API-Routen
  package.json               Startskripte fuer beide Teile (siehe unten)
```

## Schnellstart: Docker

Nach dem Klonen genuegt dieser eine Befehl:

```bash
docker compose up -d --build
```

Danach laeuft die Oberflaeche auf **http://localhost:5173**. Im Browser solltest
du den Katalog mit „Vier Gewinnt“ sehen, unter „Sitzungen“ eine Beispielpartie
und oben vier Personen zum Auswaehlen - das kommt alles aus den Migrationen,
nicht aus dem Browser.

| Adresse                          | Inhalt                                      |
| -------------------------------- | ------------------------------------------- |
| http://localhost:5173            | Oberflaeche, nginx liefert `frontend/dist`  |
| http://localhost:3000/api/health | API direkt (json)                           |
| 127.0.0.1:3306                   | MySQL fuer SQL-Clients                       |

Voraussetzung ist nur Docker: Desktop oder die Engine mit Compose **V2**, also
das `docker compose`-Kommando (`docker-compose` ohne Leerzeichen geht nicht).
Pruefen mit `docker compose version`. Ein lokales Node, Rust oder MySQL wird
nicht gebraucht.

Der erste Build dauert einige Minuten: das Backend kompiliert die Rust-
Abhaengigkeiten, das Frontend holt die npm-Pakete. Danach ist ein Image in
wenigen Sekunden neu gebaut.

### Laeuft es?

```bash
docker compose ps                      # alle drei muessen "healthy" zeigen
curl http://localhost:3000/api/health  # {"status":"ok"}
```

Beim allerersten Start auf einem frischen Volume passiert das in dieser
Reihenfolge:

1. `db` startet MySQL, legt Datenbank und Benutzer selbst an (`MYSQL_*` in
   `docker-compose.yml`) und wartet, bis es healthy ist.
2. `backend` startet, verbindet sich und fuehrt die Migrationen aus: Schema,
   vier Beispielpersonen, eine Beispielpartie.
3. `frontend` startet nginx und reicht `/api` an `backend:3000` weiter.

Die Datenbank ist also nie leer, sondern enthaelt genau das, was in
`backend/migrations/` steht.

### Ports muessen frei sein

5173, 3000 und 3306 werden auf dem Host belegt. **5173 kollidiert mit einem
laufenden `npm run dev`** - dann antwortet der Dev-Server statt des Containers.
Ports und Zugangsdaten stehen in `.env`, die Vorlage ist `.env.example` und
optional:

```bash
cp .env.example .env          # Windows: copy .env.example .env
# darin z. B. FRONTEND_PORT=5180 setzen, dann:
docker compose up -d
```

### Alltag

| Befehl                           | Wirkung                                     |
| -------------------------------- | ------------------------------------------- |
| `docker compose up -d`           | starten, auch nach einer Aenderung an `.env` |
| `docker compose ps`              | Status und Ports                            |
| `docker compose logs -f`         | Logs aller drei Container                  |
| `docker compose logs -f backend` | nur das Backend                              |
| `docker compose down`            | stoppen, die Datenbank bleibt               |
| `docker compose down -v`         | stoppen **und** Datenbank loeschen          |

Dieselben Befehle gibt es als npm-Skripte: `docker:up`, `docker:ps`,
`docker:logs`, `docker:down` und `docker:db:reset`.

Die Datenbank liegt im Volume `db-data` und ueberlebt `docker compose down`.
Weg damit ist sie nur ueber `down -v` oder `docker:db:reset` - danach legt
der naechste Start sie samt Migrationen neu an.

### Wenn etwas klemmt

* **Ein Container startet nicht.** `docker compose logs <name>` ansehen. Der
  haeufigste Grund ist ein belegter Port (siehe oben).
* **Die Oberflaeche meldet „Das Backend ist nicht erreichbar“.** Dann laeuft
  `backend` nicht: `docker compose ps` und `docker compose logs backend`.
* **„Es laeuft bereits eine Partie“.** Es ist noch eine offene Sitzung da. Unter
  `/sessions` anzeigen und dort beenden, oder `docker compose exec db mysql
  -uboardgames -pboardgames boardgames -e "DELETE FROM game_sessions WHERE
  outcome IS NULL;"`.
* **Neu aufsetzen.** `docker compose down -v && docker compose up -d` loescht
  die Datenbank und legt sie mit den Migrationen neu an.

## Wie es im Container aussieht

* `backend/Dockerfile` baut mit `cargo build --release --locked`, legt das
  Ergebnis auf `debian:bookworm-slim` und startet danach als Benutzer
  `boardgames` (uid 10001), nicht als root. Der Healthcheck fragt
  `/api/health`.
* `frontend/Dockerfile` baut mit `npm ci` und `npm run build` (`tsc -b &&
  vite build`) und liefert `dist/` ueber nginx aus. Build-Variablen gibt es
  keine: das Frontend ruft ausschliesslich relative `/api`-Pfade.
* Beide Images legen erst die Abhaengigkeiten und dann den Code an, sodass
  `docker compose build backend` nach einer Codeaenderung nicht den ganzen
  Dependency-Stack neu kompiliert.
* `backend/target/` ist zwar eingecheckt, `.dockerignore` schliesst es aber aus
  - sonst waere es Teil jedes Build-Kontexts.

## Entwicklung mit Docker

`docker-compose.dev.yml` legt sich ueber `docker-compose.yml`: gemounteter
Quelltext, Vite-Dev-Server mit HMR statt nginx, `cargo run` statt
Release-Binary. Die Adresse bleibt http://localhost:5173.

```bash
npm run docker:dev
```

Zwei Einschraenkungen. `cargo watch` laeuft nicht im Container, Aenderungen an
`backend/src` wirken erst nach `docker compose restart backend`. Und weil
Docker auf Windows keine Datei-Events liefert, pollt der Vite-Server
(`CHOKIDAR_USEPOLLING` in der Override). Fuer den Editierzyklus auf dem Host
bleibt `npm run dev:all` die schnellere Wahl.

## Ohne Docker

Dann laeuft alles direkt auf dem Rechner, und diese Werkzeuge brauchst du:

| Tool       | Version                                    |
| ---------- | ------------------------------------------ |
| Node.js    | 20 oder neuer (entwickelt mit 24)          |
| Rust       | edition 2024, also 1.85 oder neuer         |
| MySQL      | 8.0.16 oder neuer (CHECK-Constraints)      |

## Einmalig einrichten

Die folgenden drei Schritte gelten nur ohne Docker. Mit
`docker compose up -d` fallen sie weg: die Container bauen, starten und
initialisieren sich selbst.

### 1. Datenbank anlegen

`backend/migrations/` erzeugt die *Tabellen*, nicht die Datenbank selbst und
keinen Benutzer. Beides muss einmal von Hand passen:

```sql
CREATE DATABASE boardgames CHARACTER SET utf8mb4;
CREATE USER 'boardgames'@'127.0.0.1' IDENTIFIED BY 'boardgames';
GRANT ALL PRIVILEGES ON boardgames.* TO 'boardgames'@'127.0.0.1';
FLUSH PRIVILEGES;
```

### 2. Konfiguration anlegen

```bash
cp backend/.env.example backend/.env
```

`backend/.env` wird von `dotenvy` zur Laufzeit gelesen und ist über `.gitignore`
ausgeschlossen:

```
DATABASE_URL=mysql://boardgames:boardgames@127.0.0.1:3306/boardgames
BIND_ADDR=127.0.0.1:3000
```

### 3. Abhängigkeiten

```bash
npm run setup
```

Installiert die Skripte im Wurzelverzeichnis (`concurrently`) und die
Pakete in `frontend/`.

## Starten

Mit Docker: `docker compose up -d --build`, dazu der Abschnitt weiter oben.

Ohne Docker drei Terminals, oder eines mit allem:

```bash
npm run backend    # http://127.0.0.1:3000, fuehrt die Migrationen aus
npm run dev        # http://localhost:5173
npm run dev:all    # beides parallel in einem Terminal
```

`npm run dev:all` startet das Backend nur, wenn Rust und MySQL laufen. Fehlt
beides, startet ausschliesslich das Frontend.

### Das Frontend braucht das Backend

Der Dev-Server leitet `/api` an `BACKEND_URL` weiter, standardmaessig an
`http://127.0.0.1:3000`; hinter nginx laeuft derselbe Pfad ohne Proxy.

Ohne Backend zeigt die Oberflaeche in jeder Ansicht einen Fehler und legt
nichts an. Das ist Absicht: die Daten liegen in MySQL, nicht im localStorage.
Ein stiller Rueckfall auf den Browser wuerde Datensaetze erzeugen, die nur auf
einem Rechner existieren und beim naechsten Start verschwunden waeren.

Die einzige lokale Zustandsangabe bleibt, wer gerade als wer eingeloggt ist
(`usePersistentState`) - da gibt es noch keinen Login.

## API

Alle Routen werden von `frontend/src/lib/api.ts` benutzt, das ist der einzige
Datenzugriff der Oberflaeche:

| Methode | Route                                   | Zweck                                  |
| ------- | --------------------------------------- | -------------------------------------- |
| GET     | `/api/health`                           | DB-Verbindung pruefen                  |
| GET     | `/api/users`                            | Beispielpersonen aus `users`           |
| GET     | `/api/games`                            | Spieltypen aus `game_types`            |
| GET     | `/api/sessions`                         | gehostete Sitzungen, neueste zuerst    |
| POST    | `/api/sessions`                         | Sitzung anlegen, zwei Plaetze belegen  |
| GET     | `/api/sessions/{id}`                    | eine Sitzung                           |
| POST    | `/api/sessions/{id}/pause`              | Pause in `metadata_json` vermerken     |
| POST    | `/api/sessions/{id}/resume`             | Pause abschliessen, Pausenzeit addieren |
| POST    | `/api/sessions/{id}/abort`              | Sitzung abbrechen                      |
| POST    | `/api/sessions/{id}/surrender`          | Aufgabe, Gegner gewinnt                |
| POST    | `/api/connect-four/games`               | Partie speichern, Sitzung schliessen   |
| GET     | `/api/connect-four/games`               | alle Verlaeufe                         |
| GET     | `/api/connect-four/games/{session_id}`  | eine Partie                            |
| DELETE  | `/api/demo-data`                        | Beispielpartie loeschen                |

Die Zustaende ohne eigene Spalte liegen in `game_sessions.metadata_json`:
`paused_at`, `paused_ms`, `abort_reason`, `surrendered_by`, `winner_side` sowie
die Kennzeichen `demo` und `ad_hoc`. Eine gehostete Partie ist dieselbe Zeile wie
ihre Sitzung - `POST /api/connect-four/games` schliesst sie, statt eine zweite
Sitzung anzulegen. Partien aus `/play` ohne Sitzung bekommen eine eigene Zeile
mit `ad_hoc`.

## Pruefen

```bash
npm test                    # Router, Ableitungen, Ergebnis-Pruefung (Node, ohne Browser)
npm run lint                # eslint inkl. React-Compiler-Regeln
npm run build               # tsc -b && vite build -> frontend/dist/
npm run backend:check       # cargo check
docker compose config       # beide Compose-Dateien gegenpruefen
docker compose build        # beide Images bauen, ohne zu starten
cargo test                  # Brettpruefung und Metadaten-Helfer (im Backend)
```

`npm test`, `npm run lint` und `npm run build` laufen unveraendert auch im
Container. `npm run backend:check` braucht dort das `dev`-Target des
Backend-Dockerfiles, sonst wird nur das Release-Binary gebaut.

Fuer die Routen gibt es einen Durchlauf gegen den laufenden Stack, der jeden
Erfolgspfad und den Fehlerpfad daneben abklappert und seine Testdaten wieder
entfernt:

```bash
powershell -ExecutionPolicy Bypass -File scripts/api-smoke.ps1
```

## Schema aendern

Ausschliesslich neue Dateien unter `backend/migrations/` anlegen, im Format
`<timestamp>_<beschreibung>.sql`. Bereits angewandte Migrationen werden nicht
angefasst: sqlx speichert deren Pruefsummen und verweigert den Start, wenn sie
sich aendern. Fuer die Tabellenstruktur, die Einschraenkungen und den
Rust-Abgleich siehe die Kommentare in
`backend/migrations/20250101000000_init_schema.sql`.

## Bekannte Grenzen

* **Kein Login.** "Angemeldet als" waehlt eine der vier Beispiel-Personen aus
  `backend/migrations/20251007000000_seed_users.sql`; `password_hash` ist dort nur
  ein Platzhalter, es wird sich nie angemeldet. Die Rechtepruefung aus
  `v_user_permissions` wird erst mit dem Login scharf.
* **Eine offene Sitzung zur Zeit.** `POST /api/sessions` lehnt ab, wenn bereits
  eine laeuft (`outcome IS NULL`). Das entspricht der Regel der Oberflaeche,
  gilt aber fuer alle zusammen und nicht je Person.
* **`website/boardgames/`** war ein veraltetes Duplikat des Frontends und wurde
  nach `frontend/` verschoben. Das Original steckt in der Git-Historie. Was noch
  davon da ist, ist ein alter `dist/`-Ordner, also Ausgabe und kein eigenes
  Programm - deshalb bekommt er keinen Container.
* **`backend/target/`** ist eingecheckt. Das ist Build-Ausgabe und gehoert nicht
  ins Repository, wurde aber bewusst nicht entfernt. Die Dockerfiles schliessen
  das Verzeichnis ueber `.dockerignore` aus, sonst waere es Teil jedes
  Build-Kontexts.
* **Kein TLS im Container.** nginx laeuft auf Port 80 ohne Zertifikat; fuer eine
  oeffentliche Instanz gehoert ein Reverse Proxy davor.
* Farben und Rollen stehen in `game_session_players.side`, nicht in festen
  Spalten: Rot ist Sitzplatz 0, Gelb Sitzplatz 1.