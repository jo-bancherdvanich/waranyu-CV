# Renewable transition film (Blender)

The narrated film at the top of `renewable.html`. A Blender scene of a
wheatbelt wind and solar farm beside a coal and gas plant, with the
statistics drawn over it.

## What is real and what is illustration

- **Real:** every number on screen and in the narration. Yearly values come
  from `../data.json` (the same data as the dashboard). The 2030 and 2035
  forecasts, the solar and wind share of renewables, and the country shares
  are the figures stated on `renewable.html`.
- **Illustration:** the landscape, and the number of turbines and panel rows,
  which grow with wind and solar output each year. Steam from the plant
  thins as fossil generation falls. The corner note says so.

## Files

| File | Purpose |
|---|---|
| `film.json` | Scenes and narration lines. Scene lengths follow the speech. |
| `narrate.py` | Speaks each line, writes `build/timing.json`, `build/narration.wav` and `video/renewable-transition.vtt`. |
| `scene.py` | Builds the scene in Blender and renders frames, plus per-frame state (year, label positions). |
| `hud.py` | Draws the statistics over each frame and encodes the MP4 with the narration. |
| `assets.json`, `fetch_assets.py` | The CC0 models, textures, HDRI and OFL fonts, downloaded to `assets/` (not committed). Credits in `video/ASSETS.md`. |
| `build.ps1` | Runs every step. |

## Rebuild (PowerShell)

Blender 5.2 and ffmpeg on the PATH. Pillow and edge-tts go into a local
folder for Blender's own Python, so nothing is installed system-wide.

```powershell
cd tools\video\blender
.\build.ps1             # full build, about 3 hours on a laptop GPU
.\build.ps1 -Stills     # check a few moments first
```

Rendered frames are kept in `build/frames/`, so an interrupted render picks
up where it stopped.
