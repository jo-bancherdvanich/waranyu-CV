"""Speak the narration and lay it over a soft pad that dips under the voice.

Writes build/audio/*.wav, build/narration.wav and ../../../video/locollm-future.vtt.
Each line starts at its "at" time in narration.json, or just after the line
before if that one runs long. Needs edge-tts, numpy and ffmpeg.
"""
import asyncio
import json
import os
import subprocess

import edge_tts
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
BUILD = os.path.join(HERE, "build")
AUDIO = os.path.join(BUILD, "audio")
VTT = os.path.normpath(os.path.join(HERE, "..", "..", "..", "video", "locollm-future.vtt"))
SR = 48000
DURATION = 48.0
GAP = 0.35


def spoken(text, say):
    for k, v in say.items():
        text = text.replace(k, v)
    return text


def speak(text, path, voice, rate):
    if os.path.exists(path):
        return
    raw = path[:-4] + ".mp3"
    if not os.path.exists(raw):
        asyncio.run(edge_tts.Communicate(text, voice, rate=rate).save(raw))
    trim = "silenceremove=start_periods=1:start_threshold=-50dB"
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", raw, "-af", f"{trim},areverse,{trim},areverse",
                    "-ac", "1", "-ar", str(SR), path], check=True)


def pcm(path):
    r = subprocess.run(["ffmpeg", "-v", "error", "-i", path, "-f", "f32le", "-ac", "1", "-ar", str(SR), "-"],
                       capture_output=True, check=True)
    return np.frombuffer(r.stdout, dtype=np.float32)


def pad(n):
    """Am, F, C, G, six seconds each, slightly detuned left and right."""
    t = np.arange(n) / SR
    chords = [(110.0, 164.81, 220.0, 261.63), (87.31, 130.81, 174.61, 220.0),
              (130.81, 196.0, 261.63, 329.63), (98.0, 146.83, 196.0, 246.94)]
    span = 6.0
    left, right = np.zeros(n), np.zeros(n)
    for i in range(int(DURATION / span) + 1):
        env = np.clip(1 - np.abs((t - i * span - span / 2) / (span * 0.75)), 0, 1) ** 1.5
        for j, f in enumerate(chords[i % 4]):
            g = 0.5 / (j + 1) ** 0.5
            left += env * g * np.sin(2 * np.pi * f * 0.998 * t + j)
            right += env * g * np.sin(2 * np.pi * f * 1.002 * t + 2 * j)
    st = np.stack([left, right], 1)
    st *= (np.clip(t / 2.0, 0, 1) * np.clip((DURATION - t) / 2.5, 0, 1))[:, None]
    return (st / np.abs(st).max() * 0.25).astype(np.float32)


def stamp(t):
    m, s = divmod(t, 60)
    return f"00:{int(m):02d}:{s:06.3f}"


def main():
    film = json.load(open(os.path.join(HERE, "narration.json"), encoding="utf-8"))
    os.makedirs(AUDIO, exist_ok=True)
    n = int(DURATION * SR)
    voice = np.zeros(n, np.float32)
    cues, cur = [], 0.0
    for i, ln in enumerate(film["lines"]):
        path = os.path.join(AUDIO, f"line{i}.wav")
        speak(spoken(ln["text"], film["say"]), path, film["voice"], film["rate"])
        x = pcm(path)
        start = max(ln["at"], cur)
        s = int(start * SR)
        voice[s:s + len(x)] += x[:n - s]
        cur = start + len(x) / SR + GAP
        cues.append((start, start + len(x) / SR, ln["text"]))

    raw_v, raw_p = os.path.join(BUILD, "voice.f32"), os.path.join(BUILD, "pad.f32")
    voice.tofile(raw_v)
    pad(n).tofile(raw_p)
    fc = ("[0:a]highpass=f=80,acompressor=threshold=-20dB:ratio=2.5:attack=5:release=120,"
          "pan=stereo|c0=c0|c1=c0,asplit[v][sc];"
          "[1:a]lowpass=f=1800,volume=-6dB[p];[p][sc]sidechaincompress=threshold=0.02:ratio=6:attack=40:release=600[pd];"
          "[v][pd]amix=inputs=2:normalize=0,loudnorm=I=-16:TP=-1.5:LRA=11[o]")
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "f32le", "-ar", str(SR), "-ac", "1", "-i", raw_v,
                    "-f", "f32le", "-ar", str(SR), "-ac", "2", "-i", raw_p, "-filter_complex", fc, "-map", "[o]",
                    "-ar", str(SR), "-t", str(DURATION), os.path.join(BUILD, "narration.wav")], check=True)
    os.remove(raw_v)
    os.remove(raw_p)

    with open(VTT, "w", encoding="utf-8", newline="\n") as f:
        f.write("WEBVTT\n")
        for k, (a, b, text) in enumerate(cues, 1):
            f.write(f"\n{k}\n{stamp(a)} --> {stamp(b)}\n{text}\n")
    for a, b, text in cues:
        print(f"{a:6.2f} {b:6.2f} {text}")


if __name__ == "__main__":
    main()
