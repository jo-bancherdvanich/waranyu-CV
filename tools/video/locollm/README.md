# The future of LocoLLM (Blender)

The 48-second narrated film on `locollm.html`: a small town where every
building gets its own specialist, a hospital room where a clinician uses a
local health specialist, and a corner shop using free business specialists.

## Files

| File | Purpose |
|---|---|
| `scene.py` | Builds the town, hospital room and shop in Blender and renders frames, plus per-frame label positions. |
| `mhuman.py` | Builds the people from MakeHuman data: body shape, skin, eyes, brows, lashes, hair and clothes, a skeleton and weights, then poses them. It reads the files as data; no add-on is installed or run. |
| `screens.py` | Draws what the monitor, laptop and patient monitor show, and the badge icons. |
| `hud.py` | Captions, badges and cards over the frames; encodes the MP4 with the narration. |
| `assets.json`, `unpack.py` | The Poly Haven and MakeHuman assets (CC0), downloaded to `assets/` and not committed. Credits in `video/ASSETS.md`. |
| `build.ps1` | Runs every step. |

The narration is the original film's voice track, and the captions follow
`video/locollm-future.vtt`, so the words and timing are unchanged.

## Rebuild (PowerShell)

```powershell
cd tools\video\locollm
.\build.ps1 -Stills     # check ten moments first
.\build.ps1             # full build, a few hours on a laptop GPU
```
