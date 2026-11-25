import glob
from PIL import Image, ImageDraw
RES='android/app/src/main/res'
BG=(185,28,28,255)
def draw(S,scale,bg=None,radius=0):
    im=Image.new('RGBA',(S,S),(0,0,0,0)); d=ImageDraw.Draw(im)
    if bg: d.rounded_rectangle((0,0,S-1,S-1),radius,fill=bg)
    k=S/512*scale; sc=lambda p:(S/2+(p[0]-256)*k,S/2+(p[1]-256)*k)
    d.rounded_rectangle((*sc((130,110)),*sc((382,402))),int(28*k),fill=(255,255,255,255))
    d.rounded_rectangle((*sc((205,88)),*sc((307,140))),int(14*k),fill=(15,23,42,255))
    for i,y in enumerate((200,265,330)):
        d.line([sc((160,y)),sc((178,y+18)),sc((208,y-18))],fill=(185,28,28,255),width=max(2,int(11*k)),joint='curve')
        d.rounded_rectangle((*sc((232,y-8)),*sc((352,y+8))),int(8*k),fill=(148,163,184,255))
    return im
legacy={'mdpi':48,'hdpi':72,'xhdpi':96,'xxhdpi':144,'xxxhdpi':192}
fore={'mdpi':108,'hdpi':162,'xhdpi':216,'xxhdpi':324,'xxxhdpi':432}
for dpi in legacy:
    d=f'{RES}/mipmap-{dpi}'; S=legacy[dpi]
    draw(S*4,1.3,BG,S*4//5).resize((S,S),Image.LANCZOS).save(f'{d}/ic_launcher.png')
    draw(S*4,1.15,BG,S*2).resize((S,S),Image.LANCZOS).save(f'{d}/ic_launcher_round.png')
    F=fore[dpi]; draw(F*4,0.9).resize((F,F),Image.LANCZOS).save(f'{d}/ic_launcher_foreground.png')
open(f'{RES}/values/ic_launcher_background.xml','w').write('<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">#B91C1C</color>\n</resources>\n')
logo=draw(512,1.0,BG,110)
for p in glob.glob(f'{RES}/drawable*/splash.png'):
    w,h=Image.open(p).size; im=Image.new('RGB',(w,h),(22,10,11)); s=min(w,h)//3
    lg=logo.resize((s,s),Image.LANCZOS); im.paste(lg,((w-s)//2,(h-s)//2),lg); im.save(p)
