# BoardGames

Sitzungen für Brettspiele hosten, Spielfelder in eigenen Fenstern öffnen,
Spielverläufe sammeln und Spieler-Ratings pflegen. Spielbar sind Vier Gewinnt,
Tic Tac Toe, Memory, Schach und Mensch ärgere dich nicht; das Datenmodell ist
spielunabhängig. Während der Partie zeigt das Brett laufend geschätzte
Gewinnchancen und einen Zugtipp; die Bewertung läuft vollständig im Browser.
Dazu kommen eine Webcam-Erkennung für ein physisches Brett samt Live-Feedback
zur Erkennungsqualität und Zuganalyse, Freundschaftsanfragen im Profil und eine
rollenabhängige Oberfläche: Spieler:innen sehen ihr eigenes Rating, Hosts
zusätzlich Sitzungen, Kamera und Rangliste, Admins zusätzlich Meldungen,
Ratings und Benutzerverwaltung.

Dieses README ist die einzige Projektdokumentation und beschreibt Backend,
Frontend, Betrieb, API und Tests.

## Projektstruktur

```
BoardGames/
  frontend/                  React-/Vite-Oberfläche
    Dockerfile               Bau (Vite) und Auslieferung (nginx)
    nginx.conf               statische Dateien, SPA-Fallback, /api-Proxy
    src/                     Ansichten, Komponenten, Hooks und reine Logik
    scripts/                 Tests der reinen Logik und der Kamera-Bibliothek
  backend/                   Rust-API mit axum, Datenbankzugriff mit sqlx
    Dockerfile               Release-Binary und schlankes Laufzeit-Image
    migrations/              ausführbares MySQL-Schema, einzige Quelle
    src/                     API-Routen, DB-Zeilen, Domänenmodelle
  docker-compose.yml         MySQL + API + Oberfläche
  docker-compose.dev.yml     Überlagerung mit gemountetem Quelltext
  .env.example               Ports und Datenbank-Zugangsdaten für Compose
  scripts/api-smoke.ps1      Durchlauf durch alle API-Routen
  package.json               Startskripte für beide Teile (siehe unten)
```

## Schnellstart mit Docker

Nach dem Klonen genügt ein Befehl:

```bash
docker compose up -d --build
```

Danach läuft die Oberfläche auf **http://localhost:5173**. Im Browser erscheint
zuerst die Anmeldung. Die Beispielkonten aus den Migrationen haben alle das
Passwort `password`:

| Konto      | Rolle  | Darf                                                    |
| ---------- | ------ | ------------------------------------------------------- |
| `HostUser` | host   | spielen, eigene Sitzungen anlegen und steuern            |
| `Alice`    | player | nur spielen                                              |
| `Bob`      | player | nur spielen                                              |
| `Mara`     | admin  | alles: Sitzungen, Meldungen, Benutzer, Beispieldaten     |

Nach dem Login erscheint der Katalog mit allen fünf Spielen, unter „Sitzungen“
(als Host/Admin) eine Beispielpartie. Neue Konten über „Konto erstellen“ sind
immer `player`; Rollen vergibt nur die Administration.

Beim Anlegen einer Sitzung wählst du zwischen **Gewertet** und
**Freundschaftsspiel**. Ein Freundschaftsspiel wird mit vollem Verlauf und
Ergebnis gespeichert, verändert aber keine Wertung. Direkt gespielte Partien
aus `/play` sind immer Freundschaftsspiele. Die eigene Elo-Wertung steht im
Profil.

| Adresse                          | Inhalt                                      |
| -------------------------------- | ------------------------------------------- |
| http://localhost:5173            | Oberfläche, nginx liefert `frontend/dist`   |
| http://localhost:3000/api/health | API direkt (JSON)                            |
| 127.0.0.1:3306                   | MySQL für SQL-Clients                        |

Voraussetzung ist nur Docker: Desktop oder die Engine mit Compose **V2**, also
das `docker compose`-Kommando (`docker-compose` ohne Leerzeichen geht nicht).
Prüfen mit `docker compose version`. Ein lokales Node, Rust oder MySQL wird
nicht gebraucht.

Der erste Build dauert einige Minuten: das Backend kompiliert die
Rust-Abhängigkeiten, das Frontend holt die npm-Pakete. Danach ist ein Image in
wenigen Sekunden neu gebaut.

### Läuft es?

```bash
docker compose ps                      # alle drei müssen "healthy" zeigen
curl http://localhost:3000/api/health  # {"status":"ok"}
```

Beim allerersten Start auf einem frischen Volume passiert das in dieser
Reihenfolge:

1. `db` startet MySQL, legt Datenbank und Benutzer selbst an (`MYSQL_*` in
   `docker-compose.yml`) und wartet, bis es healthy ist.
2. `backend` startet, verbindet sich und führt die Migrationen aus: Schema,
   vier Beispielpersonen, eine Beispielpartie.
3. `frontend` startet nginx und reicht `/api` an `backend:3000` weiter.

Die Datenbank ist also nie leer, sondern enthält genau das, was in
`backend/migrations/` steht.

### Ports müssen frei sein

5173, 3000 und 3306 werden auf dem Host belegt. **5173 kollidiert mit einem
laufenden `npm run dev`** – dann antwortet der Dev-Server statt des Containers.
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
| `docker compose up -d`           | starten, auch nach einer Änderung an `.env` |
| `docker compose ps`              | Status und Ports                            |
| `docker compose logs -f`         | Logs aller drei Container                   |
| `docker compose logs -f backend` | nur das Backend                             |
| `docker compose down`            | stoppen, die Datenbank bleibt               |
| `docker compose down -v`         | stoppen **und** Datenbank löschen           |

Dieselben Befehle gibt es als npm-Skripte: `docker:up`, `docker:ps`,
`docker:logs`, `docker:down` und `docker:db:reset`.

Die Datenbank liegt im Volume `db-data` und überlebt `docker compose down`.
Weg damit ist sie nur über `down -v` oder `docker:db:reset` – danach legt der
nächste Start sie samt Migrationen neu an.

### Wenn etwas klemmt

* **Ein Container startet nicht.** `docker compose logs <name>` ansehen. Der
  häufigste Grund ist ein belegter Port (siehe oben).
* **Die Oberfläche meldet „Das Backend ist nicht erreichbar“.** Dann läuft
  `backend` nicht: `docker compose ps` und `docker compose logs backend`.
* **„Es läuft bereits eine Partie“.** Es ist noch eine offene Sitzung da. Als
  Host oder Admin unter `/sessions` anzeigen und dort beenden, oder
  `docker compose exec db mysql -uboardgames -pboardgames boardgames -e "DELETE
  FROM game_sessions WHERE outcome IS NULL;"`.
* **Neu aufsetzen.** `docker compose down -v && docker compose up -d` löscht die
  Datenbank und legt sie mit den Migrationen neu an.

## Wie es im Container aussieht

* `backend/Dockerfile` baut mit `cargo build --release --locked`, legt das
  Ergebnis auf `debian:bookworm-slim` und startet danach als Benutzer
  `boardgames` (uid 10001), nicht als root. Der Healthcheck fragt
  `/api/health`.
* `frontend/Dockerfile` baut mit `npm ci` und `npm run build` (`tsc -b &&
  vite build`) und liefert `dist/` über nginx aus. Build-Variablen gibt es
  keine: das Frontend ruft ausschließlich relative `/api`-Pfade.
* Beide Images legen erst die Abhängigkeiten und dann den Code an, sodass
  `docker compose build backend` nach einer Codeänderung nicht den ganzen
  Dependency-Stack neu kompiliert.
* `backend/target/` ist zwar eingecheckt, `.dockerignore` schließt es aber aus –
  sonst wäre es Teil jedes Build-Kontexts.

## Entwicklung

### Mit Docker

`docker-compose.dev.yml` legt sich über `docker-compose.yml`: gemounteter
Quelltext, Vite-Dev-Server mit HMR statt nginx, `cargo run` statt
Release-Binary. Die Adresse bleibt http://localhost:5173.

```bash
npm run docker:dev
```

Zwei Einschränkungen. `cargo watch` läuft nicht im Container, Änderungen an
`backend/src` wirken erst nach `docker compose restart backend`. Und weil Docker
auf Windows keine Datei-Events liefert, pollt der Vite-Server
(`CHOKIDAR_USEPOLLING` in der Override). Für den Editierzyklus auf dem Host
bleibt `npm run dev:all` die schnellere Wahl.

### Ohne Docker

Dann läuft alles direkt auf dem Rechner, und diese Werkzeuge werden gebraucht:

| Tool       | Version                                    |
| ---------- | ------------------------------------------ |
| Node.js    | 20 oder neuer (entwickelt mit 24)          |
| Rust       | edition 2024, also 1.85 oder neuer         |
| MySQL      | 8.0.16 oder neuer (CHECK-Constraints)      |

#### Einmalig einrichten

Die folgenden drei Schritte gelten nur ohne Docker. Mit
`docker compose up -d` fallen sie weg: die Container bauen, starten und
initialisieren sich selbst.

1. **Datenbank anlegen.** `backend/migrations/` erzeugt die *Tabellen*, nicht die
   Datenbank selbst und keinen Benutzer. Beides muss einmal von Hand passen:

   ```sql
   CREATE DATABASE boardgames CHARACTER SET utf8mb4;
   CREATE USER 'boardgames'@'127.0.0.1' IDENTIFIED BY 'boardgames';
   GRANT ALL PRIVILEGES ON boardgames.* TO 'boardgames'@'127.0.0.1';
   FLUSH PRIVILEGES;
   ```

2. **Konfiguration anlegen.**

   ```bash
   cp backend/.env.example backend/.env
   ```

   `backend/.env` wird von `dotenvy` zur Laufzeit gelesen und ist über
   `.gitignore` ausgeschlossen:

   ```
   DATABASE_URL=mysql://boardgames:boardgames@127.0.0.1:3306/boardgames
   BIND_ADDR=127.0.0.1:3000
   ```

3. **Abhängigkeiten installieren.**

   ```bash
   npm run setup
   ```

   Installiert die Skripte im Wurzelverzeichnis (`concurrently`) und die Pakete
   in `frontend/`.

#### Starten

Mit Docker: `docker compose up -d --build`, dazu der Abschnitt weiter oben.

Ohne Docker drei Terminals, oder eines mit allem:

```bash
npm run backend    # http://127.0.0.1:3000, führt die Migrationen aus
npm run dev        # http://localhost:5173
npm run dev:all    # beides parallel in einem Terminal
```

`npm run dev:all` startet das Backend nur, wenn Rust und MySQL laufen. Fehlt
beides, startet ausschließlich das Frontend.

#### Das Frontend braucht das Backend

Der Dev-Server leitet `/api` an `BACKEND_URL` weiter, standardmäßig an
`http://127.0.0.1:3000`; hinter nginx läuft derselbe Pfad ohne Proxy.

Ohne Backend zeigt die Oberfläche in jeder Ansicht einen Fehler und legt nichts
an. Das ist Absicht: die Daten liegen in MySQL, nicht im localStorage. Ein
stiller Rückfall auf den Browser würde Datensätze erzeugen, die nur auf einem
Rechner existieren und beim nächsten Start verschwunden wären.

Der Browser hält nur das Bearer-Token und das öffentliche Profil der
angemeldeten Person (`frontend/src/lib/auth.ts`); alle Daten liegen in MySQL.
Beim nächsten Laden prüft der Server das Token und die Rechte erneut.

## Rollen und Rechte

Die Rollen stehen in `users.role`, die daraus abgeleiteten Rechte in
`v_user_permissions` (Migration `20261104000000_role_permissions.sql`). Das
Backend liest die Rechte bei **jeder** Anfrage neu aus der Datenbank; Änderungen
an Rolle oder Sperre wirken deshalb ohne neues Token. Zusätzlich prüft jede
schreibende Route die Rolle serverseitig – die Oberfläche blendet nur aus, was
ohnehin verboten wäre.

| Aktion                                   | player        | host             | admin             |
| ---------------------------------------- | ------------- | ---------------- | ----------------- |
| Spielen (auch `/play`)                   | ja            | ja               | ja                |
| Katalog, Spielregeln, eigenes Profil     | ja            | ja               | ja                |
| Sitzungen anlegen                        | nein          | eigene           | alle              |
| Pause/Fortsetzen/Beenden                 | nein          | eigene Sitzung   | alle Sitzungen    |
| Aufgeben                                 | eigener Platz | eigener Platz    | eigener/erzwungen |
| Sitzungsübersicht `/sessions`            | nein          | ja               | ja                |
| Kamera-/Brettverfolgung `/camera`        | nein          | ja               | ja                |
| Rangliste `/ratings`                     | eigenes Rating | Rangliste       | Rangliste         |
| Meldungs-Visualisierung `/reports`       | nein          | nein             | ja                |
| Meldungen verwalten (Details)            | nein          | nein             | ja                |
| Rating zurücksetzen                      | nein          | nein             | ja                |
| Benutzerverwaltung `/api/admin/users`    | nein          | nein             | ja                |
| Beispieldaten löschen                    | nein          | nein             | ja                |

Ein **gesperrtes** Konto darf noch lesen, aber nichts schreiben: die
Schreibrouten antworten mit `403`. Selbstregistrierung legt immer `player` an.

Die Oberfläche liest die Rolle aus dem angemeldeten Profil (`useAuth`) und
blendet Wege aus, die für die Rolle nicht vorgesehen sind. Das ist nur die
Bequemlichkeitsschicht: Jede schreibende Route prüft dieselben Regeln noch
einmal im Backend (`backend/src/api.rs`).

| Rolle  | Navigation                                      | Darf                                                          |
| ------ | ----------------------------------------------- | ------------------------------------------------------------- |
| player | Spiele, Direkt spielen, Mein Rating, Profil     | spielen und das eigene Rating sehen                            |
| host   | zusätzlich Sitzungen, Kamera, Rangliste         | eigene Sitzungen anlegen, pausieren, fortsetzen, beenden       |
| admin  | zusätzlich Meldungsverwaltung                   | alles, auch fremde Sitzungen, Ratings, Meldungen und Benutzer  |

Die Meldungsseite ist ausschließlich für Admins sichtbar; Spieler:innen und
Hosts bekommen dort eine Kein-Zugriff-Meldung. Admins sehen auf `/ratings` pro
Person einen Inline-Reset mit Zielwert und optionalem Grund. Die vollständige
Rangliste ist Hosts und Admins vorbehalten, Spieler:innen sehen nur ihr eigenes
Rating. Die Kamera-/Brettverfolgung unter `/camera` ist ebenfalls auf Hosts und
Admins beschränkt.

Die Anmeldung liegt in `frontend/src/lib/auth.ts`: Login und Registrierung
speichern Token und Profil, `api.ts` schickt `Authorization: Bearer …` mit und
meldet bei `401` lokal ab.

## Oberfläche (Frontend)

React-/Vite-Oberfläche für Connect-Four-Sitzungen: anmelden, spielen, als Host
Sitzungen anlegen und die Rangliste einsehen. Spieler:innen sehen ihr eigenes
Rating; Admins verwalten zusätzlich Meldungen, Ratings und Benutzer. Die Rechte
kommen aus derselben Datenbank wie im Backend (`v_user_permissions`).

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # tsc -b && vite build -> frontend/dist/
npm run preview    # Produktionsbuild lokal ausliefern
npm run lint       # eslint (inkl. React-Compiler-Regeln)
npm test           # Router, Spiellogik, Ableitungen, Kamera-Feedback und Ergebnis-Prüfung (Node)
```

Voraussetzung ist ein laufendes Backend: Sitzungen, Verläufe und Personen liegen
in MySQL, nicht im Browser.

### Auslieferung im Container

`frontend/Dockerfile` baut mit `npm ci` und `npm run build`, ausgeliefert wird
über `nginx.conf`:

```bash
docker build -t boardgames-frontend frontend
docker run --rm -p 5173:80 boardgames-frontend
```

nginx liefert `dist/` aus, übernimmt den SPA-Fallback (`try_files … /index.html`,
siehe [Routen](#routen)) und reicht `/api/` an `http://backend:3000` weiter –
dieselbe Konstruktion wie der Proxy in `vite.config.ts`. Der Backend-Hostname
wird pro Anfrage aufgelöst, der Container startet also auch dann, wenn die API
noch nicht läuft.

Zusammen mit API und Datenbank genügt `docker compose up -d --build` im
Repository-Root.

### Aufbau

```
frontend/src/
  App.tsx                  Wurzel: verteilt die Ansichten und prüft die Rolle (router.ts)
  LoginView.tsx            Anmeldung und Registrierung
  Catalog.tsx              Spielekatalog unter /
  GameSetup.tsx            Einstellungen unter /games/:name; für player nur der Spielstart
  SessionsView.tsx         Sitzungen und Verläufe unter /sessions (host/admin)
  RatingsView.tsx          eigenes Rating bzw. Rangliste, Admin-Reset pro Person
  ReportsView.tsx          Meldungs-Visualisierung und Verwaltung (admin)
  ProfileView.tsx          eigenes Profil unter /profile inkl. Rating und Freundschaften
  CameraView.tsx           Kamera-/Brettverfolgung mit Live-Feedback unter /camera
  GameSessionWindow.tsx    Spielfeld-Fenster unter /:spiel/:id
  PlayView.tsx             Partie ohne Sitzung unter /play bzw. /play/:name
  router.ts                Pfadauflösung ohne Router-Bibliothek
  types.ts                 Domänen-Typen (Sitzung, Ergebnis, Seite)
  ConnectFour.tsx          eingefroren – reines Brett ohne Auswertung (siehe unten)
  ConnectFourGame.tsx      aktives Brett mit Live-Gewinnchancen
  useConnectFour.ts        eingefroren – siehe unten
  ConnectFour.css          Gestaltung des Bretts inkl. Chancen-Balken
  index.css                Gestaltung der Oberfläche (Variablen + Komponenten)
  components/              Bausteine: Karten, Kacheln, Auswahl, Anzeigen, Rahmen
    WinOdds.tsx            Balken, Legende und Zugtipp zu den Gewinnchancen
    CameraAnalysis.tsx     Live-Feedback, Drohungen und Zugqualität der Kamera
    ReportVisualisation.tsx Statusbalken, Gründe, Monatsverlauf und Top-Meldungen
  games/                   Tic Tac Toe, Memory, Schach, Mensch
    GameBoard.tsx          wählt das Brett zum Spielnamen
    useGameRecord.ts       speichert ein Ergebnis genau einmal
    logic/                 reine Spiellogik, auch von npm test genutzt
  hooks/                   useLiveData, useNow, usePausedTime, usePersistentState,
                           useCameraMoveTracker
  lib/
    api.ts                 interface Api und httpApi – der einzige Datenzugriff
    auth.ts                Bearer-Token, Profil und useAuth
    permissions.ts         Rollenmatrix für Navigation und Bedienelemente
    ratings.ts             Sortierung, Stufen und Siegquote der Rangliste
    reportVisuals.ts       Aufbereitung der Status-, Grund- und Monatsdaten
    gameResultEndpoint.ts  ergänzt Sitzungs-Id und Spielzeit beim POST des Hooks
    connectFour.ts         Validierung eines abgeschlossenen Spielverlaufs
    connectFourOdds.ts     Monte-Carlo-Bewertung einer Stellung und Zugchancen
    cameraAnalysis.ts      Erkennungsfeedback, Drohungen und Zugnoten der Kamera
    gameMoves.ts           beschreibt Züge für die Verlaufsliste
    camera/                Kamera-Bibliothek: Kalibrierung, Erkennung, Zugtracker
frontend/scripts/logic.test.ts      Tests für die reine Logik (npm test)
frontend/scripts/games.test.ts      Tests für die Spiellogik der neuen Bretter
frontend/scripts/camera.test.ts     Tests für Geometrie, Farben, Detektor und Tracker
frontend/scripts/cameraAnalysis.test.ts  Tests für Live-Feedback und Zuganalyse
```

Der Katalog in `lib/gameTypes.ts` listet alle fünf Spiele als spielbar. Die
neuen Spiele sind bewusst Zweipersonen-Fassungen und nutzen dasselbe
Rot/Gelb-Sitzplatzmodell wie Vier Gewinnt.

#### Farben und Seiten

`useConnectFour.ts` kennt nur `"red" | "yellow"` und beginnt mit Rot. Damit App,
Datenhaltung und Datenbank denselben Begriff verwenden, ist **Rot = Sitzplatz 0**
und **Gelb = Sitzplatz 1**. Die Farbnamen stehen später in
`game_session_players.side`; `white`/`black` aus den ersten Entwürfen sind
durchgängig ersetzt.

#### Eingefrorene Dateien

`useConnectFour.ts` und `ConnectFour.tsx` werden nicht angefasst. Daraus folgt:

* **Die Brettgröße ist fest** (6×7, Pluszeichen, keine Gewichtung).
* **Beide Personen spielen in einem Fenster** abwechselnd – getrennte Fenster je
  Seite wären nur mit einem Eingriff in den Hook möglich.
* **Der Hook meldet das Ergebnis per `fetch`** an `POST /api/connect-four/games`
  und erwartet eine 2xx-Antwort. Zwei Angaben fehlen in seinem Body – die
  Sitzungs-Id und die Spielzeit ohne Pausen –, die ergänzt
  `lib/gameResultEndpoint.ts`, bevor der Request das Fenster verlässt (siehe
  [Datenhaltung](#datenhaltung)). Ohne diese Ergänzung entstünde zusätzlich zur
  Partie eine offene Sitzung.

Die aktive Ansicht ist deshalb `ConnectFourGame.tsx`: Sie übernimmt das
unveränderte Markup und die CSS-Klassen des eingefrorenen Bretts, bindet aber
`useConnectFour` direkt ein, um den Spielstand an die Auswertung zu reichen.
`ConnectFour.tsx` bleibt als unveränderte Basis erhalten.

### Live-Gewinnchancen

Über dem Brett steht während der Partie ein Balken mit den geschätzten
Gewinnchancen für Rot, Unentschieden und Gelb. Darunter stehen die Prozentwerte
als Text, eine kurze Einordnung („Rot leicht im Vorteil“) und – solange die
Partie läuft – die Spalte mit der höchsten geschätzten Siegchance für die Person
am Zug. Die gleiche Anzeige erscheint in der Kamera-Ansicht; dort werden die
Beschriftungen und Farben an die gewählte Steinpalette angepasst (Grün/Gelb).

Die Bewertung liegt in `lib/connectFourOdds.ts` und läuft vollständig im
Browser:

* Ab der aktuellen Stellung werden 320 Partien zu Ende gespielt (Monte Carlo).
* Beide Seiten nehmen einen sofortigen Sieg immer, blockieren eine unmittelbare
  gegnerische Drohung und wählen sonst eine freie Spalte mit leichter
  Mittenpräferenz.
* Der Zufall ist an die Stellung gekoppelt: dieselbe Stellung ergibt dieselbe
  Anzeige. Ergebnisse werden kurz zwischengespeichert, damit das Polling der
  Sitzung nicht jede Sekunde neu rechnet.
* Der Zugtipp bewertet zusätzlich jede legale Spalte mit eigenen Simulationen
  und empfiehlt die mit der höchsten Siegchance.

Das ist eine Orientierung, keine perfekte Lösung: Connect Four ist zwar gelöst,
eine vollständige Suche wäre im Browser aber zu teuer. Die Anzeige greift nicht
in Regeln, Zugablauf oder Speicherung ein. `npm test` prüft unter anderem
sofortige Siege, Blockaden, entschiedene Partien und die Reproduzierbarkeit.

### Rangliste und Rating-Reset

`/ratings` zeigt für Hosts und Admins alle Konten absteigend nach Elo-Wert, mit
Siegen, Niederlagen, Remis, Siegquote und einer Stufe (Bronze bis Platin).
Reguläre Spieler:innen sehen dort ausschließlich ihr eigenes Rating, die
zugehörige Stufe und ihre Statistik. Die Ableitungen liegen in `lib/ratings.ts`;
die Werte selbst vergibt das Backend nach beendeten Partien.

Admins bekommen pro Zeile „Zurücksetzen“: Das Formular schickt einen Zielwert
(Standard `1000`, erlaubt `100` bis `4000`) und einen optionalen Grund an
`POST /api/admin/ratings/{id}/reset`. Die Statistik wird dabei standardmäßig
zurückgesetzt; der alte Wert bleibt im Reset-Protokoll des Backends. Hosts sehen
die Rangliste, aber keine Reset-Bedienelemente.

### Profil und Freundschaften

`/profile` zeigt das eigene Konto mit Partien, Siegen, Sitzungen, Rating und der
Freundesliste. Unter „Personen finden“ lässt sich nach aktiven Konten suchen;
je nach Stand erscheint dort „Anfrage senden“, „Annehmen“/„Ablehnen“,
„Zurückziehen“ oder „Freund:in“. Eigene Freund:innen können direkt entfernt
werden. Ein gesperrtes Konto darf die Liste lesen, aber keine Anfrage stellen
oder beantworten (`require_write`).

Anfragen liegen in `friendships` (Migration `20261110000000_friends.sql`): eine
Zeile pro gerichteter Anfrage mit `pending`, `accepted` oder `declined`. Eine
angenommene Zeile gilt für beide Personen, weil die Leserouten immer beide
Richtungen abfragen. Die Tabelle verhindert Selbstanfragen und doppelte
Richtungen; eine abgelehnte Anfrage darf später erneut gestellt werden und wird
dann ersetzt. `useLiveData` lädt die Übersicht nach jeder Aktion neu.

### Meldungs-Visualisierung

`ReportVisualisation` zeigt die Gesamtzahl, die Statusverteilung als gestapelten
Balken, die häufigsten Gründe, den Monatsverlauf und die am häufigsten
gemeldeten Personen. Die Ansicht ist der Administration vorbehalten; die Daten
kommen aus `GET /api/reports/visualisation` und werden nur für Admins geladen.

### Routen

| Pfad               | Ansicht                                                        | Zugriff                    |
| ------------------ | -------------------------------------------------------------- | -------------------------- |
| `/login`           | Anmeldung / Registrierung                                      | ohne Anmeldung             |
| `/`                | Spielekatalog – eine Kachel je Spiel                           | angemeldet                 |
| `/games/:name`     | Einstellungen (host/admin) bzw. Spielstart (player)            | angemeldet                 |
| `/sessions`        | Sitzungen und Spielverläufe über alle Spiele                   | host/admin                 |
| `/camera`          | Kamera-/Brettverfolgung                                        | host/admin                 |
| `/ratings`         | eigenes Rating (player) bzw. Rangliste und Admin-Reset         | angemeldet                 |
| `/reports`         | Meldungs-Visualisierung und Verwaltung                         | admin                      |
| `/profile`         | eigenes Profil inkl. Rating und Freundschaften                 | angemeldet                 |
| `/play`            | Brett direkt im Tab, ohne Sitzung                              | angemeldet                 |
| `/connectfour/:id` | Spielfeld-Fenster, wird per `window.open` als Pop-up geöffnet  | Mitwirkende, Host, Admin   |

Für den Produktivbetrieb braucht der Server einen SPA-Fallback: unbekannte
Pfade müssen `index.html` ausliefern. `npm run preview` macht das bereits;
`/connectfour/:id` funktioniert im Dev-Server ohne zusätzliche Konfiguration.

### Sitzungen steuern

Eine Sitzung kennt vier Zustände: `running`, `paused`, `finished`, `aborted`
(`sessionStatus` in `types.ts`). Starten und Beenden liegen im Spielfeld-Fenster,
Pausieren und Fortsetzen zusätzlich in der Sitzungsübersicht – auch wenn das
Spielfeld gar nicht offen ist. Das darf nur der Host der Sitzung oder ein Admin;
Mitwirkende dürfen ausschließlich den eigenen Platz aufgeben. Die Oberfläche
blendet die übrigen Knöpfe aus, das Backend prüft es zusätzlich.

Die Spieluhr läuft während einer Pause nicht: `playedMs` zieht `pausedMs`
(abgeschlossene Pausen) und eine noch offene Pause von der verstrichenen Zeit ab.
Beim Fortsetzen wird die abgelaufene Pause in `pausedMs` festgeschrieben, damit
die Rechnung auch nach einem Neuladen des Fensters stimmt.

`ConnectFour` ist eingefroren und kennt weder Pause noch Sperre; der Brettzustand
liegt in `useConnectFour`. Deshalb bleibt das Brett während der Pause eingebunden
(sonst ginge der Spielstand verloren) und wird über `inert` gesperrt – das nimmt
Zeiger- *und* Tastatureingaben zurück, womit auch der „New Game“-Knopf des Bretts
außer Reichweite liegt. Eine halbtransparente Deckschicht macht den Zustand
sichtbar.

### Datenhaltung

`frontend/src/lib/api.ts` definiert das interface `Api` und liefert die
Implementierung `httpApi`: jeder Aufruf geht an das Rust-Backend und landet in
MySQL. Sitzungen, Spielverläufe und Personen liegen also auf dem Server, nicht
im Browser – das Pop-up mit dem Brett und das Dashboard lesen denselben Stand aus
derselben Quelle.

Bis auf `/health`, `/login` und `/register` verlangt jede Route einen
Bearer-Token. `lib/auth.ts` speichert Token und Profil, `api.ts` hängt
`Authorization: Bearer …` an jede Anfrage und meldet bei `401` lokal ab. Die
Rechte selbst kommen aus `v_user_permissions` und werden vom Backend bei jeder
Anfrage neu gelesen; die Oberfläche prüft nur dieselbe Rollenmatrix, um Wege
auszublenden.

Ohne Backend bekommt jede Ansicht einen Fehlertext und legt nichts an. Ein
Rückfall auf `localStorage` wäre bequemer, erzeugte aber Datensätze, die nur auf
einem Rechner existieren und beim nächsten Start verschwunden wären.

Aktualisierung ohne Polling war früher ein `storage`-Event, weil `localStorage`
zwar fensterübergreifend ist, aber nur *andere* Fenster benachrichtigt. Aus der
Datenbank kommt so etwas nicht heraus: `api.subscribe` meldet jede eigene
Änderung sofort und fragt zusätzlich alle drei Sekunden nach, damit auch andere
Fenster mitkommen. `useLiveData` abonniert das. Rendert nur bei echter Änderung
neu (Vergleich über den JSON-Text), sonst flackert jede Liste im Takt.

Die Beispielpartie aus `backend/migrations/20251007000001_seed_demo_session.sql`
landet in der Historie als „Beispiel“ markiert; „Beispiel entfernen“ löscht sie
per `DELETE /api/demo-data` samt Zügen.

Drei Punkte, an denen Frontend und Backend sich verstehen müssen:

1. **Eine gehostete Partie ist dieselbe Zeile wie ihre Sitzung.** Der eingefrorene
   Hook `useConnectFour` kennt die Sitzungs-Id nicht – er schickt nur
   `{ moves, winner }`. `lib/gameResultEndpoint.ts` ergänzt deshalb
   `duration_ms` (echte Spielzeit ohne Pausen) und `session_id`, bevor der
   Request das Fenster verlässt. Ohne die Verknüpfung entstünden zwei getrennte
   Datensätze: eine offene Sitzung und eine anonyme Partie.
2. **`duration_ms` kann nur das Fenster messen.** Der Server startet und stoppt
   die Uhr nicht mit, das Brett läuft in genau einem Fenster.
3. **Der Dev-Server leitet `/api` weiter.** `vite.config.ts` proxyt auf
   `http://127.0.0.1:3000` (siehe `backend/.env`), überschreibbar mit
   `BACKEND_URL`. Hinter nginx (Docker) macht nginx das statt Vite.

Eine Pause setzt weder `outcome` noch `finished_at`. Beide dürfen laut
`chk_session_outcome` in `game_sessions` nur zusammen gesetzt werden; der
Pausenzustand gehört deshalb nach `metadata_json` (`paused_at`, `paused_ms`).

`GET /api/sessions` liefert nur gehostete Sitzungen. Partien aus `/play`
bekommen eine eigene Zeile mit `metadata_json.ad_hoc` und tauchen deshalb nicht
im Dashboard der Sitzungen auf, sondern unter „Partien ohne Sitzung“.

### Kamera-Bibliothek

`frontend/src/lib/camera/` erkennt Züge auf einem physischen Brett über die
Webcam. Die Bibliothek ist in drei Schichten geteilt:

* `CameraCapture` holt den Stream und liefert einzelne Frames als `PixelSource`.
* `ConnectFourDetector` liest die Zellmitten anhand von vier kalibrierten Ecken
  und klassifiziert Rot/Gelb/Leer über den Farbton.
* `MoveTracker` vergleicht aufeinanderfolgende Brettzustände und erzeugt
  `TrackedMove`s. Er bestätigt Änderungen über mehrere Frames, ignoriert
  schwebende Steine und erkennt einen geleerten Spielstand als Reset.

In der Oberfläche liegt die fertige Ansicht unter **`/camera`** (Navigation
„Kamera“, nur Host/Admin). Sie startet die eingebaute Laptop-Kamera, blendet ein
6×7-Raster über das Bild und lässt die vier Ecken per Pointer verschieben. Nach
„Kalibrierung übernehmen“ zählt die App neue Steine, zeigt Brett, Zugliste und
Sieger an und speichert die Partie über `api.recordConnectFourGame` als Partie
ohne Sitzung. Die Vorschau wird bewusst nicht gespiegelt, damit Kalibrierung und
Erkennung dieselben Pixel benutzen. Für eine Kamera auf der gegenüberliegenden
Brettseite gibt es die X/Y-Spiegelung in der Kalibrierung.

Die Steinfarben sind standardmäßig **Gelb/Grün** (die grünen Steine werden
intern auf die Seite „red“ abgebildet, weil Datenhaltung und Spiel-Logik nur
„red“/„yellow“ kennen). Über „Steine“ in der Werkzeugleiste lässt sich die
Anzeige auf **Rot/Gelb** umschalten; die Erkennung akzeptiert Rot, Gelb und
Grün unabhängig davon.

> Der Browser gibt die Kamera nur in einem sicheren Kontext frei. Lokal ist das
> über `http://localhost:5173` der Fall; für eine andere Adresse braucht die
> Instanz HTTPS (siehe Hinweis in der Ansicht).

Schnellstart der Bibliothek:

```ts
import { createConnectFourCamera } from "./lib/camera";

const camera = createConnectFourCamera({
  calibration: { topLeft, topRight, bottomRight, bottomLeft },
  onMove: (move) => console.log(move.turn, move.side, move.location),
});

await camera.start(videoElement); // videoElement ist ein <video> in der Oberfläche
// ...
camera.stop();
```

Die vier Ecken werden im **Video-Koordinatensystem** erwartet und beschreiben
die äußeren Kanten des 6×7-Rasters, nicht den Rahmen des Bretts. Wer sie per
Klick in einer per CSS verkleinerten Vorschau setzt, rechnet sie mit
`scaleCorners` um. Für eine fest auf das Brett gerichtete Kamera reicht
`cornersFromRect`. Steht die Kamera auf der gegenüberliegenden Seite des Bretts,
spiegeln `flipX`/`flipY` in den Detektor-Optionen das erkannte Raster.

Die erkannten Züge lassen sich am Partieende direkt an die bestehende API
geben:

```ts
import { toConnectFourMoves, winnerOf } from "./lib/camera";

const winner = winnerOf(camera.tracker.board);
if (winner !== null) {
  await api.recordConnectFourGame(
    { moves: toConnectFourMoves(camera.tracker.moves), winner },
    context,
  );
}
```

Für React gibt es `useCameraMoveTracker` in `src/hooks/`. Der Hook liefert
`videoRef`, Status, Brett und Züge und räumt den Stream beim Unmount auf.

Die Erkennung ist bewusst konservativ: Sie liest nur die Zellmitten, braucht
eine feste Kamera und eine einmalige Kalibrierung. Bei starkem Gegenlicht,
bewegter Kamera oder einem Brett mit hellen, leeren Feldern müssen die
Schwellwerte in `ConnectFourDetectorOptions.thresholds` angepasst werden.
`npm test` prüft Geometrie, Farbklassifikation, Detektor und Tracker mit
synthetischen Bildern – ohne Browser und ohne Kamera.

### Kamera-Live-Feedback und Zuganalyse

Neben dem Kamerabild zeigt `/camera` ein Panel „Live-Feedback & Analyse“. Die
reine Logik liegt in `lib/cameraAnalysis.ts`, die Darstellung in
`components/CameraAnalysis.tsx`:

* **Erkennungsstatus.** `describeDetection` fasst den letzten ausgewerteten
  Frame zusammen: „Warte auf das erste Bild“, „Erkennung stabil“, „Erkennung
  prüfen“ bei zu vielen unsicheren Zellen oder „Keine neuen Bilder“, wenn der
  letzte Frame älter als drei Sekunden ist. Dazu kommen die Anzahl der Bilder,
  die durchschnittliche Konfidenz, unsichere Zellen und das Alter des letzten
  Frames. Unsichere Zellen werden zusätzlich im erkannten Brett markiert.
* **Neuer Zug.** Der zuletzt bestätigte Zug wird kurz als Overlay eingeblendet
  („Rot: Spalte 4“ mit Zugnummer und Konfidenz), damit die Erkennung ohne Blick
  auf die Zugliste nachvollziehbar ist. Das Overlay verschwindet nach vier
  Sekunden.
* **Drohungen.** `threatColumns` meldet Spalten, in denen die eigene Seite
  sofort gewinnen kann, und solche, die der Gegner im nächsten Zug gewinnt.
* **Zugqualität.** `assessMoves` baut das Brett aus dem Startzustand und den
  erkannten Zügen neu auf und bewertet für die letzten zehn Züge die Stellung
  *vor* jedem Zug mit `estimateMoveChances`. Daraus entstehen Siegchance, verpasste Chance und eine
  Note von „Bester Zug“ über „Gut“ und „Ungenau“ bis „Fehler“; `summariseMoves`
  fasst sie zu einer Genauigkeit in Prozent zusammen.

`useCameraMoveTracker` liefert dafür zusätzlich `frames`, `lastUpdateAt` und
`log` (Züge und Resets). Die Auswertung ist eine Orientierung: Sie läuft mit
wenigen Monte-Carlo-Simulationen im Browser und greift nicht in Erkennung,
Regeln oder Speicherung ein. `scripts/cameraAnalysis.test.ts` prüft Status,
Sofortsieg und die Benotung eines entscheidenden Zuges.

### Spielverläufe prüfen

`lib/connectFour.ts` validiert einen abgeschlossenen Verlauf, bevor er
gespeichert wird: fortlaufende `turn`-Nummern, Seitenfolge Rot/Gelb, Koordinaten
im Brett, korrekte Schwerkraft, „Unentschieden“ nur bei vollem Brett. Die Regeln
entsprechen den serverseitigen Prüfungen in `backend/src/api.rs` und sind in
`scripts/logic.test.ts` als `npm test` abgesichert.

### Barrierefreiheit und Bedienung

* Alle Bedienelemente sind echte `<button>`/`<select>` mit sichtbarem Fokusring.
* Das Brett ist mit `role="grid"` und Beschriftungen je Feld ausgezeichnet.
* Farbige Zustände sind zusätzlich beschriftet (`Laufend`, `Rot gewinnt`, …) –
  Farbe allein trägt keine Information.
* Die Gewinnchancen stehen als Prozenttext in der Legende; der Balken ist als
  Ganzes beschriftet und aktualisiert sich über eine höfliche Live-Region.
* `prefers-color-scheme` und `prefers-reduced-motion` werden berücksichtigt.
* Layout und Schrift skalieren zwischen 360 px und Desktop.

## API

Alle Routen außer `GET /api/health`, `POST /api/login` und `POST /api/register`
verlangen einen Bearer-Token:

```
Authorization: Bearer <token>
```

Login und Registrierung liefern den Token, seine Ablaufzeit (7 Tage) und die
Rechte aus `v_user_permissions`. Gespeichert wird nur der SHA-256-Hash in
`auth_tokens`; `POST /api/logout` macht den Token ungültig. `GET /api/me`
liefert die angemeldete Person samt Rechten nach einem Reload.

Alle Routen werden von `frontend/src/lib/api.ts` benutzt, das ist der einzige
Datenzugriff der Oberfläche. Die Tabelle nennt deshalb auch die passende
`Api`-Methode und die berührten Tabellen:

| Methode | Route                                   | Zweck                                  | `Api`-Methode           | Tabellen |
| ------- | --------------------------------------- | -------------------------------------- | ----------------------- | -------- |
| GET     | `/api/health`                           | DB-Verbindung prüfen (ohne Token)      | –                       | – |
| GET     | `/api/users`                            | aktive Personen aus `users`            | `getUsers`              | `users` |
| GET     | `/api/users/{id}`                       | öffentliches Profil einer Person       | `getUser`               | `users` |
| POST    | `/api/login`                            | Anmeldung, liefert Bearer-Token        | `login`                 | `users`, `auth_tokens` |
| POST    | `/api/register`                         | neues Konto (immer `player`)           | `register`              | `users`, `auth_tokens` |
| POST    | `/api/logout`                           | Token ungültig machen                  | `logout`                | `auth_tokens` |
| GET     | `/api/me`                               | angemeldete Person und Rechte          | –                       | `users`, `v_user_permissions` |
| GET     | `/api/friends`                          | Freund:innen, eingehende und ausgehende Anfragen | `getFriends`   | `friendships`, `users` |
| POST    | `/api/friends/requests`                 | Anfrage senden (`user_id`, optional `message`) | `sendFriendRequest` | `friendships`, `users` |
| POST    | `/api/friends/requests/{id}/accept`     | Anfrage annehmen (nur gefragte Person) | `acceptFriendRequest`   | `friendships` |
| POST    | `/api/friends/requests/{id}/decline`    | Anfrage ablehnen (nur gefragte Person) | `declineFriendRequest`  | `friendships` |
| DELETE  | `/api/friends/requests/{id}`            | eigene offene Anfrage zurückziehen     | `cancelFriendRequest`   | `friendships` |
| DELETE  | `/api/friends/{id}`                     | Freundschaft mit Person `{id}` entfernen | `removeFriend`        | `friendships` |
| GET     | `/api/admin/users`                      | Benutzerverwaltung (nur Admin)         | –                       | `users` |
| PATCH   | `/api/admin/users/{id}`                 | Rolle/Sperre ändern (nur Admin)        | –                       | `users` |
| GET     | `/api/games`                            | Spieltypen aus `game_types`            | `getGameTypes`, `getGameType` | `game_types` |
| GET     | `/api/sessions`                         | gehostete Sitzungen, neueste zuerst    | `listSessions`          | `game_sessions`, `game_session_players` |
| POST    | `/api/sessions`                         | Sitzung anlegen (Host/Admin)           | `createSession`         | dito |
| GET     | `/api/sessions/{id}`                    | eine Sitzung                           | `getSession`            | dito |
| POST    | `/api/sessions/{id}/pause`              | Pause in `metadata_json` vermerken     | `pauseSession`          | `game_sessions` |
| POST    | `/api/sessions/{id}/resume`             | Pause abschließen, Pausenzeit addieren | `resumeSession`         | dito |
| POST    | `/api/sessions/{id}/abort`              | Sitzung abbrechen                      | `abortSession`          | dito |
| POST    | `/api/sessions/{id}/surrender`          | Aufgabe, Gegner gewinnt                | `surrenderSession`      | dito |
| POST    | `/api/connect-four/games`               | Partie speichern, Sitzung schließen    | `recordConnectFourGame` | `game_sessions`, `moves`, `player_ratings` |
| GET     | `/api/connect-four/games`               | alle Verläufe                          | –                       | dito |
| GET     | `/api/connect-four/games/{session_id}`  | eine Partie                            | –                       | dito |
| POST    | `/api/games/{game_name}/results`        | Partie eines beliebigen Spiels speichern | `recordGame`           | `game_sessions`, `moves` |
| GET     | `/api/games/results`                    | alle Verläufe aller Spiele             | `listGames`             | `game_sessions`, `moves` |
| DELETE  | `/api/demo-data`                        | Beispielpartie löschen (nur Admin)     | `clearDemoData`         | dito |
| GET     | `/api/ratings`                          | eigenes Rating (player) bzw. Rangliste (host/admin) | `getRatings` | `users`, `player_ratings` |
| GET     | `/api/ratings/{id}`                     | Rating einer Person; player nur das eigene | `getRating`        | dito |
| POST    | `/api/admin/ratings/{id}/reset`         | Rating zurücksetzen (nur Admin)        | `resetRating`           | `player_ratings`, `rating_resets` |
| GET     | `/api/reports`                          | Spieler-Meldungen (nur Admin; Filter: status, reported_user_id, reporter_id) | `getReports` | `player_reports` |
| GET     | `/api/reports/visualisation`            | Aggregierte Meldungs-Visualisierung (nur Admin) | `getReportOverview` | `player_reports`, `users` |
| POST    | `/api/reports`                          | Meldung anlegen (nur Admin)            | `createReport`          | `player_reports` |
| GET     | `/api/reports/{id}`                     | eine Meldung (nur Admin)               | –                       | `player_reports` |
| PATCH   | `/api/reports/{id}`                     | Meldung prüfen / Status ändern (nur Admin) | `updateReport`      | dito |
| DELETE  | `/api/reports/{id}`                     | Meldung löschen (nur Admin)            | `deleteReport`          | dito |

### Freundschaften

`GET /api/friends` ist für alle angemeldeten Konten lesbar und liefert
`friends`, `incoming` und `outgoing`. Schreibende Routen prüfen zusätzlich
`require_write`; ein gesperrtes Konto erhält `403`. Eine Anfrage an sich selbst
oder an ein gesperrtes Konto wird mit `400` abgelehnt, eine bereits bestehende
Freundschaft mit `409`. Annehmen und Ablehnen darf nur die gefragte Person
(sonst `403`), Zurückziehen nur die anfragende; unbekannte oder nicht mehr
offene Zeilen antworten mit `404`. `DELETE /api/friends/{id}` erwartet die
Kennung der anderen Person, nicht die Zeile aus `friendships`. Eine abgelehnte
Anfrage darf später erneut gestellt werden; die API ersetzt die alte Zeile.

### Ratings und Meldungs-Visualisierung

Ratings sind Elo-Werte. Beide Sitzplätze müssen zu registrierten Konten
gehören; dann ändert `POST /api/connect-four/games` die Werte nach Sieg,
Niederlage oder Remis, ebenso eine Aufgabe. Anonyme Ad-hoc-Partien aus `/play`
und abgebrochene Sitzungen lassen die Ratings unverändert. Neue Konten starten
bei `1000`; die Grenzen sind `100` bis `4000`.

`GET /api/ratings` liefert für `player` nur die eigene Zeile; `host` und
`admin` erhalten die vollständige Rangliste. `GET /api/ratings/{id}` ist für
`player` auf die eigene Kennung beschränkt (sonst `403`).

`POST /api/admin/ratings/{id}/reset` setzt standardmäßig auf `1000` und löscht
Siege, Niederlagen und Remis. Mit `{"rating": 1234, "reset_stats": false}`
bleibt die Statistik erhalten. Der alte Wert, die Administration und ein
optionaler Grund landen in `rating_resets`.

`GET /api/reports/visualisation` ist der Administration vorbehalten und liefert
Zählungen nach Status, Grund und Monat sowie die vom angemeldeten Admin
eingereichten und gegen ihn eingegangenen Meldungen. Die Detailroute
`/api/reports` bleibt ebenfalls admin-only.

Die Zustände ohne eigene Spalte liegen in `game_sessions.metadata_json`:
`paused_at`, `paused_ms`, `abort_reason`, `surrendered_by`, `winner_side` sowie
die Kennzeichen `demo`, `ad_hoc` und `friendly`. Eine gehostete Partie ist
dieselbe Zeile wie ihre Sitzung – `POST /api/connect-four/games`
beziehungsweise `POST /api/games/{game_name}/results` schließt sie, statt eine
zweite Sitzung anzulegen. Partien aus `/play` ohne Sitzung bekommen eine eigene
Zeile mit `ad_hoc`, sind immer freundschaftlich und damit ungewertet. Die
spielspezifischen Angaben eines Zuges stehen im JSON-Feld `moves.payload`;
Vier Gewinnt und Tic Tac Toe nutzen zusätzlich `location`.

`POST /api/sessions` nimmt optional `"friendly": true` an. Ohne den Schalter
entsteht eine gewertete Sitzung. Nur wenn beide Plätze mit verschiedenen Konten
besetzt sind, kein Beispieldatensatz vorliegt und das Ergebnis `win` oder `draw`
ist, schreibt das Backend die Elo-Wertung in `player_ratings` fort (K = 32,
Startwert 1000, Untergrenze 100). Eine Aufgabe zählt dabei als Sieg für die
andere Seite. Freundschaftsspiele, Abbrüche und Ad-hoc-Partien lassen
`player_ratings` unverändert. `GET /api/ratings` liefert trotzdem eine Zeile,
notfalls mit dem Startwert und leeren Zählern.

## Prüfen

```bash
npm test                    # Router, Spiellogik, Ableitungen, Kamera-Feedback, Ergebnis-Prüfung
npm run lint                # eslint inkl. React-Compiler-Regeln
npm run build               # tsc -b && vite build -> frontend/dist/
npm run backend:check       # cargo check
docker compose config       # beide Compose-Dateien gegenprüfen
docker compose build        # beide Images bauen, ohne zu starten
cargo test                  # Brettprüfung und Metadaten-Helfer (im Backend)
```

`npm test`, `npm run lint` und `npm run build` laufen unverändert auch im
Container. `npm run backend:check` braucht dort das `dev`-Target des
Backend-Dockerfiles, sonst wird nur das Release-Binary gebaut.

Für die Routen gibt es einen Durchlauf gegen den laufenden Stack, der jeden
Erfolgspfad und den Fehlerpfad daneben abklappert und seine Testdaten wieder
entfernt:

```bash
powershell -ExecutionPolicy Bypass -File scripts/api-smoke.ps1
```

Mit `-MitDemoLoeschen` entfernt das Skript zusätzlich die Beispieldaten; die
kommen nur über ein frisches Volume zurück.

## Schema ändern

Ausschließlich neue Dateien unter `backend/migrations/` anlegen, im Format
`<timestamp>_<beschreibung>.sql`. Bereits angewandte Migrationen werden nicht
angefasst: sqlx speichert deren Prüfsummen und verweigert den Start, wenn sie
sich ändern. Für die Tabellenstruktur, die Einschränkungen und den
Rust-Abgleich siehe die Kommentare in
`backend/migrations/20250101000000_init_schema.sql`.

## Bekannte Grenzen

* **Anmeldung und Rollen.** Die vier Beispielpersonen aus
  `backend/migrations/20251007000000_seed_users.sql` haben das Passwort
  `password`; neue Konten entstehen über `/login` als `player`. Rollen und
  Sperren vergibt nur die Administration über `/api/admin/users`.
* **Token im Browser.** Der Bearer-Token liegt im `localStorage`. Das ist ohne
  TLS im Container nur für die lokale Entwicklung gedacht; für eine öffentliche
  Instanz gehört ein Reverse Proxy mit HTTPS davor.
* **Eine offene Sitzung zur Zeit.** `POST /api/sessions` lehnt ab, wenn bereits
  eine läuft (`outcome IS NULL`). Das entspricht der Regel der Oberfläche, gilt
  aber für alle zusammen und nicht je Person. Eine pausierte Sitzung zählt als
  offen; die Direktansicht `/play` ist nicht betroffen.
* **Wertungen starten bei 1000.** Bestehende Konten bekommen ihre Zeile aus der
  Migration, neue beim Registrieren. Frühere Partien werden nicht nachberechnet.
* **Pop-up-Blocker.** Blockiert der Browser `window.open`, gibt das Dashboard
  einen Link statt des Fensters aus.
* **`website/boardgames/`** war ein veraltetes Duplikat des Frontends und wurde
  nach `frontend/` verschoben. Das Original steckt in der Git-Historie. Was noch
  davon da ist, ist ein alter `dist/`-Ordner, also Ausgabe und kein eigenes
  Programm – deshalb bekommt er keinen Container.
* **`backend/target/`** ist eingecheckt. Das ist Build-Ausgabe und gehört nicht
  ins Repository, wurde aber bewusst nicht entfernt. Die Dockerfiles schließen
  das Verzeichnis über `.dockerignore` aus, sonst wäre es Teil jedes
  Build-Kontexts.
* **Kein TLS im Container.** nginx läuft auf Port 80 ohne Zertifikat; für eine
  öffentliche Instanz gehört ein Reverse Proxy davor.
* Farben und Rollen stehen in `game_session_players.side`, nicht in festen
  Spalten: Rot ist Sitzplatz 0, Gelb Sitzplatz 1.
* **Pfadwechsel.** Das Projekt lag zuerst unter `boardgames/boardgames/`, dann
  unter `website/boardgames/` und steht jetzt in `frontend/`. Skripte liegen
  zusätzlich im Repository-Root und starten alles per `npm run dev`. Verweise
  auf die alten Pfade gibt es nicht mehr.
