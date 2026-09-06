"""Generate launcher icons, splash screens and Play Store graphics for Scrappy Bird."""
from PIL import Image, ImageDraw, ImageFont
import os, math

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RES = os.path.join(ROOT, "android", "app", "src", "main", "res")
STORE = os.path.join(ROOT, "store")
os.makedirs(STORE, exist_ok=True)

SKY_TOP, SKY_BOT = (78, 192, 202), (166, 227, 233)
OUTLINE = (90, 58, 0)


def sky(size_w, size_h):
    img = Image.new("RGB", (size_w, size_h))
    px = img.load()
    for y in range(size_h):
        t = y / max(1, size_h - 1)
        px_row = tuple(int(SKY_TOP[i] + (SKY_BOT[i] - SKY_TOP[i]) * t) for i in range(3))
        for x in range(size_w):
            px[x, y] = px_row
    return img


def draw_bird(img, cx, cy, s, one_wing=True, bandage=True):
    """Draw the scrappy bird centred at (cx, cy); s = scale (body radius ~ 14*s)."""
    d = ImageDraw.Draw(img)
    lw = max(2, int(2 * s))

    def ell(x, y, rx, ry, fill, outline=OUTLINE, width=lw):
        d.ellipse([x - rx, y - ry, x + rx, y + ry], fill=fill, outline=outline, width=width)

    # back wing stump with bandage (lost left wing)
    if one_wing:
        ell(cx - 5 * s, cy + 1 * s, 4 * s, 3 * s, (184, 134, 58))
        if bandage:
            d.rectangle([cx - 9 * s, cy - 1 * s, cx - 2 * s, cy + 2 * s], fill="white", outline=(204, 51, 51), width=max(1, lw // 2))
    else:
        ell(cx - 6 * s, cy, 11 * s, 6 * s, (212, 169, 23))
    # tail
    d.polygon([(cx - 12 * s, cy - 2 * s), (cx - 22 * s, cy - 7 * s), (cx - 20 * s, cy + 3 * s)], fill=(224, 180, 60), outline=OUTLINE)
    # body
    ell(cx, cy, 14 * s, 11 * s, (247, 225, 74))
    ell(cx + 1 * s, cy + 4 * s, 9 * s, 6 * s, (255, 243, 176), outline=None, width=0)
    # patches
    d.rectangle([cx + 3 * s, cy - 6 * s, cx + 7 * s, cy - 3 * s], fill=(201, 154, 46))
    d.rectangle([cx - 6 * s, cy + 5 * s, cx - 3 * s, cy + 8 * s], fill=(201, 154, 46))
    # eye
    ell(cx + 6 * s, cy - 4 * s, 5 * s, 5 * s, "white")
    ell(cx + 7.5 * s, cy - 4 * s, 2 * s, 2 * s, (34, 34, 34), outline=None, width=0)
    # beak
    d.polygon([(cx + 10 * s, cy), (cx + 20 * s, cy + 2 * s), (cx + 10 * s, cy + 5 * s)], fill=(240, 104, 47), outline=OUTLINE)
    # front wing (right wing, kept)
    ell(cx - 5 * s, cy + 2 * s, 8 * s, 4.5 * s, (244, 208, 63))
    # a few loose feathers
    for i, (fx, fy) in enumerate([(-24, -14), (-30, 6), (-20, 16)]):
        ell(cx + fx * s, cy + fy * s, 4 * s, 1.6 * s, (244, 208, 63), outline=None, width=0)


def icon_square(size, padding_frac=0.0):
    img = sky(size, size)
    d = ImageDraw.Draw(img)
    # ground strip
    gy = int(size * 0.80)
    d.rectangle([0, gy, size, size], fill=(222, 216, 149))
    d.rectangle([0, gy, size, gy + int(size * 0.04)], fill=(115, 191, 46))
    scale = size / 64.0 * (1 - padding_frac)
    draw_bird(img, size * 0.52, size * 0.45, scale)
    return img


# ---- Launcher icons (legacy PNGs) ----
mip = {"mdpi": 48, "hdpi": 72, "xhdpi": 96, "xxhdpi": 144, "xxxhdpi": 192}
for dpi, sz in mip.items():
    folder = os.path.join(RES, f"mipmap-{dpi}")
    os.makedirs(folder, exist_ok=True)
    ic = icon_square(sz)
    ic.save(os.path.join(folder, "ic_launcher.png"))
    # round variant
    mask = Image.new("L", (sz, sz), 0)
    ImageDraw.Draw(mask).ellipse([0, 0, sz - 1, sz - 1], fill=255)
    rnd = Image.new("RGBA", (sz, sz), (0, 0, 0, 0))
    rnd.paste(ic, (0, 0), mask)
    rnd.save(os.path.join(folder, "ic_launcher_round.png"))
    # adaptive foreground: bird on transparent, inside the safe zone (66% of 108dp)
    fg_sz = int(sz * 108 / 48)
    fg = Image.new("RGBA", (fg_sz, fg_sz), (0, 0, 0, 0))
    draw_bird(fg, fg_sz * 0.52, fg_sz * 0.48, fg_sz / 64.0 * 0.55)
    fg.save(os.path.join(folder, "ic_launcher_foreground.png"))

# ---- Adaptive icon XML + background colour ----
anydpi = os.path.join(RES, "mipmap-anydpi-v26")
os.makedirs(anydpi, exist_ok=True)
adaptive = """<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/ic_launcher_background"/>
    <foreground android:drawable="@mipmap/ic_launcher_foreground"/>
</adaptive-icon>
"""
for name in ("ic_launcher.xml", "ic_launcher_round.xml"):
    with open(os.path.join(anydpi, name), "w", encoding="utf-8") as f:
        f.write(adaptive)
with open(os.path.join(RES, "values", "ic_launcher_background.xml"), "w", encoding="utf-8") as f:
    f.write('<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">#4EC0CA</color>\n</resources>\n')

# ---- Splash screens (Capacitor drawable-port/land-*) ----
splash_sizes = {
    "port": {"mdpi": (320, 480), "hdpi": (480, 800), "xhdpi": (720, 1280), "xxhdpi": (960, 1600), "xxxhdpi": (1280, 1920)},
    "land": {"mdpi": (480, 320), "hdpi": (800, 480), "xhdpi": (1280, 720), "xxhdpi": (1600, 960), "xxxhdpi": (1920, 1280)},
}
def splash(w, h):
    img = sky(w, h)
    d = ImageDraw.Draw(img)
    gy = int(h * 0.82)
    d.rectangle([0, gy, w, h], fill=(222, 216, 149))
    d.rectangle([0, gy, w, gy + int(h * 0.02)], fill=(115, 191, 46))
    draw_bird(img, w * 0.5, h * 0.42, min(w, h) / 64.0 * 0.5)
    return img
for orient, sizes in splash_sizes.items():
    for dpi, (w, h) in sizes.items():
        folder = os.path.join(RES, f"drawable-{orient}-{dpi}")
        os.makedirs(folder, exist_ok=True)
        splash(w, h).save(os.path.join(folder, "splash.png"))
splash(480, 320).save(os.path.join(RES, "drawable", "splash.png"))

# ---- Play Store graphics ----
icon_square(512).save(os.path.join(STORE, "icon-512.png"))
feat = sky(1024, 500)
d = ImageDraw.Draw(feat)
d.rectangle([0, 420, 1024, 500], fill=(222, 216, 149))
d.rectangle([0, 420, 1024, 432], fill=(115, 191, 46))
draw_bird(feat, 250, 220, 5.5)
try:
    font = ImageFont.truetype("C:/Windows/Fonts/arialbd.ttf", 80)
    small = ImageFont.truetype("C:/Windows/Fonts/arial.ttf", 34)
except Exception:
    font = small = ImageFont.load_default()
def outlined(x, y, s, f, fill):
    for dx in (-3, 0, 3):
        for dy in (-3, 0, 3):
            d.text((x + dx, y + dy), s, font=f, fill=OUTLINE)
    d.text((x, y), s, font=f, fill=fill)
outlined(440, 150, "Scrappy Bird", font, "white")
outlined(444, 250, "Flappy Bird. Minus the wings.", small, (255, 230, 160))
feat.save(os.path.join(STORE, "feature-graphic-1024x500.png"))
print("assets written")
