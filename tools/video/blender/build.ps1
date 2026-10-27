param([switch]$Stills)
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

$blender = "C:\Program Files\Blender Foundation\Blender 5.2\blender.exe"
$py = "C:\Program Files\Blender Foundation\Blender 5.2\5.2\python\bin\python.exe"
$lib = Join-Path $PSScriptRoot "build\pylib"

if (-not (Test-Path (Join-Path $lib "PIL"))) {
    & $py -I -m pip install --quiet --target $lib pillow edge-tts
}
$env:PYTHONPATH = $lib

& $py -I fetch_assets.py
& $py narrate.py

$timing = Get-Content build\timing.json -Raw | ConvertFrom-Json
$last = [int][math]::Round($timing.duration * $timing.fps) - 1

if ($Stills) {
    & $blender -b --factory-startup --python scene.py -- still 4 13 27 42 50 62 76 84
    $names = Get-ChildItem build\stills -Filter *.png | ForEach-Object { $_.BaseName }
    & $py hud.py still @names
    Write-Output "Stills in build\hud"
    exit
}

& $blender -b --factory-startup --python scene.py -- render 0 $last
& $py hud.py encode
ffmpeg -v error -y -ss 33.4 -i ..\..\..\video\renewable-transition.mp4 -frames:v 1 -c:v libwebp -quality 82 ..\..\..\video\renewable-transition-poster.webp
