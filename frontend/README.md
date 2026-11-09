# BoardGames – Website

React-/Vite-Oberfläche für Connect-Four-Sitzungen: anmelden, spielen, als Host
Sitzungen anlegen, die eigene Meldungsübersicht ansehen, die Rangliste verfolgen
und als Admin Meldungen, Ratings und Benutzer verwalten. Die Rechte kommen aus
derselben Datenbank wie im Backend (`v_user_permissions`).

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # tsc -b && vite build -> dist/
npm run preview    # Produktionsbuild lokal ausliefern
npm run lint       # eslint (inkl. React-Compiler-Regeln)
npm test           # Router, Ableitungen und Ergebnis-Pruefung (Node, ohne Browser)
```

Voraussetzung ist ein laufendes Backend: Sitzungen, Verläufe und Personen liegen
in MySQL, nicht im Browser (siehe [Datenhaltung](#datenhaltung)).

## Auslieferung im Container

`Dockerfile` baut mit `npm ci` und `npm run build`, ausgeliefert wird über
`nginx.conf`:

```bash
docker build -t boardgames-frontend .
docker run --rm -p 5173:80 boardgames-frontend
```

nginx liefert `dist/` aus, übernimmt den SPA-Fallback (`try_files … /index.html`,
siehe [Routen](#routen)) und reicht `/api/` an `http://backend:3000` weiter –
dieselbe Konstruktion wie der Proxy in `vite.config.ts`. Der Backend-Hostname
wird pro Anfrage aufgelöst, der Container startet also auch dann, wenn die API
noch nicht läuft.

Zusammen mit API und Datenbank genügt `docker compose up -d --build` im
Repository-Root, siehe [README.md](../README.md).

## Aufbau

```
src/
  App.tsx                  Wurzel: verteilt die Ansichten und prüft die Rolle (router.ts)
  LoginView.tsx            Anmeldung und Registrierung
  Catalog.tsx              Spielekatalog unter /
  GameSetup.tsx            Einstellungen unter /games/:name; für player nur der Spielstart
  SessionsView.tsx         Sitzungen und Verläufe unter /sessions (host/admin)
  RatingsView.tsx          Rangliste unter /ratings, Admin-Reset pro Person
  ReportsView.tsx          Meldungs-Visualisierung unter /reports (alle Rollen);
                           Detailverwaltung nur Admin
  ProfileView.tsx          eigenes Profil unter /profile inkl. Rating
  GameSessionWindow.tsx    Spielfeld-Fenster unter /connectfour/:id
  PlayView.tsx             Partie ohne Sitzung unter /play
  router.ts                Pfadauflösung ohne Router-Bibliothek
  types.ts                 Domänen-Typen (Sitzung, Ergebnis, Seite)
  ConnectFour.tsx          eingefroren – reines Brett ohne Auswertung (siehe unten)
  ConnectFourGame.tsx      aktives Brett mit Live-Gewinnchancen
  useConnectFour.ts        eingefroren – siehe unten
  ConnectFour.css          Gestaltung des Bretts inkl. Chancen-Balken
  index.css                Gestaltung der Oberfläche (Variablen + Komponenten)
  components/              Bausteine: Karten, Kacheln, Auswahl, Anzeigen, Rahmen
    WinOdds.tsx            Balken, Legende und Zugtipp zu den Gewinnchancen
    ReportVisualisation.tsx Statusbalken, Gründe, Monatsverlauf und Top-Meldungen
  hooks/                   useLiveData, useNow, usePausedTime, usePersistentState,
                           useCameraMoveTracker
  lib/
    api.ts                 interface Api und httpApi – der einzige Datenzugriff
    auth.ts                Bearer-Token, Profil und useAuth
    permissions.ts         Rollenmatrix für Navigation und Bedienelemente
    ratings.ts             Sortierung, Stufen und Siegquote der Rangliste
    reportVisuals.ts       Aufbereitung der Status-, Grund- und Monatsdaten
    gameResultEndpoint.ts  ergänzt Sitzungs-Id und Spielzeit beim POST des Hooks
    connectFourOdds.ts     Monte-Carlo-Bewertung einer Stellung
    camera/                Kamera-Bibliothek: Kalibrierung, Erkennung, Zugtracker
scripts/logic.test.ts      Tests für die reine Logik (npm test)
scripts/camera.test.ts     Tests für Geometrie, Farben, Detektor und Tracker
```

Der Katalog in `lib/gameTypes.ts` listet Connect Four als spielbar und fünf
weitere Spiele als „in Arbeit“ – die zeigen auf `/games/:name` Regeln und den
Stand der Umsetzung, aber keine Partie.

### Farben und Seiten

`useConnectFour.ts` kennt nur `"red" | "yellow"` und beginnt mit Rot. Damit App,
Datenhaltung und Datenbank denselben Begriff verwenden, ist **Rot = Sitzplatz 0**
und **Gelb = Sitzplatz 1**. Die Farbnamen stehen später in
`game_session_players.side`; `white`/`black` aus den ersten Entwürfen sind
durchgängig ersetzt.

### Eingefrorene Dateien

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

## Live-Gewinnchancen

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
  Mittepräferenz.
* Der Zufall ist an die Stellung gekoppelt: dieselbe Stellung ergibt dieselbe
  Anzeige. Ergebnisse werden kurz zwischengespeichert, damit das Polling der
  Sitzung nicht jede Sekunde neu rechnet.
* Der Zugtipp bewertet zusätzlich jede legale Spalte mit eigenen Simulationen
  und empfiehlt die mit der höchsten Siegchance.

Das ist eine Orientierung, keine perfekte Lösung: Connect Four ist zwar gelöst,
eine vollständige Suche wäre im Browser aber zu teuer. Die Anzeige greift nicht
in Regeln, Zugablauf oder Speicherung ein. `npm test` prüft unter anderem
sofortige Siege, Blockaden, entschiedene Partien und die Reproduzierbarkeit.

## Rangliste und Rating-Reset

`/ratings` zeigt alle Konten absteigend nach Elo-Wert, mit Siegen, Niederlagen,
Remis, Siegquote und einer Stufe (Bronze bis Platin). Die Ableitungen liegen in
`lib/ratings.ts`; die Werte selbst vergibt das Backend nach beendeten Partien.

Admins bekommen pro Zeile „Zurücksetzen“: Das Formular schickt einen Zielwert
(Standard `1000`, erlaubt `100` bis `4000`) und einen optionalen Grund an
`POST /api/admin/ratings/{id}/reset`. Die Statistik wird dabei standardmäßig
zurückgesetzt; der alte Wert bleibt im Reset-Protokoll des Backends. Spieler
sehen die Rangliste, aber keine Reset-Bedienelemente.

## Meldungs-Visualisierung

`ReportVisualisation` zeigt die Gesamtzahl, die Statusverteilung als gestapelten
Balken, die häufigsten Gründe, den Monatsverlauf und – nur für Admins – die am
häufigsten gemeldeten Personen. Die Daten kommen bereits gefiltert aus
`GET /api/reports/visualisation`: Admins sehen alle Meldungen, alle anderen nur
Meldungen mit eigener Beteiligung. Die Detailverwaltung darunter wird nur für
Admins geladen und gerendert.

## Rollen und Rechte

Die Oberfläche liest die Rolle aus dem angemeldeten Profil (`useAuth`) und
blendet Wege aus, die für die Rolle nicht vorgesehen sind. Das ist nur die
Bequemlichkeitsschicht: Jede schreibende Route prüft dieselben Regeln noch
einmal im Backend (`backend/src/api.rs`).

| Rolle  | Navigation                                      | Darf                                                        |
| ------ | ----------------------------------------------- | ----------------------------------------------------------- |
| player | Spiele, Direkt spielen, Meldungen, Rangliste, Profil | spielen; eigene Meldungsbeteiligungen und Rangliste lesen |
| host   | zusätzlich Sitzungen                            | eigene Sitzungen anlegen, pausieren, fortsetzen, beenden     |
| admin  | zusätzlich Meldungsverwaltung                   | alles, auch fremde Sitzungen, Ratings, Meldungen und Benutzer |

Die Meldungsseite ist für alle angemeldeten Rollen sichtbar. Spieler sehen dort
nur Aggregatzahlen zu Meldungen, die sie selbst geschrieben haben oder in denen
sie gemeldet wurden; die Detailroute `/api/reports` und die Verwaltungsknöpfe
bleiben Admins vorbehalten. Admins sehen auf `/ratings` pro Person einen
Inline-Reset mit Zielwert und optionalem Grund.

Ein gesperrtes Konto darf lesen, aber nicht schreiben. Die Anmeldung liegt in
`lib/auth.ts`: Login und Registrierung speichern Token und Profil, `api.ts`
schickt `Authorization: Bearer …` mit und meldet bei `401` lokal ab.

## Routen

| Pfad               | Ansicht                                                   | Zugriff                    |
| ------------------ | --------------------------------------------------------- | -------------------------- |
| `/login`           | Anmeldung / Registrierung                                  | ohne Anmeldung             |
| `/`                | Spielekatalog – eine Kachel je Spiel                       | angemeldet                 |
| `/games/:name`     | Einstellungen (host/admin) bzw. Spielstart (player)        | angemeldet                 |
| `/sessions`        | Sitzungen und Spielverläufe über alle Spiele               | host/admin                 |
| `/ratings`         | Rangliste, eigenes Rating und Admin-Reset                  | angemeldet                 |
| `/reports`         | Meldungs-Visualisierung; Detailverwaltung für Admins        | angemeldet                 |
| `/profile`         | eigenes Profil inkl. Rating                                | angemeldet                 |
| `/play`            | Brett direkt im Tab, ohne Sitzung                           | angemeldet                 |
| `/connectfour/:id` | Spielfeld-Fenster, wird per `window.open` als Pop-up geöffnet | Mitwirkende, Host, Admin   |

Für den Produktivbetrieb braucht der Server einen SPA-Fallback: unbekannte
Pfade müssen `index.html` ausliefern. `npm run preview` macht das bereits;
`/connectfour/:id` funktioniert im Dev-Server ohne zusätzliche Konfiguration.

## Sitzungen steuern

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

## Datenhaltung

`lib/api.ts` definiert das interface `Api` und liefert die Implementierung
`httpApi`: jeder Aufruf geht an das Rust-Backend und landet in MySQL. Sitzungen,
Spielverläufe und Personen liegen also auf dem Server, nicht im Browser – das
Pop-up mit dem Brett und das Dashboard lesen denselben Stand aus derselben Quelle.

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
Datenbank kommt so etwas nicht heraus: `api.subscribe` meldet jede eigene Änderung
sofort und fragt zusätzlich alle drei Sekunden nach, damit auch andere Fenster
mitkommen. `useLiveData` abonniert das. Rendert nur bei echter Änderung neu
(Vergleich über den JSON-Text), sonst flackert jede Liste im Takt.

Die Beispielpartie aus `backend/migrations/20251007000001_seed_demo_session.sql`
landet in der Historie als „Beispiel“ markiert; „Beispiel entfernen“ löscht sie
per `DELETE /api/demo-data` samt Zügen.

### API-Vertrag mit dem Rust-Backend

`lib/api.ts` ist 1:1 auf die Routen aus `backend/src/api.rs` zugeschnitten; die
Oberfläche ruft ausschließlich `api` auf.

| Methode | Route                          | Datenhaltung (`Api`)    | DB-Tabellen |
| ------- | ------------------------------ | ----------------------- | ----------- |
| GET     | `/api/health`                  | –                       | –           |
| POST    | `/api/login`                   | `login`                 | `users`, `auth_tokens` |
| POST    | `/api/register`                | `register`              | `users`, `auth_tokens` |
| POST    | `/api/logout`                  | `logout`                | `auth_tokens` |
| GET     | `/api/users`                   | `getUsers`              | `users`     |
| GET     | `/api/games`                   | `getGameTypes`          | `game_types` |
| GET     | `/api/sessions`                | `listSessions`          | `game_sessions`, `game_session_players` |
| POST    | `/api/sessions`                | `createSession`         | dito        |
| GET     | `/api/sessions/{id}`           | `getSession`            | dito        |
| POST    | `/api/sessions/{id}/pause`     | `pauseSession`          | `game_sessions` |
| POST    | `/api/sessions/{id}/resume`    | `resumeSession`         | dito        |
| POST    | `/api/sessions/{id}/abort`     | `abortSession`          | dito        |
| POST    | `/api/sessions/{id}/surrender` | `surrenderSession`      | dito        |
| POST    | `/api/connect-four/games`      | `recordConnectFourGame` | `game_sessions`, `moves`, `player_ratings` |
| GET     | `/api/connect-four/games`      | `listGames`             | dito        |
| DELETE  | `/api/demo-data`               | `clearDemoData`         | dito        |
| GET     | `/api/ratings`                 | `getRatings`            | `users`, `player_ratings` |
| GET     | `/api/ratings/{id}`            | `getRating`             | dito        |
| POST    | `/api/admin/ratings/{id}/reset` | `resetRating`          | `player_ratings`, `rating_resets` |
| GET     | `/api/reports`                 | `getReports`            | `player_reports` (nur Admin) |
| POST    | `/api/reports`                 | `createReport`          | `player_reports` (nur Admin) |
| PATCH   | `/api/reports/{id}`            | `updateReport`          | dito        |
| DELETE  | `/api/reports/{id}`            | `deleteReport`          | dito        |
| GET     | `/api/reports/visualisation`   | `getReportOverview`     | `player_reports`, `users` |

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

## Kamera-Bibliothek

`src/lib/camera/` erkennt Züge auf einem physischen Brett über die Webcam. Die
Bibliothek ist in drei Schichten geteilt:

* `CameraCapture` holt den Stream und liefert einzelne Frames als `PixelSource`.
* `ConnectFourDetector` liest die Zellmitten anhand von vier kalibrierten Ecken
  und klassifiziert Rot/Gelb/Leer über den Farbton.
* `MoveTracker` vergleicht aufeinanderfolgende Brettzustände und erzeugt
  `TrackedMove`s. Er bestätigt Änderungen über mehrere Frames, ignoriert
  schwebende Steine und erkennt einen geleerten Spielstand als Reset.

In der Oberfläche liegt die fertige Ansicht unter **`/camera`** (Navigation
„Kamera“). Sie startet die eingebaute Laptop-Kamera, blendet ein 6×7-Raster über
das Bild und lässt die vier Ecken per Pointer verschieben. Nach „Kalibrierung
übernehmen“ zählt die App neue Steine, zeigt Brett, Zugliste und Sieger an und
speichert die Partie über `api.recordConnectFourGame` als Partie ohne Sitzung.
Die Vorschau wird bewusst nicht gespiegelt, damit Kalibrierung und Erkennung
dieselben Pixel benutzen. Für eine Kamera auf der gegenüberliegenden Brettseite
gibt es die X/Y-Spiegelung in der Kalibrierung.

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
`cornersFromRect`. Steht die Kamera auf der gegenüberliegenden Seite des
Bretts, spiegeln `flipX`/`flipY` in den Detektor-Optionen das erkannte Raster.

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

## Spielverläufe prüfen

`lib/connectFour.ts` validiert einen abgeschlossenen Verlauf, bevor er
gespeichert wird: fortlaufende `turn`-Nummern, Seitenfolge Rot/Gelb, Koordinaten
im Brett, korrekte Schwerkraft, „Unentschieden“ nur bei vollem Brett. Die Regeln
entsprechen den serverseitigen Prüfungen in `backend/src/api.rs` und sind in
`scripts/logic.test.ts` als `npm test` abgesichert.

## Barrierefreiheit und Bedienung

* Alle Bedienelemente sind echte `<button>`/`<select>` mit sichtbarem Fokusring.
* Das Brett ist mit `role="grid"` und Beschriftungen je Feld ausgezeichnet.
* Farbige Zustände sind zusätzlich beschriftet (`Laufend`, `Rot gewinnt`, …) –
  Farbe allein trägt keine Information.
* Die Gewinnchancen stehen als Prozenttext in der Legende; der Balken ist als
  Ganzes beschriftet und aktualisiert sich über eine höfliche Live-Region.
* `prefers-color-scheme` und `prefers-reduced-motion` werden berücksichtigt;
* Layout und Schrift skalieren zwischen 360 px und Desktop.

## Bekannte Grenzen

* **Anmeldung und Rollen.** Anmeldung und Registrierung laufen über
  `/api/login` und `/api/register`; die vier Beispiel-Personen haben das
  Passwort `password`, neue Konten sind `player`. Rollen und Sperren ändert nur
  die Administration über `/api/admin/users` (im Backend, nicht in dieser
  Ansicht).
* **Nur eine gehostete Partie zur Zeit.** Ohne Server gibt es keine
  Sitzungs-IDs, die werkzeugübergreifend eindeutig sind – zwei gleichzeitige
  Fenster könnten ihr Ergebnis nicht eindeutig zuordnen. Die Oberfläche weist
  deshalb darauf hin, wenn schon eine Partie offen ist – eine pausierte Sitzung
  zählt dabei als offen. Die Direktansicht (`/play`) ist nicht betroffen.
* **Nur Connect Four ist spielbar.** Das liegt an `useConnectFour.ts`: der Hook
  enthält die Spiellogik fest, andere Spiele brauchen eigene Hooks. Das Backend
  kennt die Routen für `/connectfour` und `/tictactoe`, das Frontend nutzt
  bislang nur die erste.
* **Ein Brett pro Browser.** Ohne Server gibt es keine Sitzungs-IDs, die
  werkzeugübergreifend eindeutig sind – die Daten sind an Browser und
  Rechner gebunden.
* **Pop-up-Blocker.** Blockiert der Browser `window.open`, gibt das Dashboard
  einen Link statt des Fensters aus.
* **Pfadwechsel.** Das Projekt lag zuerst unter `boardgames/boardgames/`, dann
  unter `website/boardgames/` und steht jetzt in `frontend/`. Skripte liegen
  zusätzlich im Repository-Root und starten alles per `npm run dev`. Verweise
  auf die alten Pfade gibt es nicht mehr.
