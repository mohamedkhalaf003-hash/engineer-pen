import glob
from PIL import Image, ImageDraw
RES = 'android/app/src/main/res'
BG, DARK = (15, 118, 110, 255), (15, 23, 42, 255)
def draw(S, scale, bg=None, radius=0):
    im = Image.new('RGBA', (S, S), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    if bg: d.rounded_rectangle((0, 0, S-1, S-1), radius, fill=bg)
    k = S/512*scale; sc = lambda p: (S/2+(p[0]-256)*k, S/2+(p[1]-256)*k)
    d.polygon([sc(p) for p in [(256,90),(390,140),(390,270),(256,420),(122,270),(122,140)]], fill=(255,255,255,255))
    # handset
    d.polygon([sc(p) for p in [(200,190),(235,185),(250,225),(230,240),(260,290),(280,275),(318,292),(312,327),(270,335),(200,250)]], fill=DARK)
    d.ellipse((*sc((300,150)), *sc((345,195))), fill=(239,68,68,255))
    return im
legacy={'mdpi':48,'hdpi':72,'xhdpi':96,'xxhdpi':144,'xxxhdpi':192}
fore={'mdpi':108,'hdpi':162,'xhdpi':216,'xxhdpi':324,'xxxhdpi':432}
for dpi in legacy:
    d=f'{RES}/mipmap-{dpi}'; S=legacy[dpi]
    draw(S*4,1.4,BG,S*4//5).resize((S,S),Image.LANCZOS).save(f'{d}/ic_launcher.png')
    draw(S*4,1.25,BG,S*2).resize((S,S),Image.LANCZOS).save(f'{d}/ic_launcher_round.png')
    F=fore[dpi]; draw(F*4,1.0).resize((F,F),Image.LANCZOS).save(f'{d}/ic_launcher_foreground.png')
open(f'{RES}/values/ic_launcher_background.xml','w').write('<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">#0F766E</color>\n</resources>\n')
logo=draw(512,1.0,BG,110)
for p in glob.glob(f'{RES}/drawable*/splash.png'):
    w,h=Image.open(p).size; im=Image.new('RGB',(w,h),(15,23,42)); s=min(w,h)//3
    lg=logo.resize((s,s),Image.LANCZOS); im.paste(lg,((w-s)//2,(h-s)//2),lg); im.save(p)
