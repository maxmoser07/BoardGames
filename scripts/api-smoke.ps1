# Durchtest aller Routen gegen den laufenden Stack.
#
#   powershell -ExecutionPolicy Bypass -File scripts/api-smoke.ps1
#   powershell -ExecutionPolicy Bypass -File scripts/api-smoke.ps1 -MitDemoLoeschen
#
# Prueft jede Route mit einem gueltigen Fall und den Fehlerpfad daneben und gibt
# am Ende die Zeilen der Datenbank aus. Die Testdaten werden zum Schluss wieder
# entfernt; die Beispieldaten aus der Migration bleiben - ausser bei
# -MitDemoLoeschen, denn DELETE /api/demo-data loescht sie endgueltig. Neu
# bekommt man sie nur ueber ein frisches Volume:
#   docker compose down -v && docker compose up -d
#
# Seit der Rollen-Migration braucht jede Route ausser /health, /login und
# /register ein Bearer-Token. Das Skript meldet sich deshalb als Host, Spieler
# und Admin an und prueft die Rollenmatrix mit erwarteten 401/403-Antworten.
param([switch]$MitDemoLoeschen)

$ErrorActionPreference = "Stop"
$base = "http://127.0.0.1:5173/api"
$tmp = Join-Path $env:TEMP "bg-smoke"
New-Item -ItemType Directory -Force -Path $tmp | Out-Null

# Aktuelles Token; ein Aufruf ohne -token nimmt dieses. -token "" fragt bewusst
# ohne Authorization-Header an (401-Pfad).
$script:token = ""

# Gibt @{ Json = ...; Status = ... } zurueck und protokolliert den Aufruf.
function Send([string]$method, [string]$path, [string]$body = "", $token = $null) {
  if ($null -eq $token) { $token = $script:token }
  $args = @("-s", "-X", $method, "-w", "`n__status__%{http_code}", "$base$path")
  if ($token -ne "") {
    $args += @("-H", "Authorization: Bearer $token")
  }
  if ($body -ne "") {
    $file = Join-Path $tmp "body.json"
    Set-Content -Path $file -Value $body -Encoding ascii
    $args += @("-H", "Content-Type: application/json", "--data-binary", "@$file")
  }
  $out = & curl.exe @args
  $joined = $out -join "`n"
  $parts = $joined -split "`n__status__"
  $json = $parts[0]
  $status = [int]($parts[1])
  $short = if ($json.Length -gt 150) { $json.Substring(0, 150) + "..." } else { $json }
  Write-Host ("  {0,-6} {1,-34} -> {2}  {3}" -f $method, $path, $status, $short)
  return @{ Json = $json; Status = $status }
}

# Erwartet 200 oder 201 und gibt das Objekt dahinter zurueck.
function Ok($response, $path) {
  if ($response.Status -ne 200 -and $response.Status -ne 201) {
    throw "$path lieferte $($response.Status): $($response.Json)"
  }
  # PowerShell 5.1 gibt ein JSON-Array sonst als ein einzelnes Objekt aus.
  $parsed = $response.Json | ConvertFrom-Json
  foreach ($item in $parsed) { Write-Output $item }
}

# SIEHE: 200 oder ein erwarteter Fehlercode.
function Expect($response, $path, $code) {
  if ($response.Status -ne $code) {
    throw "$path lieferte $($response.Status) statt ${code}: $($response.Json)"
  }
}

# Meldet eine der Beispielpersonen an (Passwort fuer alle: "password").
function Login([string]$username) {
  $body = @{ username = $username; password = "password" } | ConvertTo-Json -Compress
  $response = Send POST "/login" $body -token ""
  $auth = Ok $response "/login ($username)"
  if ([string]::IsNullOrEmpty($auth.token)) {
    throw "Login fuer $username lieferte kein Token"
  }
  Write-Host "  $username ist $($auth.role), Rechte: $($auth.permissions | ConvertTo-Json -Compress)"
  return $auth.token
}

# Siegpartie: Rot senkrecht in Spalte 0, unterste vier Zeilen.
function Winmoves([string]$extra) {
  $m = '{"moves":['
  $m += '{"turn":1,"player":"red","location":{"x":0,"y":5}},'
  $m += '{"turn":2,"player":"yellow","location":{"x":1,"y":5}},'
  $m += '{"turn":3,"player":"red","location":{"x":0,"y":4}},'
  $m += '{"turn":4,"player":"yellow","location":{"x":1,"y":4}},'
  $m += '{"turn":5,"player":"red","location":{"x":0,"y":3}},'
  $m += '{"turn":6,"player":"yellow","location":{"x":1,"y":3}},'
  $m += '{"turn":7,"player":"red","location":{"x":0,"y":2}}],'
  $m += '"winner":"red"'
  if ($extra -ne "") { $m += ",$extra" }
  return $m + "}"
}

Write-Host "`n== Anmeldung =="
$hostToken = Login "HostUser"
$aliceToken = Login "Alice"
$bobToken = Login "Bob"
$adminToken = Login "Mara"

Write-Host "`n== Lesen =="
$script:token = $hostToken
$users = Ok (Send GET "/users") "/users"
Write-Host "  Benutzer: $($users.username -join ', ')"
$games = Ok (Send GET "/games") "/games"
Write-Host "  Spieltypen: $($games.name -join ', ')"

Write-Host "`n== Ohne Token und falsche Rolle =="
Expect (Send GET "/users" -token "") "users ohne Token" 401
Expect (Send GET "/sessions" -token "") "sessions ohne Token" 401
Expect (Send GET "/ratings" -token "") "ratings ohne Token" 401
Expect (Send GET "/reports/visualisation" -token "") "Meldungs-Visualisierung ohne Token" 401
Expect (Send POST "/sessions" '{"game_type":"connect-four","host_id":1,"players":{"red":2,"yellow":3}}' -token "") "Sitzung ohne Token" 401
Expect (Send GET "/users" -token $aliceToken) "users als Player" 200
$playerRatings = @(Ok (Send GET "/ratings" -token $aliceToken) "Player liest eigenes Rating")
if ($playerRatings.Count -ne 1) { throw "Player sieht $($playerRatings.Count) Ratings statt nur dem eigenen" }
if ($playerRatings[0].user_id -ne 2) { throw "Player sieht ein fremdes Rating" }
Write-Host "  Player-Rating: $($playerRatings[0].username) ($($playerRatings[0].rating))"
Ok (Send GET "/ratings/2" -token $aliceToken) "Player liest eigenes Rating" | Out-Null
Expect (Send GET "/ratings/3" -token $aliceToken) "Player liest fremdes Rating" 403
Expect (Send GET "/reports/visualisation" -token $aliceToken) "Player liest Meldungs-Visualisierung" 403
Expect (Send GET "/reports" -token $aliceToken) "Player liest Meldungen" 403
Expect (Send POST "/admin/ratings/2/reset" '{"rating":1200}' -token $aliceToken) "Player setzt Rating zurueck" 403
Expect (Send GET "/admin/users" -token $aliceToken) "Player liest Benutzerverwaltung" 403
Expect (Send DELETE "/demo-data" -token $aliceToken) "Player loescht Demo" 403
Expect (Send POST "/sessions" '{"game_type":"connect-four","host_id":2,"players":{"red":2,"yellow":3}}' -token $aliceToken) "Player legt Sitzung an" 403
Expect (Send GET "/reports" -token $hostToken) "Host liest Meldungen" 403
Expect (Send GET "/reports/visualisation" -token $hostToken) "Host liest Meldungs-Visualisierung" 403
$hostRatings = @(Ok (Send GET "/ratings" -token $hostToken) "Host liest Rangliste")
if ($hostRatings.Count -le 1) { throw "Host sieht keine vollstaendige Rangliste" }
Expect (Send GET "/admin/users" -token $hostToken) "Host liest Benutzerverwaltung" 403
Expect (Send DELETE "/demo-data" -token $hostToken) "Host loescht Demo" 403

Write-Host "`n== Freundschaftsanfragen =="
$script:token = $aliceToken
# Reste eines abgebrochenen Laufs entfernen; 404 heisst nur "war nicht da".
Send DELETE "/friends/3" | Out-Null
Send DELETE "/friends/4" | Out-Null
Send DELETE "/friends/1" | Out-Null

Expect (Send POST "/friends/requests" '{"user_id":2}') "Anfrage an sich selbst" 400
Expect (Send POST "/friends/requests" '{"user_id":999999}') "Anfrage an unbekanntes Konto" 404

$request = Ok (Send POST "/friends/requests" '{"user_id":3,"message":"Lust auf eine Partie?"}') "Anfrage an Bob"
if ($request.direction -ne "outgoing" -or $request.user.id -ne 3) {
  throw "Gesendete Anfrage zeigt nicht auf Bob"
}
if ($request.message -ne "Lust auf eine Partie?") { throw "Nachricht der Anfrage ging verloren" }

$aliceOverview = Ok (Send GET "/friends") "Alice nach dem Senden"
if (@($aliceOverview.outgoing).Count -ne 1) { throw "Ausgehende Anfrage fehlt bei Alice" }
if (@($aliceOverview.outgoing | Where-Object { $_.id -eq $request.id }).Count -ne 1) {
  throw "Alice sieht nicht ihre eigene offene Anfrage"
}

$bobOverview = Ok (Send GET "/friends" -token $bobToken) "Bob nach dem Senden"
$incoming = @($bobOverview.incoming)
if ($incoming.Count -ne 1 -or $incoming[0].id -ne $request.id) {
  throw "Eingehende Anfrage fehlt bei Bob"
}

Expect (Send POST "/friends/requests/$($request.id)/accept" -token $hostToken) "Host nimmt fremde Anfrage an" 403
$accepted = Ok (Send POST "/friends/requests/$($request.id)/accept" -token $bobToken) "Bob nimmt an"
if ($accepted.direction -ne "incoming") { throw "Annahme lieferte die falsche Richtung" }
Expect (Send POST "/friends/requests/$($request.id)/accept" -token $bobToken) "Anfrage zweimal annehmen" 404

$aliceOverview = Ok (Send GET "/friends") "Alice nach der Annahme"
if (@($aliceOverview.friends | Where-Object { $_.id -eq 3 }).Count -ne 1) {
  throw "Bob fehlt in Alices Freundesliste"
}
$bobOverview = Ok (Send GET "/friends" -token $bobToken) "Bob nach der Annahme"
if (@($bobOverview.friends | Where-Object { $_.id -eq 2 }).Count -ne 1) {
  throw "Alice fehlt in Bobs Freundesliste"
}

# Ablehnen darf nur die gefragte Person.
$declineRequest = Ok (Send POST "/friends/requests" '{"user_id":1}') "Anfrage an Host"
Expect (Send POST "/friends/requests/$($declineRequest.id)/decline" -token $bobToken) "Bob lehnt fremde Anfrage ab" 403
Ok (Send POST "/friends/requests/$($declineRequest.id)/decline" -token $hostToken) "Host lehnt ab" | Out-Null
Expect (Send POST "/friends/requests/$($declineRequest.id)/decline" -token $hostToken) "Anfrage zweimal ablehnen" 404
Expect (Send POST "/friends/requests/$($declineRequest.id)/accept" -token $hostToken) "Abgelehnte Anfrage annehmen" 404

# Zurueckziehen darf nur die anfragende Person.
$cancelRequest = Ok (Send POST "/friends/requests" '{"user_id":4}') "Anfrage an Mara"
Expect (Send DELETE "/friends/requests/$($cancelRequest.id)" -token $bobToken) "Bob zieht fremde Anfrage zurueck" 404
Ok (Send DELETE "/friends/requests/$($cancelRequest.id)") "Alice zieht Anfrage zurueck" | Out-Null
Expect (Send DELETE "/friends/requests/$($cancelRequest.id)") "Anfrage zweimal zurueckziehen" 404

# Entfernen beendet die angenommene Freundschaft fuer beide Seiten.
Ok (Send DELETE "/friends/3") "Freundschaft mit Bob entfernen" | Out-Null
Expect (Send DELETE "/friends/3") "Freundschaft zweimal entfernen" 404
Write-Host "  Senden, Annehmen, Ablehnen, Zurueckziehen und Entfernen geprueft"

# Der folgende Abschnitt legt Sitzungen an und braucht wieder den Host.
$script:token = $hostToken

Write-Host "`n== Sitzung anlegen und abweisen =="
$open = Ok (Send POST "/sessions" '{"game_type":"connect-four","host_id":1,"players":{"red":2,"yellow":3}}') "/sessions"
Write-Host "  offene Sitzung $($open.id), Plaetze $($open.players.user_id -join ' und ')"
Expect (Send POST "/sessions" '{"game_type":"connect-four","host_id":4,"players":{"red":2,"yellow":3}}') "Host legt fremde Sitzung an" 403
Expect (Send POST "/sessions" '{"game_type":"connect-four","host_id":1,"players":{"red":3,"yellow":4}}') "zweite Sitzung" 400
Expect (Send POST "/sessions" '{"game_type":"connect-four","host_id":1,"players":{"red":2,"yellow":2}}') "dieselbe Person" 400
Expect (Send POST "/sessions" '{"game_type":"connect-four","host_id":1,"players":{"red":2,"yellow":99}}') "unbekannte Person" 400
Expect (Send POST "/sessions" '{"game_type":"nicht-existent","host_id":1,"players":{"red":2,"yellow":3}}') "unbekanntes Spiel" 400
Ok (Send GET "/sessions/$($open.id)") "/sessions/{id}" | Out-Null
Expect (Send GET "/sessions/999999") "unbekannte Sitzung" 404

Write-Host "`n== Pause und Fortsetzen =="
$paused = Ok (Send POST "/sessions/$($open.id)/pause") "pause"
Write-Host "  Pause ab $($paused.paused_at)"
Expect (Send POST "/sessions/$($open.id)/pause") "pause zweimal" 400
Start-Sleep -Seconds 2
$resumed = Ok (Send POST "/sessions/$($open.id)/resume") "resume"
Write-Host "  abgeschlossene Pausenzeit: $($resumed.paused_ms) ms"
Expect (Send POST "/sessions/$($open.id)/resume") "resume ohne Pause" 400

# Admins duerfen fremde Sitzungen steuern, Hosts nur ihre eigenen.
$adminPaused = Ok (Send POST "/sessions/$($open.id)/pause" -token $adminToken) "Admin pausiert Host-Sitzung"
Write-Host "  Admin pausiert seit $($adminPaused.paused_at)"
Ok (Send POST "/sessions/$($open.id)/resume" -token $adminToken) "Admin setzt Host-Sitzung fort" | Out-Null

Write-Host "`n== Partie schliesst die gehostete Sitzung =="
$won = Ok (Send POST "/connect-four/games" (Winmoves "`"duration_ms`":87500,`"session_id`":$($open.id)")) "/connect-four/games"
$closed = Ok (Send GET "/sessions/$($open.id)") "Sitzung danach"
Write-Host "  Sitzung $($closed.id): outcome=$($closed.outcome) sieger=$($closed.winner_side) dauer=$($closed.duration_ms)"
if ($closed.outcome -ne "win" -or $closed.duration_ms -ne 87500) { throw "Sitzung wurde nicht korrekt geschlossen" }
Ok (Send GET "/connect-four/games/$($closed.id)") "eine Partie" | Out-Null
Expect (Send GET "/connect-four/games/999999") "unbekannte Partie" 404
Expect (Send POST "/connect-four/games" (Winmoves "`"session_id`":$($open.id)")) "zweites Mal" 400

# Eine Sitzung eines anderen Hosts darf der Host weder pausieren noch das
# Ergebnis speichern; der Admin schon.
$foreign = Ok (Send POST "/sessions" '{"game_type":"connect-four","host_id":4,"players":{"red":2,"yellow":3}}' -token $adminToken) "Admin-Sitzung"
Expect (Send POST "/sessions/$($foreign.id)/pause" -token $hostToken) "Host pausiert fremde Sitzung" 403
Expect (Send POST "/connect-four/games" (Winmoves "`"duration_ms`":1000,`"session_id`":$($foreign.id)") -token $hostToken) "Host speichert fremdes Ergebnis" 403
Ok (Send POST "/sessions/$($foreign.id)/abort" -token $adminToken) "Admin beendet fremde Sitzung" | Out-Null

Write-Host "`n== Partie ohne Sitzung, wie aus /play =="
$script:token = $aliceToken
$adhoc = Ok (Send POST "/connect-four/games" (Winmoves '"duration_ms":12000')) "/connect-four/games ohne session_id"
Write-Host "  ad_hoc=$($adhoc.ad_hoc) sitzung=$($adhoc.session_id)"

Write-Host "`n== Unregelkonforme Partien =="
Expect (Send POST "/connect-four/games" '{"moves":[{"turn":1,"player":"red","location":{"x":0,"y":5}},{"turn":2,"player":"red","location":{"x":1,"y":5}}],"winner":"red"}') "zweimal dieselbe Seite" 400
Expect (Send POST "/connect-four/games" '{"moves":[{"turn":1,"player":"red","location":{"x":0,"y":5}},{"turn":2,"player":"yellow","location":{"x":1,"y":5}}],"winner":"red"}') "Sieg ohne Viererreihe" 400
Expect (Send POST "/connect-four/games" '{"moves":[{"turn":1,"player":"red","location":{"x":0,"y":5}}],"winner":"gruen"}') "unbekannter Sieger" 400
Expect (Send POST "/connect-four/games" '{"moves":[],"winner":"red"}') "leere Partie" 400

Write-Host "`n== Abbruch und Aufgabe =="
$script:token = $hostToken
$abort = Ok (Send POST "/sessions" '{"game_type":"connect-four","host_id":1,"players":{"red":3,"yellow":4}}') "Sitzung fuer Abbruch"
$stopped = Ok (Send POST "/sessions/$($abort.id)/abort") "abort"
Write-Host "  Sitzung $($abort.id) -> $($stopped.outcome), Grund $($stopped.abort_reason)"
Expect (Send POST "/sessions/$($abort.id)/abort") "abbruch zweimal" 400

$surrender = Ok (Send POST "/sessions" '{"game_type":"connect-four","host_id":1,"players":{"red":4,"yellow":3}}') "Sitzung fuer Aufgabe"
Expect (Send POST "/sessions/$($surrender.id)/surrender" '{"user_id":3}') "Host gibt fuer fremden Platz auf" 403
$given = Ok (Send POST "/sessions/$($surrender.id)/surrender" '{"user_id":3}' -token $bobToken) "surrender"
Write-Host "  Sitzung $($surrender.id) -> $($given.outcome) fuer $($given.winner_side), aufgegeben hat $($given.surrendered_by)"
Expect (Send POST "/sessions/$($surrender.id)/surrender" '{"user_id":1}') "Sitzung schon beendet" 400

$fremd = Ok (Send POST "/sessions" '{"game_type":"connect-four","host_id":1,"players":{"red":2,"yellow":3}}') "Sitzung fuer Fremden"
Expect (Send POST "/sessions/$($fremd.id)/surrender" '{"user_id":4}' -token $adminToken) "Person sitzt nicht am Brett" 400
Ok (Send POST "/sessions/$($fremd.id)/abort") "Fremde Sitzung aufraeumen" | Out-Null

Write-Host "`n== Freundschaftsspiel und Wertung =="
function RatingOf($ratings, [int]$userId) {
  $row = $ratings | Where-Object { $_.user_id -eq $userId }
  if ($null -eq $row) { throw "Keine Wertungszeile fuer Benutzer $userId" }
  return [int]$row.rating
}

# Freundschaftsspiel: Verlauf und Ergebnis werden gespeichert, die Wertung
# bleibt aber unveraendert.
$before = Ok (Send GET "/ratings") "/ratings"
$aliceBefore = RatingOf $before 2
$bobBefore = RatingOf $before 3
$friendly = Ok (Send POST "/sessions" '{"game_type":"connect-four","host_id":1,"players":{"red":2,"yellow":3},"friendly":true}') "Sitzung als Freundschaftsspiel"
if (-not $friendly.friendly) { throw "Sitzung $($friendly.id) ist nicht als Freundschaftsspiel markiert" }
Ok (Send POST "/connect-four/games" (Winmoves "`"duration_ms`":9000,`"session_id`":$($friendly.id)")) "Freundschaftsspiel speichern" | Out-Null
$friendlyClosed = Ok (Send GET "/sessions/$($friendly.id)") "Freundschaftsspiel danach"
if (-not $friendlyClosed.friendly) { throw "friendly-Kennzeichen ging beim Speichern verloren" }
if ($friendlyClosed.outcome -ne "win") { throw "Freundschaftsspiel wurde nicht gespeichert" }
$afterFriendly = Ok (Send GET "/ratings") "/ratings nach Freundschaftsspiel"
if ((RatingOf $afterFriendly 2) -ne $aliceBefore -or (RatingOf $afterFriendly 3) -ne $bobBefore) {
  throw "Freundschaftsspiel hat die Wertung veraendert"
}
Write-Host "  Freundschaftsspiel $($friendly.id) gespeichert, Wertung bleibt $aliceBefore/$bobBefore"

# Dieselbe Partie als gewertete Sitzung: Rot gewinnt, beide Staende aendern sich.
$rated = Ok (Send POST "/sessions" '{"game_type":"connect-four","host_id":1,"players":{"red":2,"yellow":3}}') "gewertete Sitzung"
if ($rated.friendly) { throw "Gewertete Sitzung ist faelschlich freundschaftlich" }
Ok (Send POST "/connect-four/games" (Winmoves "`"duration_ms`":9000,`"session_id`":$($rated.id)")) "gewertete Partie speichern" | Out-Null
$afterRated = Ok (Send GET "/ratings") "/ratings nach gewerteter Partie"
$aliceAfter = RatingOf $afterRated 2
$bobAfter = RatingOf $afterRated 3
if ($aliceAfter -le $aliceBefore -or $bobAfter -ge $bobBefore) {
  throw "Gewertete Partie hat die Elo-Staende nicht erwartet veraendert ($aliceBefore->$aliceAfter, $bobBefore->$bobAfter)"
}
Write-Host "  gewertete Partie: Alice $aliceBefore -> $aliceAfter, Bob $bobBefore -> $bobAfter"

Write-Host "`n== Administration =="
$script:token = $adminToken
$adminUsers = Ok (Send GET "/admin/users") "/admin/users"
Write-Host "  Benutzer: $($adminUsers.username -join ', ')"

Write-Host "`n== Spiele anlegen und loeschen =="
# Reste eines abgebrochenen Laufs entfernen; 404 heisst nur "war nicht da".
$beforeGames = Ok (Send GET "/games") "/games"
$oldGame = $beforeGames | Where-Object { $_.name -eq "smoke-spiel" }
if ($null -ne $oldGame) { Send DELETE "/games/$($oldGame.id)" | Out-Null }

$createdGame = Ok (Send POST "/games" '{"name":"smoke-spiel","display_name":"Smoke-Spiel","max_players":3}') "/games anlegen"
Write-Host "  Spiel $($createdGame.id): $($createdGame.name) / $($createdGame.display_name)"
if ($createdGame.max_players -ne 3) { throw "Neues Spiel hat die falsche Spielerzahl" }
Expect (Send POST "/games" '{"name":"smoke-spiel","display_name":"Doppelt","max_players":2}') "doppelte Kennung" 409
Expect (Send POST "/games" '{"name":"Mit Leerzeichen","display_name":"Ungueltig","max_players":2}') "ungueltige Kennung" 400
Expect (Send POST "/games" '{"name":"smoke-zu-viele","display_name":"Zu viele","max_players":99}') "zu viele Spieler" 400
# Ein Spiel mit Partien bleibt erhalten, damit die Historie nicht verschwindet.
$connectFour = $beforeGames | Where-Object { $_.name -eq "connect-four" }
Expect (Send DELETE "/games/$($connectFour.id)") "Spiel mit Partien loeschen" 409
Expect (Send DELETE "/games/$($createdGame.id)" -token $hostToken) "Host loescht Spiel" 403
Ok (Send DELETE "/games/$($createdGame.id)") "Spiel loeschen" | Out-Null
Expect (Send DELETE "/games/$($createdGame.id)") "Spiel zweimal loeschen" 404
Write-Host "  Anlegen, Abweisen und Loeschen geprueft"

Write-Host "`n== Ratings lesen und zuruecksetzen =="
$allRatings = Ok (Send GET "/ratings") "/ratings"
Write-Host "  Ratings: $(($allRatings | Measure-Object).Count) Eintraege, Top: $($allRatings[0].username) ($($allRatings[0].rating))"
$before = Ok (Send GET "/ratings/2") "/ratings/2"
Write-Host "  Alice vor Reset: rating=$($before.rating), partien=$($before.games_played)"
Ok (Send GET "/ratings/3") "/ratings/3" | Out-Null
Expect (Send GET "/ratings/999999") "unbekanntes Rating" 404
Expect (Send POST "/admin/ratings/2/reset" '{"rating":50}') "Rating ausserhalb der Grenzen" 400
Expect (Send POST "/admin/ratings/999999/reset" '{"rating":1000}') "Reset fuer unbekannte Person" 404
$reset = Ok (Send POST "/admin/ratings/2/reset" '{"rating":1234,"reason":"Smoke-Test","reset_stats":false}') "Rating-Reset"
Write-Host "  Alice nach Reset: rating=$($reset.rating), partien=$($reset.games_played)"
if ($reset.rating -ne 1234) { throw "Rating-Reset lieferte $($reset.rating) statt 1234" }
if ($reset.games_played -ne $before.games_played) { throw "reset_stats=false hat die Statistik veraendert" }
$restored = Ok (Send POST "/admin/ratings/2/reset" (@{ rating = $before.rating; reason = "Smoke-Test rueckgaengig"; reset_stats = $false } | ConvertTo-Json -Compress)) "Rating wiederherstellen"
Write-Host "  Alice wiederhergestellt: rating=$($restored.rating), partien=$($restored.games_played)"
if ($restored.rating -ne $before.rating) { throw "Rating wurde nicht wiederhergestellt" }

$reports = Ok (Send GET "/reports") "/reports"
Write-Host "  Meldungen: $(($reports | Measure-Object).Count)"
$adminOverview = Ok (Send GET "/reports/visualisation") "Admin liest Meldungs-Visualisierung"
Write-Host "  Visualisierung: scope=$($adminOverview.scope), gesamt=$($adminOverview.total)"
Expect (Send PATCH "/admin/users/4" '{"role":"player"}') "Admin degradiert sich selbst" 400

Write-Host "`n== Listen =="
$sessions = Ok (Send GET "/sessions") "/sessions"
$verlaeufe = Ok (Send GET "/connect-four/games") "/connect-four/games"
foreach ($s in $sessions) {
  Write-Host ("  Sitzung {0,-3} {1,-5} {2,-7} dauer={3,-7} demo={4}" -f $s.id, $s.outcome, $s.winner_side, $s.duration_ms, $s.demo)
}
foreach ($g in $verlaeufe) {
  Write-Host ("  Verlauf {0,-3} ad_hoc={1,-5} demo={2,-5} zuege={3,-3} sieger={4}" -f $g.session.id, $g.session.ad_hoc, $g.session.demo, $g.moves.Count, $g.session.winner_side)
}

Write-Host "`n== Testdaten entfernen =="
if ($MitDemoLoeschen) {
  Ok (Send DELETE "/demo-data") "/demo-data" | Out-Null
  Write-Host "  Beispielpartie geloescht (nur mit -MitDemoLoeschen)"
}
$sql = 'DELETE FROM game_sessions WHERE JSON_EXTRACT(metadata_json, ''$.demo'') IS NOT TRUE; DELETE FROM player_ratings; DELETE FROM friendships WHERE requester_id IN (1,2,3,4) OR addressee_id IN (1,2,3,4);'
# mysql schreibt die Passwort-Warnung nach stderr, das wuerde mit
# $ErrorActionPreference = "Stop" den Lauf abbrechen.
$ErrorActionPreference = "Continue"
docker compose exec -T db mysql -uboardgames -pboardgames boardgames -e $sql 2>&1 | Select-String -NotMatch "Warning"
$ErrorActionPreference = "Stop"

$rest = Ok (Send GET "/sessions" -token $hostToken) "/sessions"

foreach ($token in @($hostToken, $aliceToken, $bobToken, $adminToken)) {
  Send POST "/logout" -token $token | Out-Null
}
Write-Host "  Sitzungen danach: $(($rest | Measure-Object).Count)"
Write-Host ""
