import glob
from PIL import Image
RES = 'android/app/src/main/res'
src = Image.open('../review/icon-512.png').convert('RGBA')
legacy = {'mdpi': 48, 'hdpi': 72, 'xhdpi': 96, 'xxhdpi': 144, 'xxxhdpi': 192}
fore = {'mdpi': 108, 'hdpi': 162, 'xhdpi': 216, 'xxhdpi': 324, 'xxxhdpi': 432}
for dpi, S in legacy.items():
    d = f'{RES}/mipmap-{dpi}'
    src.resize((S, S), Image.LANCZOS).save(f'{d}/ic_launcher.png'); src.resize((S, S), Image.LANCZOS).save(f'{d}/ic_launcher_round.png')
    F = fore[dpi]; im = Image.new('RGBA', (F, F), (0, 0, 0, 0)); s = int(F * .62); lg = src.resize((s, s), Image.LANCZOS); im.paste(lg, ((F - s) // 2, (F - s) // 2), lg); im.save(f'{d}/ic_launcher_foreground.png')
open(f'{RES}/values/ic_launcher_background.xml', 'w').write('<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">#0F766E</color>\n</resources>\n')
for p in glob.glob(f'{RES}/drawable*/splash.png'):
    w, h = Image.open(p).size; im = Image.new('RGB', (w, h), (238, 241, 246)); s = min(w, h) // 3; lg = src.resize((s, s), Image.LANCZOS); im.paste(lg, ((w - s) // 2, (h - s) // 2), lg); im.save(p)
print('icons done')
