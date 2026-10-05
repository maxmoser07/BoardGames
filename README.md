# BoardGames

Sitzungen fuer Brettspiele hosten, Spielfelder in eigenen Fenstern oeffnen und
Spielverlaeufe sammeln. Connect Four ist die erste umgesetzte Partie, das
Datenmodell ist bereits Spielunabhaengig.

```
BoardGames/
  frontend/          React-/Vite-Oberflaeche (siehe frontend/README.md)
  backend/           Rust-API mit axum, Datenbankzugriff mit sqlx
    migrations/      ausfuehrbares MySQL-Schema, einzige Quelle
    src/             API-Routen, DB-Zeilen, Domänenmodelle
  package.json       Startskripte fuer beide Teile (siehe unten)
```

## Voraussetzungen

| Tool       | Version                                    |
| ---------- | ------------------------------------------ |
| Node.js    | 20 oder neuer (entwickelt mit 24)          |
| Rust       | edition 2024, also 1.85 oder neuer         |
| MySQL      | 8.0.16 oder neuer (CHECK-Constraints)      |

## Einmalig einrichten

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

Drei Terminals, oder eines mit allem:

```bash
npm run backend    # http://127.0.0.1:3000, fuehrt die Migrationen aus
npm run dev        # http://localhost:5173
npm run dev:all    # beides parallel in einem Terminal
```

`npm run dev:all` startet das Backend nur, wenn Rust und MySQL laufen. Fehlt
beides, startet ausschliesslich das Frontend.

### Das Frontend laeuft auch ohne Backend

Der Dev-Server leitet `/api` an `BACKEND_URL` weiter, standardmaessig an
`http://127.0.0.1:3000`. Ohne laufendes Backend beantwortet
`frontend/src/lib/gameResultBridge.ts` genau die eine Anfrage, die das Brett
selbst stellt (`POST /api/connect-four/games`), lokal aus `localStorage`. Alle
uebrigen Routen aus `lib/api.ts` sind erst mit Backend aktiv.

## API

Das Backend liefert derzeit drei Routen:

| Methode | Route                                  | Zweck                            |
| ------- | -------------------------------------- | -------------------------------- |
| GET     | `/api/health`                          | DB-Verbindung pruefen            |
| POST    | `/api/connect-four/games`              | beendete Partie speichern        |
| GET     | `/api/connect-four/games/{session_id}` | eine Partie zuruecklesen         |

`frontend/src/lib/api.ts` ist auf zehn Routen zugeschnitten (Sitzungen,
Benutzer, Spieltypen, Abbruch, Aufgabe). Die fehlenden Routen sind der naechste
Schritt; die Oberflaeche ruft ausschliesslich ueber `api` darauf zu.

## Pruefen

```bash
npm test                    # Router, Ableitungen, Ergebnis-Pruefung (Node, ohne Browser)
npm run lint                # eslint inkl. React-Compiler-Regeln
npm run build               # tsc -b && vite build -> frontend/dist/
npm run backend:check       # cargo check
```

## Schema aendern

Ausschliesslich neue Dateien unter `backend/migrations/` anlegen, im Format
`<timestamp>_<beschreibung>.sql`. Bereits angewandte Migrationen werden nicht
angefasst: sqlx speichert deren Pruefsummen und verweigert den Start, wenn sie
sich aendern. Fuer die Tabellenstruktur, die Einschraenkungen und den
Rust-Abgleich siehe die Kommentare in
`backend/migrations/20250101000000_init_schema.sql`.

## Bekannte Grenzen

* **Kein Login.** "Angemeldet als" waehlt eine der Beispiel-Personen; die
  Rechtepruefung aus `v_user_permissions` wird erst mit dem Backend scharf.
* **`website/boardgames/`** war ein veraltetes Duplikat des Frontends und wurde
  nach `frontend/` verschoben. Das Original steckt in der Git-Historie.
* **`backend/target/`** ist eingecheckt. Das ist Build-Ausgabe und gehoert nicht
  ins Repository, wurde aber bewusst nicht entfernt.
* Farben und Rollen stehen in `game_session_players.side`, nicht in festen
  Spalten: Rot ist Sitzplatz 0, Gelb Sitzplatz 1.