# Startet Docker Desktop (falls noetig) und den kompletten BoardGames-Stack.
# Danach ist die Oberflaeche unter http://localhost:5173 erreichbar.
$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
Set-Location $repo

Write-Host ''
Write-Host 'BoardGames lokal starten'
Write-Host '------------------------'
Write-Host 'Beim allerersten Start kann Docker Desktop nach der Lizenz fragen:'
Write-Host 'Bitte im Docker-Desktop-Fenster akzeptieren (und Anmeldung ueberspringen).'
Write-Host ''

$dockerBin = 'C:\Program Files\Docker\Docker\resources\bin'
if (Test-Path (Join-Path $dockerBin 'docker.exe')) {
    $env:PATH = "$dockerBin;$env:PATH"
} else {
    $cmd = Get-Command docker.exe -ErrorAction SilentlyContinue
    if (-not $cmd) { throw 'Docker CLI nicht gefunden. Ist Docker Desktop installiert?' }
}

function Test-Port {
    param([int]$Port)
    $client = New-Object System.Net.Sockets.TcpClient
    try { $client.Connect('127.0.0.1', $Port); return $true }
    catch { return $false }
    finally { $client.Dispose() }
}

$runningServices = @(& docker.exe compose ps --status running --services 2>$null)
$missingServices = @('db', 'backend', 'frontend') | Where-Object { $runningServices -notcontains $_ }
if ($missingServices.Count -gt 0) {
    foreach ($port in 5173, 3000, 3306) {
        if (Test-Port -Port $port) {
            throw "Port $port ist bereits belegt. Bitte den anderen Prozess beenden (z. B. 'npm run dev' oder eine lokale MySQL-Instanz)."
        }
    }
}

if (-not (Get-Process -Name 'Docker Desktop' -ErrorAction SilentlyContinue)) {
    $desktop = 'C:\Program Files\Docker\Docker\Docker Desktop.exe'
    if (-not (Test-Path $desktop)) { throw 'Docker Desktop.exe nicht gefunden.' }
    Write-Host '==> starte Docker Desktop'
    Start-Process -FilePath $desktop
}

Write-Host '==> warte auf die Docker-Engine (beim ersten Mal kann das etwas dauern)'
$deadline = (Get-Date).AddMinutes(10)
$ready = $false
do {
    Start-Sleep -Seconds 3
    try { & docker.exe info *> $null; $ready = ($LASTEXITCODE -eq 0) } catch { $ready = $false }
    if (-not $ready) { Write-Host '.' -NoNewline }
} until ($ready -or (Get-Date) -gt $deadline)
Write-Host ''

if (-not $ready) {
    throw 'Docker-Engine ist nicht bereit. Docker Desktop manuell starten, Lizenz/Onboarding abschliessen und das Skript erneut ausfuehren.'
}

Write-Host '==> baue und starte den Stack (der erste Build dauert einige Minuten)'
& docker.exe compose up -d --build
if ($LASTEXITCODE -ne 0) { throw "docker compose up fehlgeschlagen ($LASTEXITCODE)" }

Write-Host '==> warte auf die Oberflaeche'
$deadline = (Get-Date).AddMinutes(3)
$webReady = $false
do {
    Start-Sleep -Seconds 2
    try {
        $response = Invoke-WebRequest -Uri 'http://localhost:5173' -UseBasicParsing -TimeoutSec 5
        $webReady = ($response.StatusCode -eq 200)
    } catch { $webReady = $false }
} until ($webReady -or (Get-Date) -gt $deadline)

& docker.exe compose ps

if ($webReady) {
    Write-Host ''
    Write-Host 'BoardGames laeuft: http://localhost:5173'
    Start-Process 'http://localhost:5173'
    exit 0
} else {
    Write-Host ''
    Write-Host 'Der Stack laeuft, aber die Oberflaeche antwortet noch nicht.'
    Write-Host 'Logs ansehen:  docker compose logs -f'
    exit 1
}
