"""Rebuild src/data.json from the Excel workbook, then run: npx esbuild src/main.js --bundle --minify --format=esm --outfile=web/app.js
Keeps the 'plan' (weekday table) from the existing data.json unless the workbook layout changes."""
import openpyxl, json, sys, datetime
wb = openpyxl.load_workbook(sys.argv[1], data_only=True)
rows = lambda n: [list(r) for r in wb[n].iter_rows(values_only=True)]
iso = lambda d: d.strftime('%Y-%m-%d') if isinstance(d, datetime.datetime) else d
old = json.load(open('src/data.json'))
b = rows('الكتب الشرعية')[3:]
books = [dict(day=r[0], branch=r[1], book=r[2], author=r[3], why=r[4], weeks=r[5], goal=r[6], next=r[7]) for r in b if r[0]]
c = rows('خطة المحتوى')
series = [dict(day=r[0], file=r[1], name=r[2], do=r[3], dont=r[4], target=r[5]) for r in c if isinstance(r[5], int)]
rules = [dict(k=r[0], t=r[1]) for r in c if r[0] in ('افعل', 'لا تفعل')]
s = rows('الجدول الزمني فبراير-مارس')
weeks = [dict(n=r[0], frm=iso(r[1]), to=iso(r[2]), ram=bool(r[3]), sat=r[4], sun=r[5], mon=r[6], tue=r[7], wed=r[8], thu=r[9], taf=r[10], content=r[11], name=r[12]) for r in s if isinstance(r[0], int)]
batches = [dict(n=r[0], series=r[1], lec=str(r[2]), weeks=str(r[3]), suggest=iso(r[4]), name=r[5] or '') for r in s if r[0] and str(r[0]).startswith('الكتيب')]
meta = dict(start=iso(s[1][1]), end=iso(s[1][3]), rs=iso(s[1][5]), re=iso(s[1][7]))
json.dump(dict(plan=old['plan'], books=books, series=series, rules=rules, weeks=weeks, batches=batches, meta=meta), open('src/data.json', 'w'), ensure_ascii=False, indent=1)
