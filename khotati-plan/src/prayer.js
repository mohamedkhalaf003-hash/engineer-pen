export const CITIES = {
  riyadh: ['الرياض', 24.7136, 46.6753], makkah: ['مكة المكرمة', 21.3891, 39.8579], madinah: ['المدينة المنورة', 24.5247, 39.5692],
  jeddah: ['جدة', 21.4858, 39.1925], dammam: ['الدمام', 26.4207, 50.0888], abha: ['أبها', 18.2164, 42.5053], tabuk: ['تبوك', 28.3835, 36.5662],
  cairo: ['القاهرة', 30.0444, 31.2357], alex: ['الإسكندرية', 31.2001, 29.9187]
};
const R = Math.PI / 180, sin = d => Math.sin(d * R), cos = d => Math.cos(d * R), fix = (a, b) => ((a % b) + b) % b;
const jd = (y, m, d) => { if (m <= 2) { y--; m += 12; } const A = Math.floor(y / 100), B = 2 - A + Math.floor(A / 4); return Math.floor(365.25 * (y + 4716)) + Math.floor(30.6001 * (m + 1)) + d + B - 1524.5; };
export function hijriMonth(d) { return +new Intl.DateTimeFormat('en-u-ca-islamic-umalqura-nu-latn', { month: 'numeric' }).format(d); }
export function times(date, lat, lng) {
  const tz = -date.getTimezoneOffset() / 60;
  const D = jd(date.getFullYear(), date.getMonth() + 1, date.getDate()) - 2451545;
  const g = fix(357.529 + 0.98560028 * D, 360), q = fix(280.459 + 0.98564736 * D, 360);
  const L = fix(q + 1.915 * sin(g) + 0.020 * sin(2 * g), 360), e = 23.439 - 0.00000036 * D;
  let RA = Math.atan2(cos(e) * sin(L), cos(L)) / R / 15; RA = fix(RA, 24);
  const eqt = q / 15 - RA, decl = Math.asin(sin(e) * sin(L)) / R;
  const eq = fix(eqt + 12, 24) - 12;
  const mid = 12 + tz - lng / 15 - eq;
  const T = a => Math.acos((-sin(a) - sin(lat) * sin(decl)) / (cos(lat) * cos(decl))) / R / 15;
  const asrAng = Math.atan(1 / (1 + Math.tan(Math.abs(lat - decl) * R))) / R;
  const TA = Math.acos((sin(asrAng) - sin(lat) * sin(decl)) / (cos(lat) * cos(decl))) / R / 15;
  const fajr = mid - T(18.5), sunrise = mid - T(0.833), dhuhr = mid + 1 / 60, asr = mid + TA, maghrib = mid + T(0.833);
  const isha = maghrib + (hijriMonth(date) === 9 ? 120 : 90) / 60;
  const mk = h => { const x = new Date(date.getFullYear(), date.getMonth(), date.getDate()); x.setTime(x.getTime() + Math.round(h * 36e5)); return x; };
  return { fajr: mk(fajr), sunrise: mk(sunrise), dhuhr: mk(dhuhr), asr: mk(asr), maghrib: mk(maghrib), isha: mk(isha) };
}
