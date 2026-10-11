# Renewable transition video

The 30-second overview at the top of `renewable.html` is a three.js scene
rendered frame by frame in a headless browser, then encoded with ffmpeg.

## What is real and what is illustration

- **Real:** every number on screen. `data.json` is extracted from
  `renewable-rows.js`, the same cleaned data the live dashboard uses.
  The 2035 forecast (123.4 TWh, R² 0.845, 44.6% share) is computed in
  `scene.js` with the same linear regression and 95% prediction interval as
  the case study.
- **Illustration:** the landscape, the number of turbines and panel rows
  (scaled to wind and solar output each year), turbine speed, clouds and the
  pulses along the power lines. The video says so in its corner note.

## Files

| File | Purpose |
|---|---|
| `index.html` | The page that hosts the scene and the text overlay. |
| `scene.js` | Builds the scene. `window.frame(t)` poses and renders time `t` in seconds. |
| `data.json` | Australia: solar, wind, hydro, total renewable TWh and share, 2005 to 2024. |
| `stills.mjs` | Renders chosen moments into one contact sheet, for checking before recording. |
| `views.mjs` | Renders any camera position, for checking single objects up close. |
| `record.mjs` | Renders every frame to `frames/`. |

## Rebuild

```sh
cd tools/video
npm install
pip install imageio-ffmpeg            # provides an ffmpeg binary
python3 -m http.server 8010 &          # serve this folder

node stills.mjs sheet.png 1 6 12 16 21 27     # check first
node record.mjs 30 1.25                        # 900 frames at 1600x900

FF=$(python3 -c "import imageio_ffmpeg as f; print(f.get_ffmpeg_exe())")
$FF -y -framerate 30 -i frames/f%04d.jpg -c:v libx264 -preset slow -crf 24 \
    -pix_fmt yuv420p -profile:v high -movflags +faststart -an ../../video/renewable-transition.mp4
```

The scripts expect Chromium at `/opt/pw-browsers/chromium-1194/chrome-linux/chrome`;
change `executablePath` for another machine. With a real graphics card, drop
the SwiftShader flags and rendering is many times faster.

## Changing the timing

All beats are times in seconds in `scene.js`: the growth runs from
`T_GROW0` to `T_GROW1`, the camera follows `camKeys`, and each caption and
card has its own start and end time in `drawHUD`.
