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
  return $response.Json | ConvertFrom-Json
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
Expect (Send POST "/sessions" '{"game_type":"connect-four","host_id":1,"players":{"red":2,"yellow":3}}' -token "") "Sitzung ohne Token" 401
Expect (Send GET "/users" -token $aliceToken) "users als Player" 200
Expect (Send GET "/reports" -token $aliceToken) "Player liest Meldungen" 403
Expect (Send GET "/admin/users" -token $aliceToken) "Player liest Benutzerverwaltung" 403
Expect (Send DELETE "/demo-data" -token $aliceToken) "Player loescht Demo" 403
Expect (Send POST "/sessions" '{"game_type":"connect-four","host_id":2,"players":{"red":2,"yellow":3}}' -token $aliceToken) "Player legt Sitzung an" 403
Expect (Send GET "/reports" -token $hostToken) "Host liest Meldungen" 403
Expect (Send GET "/admin/users" -token $hostToken) "Host liest Benutzerverwaltung" 403
Expect (Send DELETE "/demo-data" -token $hostToken) "Host loescht Demo" 403

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
  $row = $ratings | Where-Object { $_.user_id -eq $userId -and $_.game_type -eq "connect-four" }
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
$reports = Ok (Send GET "/reports") "/reports"
Write-Host "  Meldungen: $(($reports | Measure-Object).Count)"
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
$sql = 'DELETE FROM game_sessions WHERE JSON_EXTRACT(metadata_json, ''$.demo'') IS NOT TRUE; DELETE FROM player_ratings;'
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
