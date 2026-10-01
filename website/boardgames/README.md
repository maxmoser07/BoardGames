# BoardGames – Website

React-/Vite-Oberfläche für Connect-Four-Sitzungen: Sitzung anlegen, Brett in einem
eigenen Fenster öffnen, Partien verwalten und Spielverläufe sammeln.

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # tsc -b && vite build -> dist/
npm run preview    # Produktionsbuild lokal ausliefern
npm run lint       # eslint (inkl. React-Compiler-Regeln)
npm test           # Router, Ableitungen und Ergebnis-Pruefung (Node, ohne Browser)
```

Voraussetzung ist nur Node 20+. Ein laufendes Backend wird **nicht** benötigt –
die Daten liegen im Browser (siehe [Datenhaltung](#datenhaltung)).

## Aufbau

```
src/
  App.tsx                  Wurzel: verteilt die drei Ansichten (router.ts)
  Dashboard.tsx            Übersicht: Sitzung anlegen, Sitzungen, Historie
  GameSessionWindow.tsx    Spielfeld-Fenster unter /connectfour/:id
  PlayView.tsx             Partie ohne Sitzung unter /play
  router.ts                Pfadauflösung ohne Router-Bibliothek
  types.ts                 Domänen-Typen (Sitzung, Ergebnis, Seite)
  ConnectFour.tsx          eingefroren – siehe unten
  useConnectFour.ts        eingefroren – siehe unten
  ConnectFour.css          Gestaltung des Bretts
  index.css                Gestaltung der Oberfläche (Variablen + Komponenten)
  components/              Bausteine: Karten, Auswahl, Anzeigen, Rahmen
  hooks/                   useLiveData, useNow, usePersistentState
  lib/                     Datenhaltung, Validierung, Formatierung, fetch-Brücke
```

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
  und erwartet eine 2xx-Antwort. Damit das ohne Backend funktioniert, beantwortet
  `lib/gameResultBridge.ts` genau diesen Request lokal (siehe unten). Die Datei
  kann ersatzlos entfallen, sobald das Backend läuft.

## Routen

| Pfad               | Ansicht                                                   |
| ------------------ | --------------------------------------------------------- |
| `/`                | Dashboard                                                   |
| `/play`            | Brett direkt im Tab, ohne Sitzung                           |
| `/connectfour/:id` | Spielfeld-Fenster, wird per `window.open` als Pop-up geöffnet |

Für den Produktivbetrieb braucht der Server einen SPA-Fallback: unbekannte
Pfade müssen `index.html` ausliefern. `npm run preview` macht das bereits;
`/connectfour/:id` funktioniert im Dev-Server ohne zusätzliche Konfiguration.

## Datenhaltung

`lib/api.ts` definiert das interface `Api` und liefert die aktuelle
Implementierung `localApi` auf Basis von `localStorage` (`lib/storage.ts`).
Damit sehen das Pop-up mit dem Brett und das Dashboard denselben Stand, ohne
dass ein Server laufen muss.

Aktualisierung ohne Polling: `localStorage` ist origin- und damit
fensterübergreifend, benachrichtigt aber nur *andere* Fenster. `lib/storage.ts`
hängt daher an jedes Fenster ein `storage`-Event und ruft die Abonnenten
zusätzlich lokal auf; jeder Schreibvorgang bekommt eine eigene Revision, damit
sich der gespeicherte String garantiert ändert. `useLiveData` abonniert das und
lädt neu – synchron wirkende Änderungen im anderen Fenster erscheinen dadurch
sofort im Dashboard.

Es wird eine Beispielpartie mit ausgeliefert (in der Historie als „Beispiel“
gekennzeichnet), damit beim ersten Aufruf etwas zu sehen ist; „Beispiel
entfernen“ leert sie.

### API-Vertrag für das Rust-Backend

`lib/api.ts` ist bewusst 1:1 auf die REST-Routen aus `backend/src/api.rs`
zugeschnitten. Für den Umstieg genügt es, `localApi` durch eine HTTP-Variante zu
ersetzen – die Oberfläche ruft ausschließlich `api` auf.

| Methode | Route                         | Datenhaltung (`Api`)         | DB-Tabellen |
| ------- | ----------------------------- | ---------------------------- | ----------- |
| GET     | `/api/health`                 | –                            | –           |
| GET     | `/api/users`                  | `getUsers`                   | `users`, `v_user_permissions` |
| GET     | `/api/games`                  | `getGameTypes`               | `game_types` |
| GET     | `/api/sessions`               | `listSessions`               | `game_sessions`, `game_session_players` |
| POST    | `/api/sessions`               | `createSession`              | `game_sessions`, `game_session_players` |
| GET     | `/api/sessions/{id}`          | `getSession`                 | dito |
| POST    | `/api/sessions/{id}/abort`    | `abortSession`               | `game_sessions` |
| POST    | `/api/sessions/{id}/surrender`| `surrenderSession`           | dito |
| POST    | `/api/connect-four/games`     | `recordConnectFourGame`      | `game_sessions`, `moves` |
| GET     | `/api/connect-four/games`     | `listGames`                  | dito |

Beim Umstieg sind zwei Punkte zu beachten:

1. **`POST /api/connect-four/games` schließt die gehostete Sitzung an.** Der Hook
   kennt die Sitzungs-Id nicht, sie kann also nur aus der Umgebung kommen
   (z. B. ein Cookie, das das Spielfeld-Fenster beim Laden setzt). Ohne diese
   Verknüpfung entstehen zwei getrennte Datensätze: eine leere Sitzung und eine
   anonyme Partie. Aktuell löst das `gameResultBridge`, weil Frontend und
   Datenhaltung im selben Tab laufen.
2. **Der Dev-Server leitet `/api` weiter.** `vite.config.ts` proxyt auf
   `http://127.0.0.1:3000` (siehe `backend/.env`), überschreibbar mit
   `BACKEND_URL`.

Der Vite-Dev-Server läuft ohne Backend trotzdem: `/api/connect-four/games` wird
lokal beantwortet, alle übrigen Routen sind erst mit Backend aktiv.

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
* `prefers-color-scheme` und `prefers-reduced-motion` werden berücksichtigt;
* Layout und Schrift skalieren zwischen 360 px und Desktop.

## Bekannte Grenzen

* **Kein Login.** „Angemeldet als“ wählt eine der Beispiel-Personen; die
  Rechteprüfung (`v_user_permissions`) wird erst mit dem Backend scharf.
* **Nur eine gehostete Partie zur Zeit.** Ohne Server gibt es keine
  Sitzungs-IDs, die werkzeugübergreifend eindeutig sind – zwei gleichzeitige
  Fenster könnten ihr Ergebnis nicht eindeutig zuordnen. Das Dashboard weist
  deshalb darauf hin, wenn schon eine Partie läuft. Die Direktansicht
  (`/play`) ist davon nicht betroffen.
* **Ein Brett pro Browser.** Ohne Server gibt es keine Sitzungs-IDs, die
  werkzeugübergreifend eindeutig sind – die Daten sind an Browser und
  Rechner gebunden.
* **Pop-up-Blocker.** Blockiert der Browser `window.open`, gibt das Dashboard
  einen Link statt des Fensters aus.
* **`boardgames/boardgames/`** im Repository-Root ist ein veraltetes Duplikat
  dieses Projekts und wird nicht mehr gepflegt.
