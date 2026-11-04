# Startet Docker Desktop (falls noetig) und den kompletten BoardGames-Stack.
# Danach ist die Oberflaeche unter http://localhost:5173 erreichbar.
$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
Set-Location $repo

$dockerExe = 'C:\Program Files\Docker\Docker\resources\bin\docker.exe'
if (Test-Path $dockerExe) {
    $env:PATH = "C:\Program Files\Docker\Docker\resources\bin;$env:PATH"
} else {
    $cmd = Get-Command docker.exe -ErrorAction SilentlyContinue
    if (-not $cmd) { throw 'Docker CLI nicht gefunden. Ist Docker Desktop installiert?' }
}

if (-not (Get-Process -Name 'Docker Desktop' -ErrorAction SilentlyContinue)) {
    $desktop = 'C:\Program Files\Docker\Docker\Docker Desktop.exe'
    if (-not (Test-Path $desktop)) { throw 'Docker Desktop.exe nicht gefunden.' }
    Write-Host '==> starte Docker Desktop'
    Start-Process -FilePath $desktop
}

Write-Host '==> warte auf die Docker-Engine'
$deadline = (Get-Date).AddMinutes(5)
do {
    Start-Sleep -Seconds 3
    $ready = $false
    try { & docker.exe info *> $null; $ready = ($LASTEXITCODE -eq 0) } catch { }
} until ($ready -or (Get-Date) -gt $deadline)

if (-not $ready) { throw 'Docker-Engine ist nicht bereit. Docker Desktop einmal manuell starten und pruefen.' }

Write-Host '==> baue und starte den Stack (erster Build dauert einige Minuten)'
& docker.exe compose up -d --build
if ($LASTEXITCODE -ne 0) { throw "docker compose up fehlgeschlagen ($LASTEXITCODE)" }

Write-Host '==> warte auf die Oberflaeche'
$deadline = (Get-Date).AddMinutes(3)
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
} else {
    Write-Host 'Der Stack laeuft, aber die Oberflaeche antwortet noch nicht. Logs: docker compose logs -f'
}
