"""Captions, badges and cards over the LocoLLM frames, then encode.

python hud.py still f00090 f00600     (writes build/hud/)
python hud.py encode                  (writes ../../../video/locollm-future.mp4)

The narration is the existing track, kept as build/narration.wav, and the
captions follow video/locollm-future.vtt.
"""
import json
import os
import re
import subprocess
import sys

from PIL import Image, ImageDraw

import screens
from screens import font, icon

HERE = os.path.dirname(os.path.abspath(__file__))
BUILD = os.path.join(HERE, "build")
VIDEO = os.path.normpath(os.path.join(HERE, "..", "..", "..", "video"))
W, H, S, FPS = 1280, 720, 2, 30
DURATION = 48.0

NAVY = (28, 40, 70)
INK = (255, 255, 255)
HL = (130, 180, 255)

BADGES = [  # name, colour, icon, appears at
    ("Privacy law", (52, 84, 160), "scales", 1.0),
    ("Health", (220, 60, 72), "cross", 7.2),
    ("Small business", (236, 150, 40), "bag", 7.5),
    ("Finance", (30, 160, 90), "dollar", 7.8),
    ("Education", (120, 80, 200), "cap", 8.1),
    ("Accounting", (25, 140, 130), "calc", 8.4),
    ("Real estate", (238, 120, 40), "house", 8.7),
    ("Pharmacy", (40, 170, 190), "pill", 9.0),
    ("Government", (90, 100, 120), "columns", 9.3),
    ("HR", (60, 120, 220), "people", 9.6),
]
HIGHLIGHT = ["one", "privacy law", "every place in town", "local health specialist", "never leaves the building",
             "can't pay", "marketing", "finance", "compliance", "law", "Many", "LocoLLM"]


def clamp(u):
    return min(1.0, max(0.0, u))


def ease(u):
    u = clamp(u)
    return 1 - (1 - u) ** 3


def fade(t, a, b, d=0.35):
    return ease((t - a) / d) * ease((b - t) / d)


def read_vtt():
    cues = []
    lines = open(os.path.join(VIDEO, "locollm-future.vtt"), encoding="utf-8").read().splitlines()
    for i, ln in enumerate(lines):
        m = re.match(r"(\d+):(\d+):([\d.]+) --> (\d+):(\d+):([\d.]+)", ln)
        if m:
            a = int(m[1]) * 3600 + int(m[2]) * 60 + float(m[3])
            b = int(m[4]) * 3600 + int(m[5]) * 60 + float(m[6])
            cues.append((a, b, lines[i + 1].strip()))
    return cues


CUES = read_vtt()


class Layer:
    def __init__(self):
        self.im = Image.new("RGBA", (W * S, H * S), (0, 0, 0, 0))
        self.d = ImageDraw.Draw(self.im)

    def rgba(self, c, a):
        return (*c[:3], int(255 * clamp(a)))

    def pill(self, x, y, w, h, c, a, r=None):
        r = h / 2 if r is None else r
        self.d.rounded_rectangle([x * S, y * S, (x + w) * S, (y + h) * S], r * S, fill=self.rgba(c, a))

    def text(self, x, y, s, size, c, a, weight=600, anchor="la"):
        self.d.text((x * S, y * S), s, font=font(size * S, weight), fill=self.rgba(c, a), anchor=anchor)

    def width(self, s, size, weight=600):
        return self.d.textlength(s, font=font(size * S, weight)) / S

    def line(self, p0, p1, c, a, w=3):
        self.d.line([(p0[0] * S, p0[1] * S), (p1[0] * S, p1[1] * S)], fill=self.rgba(c, a), width=int(w * S))

    def badge(self, x, y, r, col, ic, label, a, pop=1.0):
        if a <= 0:
            return
        r = r * (0.6 + 0.4 * pop)
        sub = Image.new("RGBA", (int(r * 2 * S + 8 * S), int(r * 2 * S + 8 * S)), (0, 0, 0, 0))
        sd = ImageDraw.Draw(sub)
        c = sub.width / 2
        sd.ellipse([c - r * S - 3 * S, c - r * S - 3 * S, c + r * S + 3 * S, c + r * S + 3 * S], fill=(255, 255, 255, 255))
        sd.ellipse([c - r * S, c - r * S, c + r * S, c + r * S], fill=(*col, 255))
        icon(sd, ic, c, c, r * S * 0.92)
        if a < 1:
            alpha = sub.getchannel("A").point(lambda v: int(v * a))
            sub.putalpha(alpha)
        self.im.alpha_composite(sub, (int(x * S - c), int(y * S - c)))
        if label:
            w = self.width(label, 15) + 18
            self.pill(x - w / 2, y + r + 6, w, 24, (255, 255, 255), a * 0.95)
            self.text(x, y + r + 18, label, 15, col, a, 700, "mm")

    def image(self):
        return self.im.resize((W, H), Image.LANCZOS)


def caption(L, t):
    for a, b, text in CUES:
        if a - 0.15 <= t <= b + 0.5:
            al = fade(t, a - 0.15, b + 0.5, 0.25)
            size = 24
            # split into highlighted runs
            spans = [(text, False)]
            for k in sorted(HIGHLIGHT, key=len, reverse=True):
                out = []
                for s, h in spans:
                    if h or k not in s:
                        out.append((s, h))
                        continue
                    i = s.index(k)
                    out += [(s[:i], False), (k, True), (s[i + len(k):], False)]
                spans = [x for x in out if x[0]]
            total = sum(L.width(s, size, 700 if h else 600) for s, h in spans)
            x = W / 2 - total / 2
            L.pill(x - 22, H - 78, total + 44, 46, NAVY, al * 0.9, 14)
            for s, h in spans:
                L.text(x, H - 55, s, size, HL if h else INK, al, 700 if h else 600, "lm")
                x += L.width(s, size, 700 if h else 600)


def kicker(L, t):
    s = "THE FUTURE OF LOCOLLM"
    w = L.width(s, 14, 700) + 28
    L.pill(24, 22, w, 30, NAVY, 0.88)
    L.text(38, 37, s, 14, INK, 1.0, 700, "lm")


def town_badges(L, t, st, final=False):
    for name, col, ic, when in BADGES:
        an = st["anchors"].get(name)
        if not an or an[2] <= 0:
            continue
        if final:
            a = fade(t, 37.3, 43.0 if final else 99)
            pop = ease((t - 37.3) / 0.4)
        else:
            a = fade(t, when, 12.4)
            pop = ease((t - when) / 0.35)
        L.badge(an[0] * W, an[1] * H, 24, col, ic, name, a, pop)


def final_links(L, t, st):
    c = st["anchors"].get("centre")
    if not c:
        return
    a = fade(t, 37.8, 43.0)
    cx, cy = W / 2, 104
    for i, (name, col, *_rest) in enumerate(BADGES):
        an = st["anchors"].get(name)
        if not an or an[2] <= 0:
            continue
        g = ease((t - 37.8 - i * 0.08) / 0.6)
        if g > 0:
            x, y = an[0] * W, an[1] * H
            L.line((cx, cy), (cx + (x - cx) * g, cy + (y - cy) * g), col, a * 0.85, 3)
    w = L.width("One small model", 17, 700) + 56
    L.pill(cx - w / 2, cy - 20, w, 40, (255, 255, 255), a)
    icon(L.d, "lock", (cx - w / 2 + 22) * S, cy * S, 11 * S, col=NAVY)
    L.text(cx + 12, cy, "One small model", 17, NAVY, a, 700, "mm")


def hospital_card(L, t):
    a = fade(t, 13.4, 19.0)
    if a <= 0:
        return
    x, y, w, h = W / 2 - 250, 96, 500, 150
    L.pill(x, y, w, h, NAVY, a * 0.9, 18)
    L.badge(x + 90, y + 66, 34, (220, 60, 72), "cross", "Patient records", a)
    L.badge(x + w - 90, y + 66, 34, (120, 130, 150), "cloud", "Cloud AI", a)
    g = ease((t - 14.0) / 0.8)
    L.line((x + 140, y + 66), (x + 140 + (w - 280) * g, y + 66), INK, a * 0.6, 3)
    b = ease((t - 15.0) / 0.4)
    if b > 0:
        cx, cy, r = x + w / 2, y + 66, 22 * (0.6 + 0.4 * b)
        L.d.ellipse([(cx - r) * S, (cy - r) * S, (cx + r) * S, (cy + r) * S], fill=L.rgba((220, 50, 60), a * b))
        L.line((cx - r * 0.45, cy - r * 0.45), (cx + r * 0.45, cy + r * 0.45), INK, a * b, 4)
        L.line((cx - r * 0.45, cy + r * 0.45), (cx + r * 0.45, cy - r * 0.45), INK, a * b, 4)


def local_badge(L, t, st):
    a = fade(t, 24.1, 26.5)
    if a <= 0:
        return
    s = "Stays on this computer"
    w = L.width(s, 18, 700) + 70
    x, y = W - w - 40, 96
    L.pill(x, y, w, 46, (32, 150, 90), a * 0.95)
    icon(L.d, "lock", (x + 28) * S, (y + 23) * S, 12 * S)
    L.text(x + 48, y + 23, s, 18, INK, a, 700, "lm")


def shop_badges(L, t, st):
    lp = st["anchors"].get("laptop")
    if not lp:
        return
    for i, (name, col, ic, when) in enumerate(screens.TILES):
        a = fade(t, when - 0.1, 37.2)
        if a <= 0:
            continue
        x = W * (0.22 + 0.19 * i)
        y = 150 + (24 if i in (0, 3) else 0)
        g = ease((t - when) / 0.5)
        lx, ly = lp[0] * W, lp[1] * H
        L.line((x, y + 40), (x + (lx - x) * g, y + 40 + (ly - y - 40) * g), col, a * 0.8, 4)
        L.badge(x, y, 38, col, ic, name, a, ease((t - when) / 0.35))


def end_card(L, t):
    a = fade(t, 43.0, 50.0, 0.6)
    if a <= 0:
        return
    w, h = 640, 130
    x, y = W / 2 - w / 2, H - 220
    L.pill(x, y, w, h, (255, 255, 255), a * 0.96, 20)
    t1, t2 = "This is the future of ", "LocoLLM"
    tw = L.width(t1, 40, 800) + L.width(t2, 40, 800)
    L.text(W / 2 - tw / 2, y + 50, t1, 40, NAVY, a, 800, "lm")
    L.text(W / 2 - tw / 2 + L.width(t1, 40, 800), y + 50, t2, 40, (52, 100, 210), a, 800, "lm")
    L.text(W / 2, y + 96, "One small model. Many free, private specialists.", 20, (90, 96, 110), a, 500, "mm")


def draw(t, st):
    L = Layer()
    kicker(L, t)
    if t < 12.4:
        town_badges(L, t, st)
    elif t < 19.2:
        hospital_card(L, t)
    elif t < 26.5:
        local_badge(L, t, st)
    elif 30.0 <= t < 37.2:
        shop_badges(L, t, st)
    elif t >= 37.2:
        final_links(L, t, st)
        town_badges(L, t, st, final=True)
        end_card(L, t)
    if t < 43.0:
        caption(L, t)
    return L.image()


def compose(f, folder):
    base = Image.open(os.path.join(BUILD, folder, f"f{f:05d}.png")).convert("RGBA")
    st = json.load(open(os.path.join(BUILD, "state", f"f{f:05d}.json")))
    out = Image.alpha_composite(base, draw(f / FPS, st)).convert("RGB")
    return out


def main():
    mode = sys.argv[1] if len(sys.argv) > 1 else "encode"
    if mode == "still":
        os.makedirs(os.path.join(BUILD, "hud"), exist_ok=True)
        for name in sys.argv[2:]:
            f = int(name.strip("f"))
            compose(f, "stills").save(os.path.join(BUILD, "hud", f"f{f:05d}.png"))
        return
    n = int(DURATION * FPS)
    out = os.path.join(VIDEO, "locollm-future.mp4")
    cmd = ["ffmpeg", "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", str(FPS),
           "-i", "-", "-i", os.path.join(BUILD, "narration.wav"), "-c:v", "libx264", "-preset", "slow", "-crf", "22",
           "-pix_fmt", "yuv420p", "-profile:v", "high", "-c:a", "aac", "-b:a", "128k", "-shortest",
           "-movflags", "+faststart", out]
    p = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    for f in range(n):
        p.stdin.write(compose(f, "frames").tobytes())
        if f % 300 == 0:
            print("frame", f, flush=True)
    p.stdin.close()
    p.wait()
    print(out)


if __name__ == "__main__":
    main()
