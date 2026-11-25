# Generates Engineer Pen launcher icons + splash for the Capacitor Android project.
import glob, os
from PIL import Image, ImageDraw
RES = 'android/app/src/main/res'
BLUE, DARK = (37, 99, 235, 255), (17, 24, 39, 255)

def draw(S, scale, bg=None, radius=0):
    im = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    if bg:
        d.rounded_rectangle((0, 0, S - 1, S - 1), radius, fill=bg)
    k = S / 512 * scale
    sc = lambda p: (S / 2 + (p[0] - 285) * k, S / 2 + (p[1] - 245) * k)
    x0, y0 = sc((140, 110)); x1, y1 = sc((330, 380))
    d.rounded_rectangle((x0, y0, x1, y1), 20 * k, fill=(255, 255, 255, 255))
    for y in (170, 220, 270, 320):
        d.line((sc((162, y)), sc((308, y))), fill=(157, 183, 224, 255), width=max(1, round(6 * k)))
    d.polygon([sc(p) for p in [(385, 120), (415, 150), (255, 340), (205, 355), (220, 305)]], fill=DARK)
    d.polygon([sc(p) for p in [(205, 355), (220, 305), (255, 340)]], fill=(245, 158, 11, 255))
    d.polygon([sc(p) for p in [(385, 120), (400, 105), (430, 135), (415, 150)]], fill=(225, 29, 29, 255))
    return im

legacy = {'mdpi': 48, 'hdpi': 72, 'xhdpi': 96, 'xxhdpi': 144, 'xxxhdpi': 192}
fore = {'mdpi': 108, 'hdpi': 162, 'xhdpi': 216, 'xxhdpi': 324, 'xxxhdpi': 432}
for dpi in legacy:
    d = f'{RES}/mipmap-{dpi}'
    S = legacy[dpi]
    sq = draw(S * 4, 1.45, BLUE, S * 4 // 5).resize((S, S), Image.LANCZOS)
    sq.save(f'{d}/ic_launcher.png')
    rd = draw(S * 4, 1.3, BLUE, S * 2).resize((S, S), Image.LANCZOS)
    rd.save(f'{d}/ic_launcher_round.png')
    F = fore[dpi]
    draw(F * 4, 1.0).resize((F, F), Image.LANCZOS).save(f'{d}/ic_launcher_foreground.png')

with open(f'{RES}/values/ic_launcher_background.xml', 'w') as f:
    f.write('<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">#2563EB</color>\n</resources>\n')

logo = draw(512, 1.0, BLUE, 110)
for p in glob.glob(f'{RES}/drawable*/splash.png'):
    w, h = Image.open(p).size
    im = Image.new('RGB', (w, h), DARK[:3])
    s = min(w, h) // 3
    lg = logo.resize((s, s), Image.LANCZOS)
    im.paste(lg, ((w - s) // 2, (h - s) // 2), lg)
    im.save(p)
print('icons done')
