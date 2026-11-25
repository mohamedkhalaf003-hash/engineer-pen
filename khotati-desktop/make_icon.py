from PIL import Image, ImageDraw
S=512; BG=(185,28,28,255)
im=Image.new('RGBA',(S*2,S*2),(0,0,0,0)); d=ImageDraw.Draw(im); k=2.0
sc=lambda p:(p[0]*k,p[1]*k)
d.rounded_rectangle((0,0,S*2-1,S*2-1),220,fill=BG)
d.rounded_rectangle((*sc((130,110)),*sc((382,402))),56,fill=(255,255,255,255))
d.rounded_rectangle((*sc((205,88)),*sc((307,140))),28,fill=(15,23,42,255))
for y in (200,265,330):
    d.line([sc((160,y)),sc((178,y+18)),sc((208,y-18))],fill=BG,width=22,joint='curve')
    d.rounded_rectangle((*sc((232,y-8)),*sc((352,y+8))),16,fill=(148,163,184,255))
im.resize((S,S),Image.LANCZOS).save('icon.png')
