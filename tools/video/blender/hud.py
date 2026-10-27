"""Draw the statistics over the Blender frames and encode the film.

python hud.py still f00360 f01200      (writes build/hud/f00360.png ...)
python hud.py encode                    (writes ../../../video/renewable-transition.mp4)

Needs Pillow and ffmpeg. Every number comes from ../data.json or from the
figures stated on renewable.html.
"""
import json
import math
import os
import subprocess
import sys

from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
BUILD = os.path.join(HERE, "build")
FONTS = os.path.join(HERE, "assets", "fonts")
VIDEO = os.path.normpath(os.path.join(HERE, "..", "..", "..", "video"))
DATA = json.load(open(os.path.join(HERE, "..", "data.json"), encoding="utf-8"))
TIMING = json.load(open(os.path.join(BUILD, "timing.json"), encoding="utf-8"))
SC = {s["id"]: s for s in TIMING["scenes"]}
FPS = TIMING["fps"]
W, H = TIMING["width"], TIMING["height"]
S = 2  # supersampling

YEARS = DATA["years"]
SHARE = DATA["share"]
FOSSIL = [g - r for g, r in zip(DATA["generation"], DATA["total"])]

# figures stated on renewable.html
TARGET = 82.0
F2030 = 37.8
F2035 = 44.6
SW2005, SW2024 = 4.7, 81.3
COUNTRIES = [("New Zealand", 85.5), ("Germany", 54.5), ("Australia", 35.0), ("China", 33.7)]

INK = (239, 233, 220)
MUTED = (174, 167, 147)
CARD = (21, 20, 17)
GREEN = (79, 201, 143)
SOLAR = (237, 161, 0)
WIND = (79, 201, 143)
HYDRO = (57, 135, 229)
FOSSIL_C = (150, 144, 132)
GOLD = (255, 199, 122)


# ---------------------------------------------------------------- helpers

_fonts = {}


def font(size, weight=500, mono=False):
    key = (size, weight, mono)
    if key not in _fonts:
        if mono:
            f = ImageFont.truetype(os.path.join(FONTS, "DMMono-Medium.ttf"), size * S)
        else:
            f = ImageFont.truetype(os.path.join(FONTS, "PublicSans.ttf"), size * S)
            f.set_variation_by_axes([weight])
        _fonts[key] = f
    return _fonts[key]


def clamp(u):
    return min(1.0, max(0.0, u))


def ease(u):
    u = clamp(u)
    return 1 - (1 - u) ** 3


def smooth(u):
    u = clamp(u)
    return u * u * (3 - 2 * u)


def fade(t, a, b, d=0.45):
    return smooth((t - a) / d) * smooth((b - t) / d)


def line_t(scene, i):
    return SC[scene]["lines"][i]["start"]


def series(values, year):
    y = min(max(year, YEARS[0]), YEARS[-1])
    i = min(int(y - YEARS[0]), len(YEARS) - 2)
    return values[i] + (values[i + 1] - values[i]) * (y - YEARS[0] - i)


def rgba(c, a):
    return (*c, int(round(255 * clamp(a))))


class Layer:
    """One overlay drawn at S times the frame size."""

    def __init__(self):
        self.im = Image.new("RGBA", (W * S, H * S), (0, 0, 0, 0))
        self.d = ImageDraw.Draw(self.im)

    def card(self, x, y, w, h, a, r=16, alpha=0.84):
        self.d.rounded_rectangle([x * S, y * S, (x + w) * S, (y + h) * S], r * S, fill=rgba(CARD, alpha * a))

    def rect(self, x, y, w, h, c, a, r=0):
        if w <= 0 or h <= 0:
            return
        box = [x * S, y * S, (x + w) * S, (y + h) * S]
        if r:
            self.d.rounded_rectangle(box, min(r, w / 2, h / 2) * S, fill=rgba(c, a))
        else:
            self.d.rectangle(box, fill=rgba(c, a))

    def text(self, x, y, s, size, c, a, weight=500, mono=False, anchor="la"):
        self.d.text((x * S, y * S), s, font=font(size, weight, mono), fill=rgba(c, a), anchor=anchor)

    def width(self, s, size, weight=500, mono=False):
        return self.d.textlength(s, font=font(size, weight, mono)) / S

    def line(self, pts, c, a, w=3):
        if len(pts) > 1:
            self.d.line([(x * S, y * S) for x, y in pts], fill=rgba(c, a), width=int(w * S), joint="curve")

    def dashed(self, p0, p1, c, a, w=2, dash=8, gap=6):
        (x0, y0), (x1, y1) = p0, p1
        L = math.hypot(x1 - x0, y1 - y0)
        n = 0.0
        while n < L:
            m = min(n + dash, L)
            self.line([(x0 + (x1 - x0) * n / L, y0 + (y1 - y0) * n / L),
                       (x0 + (x1 - x0) * m / L, y0 + (y1 - y0) * m / L)], c, a, w)
            n += dash + gap

    def dot(self, x, y, r, c, a):
        self.d.ellipse([(x - r) * S, (y - r) * S, (x + r) * S, (y + r) * S], fill=rgba(c, a))

    def ring(self, x, y, r, c, a, w=3):
        self.d.ellipse([(x - r) * S, (y - r) * S, (x + r) * S, (y + r) * S], outline=rgba(c, a), width=int(w * S))

    def image(self):
        return self.im.resize((W, H), Image.LANCZOS)


def kicker(L, x, y, s, a, c=MUTED):
    L.text(x, y, s.upper(), 15, c, a, mono=True)


# ---------------------------------------------------------------- scenes

def corner_note(L, t):
    a = fade(t, SC["sides"]["start"], SC["end"]["start"] + 0.6) * 0.9
    s = "ILLUSTRATION · FIGURES FROM PROJECT DATA"
    w = L.width(s, 14, mono=True)
    L.card(W - w - 44, 20, w + 24, 32, a, r=16, alpha=0.6)
    L.text(W - w - 32, 36, s, 14, INK, a, mono=True, anchor="lm")


def title(L, t):
    s = SC["title"]
    a = fade(t, s["start"] + 0.5, s["end"] + 0.2, 0.7)
    if a <= 0:
        return
    dy = (1 - ease((t - s["start"] - 0.5) / 1.0)) * 18
    x, y = 72, 380 + dy
    L.card(x - 32, y - 46, 760, 250, a)
    kicker(L, x, y - 22, "Australia's electricity · 2005 to 2035", a)
    L.text(x, y + 6, "Is Australia on track for", 46, INK, a, weight=700)
    L.text(x, y + 62, "82% renewable electricity?", 46, GREEN, a, weight=700)
    L.text(x, y + 138, "Target set by the Australian government for 2030", 20, MUTED, a)


def tag(L, anchor, text, sub, c, a):
    if anchor[2] <= 0 or a <= 0:
        return
    px, py = anchor[0] * W, anchor[1] * H
    w = max(L.width(text, 22, 700), L.width(sub, 16)) + 36
    x, y = px - w / 2, py - 96
    L.line([(px, y + 66), (px, py - 6)], INK, a * 0.9, 2)
    L.dot(px, py, 5, c, a)
    L.card(x, y, w, 66, a, r=12)
    L.rect(x + 14, y + 16, 6, 34, c, a, r=3)
    L.text(x + 30, y + 12, text, 22, INK, a, weight=700)
    L.text(x + 30, y + 40, sub, 16, MUTED, a)


def labels(L, t, st):
    s = SC["sides"]
    a = fade(t, s["start"] + 0.8, SC["growth"]["start"] + 3.5)
    tag(L, st["anchors"]["farm"], "Wind and solar", "Renewable", GREEN, a)
    tag(L, st["anchors"]["plant"], "Coal and gas", "Non-renewable", FOSSIL_C, a)


def share_panel(L, t, year):
    a = fade(t, SC["sides"]["start"] + 1.6, SC["growth"]["end"] + 0.3)
    if a <= 0:
        return
    x, y, w, h = 40, 520, W - 80, 166
    L.card(x, y, w, h, a)
    sh = series(SHARE, year)
    fo = series(FOSSIL, year)
    yr = int(round(year)) if year > 2023.98 else int(year)
    kicker(L, x + 32, y + 26, "Year", a)
    L.text(x + 32, y + 46, f"{yr}", 60, INK, a, weight=700)
    kicker(L, x + 230, y + 26, "Renewable share", a)
    L.text(x + 230, y + 46, f"{sh:.1f}%", 60, GREEN, a, weight=700)
    L.text(x + w - 32, y + 26, "FOSSIL GENERATION", 15, MUTED, a, mono=True, anchor="ra")
    L.text(x + w - 32, y + 46, f"{fo:.0f} TWh", 44, FOSSIL_C, a, weight=700, anchor="ra")

    # share bar: renewable, then non-renewable, with the target marked
    bx, by, bw, bh = x + 230, y + 120, w - 230 - 32, 22
    L.rect(bx, by, bw, bh, FOSSIL_C, a * 0.55, r=6)
    L.rect(bx, by, bw * sh / 100, bh, GREEN, a, r=6)
    tx = bx + bw * TARGET / 100
    L.rect(tx - 1.5, by - 12, 3, bh + 18, GOLD, a)
    L.text(tx - 8, by - 6, "2030 target 82%", 17, GOLD, a, weight=700, anchor="rs")


def mix_card(L, t):
    s = SC["mix"]
    a = fade(t, s["start"] + 0.3, s["end"] + 0.1)
    if a <= 0:
        return
    x, y, w, h = 40, 40, 620, 440
    L.card(x, y, w, h, a)
    L.text(x + 30, y + 26, "Renewable electricity by source", 26, INK, a, weight=700)
    kicker(L, x + 30, y + 64, "Australia · TWh per year", a)
    cx, cy, cw, ch = x + 70, y + 110, w - 200, h - 170
    for v in (0, 10, 20, 30, 40, 50):
        yy = cy + ch - ch * v / 50
        L.line([(cx, yy), (cx + cw, yy)], MUTED, a * 0.25, 1)
        L.text(cx - 12, yy, f"{v}", 16, MUTED, a, anchor="rm")
    for yv in (2005, 2010, 2015, 2020, 2024):
        L.text(cx + cw * (yv - 2005) / 19, cy + ch + 22, f"{yv}", 16, MUTED, a, anchor="ma")
    t0, t1 = s["start"] + 0.8, line_t("mix", 1) + 0.2
    prog = 2005 + 19 * ease((t - t0) / (t1 - t0)) ** 1.0
    X = lambda yr: cx + cw * (yr - 2005) / 19
    Y = lambda v: cy + ch - ch * v / 50
    ends = []
    for key, col, name in (("hydro", HYDRO, "Hydro"), ("wind", WIND, "Wind"), ("solar", SOLAR, "Solar")):
        vals = DATA[key]
        pts = [(X(yr), Y(v)) for yr, v in zip(YEARS, vals) if yr <= prog]
        if prog < 2024:
            pts.append((X(prog), Y(series(vals, prog))))
        L.line(pts, col, a, 4)
        ex, ey = pts[-1]
        L.dot(ex, ey, 5, col, a)
        ends.append([ey, ex, col, f"{name} {series(vals, prog):.1f}"])
    if prog > 2006:
        # keep the end labels at least 22 px apart
        ends.sort()
        for i in range(1, len(ends)):
            ends[i][0] = max(ends[i][0], ends[i - 1][0] + 22)
        for ly, ex, col, txt in ends:
            L.text(ex + 12, ly, txt, 18, col, a, weight=700, anchor="lm")
    # crossovers, in step with the narration
    l1 = SC["mix"]["lines"][1]
    mid = l1["start"] + (l1["end"] - l1["start"]) * 0.48
    for i, (yr, when, txt, col) in enumerate(((2019, l1["start"], "2019: wind passes hydro", WIND),
                                              (2020, mid, "2020: solar passes both", SOLAR))):
        b = a * ease((t - when) / 0.5)
        if b <= 0:
            continue
        v = DATA["wind"][yr - 2005] if yr == 2019 else DATA["solar"][yr - 2005]
        L.ring(X(yr), Y(v), 11 + 8 * (1 - b), col, b, 3)
        L.dot(cx + 10, cy + 12 + i * 28, 5, col, b)
        L.text(cx + 24, cy + 12 + i * 28, txt, 17, INK, b, weight=600, anchor="lm")


def mix_bars(L, t):
    s = SC["mix"]
    a = fade(t, line_t("mix", 0) + 0.4, s["end"] + 0.1)
    if a <= 0:
        return
    x, y, w, h = 680, 40, 560, 250
    L.card(x, y, w, h, a)
    L.text(x + 30, y + 26, "Solar and wind share of renewables", 24, INK, a, weight=700)
    l0 = SC["mix"]["lines"][0]
    t05 = l0["start"] + (l0["end"] - l0["start"]) * 0.45
    t24 = l0["start"] + (l0["end"] - l0["start"]) * 0.78
    for i, (yr, v, when) in enumerate(((2005, SW2005, t05), (2024, SW2024, t24))):
        b = a * ease((t - when + 0.6) / 0.6)
        g = ease((t - when + 0.3) / 1.0)
        by = y + 86 + i * 78
        L.text(x + 30, by + 18, f"{yr}", 22, MUTED, a, weight=700, anchor="lm")
        bx, bw = x + 110, w - 280
        L.rect(bx, by, bw, 36, (0, 0, 0), a * 0.35, r=6)
        L.rect(bx, by, bw * v / 100 * g, 36, SOLAR if i else WIND, b, r=6)
        if g > 0:
            L.text(x + w - 30, by + 18, f"{v * g:.1f}%", 38, INK, b, weight=700, anchor="rm")
    kicker(L, x + 110, y + h - 26, "Percent of renewable electricity", a)


VOLUME = [("China", 3398.8), ("Germany", 288.3), ("Australia", 97.9), ("New Zealand", 37.5)]
CCOL = {"China": (219, 69, 56), "Germany": (237, 161, 0), "Australia": GREEN, "New Zealand": (57, 135, 229)}


def world_card(L, t, st):
    """Volume and share side by side: the order flips."""
    s = SC["world"]
    a = fade(t, s["start"] + 0.3, s["end"] + 0.1)
    if a <= 0:
        return
    l0, l1, l2 = s["lines"]
    x, y, w, h = 40, 30, 580, 600
    L.card(x, y, w, h, a)
    L.text(x + 28, y + 24, "Renewable electricity, 2024", 28, INK, a, weight=700)
    kicker(L, x + 28, y + 62, "Two measures, two different leaders", a)
    bx, bw = x + 178, w - 310

    def panel(py, heading, rows, when, unit_max, fmt, target=False):
        b = a * ease((t - when) / 0.5)
        if b <= 0:
            return
        L.text(x + 28, py, heading, 21, INK, b, weight=700)
        for i, (name, v) in enumerate(rows):
            g = ease((t - when - 0.15 * i) / 0.9)
            ry = py + 38 + i * 44
            hi = name == "Australia" or (name == "China" and t >= l2["start"])
            L.text(bx - 14, ry + 15, name, 19, INK if hi else MUTED, b, weight=700 if hi else 500, anchor="rm")
            L.rect(bx, ry, bw, 30, (0, 0, 0), b * 0.35, r=5)
            L.rect(bx, ry, max(3, bw * v / unit_max * g), 30, CCOL[name], b, r=5)
            L.text(bx + bw + 14, ry + 15, fmt(v * g), 21, INK, b * min(1, g * 2), weight=700, anchor="lm")
        if target:
            tx = bx + bw * TARGET / 100
            L.dashed((tx, py + 30), (tx, py + 38 + 4 * 44 - 8), GOLD, b, 2)
            L.text(tx, py + 38 + 4 * 44 + 2, "Australia's 2030 target 82%", 15, GOLD, b, weight=700, anchor="ma")

    panel(y + 110, "By volume (TWh)", VOLUME, l0["start"] + 0.2, 3398.8, lambda v: f"{v:,.1f}")
    panel(y + 345, "By share of electricity", list(COUNTRIES), l1["start"] + 0.6, 100, lambda v: f"{v:.1f}%",
          target=True)
    # labels on the globe, following the columns
    gw = st.get("globe", 0)
    phase_share = t >= l1["start"] + 1.4
    vol = dict(VOLUME)
    share = dict(COUNTRIES)
    for name, (cx, cy, facing) in st.get("countries", {}).items():
        b = a * gw * clamp((facing - 0.05) / 0.15) * ease((t - l0["start"] - 0.6) / 0.5)
        if b <= 0:
            continue
        txt = f"{name} {share[name]:.1f}%" if phase_share else f"{name} {vol[name]:,.1f} TWh"
        tw = L.width(txt, 17, 700) + 24
        px, py = cx * W - tw / 2, cy * H - 40
        L.card(px, py, tw, 30, b, r=15, alpha=0.9)
        L.text(px + 12, py + 15, txt, 17, CCOL[name], b, weight=700, anchor="lm")
    if t >= l2["start"] + 0.3:
        b = a * ease((t - l2["start"] - 0.3) / 0.5)
        msg = "Australia's share just edges China's"
        mw = L.width(msg, 19, 700) + 32
        L.card(x + w / 2 - mw / 2, y + h + 14, mw, 40, b, r=20, alpha=0.92)
        L.text(x + w / 2, y + h + 34, msg, 19, GREEN, b, weight=700, anchor="mm")


def trend_card(L, t, year):
    """Share line like the dashboard's, with the stall and the 2015 revision marked."""
    s = SC["growth"]
    a = fade(t, s["start"] + 0.4, s["end"] + 0.1)
    if a <= 0:
        return
    x, y, w, h = 40, 34, 640, 420
    L.card(x, y, w, h, a)
    L.text(x + 28, y + 22, "Australia's renewable share rose", 25, INK, a, weight=700)
    L.text(x + 28, y + 54, "from 9% to 35% since 2005", 25, GREEN, a, weight=700)
    cx, cy, cw, ch = x + 70, y + 120, w - 120, h - 175
    X = lambda yr: cx + cw * (yr - 2005) / 19
    Y = lambda v: cy + ch - ch * v / 40
    for v in (0, 10, 20, 30, 40):
        L.line([(cx, Y(v)), (cx + cw, Y(v))], MUTED, a * 0.22, 1)
        L.text(cx - 12, Y(v), f"{v}%", 15, MUTED, a, anchor="rm")
    for yr in (2005, 2010, 2015, 2020, 2024):
        L.text(X(yr), cy + ch + 16, f"{yr}", 15, MUTED, a, anchor="ma")
    # the stall band, then the line on top
    st_a = a * ease((year - 2012.8) / 0.6)
    if st_a > 0:
        L.rect(X(2012.6), Y(15.4), X(2016.4) - X(2012.6), Y(12.6) - Y(15.4), GOLD, st_a * 0.22, r=4)
        L.text(X(2014.5), Y(21.5), "Stalled at 13 to 15%", 17, GOLD, st_a, weight=700, anchor="ms")
        L.text(X(2014.5), Y(21.5) + 18, "while the target was under review", 15, GOLD, st_a, anchor="ms")
    pts = [(X(yr), Y(v)) for yr, v in zip(YEARS, SHARE) if yr <= year]
    if year < 2024:
        pts.append((X(year), Y(series(SHARE, year))))
    L.line(pts, GREEN, a, 4)
    L.dot(*pts[-1], 6, GREEN, a)
    L.text(X(2005) + 8, Y(SHARE[0]) - 14, "8.9%", 16, GREEN, a, weight=700, anchor="ls")
    r_a = a * ease((year - 2014.95) / 0.3)
    if r_a > 0:
        L.dashed((X(2015), Y(40)), (X(2015), Y(0)), GOLD, r_a, 3, 7, 5)
        L.dot(X(2015), Y(SHARE[10]), 8, GOLD, r_a)
        tw = L.width("2015: target revised", 17, 700) + 24
        L.card(X(2015) - tw / 2, Y(40) - 34, tw, 30, r_a, r=15, alpha=0.95)
        L.text(X(2015), Y(40) - 19, "2015: target revised", 17, GOLD, r_a, weight=700, anchor="mm")
    p_a = a * ease((year - 2017.5) / 0.6)
    if p_a > 0:
        L.text(X(2005.3), Y(38), "After the reset: about +2.5 points a year", 18, INK, p_a, weight=700)
        L.text(X(2005.3), Y(38) + 22, "nearly 5× the 2005 to 2015 pace", 15, MUTED, p_a)
    if year >= 2023.95:
        e_a = a * ease((t - s["lines"][1]["end"] + 0.6) / 0.5)
        L.text(X(2024) - 8, Y(SHARE[-1]) - 14, "35.0%", 18, GREEN, e_a, weight=700, anchor="rs")


def forecast_card(L, t):
    s = SC["forecast"]
    a = fade(t, s["start"] + 0.2, s["end"] + 0.1)
    if a <= 0:
        return
    x, y, w, h = 40, 40, 760, 520
    L.card(x, y, w, h, a)
    L.text(x + 30, y + 28, "Renewable share: trend against target", 28, INK, a, weight=700)
    kicker(L, x + 30, y + 68, "Australia · linear forecast from the project", a)
    cx, cy, cw, ch = x + 80, y + 120, w - 300, h - 200
    X = lambda yr: cx + cw * (yr - 2005) / 30
    Y = lambda v: cy + ch - ch * v / 100
    for v in (0, 20, 40, 60, 80, 100):
        L.line([(cx, Y(v)), (cx + cw, Y(v))], MUTED, a * 0.22, 1)
        L.text(cx - 12, Y(v), f"{v}%", 16, MUTED, a, anchor="rm")
    for yr in (2005, 2015, 2024, 2030, 2035):
        L.text(X(yr), cy + ch + 20, f"{yr}", 16, MUTED, a, anchor="ma")
    # actual
    g = ease((t - s["start"] - 0.4) / 1.6)
    last = 2005 + 19 * g
    pts = [(X(yr), Y(v)) for yr, v in zip(YEARS, SHARE) if yr <= last]
    pts.append((X(last), Y(series(SHARE, last))))
    L.line(pts, GREEN, a, 4)
    L.dot(*pts[-1], 5, GREEN, a)
    if g >= 1:
        L.text(X(2024) - 10, Y(SHARE[-1]) - 22, "35.0% in 2024", 18, GREEN, a, weight=700, anchor="rs")
    # target
    l0, l1 = s["lines"][0], s["lines"][1]
    b = a * ease((t - l0["start"] - 0.2) / 0.6)
    L.dashed((cx, Y(TARGET)), (X(2030), Y(TARGET)), GOLD, b * 0.8, 2)
    L.dot(X(2030), Y(TARGET), 8, GOLD, b)
    L.text(X(2030) + 16, Y(TARGET), "Target 82% by 2030", 20, GOLD, b, weight=700, anchor="lm")
    # forecast to 2030
    f = ease((t - l0["start"] - 0.6) / 1.4)
    if f > 0:
        end = (X(2024 + 6 * f), Y(SHARE[-1] + (F2030 - SHARE[-1]) * f))
        L.dashed((X(2024), Y(SHARE[-1])), end, INK, a, 3, 9, 7)
        L.dot(*end, 6, INK, a)
    if f >= 1:
        L.text(X(2030), Y(F2030) + 16, "37.8% by 2030", 22, INK, a, weight=700, anchor="ma")
        gb = a * ease((t - l0["start"] - 2.2) / 0.6)
        gx = X(2030)
        L.line([(gx, Y(F2030) - 12), (gx, Y(TARGET) + 14)], GOLD, gb, 2)
        L.text(gx - 14, Y(66), "Less than half", 20, GOLD, gb, weight=700, anchor="rm")
        L.text(gx - 14, Y(66) + 24, "the target", 20, GOLD, gb, weight=700, anchor="rm")
    # on to 2035
    f2 = ease((t - l1["start"]) / 1.0)
    if f2 > 0:
        end = (X(2030 + 5 * f2), Y(F2030 + (F2035 - F2030) * f2))
        L.dashed((X(2030), Y(F2030)), end, INK, a, 3, 9, 7)
        L.dot(*end, 6, INK, a)
    if f2 >= 1:
        L.text(X(2035) + 14, Y(F2035), "44.6% by 2035", 22, INK, a, weight=700, anchor="lm")


def end_card(L, t):
    s = SC["end"]
    a = fade(t, s["start"] + 0.2, s["end"] + 2.0, 0.7)
    if a <= 0:
        return
    x, y, w, h = 140, 210, W - 280, 300
    L.card(x, y, w, h, a)
    L.text(W / 2, y + 40, "Moving in the right direction,", 40, INK, a, weight=700, anchor="ma")
    L.text(W / 2, y + 92, "but not fast enough", 40, GOLD, a, weight=700, anchor="ma")
    cols = [("35.0%", "renewable in 2024", GREEN), ("37.8%", "forecast for 2030", INK), ("82%", "2030 target", GOLD)]
    for i, (big, small, c) in enumerate(cols):
        cx = x + w * (i + 0.5) / 3
        b = a * ease((t - s["start"] - 0.6 - i * 0.25) / 0.6)
        L.text(cx, y + 170, big, 44, c, b, weight=700, anchor="ma")
        L.text(cx, y + 226, small, 18, MUTED, b, anchor="ma")
    b = a * ease((t - s["lines"][1]["start"]) / 0.6)
    L.text(W / 2, y + h + 30, "The dashboard is below", 20, INK, b, weight=600, anchor="ma")


def draw(t, st):
    L = Layer()
    corner_note(L, t)
    title(L, t)
    labels(L, t, st)
    share_panel(L, t, st["year"])
    trend_card(L, t, st["year"])
    mix_card(L, t)
    mix_bars(L, t)
    world_card(L, t, st)
    forecast_card(L, t)
    end_card(L, t)
    return L.image()


def compose(f):
    folder = os.path.join(BUILD, "frames" if MODE == "encode" else "stills")
    st = json.load(open(os.path.join(BUILD, "state", f"f{f:05d}.json")))
    gw = st.get("globe", 0.0)
    if gw >= 1.0:
        base = Image.open(os.path.join(folder, f"g{f:05d}.png")).convert("RGBA")
    else:
        base = Image.open(os.path.join(folder, f"f{f:05d}.png")).convert("RGBA")
        if gw > 0.0:
            g = Image.open(os.path.join(folder, f"g{f:05d}.png")).convert("RGBA")
            base = Image.blend(base, g, gw)
    out = Image.alpha_composite(base, draw(f / FPS, st))
    return out.convert("RGB")


MODE = sys.argv[1] if len(sys.argv) > 1 else "encode"


def main():
    if MODE == "still":
        os.makedirs(os.path.join(BUILD, "hud"), exist_ok=True)
        for name in sys.argv[2:]:
            f = int(name.strip("f"))
            compose(f).save(os.path.join(BUILD, "hud", f"f{f:05d}.png"))
        return
    n = int(round(TIMING["duration"] * FPS))
    out = os.path.join(VIDEO, "renewable-transition.mp4")
    cmd = ["ffmpeg", "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}",
           "-r", str(FPS), "-i", "-", "-i", os.path.join(BUILD, "narration.wav"),
           "-c:v", "libx264", "-preset", "slow", "-crf", "24", "-pix_fmt", "yuv420p", "-profile:v", "high",
           "-c:a", "aac", "-b:a", "96k", "-shortest", "-movflags", "+faststart", out]
    p = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    for f in range(n):
        p.stdin.write(compose(f).tobytes())
        if f % 300 == 0:
            print("frame", f, flush=True)
    p.stdin.close()
    p.wait()
    print(out)


if __name__ == "__main__":
    main()
