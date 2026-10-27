"""Screen images for the LocoLLM film, drawn with Pillow, plus shared icons."""
import math
import os

from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
FONT = os.path.join(HERE, "assets", "fonts", "PublicSans.ttf")

NAVY = (36, 52, 88)
INK = (30, 34, 44)
MUTED = (110, 116, 128)
BLUE = (66, 125, 214)
PAPER = (246, 247, 250)
GREEN = (32, 150, 90)

# the old film's cues, from video/locollm-future.vtt
Q_START, A_START, FOOT = 20.0, 21.8, 24.1
TILES = [("Marketing", (240, 150, 40), "megaphone", 32.65), ("Finance", (30, 160, 90), "dollar", 33.45),
         ("Compliance", (40, 90, 180), "shield", 34.1), ("Law", (120, 80, 200), "scales", 35.1)]

_f = {}


def font(size, weight=500):
    k = (size, weight)
    if k not in _f:
        f = ImageFont.truetype(FONT, size)
        f.set_variation_by_axes([weight])
        _f[k] = f
    return _f[k]


def wrap(d, text, f, width):
    words, lines, cur = text.split(), [], ""
    for w in words:
        t = (cur + " " + w).strip()
        if d.textlength(t, font=f) > width and cur:
            lines.append(cur)
            cur = w
        else:
            cur = t
    lines.append(cur)
    return lines


# ---------------------------------------------------------------- icons

def icon(d, kind, cx, cy, r, col=(255, 255, 255), w=None):
    """Simple white glyphs drawn inside a badge of radius r."""
    w = w or max(2, int(r * 0.14))
    if kind == "cross":
        a, b = r * 0.55, r * 0.18
        d.rectangle([cx - a, cy - b, cx + a, cy + b], fill=col)
        d.rectangle([cx - b, cy - a, cx + b, cy + a], fill=col)
    elif kind == "scales":
        d.line([cx, cy - r * 0.55, cx, cy + r * 0.45], fill=col, width=w)
        d.line([cx - r * 0.55, cy - r * 0.35, cx + r * 0.55, cy - r * 0.35], fill=col, width=w)
        d.line([cx - r * 0.3, cy + r * 0.48, cx + r * 0.3, cy + r * 0.48], fill=col, width=w)
        for s in (-1, 1):
            x = cx + s * r * 0.5
            d.line([x, cy - r * 0.35, x - r * 0.18, cy + r * 0.1], fill=col, width=max(1, w // 2))
            d.line([x, cy - r * 0.35, x + r * 0.18, cy + r * 0.1], fill=col, width=max(1, w // 2))
            d.chord([x - r * 0.24, cy - r * 0.05, x + r * 0.24, cy + r * 0.3], 0, 180, fill=col)
    elif kind == "dollar":
        d.text((cx, cy), "$", font=font(int(r * 1.3), 800), fill=col, anchor="mm")
    elif kind == "house":
        d.polygon([(cx - r * 0.55, cy - r * 0.02), (cx, cy - r * 0.55), (cx + r * 0.55, cy - r * 0.02)], fill=col)
        d.rectangle([cx - r * 0.38, cy - r * 0.05, cx + r * 0.38, cy + r * 0.5], fill=col)
    elif kind == "pill":
        d.rounded_rectangle([cx - r * 0.55, cy - r * 0.22, cx + r * 0.55, cy + r * 0.22], r * 0.22, fill=col)
    elif kind == "columns":
        d.polygon([(cx - r * 0.6, cy - r * 0.25), (cx, cy - r * 0.6), (cx + r * 0.6, cy - r * 0.25)], fill=col)
        for i in range(4):
            x = cx - r * 0.42 + i * r * 0.28
            d.rectangle([x - r * 0.06, cy - r * 0.18, x + r * 0.06, cy + r * 0.38], fill=col)
        d.rectangle([cx - r * 0.6, cy + r * 0.42, cx + r * 0.6, cy + r * 0.52], fill=col)
    elif kind == "cap":
        d.polygon([(cx - r * 0.65, cy - r * 0.1), (cx, cy - r * 0.42), (cx + r * 0.65, cy - r * 0.1), (cx, cy + r * 0.22)],
                  fill=col)
        d.rectangle([cx - r * 0.32, cy + r * 0.05, cx + r * 0.32, cy + r * 0.38], fill=col)
    elif kind == "bag":
        d.rounded_rectangle([cx - r * 0.45, cy - r * 0.18, cx + r * 0.45, cy + r * 0.5], r * 0.08, fill=col)
        d.arc([cx - r * 0.25, cy - r * 0.5, cx + r * 0.25, cy + r * 0.05], 180, 360, fill=col, width=w)
    elif kind == "people":
        for dx, s in ((-0.28, 0.8), (0.28, 0.8), (0, 1.0)):
            x = cx + dx * r
            d.ellipse([x - r * 0.16 * s, cy - r * 0.45, x + r * 0.16 * s, cy - r * 0.13], fill=col)
            d.chord([x - r * 0.3 * s, cy - r * 0.05, x + r * 0.3 * s, cy + r * 0.6], 180, 360, fill=col)
    elif kind == "calc":
        d.rounded_rectangle([cx - r * 0.38, cy - r * 0.52, cx + r * 0.38, cy + r * 0.52], r * 0.08, fill=col)
        bg = (0, 0, 0, 0)
        d.rectangle([cx - r * 0.26, cy - r * 0.4, cx + r * 0.26, cy - r * 0.18], fill=(30, 120, 110))
        for i in range(3):
            for j in range(3):
                x, y = cx - r * 0.2 + i * r * 0.2, cy - r * 0.02 + j * r * 0.18
                d.rectangle([x - r * 0.06, y - r * 0.05, x + r * 0.06, y + r * 0.05], fill=(30, 120, 110))
    elif kind == "megaphone":
        d.polygon([(cx - r * 0.5, cy - r * 0.15), (cx + r * 0.35, cy - r * 0.5), (cx + r * 0.35, cy + r * 0.5),
                   (cx - r * 0.5, cy + r * 0.15)], fill=col)
        d.rectangle([cx - r * 0.62, cy - r * 0.15, cx - r * 0.45, cy + r * 0.15], fill=col)
    elif kind == "shield":
        d.polygon([(cx - r * 0.45, cy - r * 0.45), (cx + r * 0.45, cy - r * 0.45), (cx + r * 0.45, cy + r * 0.05),
                   (cx, cy + r * 0.55), (cx - r * 0.45, cy + r * 0.05)], fill=col)
    elif kind == "lock":
        d.rounded_rectangle([cx - r * 0.42, cy - r * 0.08, cx + r * 0.42, cy + r * 0.5], r * 0.08, fill=col)
        d.arc([cx - r * 0.28, cy - r * 0.55, cx + r * 0.28, cy + r * 0.05], 180, 360, fill=col, width=w)
    elif kind == "cloud":
        for x, y, s in ((-0.3, 0.08, 0.3), (0.05, -0.1, 0.38), (0.35, 0.1, 0.27)):
            d.ellipse([cx + (x - s) * r, cy + (y - s) * r, cx + (x + s) * r, cy + (y + s) * r], fill=col)
        d.rectangle([cx - r * 0.3, cy + r * 0.05, cx + r * 0.35, cy + r * 0.37], fill=col)


# ---------------------------------------------------------------- screens

def ui_frame(title_pill, pill_col, W=1600, H=1000):
    im = Image.new("RGB", (W, H), PAPER)
    d = ImageDraw.Draw(im)
    d.rectangle([0, 0, W, 120], fill=NAVY)
    d.text((60, 60), "LocoLLM", font=font(56, 800), fill=(255, 255, 255), anchor="lm")
    tw = d.textlength(title_pill, font=font(34, 600))
    d.rounded_rectangle([340, 34, 340 + tw + 56, 86], 26, fill=pill_col)
    d.text((368, 60), title_pill, font=font(34, 600), fill=(255, 255, 255), anchor="lm")
    icon(d, "lock", W - 80, 58, 30)
    return im, d


QUESTION = "Patient, 67. Chest tightness when walking, gets better with rest. Short of breath on stairs. What should I check first?"
ANSWER = ("Pattern fits stable angina. Suggested next steps: ECG, troponin blood test and blood pressure. "
          "Ask a doctor to review today. Urgent care if pain comes at rest.")


def health_state(t):
    if t < 19.0:
        return "idle"
    q = min(1.0, max(0.0, (t - Q_START) / 1.4))
    a = min(1.0, max(0.0, (t - A_START) / 1.8))
    foot = 1 if t >= FOOT else 0
    return f"q{int(q * 20):02d}_a{int(a * 24):02d}_f{foot}"


def health(state):
    im, d = ui_frame("Health specialist", (226, 92, 120))
    W, H = im.size
    if state == "idle":
        d.text((W / 2, H / 2), "Health specialist ready", font=font(44, 600), fill=MUTED, anchor="mm")
        return im
    q = int(state[1:3]) / 20
    a = int(state[5:7]) / 24
    foot = state.endswith("1")
    f = font(40, 450)
    if q > 0:
        n = int(len(QUESTION) * q)
        lines = wrap(d, QUESTION[:n], f, 820)
        h = 60 + 54 * len(wrap(d, QUESTION, f, 820))
        d.rounded_rectangle([W - 980, 170, W - 70, 170 + h], 24, fill=(255, 255, 255), outline=(222, 226, 233), width=3)
        for i, ln in enumerate(lines):
            d.text((W - 940, 200 + i * 54), ln, font=f, fill=INK)
    if a > 0:
        n = int(len(ANSWER) * a)
        lines = wrap(d, ANSWER[:n], font(40, 500), 900)
        h = 60 + 54 * len(wrap(d, ANSWER, font(40, 500), 900))
        y0 = 470
        d.rounded_rectangle([70, y0, 1050, y0 + h], 24, fill=BLUE)
        for i, ln in enumerate(lines):
            d.text((110, y0 + 30 + i * 54), ln, font=font(40, 500), fill=(255, 255, 255))
    if foot:
        icon(d, "lock", 100, H - 90, 22, col=GREEN)
        d.text((140, H - 90), "Runs on this computer. Patient data never leaves the hospital.", font=font(36, 600),
               fill=GREEN, anchor="lm")
    return im


def shop_state(t):
    lit = sum(1 for *_, when in TILES if t >= when)
    return f"tiles{lit}" if t >= 30.0 else "tiles0"


def shop(state):
    im, d = ui_frame("Business specialists", (230, 170, 40))
    W, H = im.size
    lit = int(state[-1])
    d.text((70, 190), "Choose a free local specialist", font=font(44, 700), fill=INK)
    tw, gap = 320, 40
    x0 = (W - (4 * tw + 3 * gap)) / 2
    for i, (name, col, ic, _) in enumerate(TILES):
        x = x0 + i * (tw + gap)
        on = i < lit
        d.rounded_rectangle([x, 300, x + tw, 760], 28, fill=(255, 255, 255),
                            outline=col if on else (220, 224, 230), width=8 if on else 3)
        c = col if on else (200, 204, 212)
        d.ellipse([x + tw / 2 - 80, 360, x + tw / 2 + 80, 520], fill=c)
        icon(d, ic, x + tw / 2, 440, 80)
        d.text((x + tw / 2, 590), name, font=font(44, 700), fill=INK if on else MUTED, anchor="mm")
        d.text((x + tw / 2, 670), "Ready" if on else "Free", font=font(34, 600), fill=col if on else MUTED, anchor="mm")
    icon(d, "lock", 100, H - 110, 22, col=GREEN)
    d.text((140, H - 110), "Free. Runs on this computer. No subscription.", font=font(38, 600), fill=GREEN, anchor="lm")
    return im


def ecg(phase):
    W, H = 800, 500
    im = Image.new("RGB", (W, H), (8, 14, 16))
    d = ImageDraw.Draw(im)
    pts = []
    for x in range(0, W, 3):
        u = (x / W * 3 + phase / 30 * 3) % 1.0
        y = 0
        if 0.30 < u < 0.33:
            y = -150 * math.sin((u - 0.30) / 0.03 * math.pi)
        elif 0.33 < u < 0.36:
            y = 40 * math.sin((u - 0.33) / 0.03 * math.pi)
        elif 0.5 < u < 0.62:
            y = -30 * math.sin((u - 0.5) / 0.12 * math.pi)
        pts.append((x, 210 + y))
    d.line(pts, fill=(60, 230, 120), width=5)
    d.text((40, 430), "HR 72", font=font(56, 700), fill=(60, 230, 120), anchor="lm")
    d.text((420, 430), "SpO2 98", font=font(56, 700), fill=(90, 190, 255), anchor="lm")
    return im
