param([switch]$Stills)
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

$blender = "C:\Program Files\Blender Foundation\Blender 5.2\blender.exe"
$py = "C:\Program Files\Blender Foundation\Blender 5.2\5.2\python\bin\python.exe"
$lib = Join-Path $PSScriptRoot "build\pylib"

if (-not (Test-Path (Join-Path $lib "PIL"))) {
    & $py -I -m pip install --quiet --target $lib pillow
}
$env:PYTHONPATH = $lib
$env:PYLIB = $lib

& $py -I ..\blender\fetch_assets.py .
if (-not (Test-Path assets\mh_base)) { & $py -I unpack.py }

# the narration is the original film's track; keep a copy before the film is replaced
if (-not (Test-Path build\narration.wav)) {
    ffmpeg -v error -y -i ..\..\..\video\locollm-future.mp4 -vn -ar 48000 -ac 2 build\narration.wav
}

if ($Stills) {
    & $blender -b --factory-startup --python scene.py -- still 3 9.5 15.5 22.5 25 28 31 35.5 40 45
    $names = Get-ChildItem build\stills -Filter *.png | ForEach-Object { $_.BaseName }
    & $py hud.py still @names
    Write-Output "Stills in build\hud"
    exit
}

& $blender -b --factory-startup --python scene.py -- render 0 1439
& $py hud.py encode
ffmpeg -v error -y -ss 40 -i ..\..\..\video\locollm-future.mp4 -frames:v 1 -q:v 3 ..\..\..\video\locollm-future-poster.jpg
