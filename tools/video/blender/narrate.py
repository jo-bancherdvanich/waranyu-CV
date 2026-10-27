"""Speak every narration line, then lay the scenes out around the speech.

Writes build/audio/*.wav, build/narration.wav, build/timing.json and
../../../video/renewable-transition.vtt. Needs edge-tts and ffmpeg.
"""
import asyncio
import json
import os
import subprocess

import edge_tts

HERE = os.path.dirname(os.path.abspath(__file__))
BUILD = os.path.join(HERE, "build")
AUDIO = os.path.join(BUILD, "audio")
VTT = os.path.normpath(os.path.join(HERE, "..", "..", "..", "video", "renewable-transition.vtt"))
GAP = 0.45


def duration(path):
    out = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration",
                          "-of", "csv=p=0", path], capture_output=True, text=True, check=True)
    return float(out.stdout.strip())


async def speak(text, path, voice, rate):
    if os.path.exists(path):
        return
    raw = path[:-4] + ".mp3"
    if not os.path.exists(raw):
        await edge_tts.Communicate(text, voice, rate=rate).save(raw)
    trim = "silenceremove=start_periods=1:start_threshold=-45dB"
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", raw, "-af",
                    f"{trim},areverse,{trim},areverse", "-ar", "48000", path], check=True)


def stamp(t):
    m, s = divmod(t, 60)
    return f"{int(m):02d}:{s:06.3f}"


def main():
    film = json.load(open(os.path.join(HERE, "film.json"), encoding="utf-8"))
    os.makedirs(AUDIO, exist_ok=True)
    t = 0.0
    scenes, clips = [], []
    for sc in film["scenes"]:
        start = t
        cur = start + sc["lead"]
        lines = []
        for i, text in enumerate(sc["lines"]):
            path = os.path.join(AUDIO, f"{sc['id']}_{i}.wav")
            asyncio.run(speak(text, path, film["voice"], film["rate"]))
            d = duration(path)
            lines.append({"text": text, "start": round(cur, 3), "end": round(cur + d, 3)})
            clips.append((path, cur))
            cur += d + GAP
        end = max(start + sc["min"], cur - GAP + sc["tail"])
        scenes.append({"id": sc["id"], "start": round(start, 3), "end": round(end, 3), "lines": lines})
        t = end
    timing = {"fps": film["fps"], "width": film["width"], "height": film["height"],
              "duration": round(t, 3), "scenes": scenes}
    json.dump(timing, open(os.path.join(BUILD, "timing.json"), "w", encoding="utf-8"), indent=1)

    cmd = ["ffmpeg", "-v", "error", "-y"]
    for path, _ in clips:
        cmd += ["-i", path]
    parts = [f"[{i}:a]adelay={int(at * 1000)}:all=1[a{i}]" for i, (_, at) in enumerate(clips)]
    mix = "".join(f"[a{i}]" for i in range(len(clips)))
    parts.append(f"{mix}amix=inputs={len(clips)}:normalize=0,apad=whole_dur={t:.3f},"
                 f"loudnorm=I=-16:TP=-1.5:LRA=11[out]")
    cmd += ["-filter_complex", ";".join(parts), "-map", "[out]", "-ar", "48000", "-ac", "2",
            os.path.join(BUILD, "narration.wav")]
    subprocess.run(cmd, check=True)

    with open(VTT, "w", encoding="utf-8", newline="\n") as f:
        f.write("WEBVTT\n")
        for sc in scenes:
            for ln in sc["lines"]:
                f.write(f"\n{stamp(ln['start'])} --> {stamp(ln['end'])}\n{ln['text']}\n")
    print(f"{t:.1f} s")
    for sc in scenes:
        print(f"  {sc['id']:9s} {sc['start']:6.2f} to {sc['end']:6.2f}")


if __name__ == "__main__":
    main()
