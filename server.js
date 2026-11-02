'use strict';

const { Hono } = require('hono');
const iett = require('./dashboard.js');
const ai = require('./ai');
const aiBilgi = require('./ai/bilgi.js');

const app = new Hono();

app.use('/*', async (c, next) => {
  if (c.req.path.startsWith('/api')) return await next();
  if (c.env && c.env.ASSETS) return c.env.ASSETS.fetch(c.req.raw);
  try {
    const { serveStatic } = require('@hono/node-server/serve-static');
    return await serveStatic({ root: './public' })(c, next);
  } catch (e) {
    return c.text('Not found', 404);
  }
});

class CookieManager {
  constructor() { this.cookies = new Map(); }
  parseSetCookie(setCookieHeaders) {
    if (!setCookieHeaders) return;
    const headers = Array.isArray(setCookieHeaders) ? setCookieHeaders : [setCookieHeaders];
    for (const h of headers) { const parts = h.split(';')[0].split('='); if (parts.length >= 2) this.cookies.set(parts[0].trim(), parts.slice(1).join('=').trim()); }
  }
  getCookieString() { return Array.from(this.cookies.entries()).map(([k, v]) => `${k}=${v}`).join('; '); }
  clear() { this.cookies.clear(); }
}
const iettJar = new CookieManager();

async function fetchIett(url, options = {}) {
  const headers = { ...options.headers, 'Cookie': iettJar.getCookieString(), 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36', 'Origin': 'https://arac.iett.gov.tr', 'Referer': 'https://arac.iett.gov.tr/' };
  const res = await fetch(url, { ...options, headers });
  let setCookie = res.headers.get('set-cookie');
  if (typeof res.headers.getSetCookie === 'function') setCookie = res.headers.getSetCookie();
  if (setCookie) iettJar.parseSetCookie(setCookie);
  return res;
}

const _cache = new Map();
function cacheGet(k) { const e = _cache.get(k); if (!e) return null; if (Date.now() > e.exp) { _cache.delete(k); return null; } return e.data; }
function cacheSet(k, data, ttlMs) { _cache.set(k, { data, exp: Date.now() + ttlMs }); }

const _durakInfoCache = new Map();
const DURAK_INFO_TTL = 15 * 60 * 1000;

async function _durakBilgiGetir(kod) {
  const k = String(kod || '').trim(); if (!k) return null;
  const c = _durakInfoCache.get(k); if (c && Date.now() < c.exp) return c.data;
  let d = null;
  try { d = await iett.getJson(iett.BASE_HAT_DURAK, 'GetDurak_json', { DurakKodu: k }, { quiet: true }); } catch (e) {}
  if (!d) { try { d = await iett.getJson(iett.BASE_HAT_DURAK, 'GetDurak_json', { SDURAKKODU: k }, { quiet: true }); } catch (e) {} }
  if (!d) {
    try {
      await aiBilgi.hazirla(iett);
      const found = (aiBilgi.durakAra(k, 5) || []).find(x => String(x.kod) === k);
      if (found) { d = [{ SDURAKKODU: found.kod, SDURAKADI: found.ad, ILCEADI: found.ilce || '', SYON: found.yon || '' }]; }
    } catch (e) {}
  }
  _durakInfoCache.set(k, { data: d, exp: Date.now() + DURAK_INFO_TTL });
  return d;
}

function _durakKodCikar(st) {
  if (!st || typeof st !== 'object') return '';
  const oncelikli = ['dcode', 'dCode', 'DCODE', 'd_kod', 'dKod', 'stationCode', 'StationCode', 'STATIONCODE', 'station_code', 'kod', 'Kod', 'KOD', 'code', 'Code', 'CODE', 'SDURAKKODU', 'sDurakKodu', 'durakKodu', 'DurakKodu', 'stopCode', 'StopCode', 'stop_code', 'durak_kodu'];
  for (const f of oncelikli) { if (st[f] != null && String(st[f]).trim()) return String(st[f]).trim(); }
  return '';
}

function _koordAl(st) {
  if (!st || typeof st !== 'object') return null;
  const koordRaw = st.KOORDINAT || st.koordinat || st.Koordinat;
  if (koordRaw) {
    const s = String(koordRaw).trim();
    const wkt = s.match(/POINT\s*\(\s*([-\d.]+)\s+([-\d.]+)\s*\)/i);
    if (wkt) { const lng = parseFloat(wkt[1]); const lat = parseFloat(wkt[2]); if (isFinite(lat) && isFinite(lng)) return [lat, lng]; }
    const parcalar = s.split(/[,\s;]+/).map(p => parseFloat(p)).filter(isFinite);
    if (parcalar.length >= 2) { let a = parcalar[0], b = parcalar[1]; const aEnlemmi = a >= 36 && a <= 42; const bEnlemmi = b >= 36 && b <= 42; if (aEnlemmi && !bEnlemmi) return [a, b]; if (bEnlemmi && !aEnlemmi) return [b, a]; return [a, b]; }
  }
  const latKeys = ['ENLEM', 'enlem', 'lat', 'LAT', 'YENLEM', 'YKOORDINAT', 'ykoordinat']; const lngKeys = ['BOYLAM', 'boylam', 'lng', 'LNG', 'XENLEM', 'XKOORDINAT', 'xkoordinat'];
  let lat = 0, lng = 0;
  for (const k of latKeys) { if (st[k] != null && isFinite(parseFloat(st[k]))) { lat = parseFloat(st[k]); break; } }
  for (const k of lngKeys) { if (st[k] != null && isFinite(parseFloat(st[k]))) { lng = parseFloat(st[k]); break; } }
  if (!lat || !lng) return null;
  return [lat, lng];
}

async function _tumDuraklariYukle() { return await iett._tumDuraklariYukle(); }
function _duyuruHatiIceriyorMu(duyuru, hk) { return iett._duyuruHatiIceriyorMu(duyuru, hk); }
async function _tumDuyurulariCek() { return await iett._tumDuyurulariCek(); }
async function _duraklaraKodEkle(out) { return await iett._duraklaraKodEkle(out); }
async function _duraklariGYYdenCek(hk) { return await iett._duraklariGYYdenCek(hk); }
function _operatorTip(kapi) { return iett._operatorTip(kapi); }
function _saatDk(hhmm) { return iett._saatDk(hhmm); }
async function _tumHatlar() { return await iett._tumHatlar(); }

const rateLimits = new Map();
const aiRateLimits = new Map();

app.use('/api/*', async (c, next) => {
  const ip = c.req.header('x-forwarded-for') || 'unknown';
  const now = Date.now(); const windowMs = 60_000; const max = 120;
  let record = rateLimits.get(ip) || { count: 0, reset: now + windowMs };
  if (now > record.reset) record = { count: 0, reset: now + windowMs };
  record.count++; rateLimits.set(ip, record);
  if (record.count > max) return c.json({ error: 'Çok fazla istek, biraz bekleyin.' }, 429);
  await next();
});

app.use('/api/ai*', async (c, next) => {
  const ip = c.req.header('x-forwarded-for') || 'unknown';
  const now = Date.now(); const windowMs = 60_000; const max = 10;
  let record = aiRateLimits.get(ip) || { count: 0, reset: now + windowMs };
  if (now > record.reset) record = { count: 0, reset: now + windowMs };
  record.count++; aiRateLimits.set(ip, record);
  if (record.count > max) return c.json({ error: 'AI sorguları için dakikada 10 istek limiti. Lütfen biraz bekleyin.' }, 429);
  await next();
});

app.onError((err, c) => { console.error(`[API HATA] ${c.req.method} ${c.req.url}:`, err.message); return c.json({ error: err.message }, 500); });

app.get('/api/ping', (c) => c.json({ ok: true, ts: Date.now() }));

app.get('/api/popup', async (c) => {
  try {
    const r = await fetch('https://iett.istanbul/Home/GetPopupByUrl', { headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://iett.istanbul/' } });
    return c.json(await r.json());
  } catch (error) { return c.json({ error: 'Popup verisi alınamadı' }, 500); }
});

app.post('/api/rednexie-arrivals', async (c) => {
  const body = await c.req.json();
  try {
    const r = await fetch('https://iett.rednexie.workers.dev/bus-arrivals', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    let data = await r.json();
    if (Array.isArray(data) && data.length > 0) {
      try {
        const hatlar = [...new Set(data.map(x => x.hatkodu).filter(Boolean))];
        const ibbAraclar = {};
        await Promise.all(hatlar.map(async hk => { try { const araclar = await iett.hatAktifAraclarKonumlu(hk); if (araclar) ibbAraclar[hk] = araclar; } catch (e) {} }));
        const normKapi = (k) => String(k || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
        data = data.map(x => {
          const nk = normKapi(x.kapino); const hattakiAraclar = ibbAraclar[x.hatkodu] || [];
          const bulunanArac = hattakiAraclar.find(a => normKapi(a.kapi) === nk);
          const gecerliMevcut = x.son_konum && typeof x.son_konum === 'string' && x.son_konum.split(',').length === 2 && !x.son_konum.includes('0,0');
          if (!gecerliMevcut && bulunanArac && bulunanArac.lat && bulunanArac.lng) return { ...x, son_konum: `${bulunanArac.lng},${bulunanArac.lat}` };
          return x;
        });
      } catch (e) {}
    }
    return c.json(data);
  } catch (error) { return c.json({ error: 'Rednexie bağlantı hatası' }, 500); }
});

app.get('/api/hat/:kod', async (c) => {
  const kod = c.req.param('kod'); const hk = String(kod).toUpperCase(); const key = `hat:${hk}`; const cached = cacheGet(key); if (cached) return c.json(cached);
  const d = await iett.getJson(iett.BASE_HAT_DURAK, 'GetHat_json', { HatKodu: kod });
  cacheSet(key, d, 5 * 60 * 1000); return c.json(d);
});

app.get('/api/hat/:kod/duraklar', async (c) => {
  const kod = c.req.param('kod'); const hk = String(kod).toUpperCase(); const key = `duraklar:${hk}`; const cached = cacheGet(key); if (cached) return c.json(cached);
  const out = { hat: hk, yonler: {} };
  const gyyYonler = await _duraklariGYYdenCek(hk);
  if (gyyYonler && Object.keys(gyyYonler).length) { Object.assign(out.yonler, gyyYonler); cacheSet(key, out, 30 * 60 * 1000); return c.json(out); }
  await Promise.all([['G_D0', 'GİDİŞ'], ['D_D0', 'DÖNÜŞ']].map(async ([yk, ya]) => {
    try {
      const kod = `${hk}_${yk}`; const d = await iett.istGet('GetRoutePinV2', { q: kod }, hk); if (!Array.isArray(d) || !d.length) return;
      const k = d[0]; if (!k || typeof k !== 'object') return; const p = k.stationPlaces || []; if (!p.length) return;
      out.yonler[yk] = { ad: ya, kod, duraklar: p.map(st => ({ ad: String(st.stationName || '').trim(), kod: _durakKodCikar(st), ilce: String(st.stationCity || '').trim(), lat: st.lat ?? null, lng: st.lng ?? null, sira: st.stationOrder ?? st.order ?? null })) };
    } catch (e) {}
  }));
  if (!Object.keys(out.yonler).length) {
    try {
      const depList = (await iett.deparListesi(hk)) || []; const dep = depList.filter(d => d && typeof d === 'object');
      const g  = dep.find(d => String(d.GUZERGAH_GUZERGAH_KODU || '').toUpperCase().includes('_G_')); const dn = dep.find(d => String(d.GUZERGAH_GUZERGAH_KODU || '').toUpperCase().includes('_D_'));
      for (const [obj, ya, yk] of [[g, 'GİDİŞ', 'G'], [dn, 'DÖNÜŞ', 'D']]) {
        if (!obj) continue; const kod = String(obj.GUZERGAH_GUZERGAH_KODU || '').trim(); if (!kod) continue;
        const places = await iett.deparDuraklari(kod); if (!places || !places.length) continue;
        out.yonler[yk] = { ad: ya, kod, duraklar: places.map(st => ({ ad: String(st.stationName || '').trim(), kod: _durakKodCikar(st), ilce: String(st.stationCity || '').trim(), lat: st.lat ?? null, lng: st.lng ?? null, sira: null })) };
      }
    } catch (e) {}
  }
  await _duraklaraKodEkle(out);
  cacheSet(key, out, 30 * 60 * 1000); return c.json(out);
});

app.get('/api/hat/:kod/seferler', async (c) => {
  const kod = c.req.param('kod'); const hk = String(kod).toUpperCase(); const key = `seferler:${hk}`; const cached = cacheGet(key); if (cached) return c.json(cached);
  const out = { hat: hk, yonler: [], debug: [] };
  try { const { yonler, bulundu } = await iett.seferleriCokKaynakliTopla(hk); if (!bulundu) out.debug.push('Hiçbir kaynaktan sefer saati bulunamadı'); else out.yonler = yonler; } catch (e) { out.debug.push(`hata: ${e.message}`); }
  cacheSet(key, out, 30 * 60 * 1000); return c.json(out);
});

app.get('/api/hat/:kod/deparlar', async (c) => {
  const kod = c.req.param('kod'); const hk = String(kod).toUpperCase(); const key = `deparlar:${hk}`; const cached = cacheGet(key); if (cached) return c.json(cached);
  let dep = []; try { dep = (await iett.deparListesi(hk)) || []; } catch (e) {}
  const rows = (Array.isArray(dep) ? dep : []).filter(d => d && typeof d === 'object');
  const out = rows.map(d => { const kod = String(d.GUZERGAH_GUZERGAH_KODU || '').trim(); return { kod, depar_no: String(d.GUZERGAH_DEPAR_NO || '').trim(), isaret: iett.isaretTemizle(d.GUZERGAH_GUZERGAH_ISARETI), yon: iett.kodYonBul(kod), ad: String(d.GUZERGAH_GUZERGAH_ADI || d.GUZERGAH_ADI || '').trim() }; });
  cacheSet(key, out, 30 * 60 * 1000); return c.json(out);
});

app.get('/api/hat/:kod/duyurular', async (c) => {
  const kod = c.req.param('kod'); const hk = String(kod).trim().toUpperCase(); const key = `hat-duyuru:${hk}`; 
  if (c.req.query('nocache') === '1') _cache.delete(key); 
  const cached = cacheGet(key); if (cached) return c.json(cached);
  let soapFiltreli = [];
  try { const soapDuyurular = await _tumDuyurulariCek(); soapFiltreli = soapDuyurular.filter(x => x && _duyuruHatiIceriyorMu(x, hk)).map(x => ({ HAT: String(x.HATKODU || x.HAT || '').trim(), HATKODU: String(x.HATKODU || '').trim(), HAT_ADI: String(x.HAT || '').trim(), TIP: String(x.TIP || '').trim(), GUNCELLEME_SAATI: String(x.GUNCELLEME_SAATI || '').trim(), MESAJ: String(x.MESAJ || '').trim() })).filter(x => x.MESAJ); } catch (e) {}
  let htmlDuyurular = []; 
  try { htmlDuyurular = await iett.hatDuyurulariHtml(hk); } catch (e) {}
  const tumDuyurular = [...soapFiltreli]; 
  const mevcutMesajlar = new Set(soapFiltreli.map(d => `${d.HATKODU || ''}|${d.MESAJ.toLowerCase().slice(0, 60)}`));
  for (const d of htmlDuyurular) { const anahtar = `${d.HATKODU || ''}|${d.MESAJ.toLowerCase().slice(0, 60)}`; if (mevcutMesajlar.has(anahtar)) continue; mevcutMesajlar.add(anahtar); tumDuyurular.push({ HAT: hk, HATKODU: hk, HAT_ADI: '', TIP: d.TIP || 'Günlük', GUNCELLEME_SAATI: d.GUNCELLEME_SAATI || new Date().toLocaleTimeString('tr-TR'), MESAJ: d.MESAJ }); }
  tumDuyurular.sort((a, b) => String(b.GUNCELLEME_SAATI).localeCompare(String(a.GUNCELLEME_SAATI)));
  const yanit = { hat: hk, toplam: tumDuyurular.length, duyurular: tumDuyurular, kaynaklar: { soap: soapFiltreli.length, html: htmlDuyurular.length } };
  cacheSet(key, yanit, 5 * 60 * 1000); return c.json(yanit);
});

app.get('/api/hat/:kod/planlanan-seferler', async (c) => {
  const kod = c.req.param('kod'); const hk = String(kod).trim().toUpperCase(); const key = `planlanan:${hk}`; const cached = cacheGet(key); if (cached) return c.json(cached);
  let ham = null; try { ham = await iett.getJson(iett.BASE_PLANLANAN_SEFER, 'GetPlanlananSeferSaati_json', { HatKodu: hk }, { quiet: true }); } catch (e) {}
  const rows = Array.isArray(ham) ? ham : (ham ? [ham] : []); const gruplar = {};
  for (const r of rows) { const yon  = String(r.SYON || '').trim().toUpperCase(); const gun  = String(r.SGUNTIPI || '').trim().toUpperCase(); const saat = String(r.DT || '').trim(); if (!saat) continue; const kk = `${yon}|${gun}`; if (!gruplar[kk]) gruplar[kk] = { yon, gun, saatler: [] }; gruplar[kk].saatler.push(saat); }
  for (const g of Object.values(gruplar)) g.saatler.sort((a, b) => a.localeCompare(b));
  const yanit = { hat: hk, toplam: rows.length, gruplar: Object.values(gruplar) };
  cacheSet(key, yanit, 30 * 60 * 1000); return c.json(yanit);
});

app.get('/api/hat/:kod/sefer-operator', async (c) => {
  const kod = c.req.param('kod'); const hk = String(kod).toUpperCase(); const gunSayisi = Math.min(14, Math.max(1, parseInt(c.req.query('gun') || '7', 10))); const toleransDk = Math.min(10, Math.max(0, parseInt(c.req.query('tol') || '3', 10)));
  const cacheKey = `opr:${hk}:${gunSayisi}:${toleransDk}`; const cached = cacheGet(cacheKey); if (cached) return c.json(cached);
  const tarihler = []; const bugun = new Date();
  for (let i = 1; i <= gunSayisi; i++) { const d = new Date(bugun); d.setDate(d.getDate() - i); const p = n => String(n).padStart(2, '0'); tarihler.push(`${d.getFullYear()}${p(d.getMonth()+1)}${p(d.getDate())}`); }
  const arsivSonuc = await Promise.allSettled(tarihler.map(t => iett.getJson(iett.BASE_IBB360, 'GetIettArsivGorev_json', { Tarih: t })));
  const arsivKayitlari = [];
  for (const r of arsivSonuc) { if (r.status !== 'fulfilled' || !r.value) continue; const rows = Array.isArray(r.value) ? r.value : [r.value]; for (const row of rows) { if (!row || String(row.SHATKODU || '').trim().toUpperCase() !== hk) continue; const saatM = String(row.DTBASLAMAZAMANI || '').match(/(\d{2}):(\d{2})/); if (!saatM) continue; const kapi = String(row.SKAPINUMARA || '').trim(); if (!kapi) continue; arsivKayitlari.push({ saat: `${saatM[1]}:${saatM[2]}`, kapi }); } }
  const kayitTip = arsivKayitlari.map(a => ({ saatDk: _saatDk(a.saat), tip: _operatorTip(a.kapi) }));
  const parsed = await iett.seferSaatleriAl(hk); const eslesmeler = {}; const detay = {};
  if (parsed) { for (const blok of parsed) { for (const day of ['workday', 'saturday', 'sunday']) { for (const raw of blok[day] || []) { const m = String(raw).replace(/^\*/, '').match(/^(\d{1,2}):(\d{2})/); if (!m) continue; const hhmm = `${m[1]}:${m[2]}`; if (eslesmeler[hhmm]) continue; const hedefDk = _saatDk(hhmm); const yakin = kayitTip.filter(k => Math.abs(k.saatDk - hedefDk) <= toleransDk); if (!yakin.length) { detay[hhmm] = { garaj: 0, oho: 0, bilinmiyor: 0, gozlem: 0 }; continue; } const sayac = { garaj: 0, oho: 0, bilinmiyor: 0 }; for (const k of yakin) sayac[k.tip]++; detay[hhmm] = { ...sayac, gozlem: yakin.length }; const sorted = Object.entries(sayac).sort((a, b) => b[1] - a[1]); const [ilkTip, ilkAdet] = sorted[0]; const ikinciAdet = sorted[1]?.[1] || 0; if (ilkAdet === 0) continue; if (ilkAdet >= 2 * Math.max(1, ikinciAdet)) eslesmeler[hhmm] = ilkTip; else eslesmeler[hhmm] = 'karisik'; } } } }
  const yanit = { hat: hk, gunSayisi, toleransDk, toplamArsivKayit: arsivKayitlari.length, eslesmeler, detay };
  cacheSet(cacheKey, yanit, 15 * 60 * 1000); return c.json(yanit);
});

app.get('/api/hat-ara/:q', async (c) => {
  const q = String(c.req.param('q') || '').trim().toLocaleUpperCase('tr-TR');
  if (q.length < 1) return c.json({ sonuclar: [] });
  const tum = await _tumHatlar();
  if (!tum.length) return c.json({ sonuclar: [], uyari: 'hat listesi boş' });
  const skorlu = [];
  for (const h of tum) {
    const kod = String(h.SHATKODU || '').toLocaleUpperCase('tr-TR').trim();
    const ad  = String(h.SHATADI  || '').toLocaleUpperCase('tr-TR').trim();
    if (!kod && !ad) continue;
    let skor = 0;
    if      (kod === q)              skor = 1000; 
    else if (kod.startsWith(q))      skor = 500;
    else if (ad.startsWith(q))       skor = 400;
    else if (kod.includes(q))        skor = 200;
    else if (ad.includes(q))         skor = 100;
    else continue;
    skorlu.push({ skor, kod: String(h.SHATKODU || '').trim(), ad: String(h.SHATADI || '').trim(), tarife: String(h.TARIFE || '').trim() });
  }
  skorlu.sort((a, b) => b.skor - a.skor || a.kod.localeCompare(b.kod, 'tr'));
  const sonuclar = skorlu.slice(0, 10).map(x => ({ kod: x.kod, ad: x.ad, tarife: x.tarife }));
  return c.json({ sonuclar });
});

app.get('/api/durak-ara/:q', async (c) => {
  const q = String(c.req.param('q') || '').trim(); if (q.length < 1) return c.json({ sonuclar: [] });
  try { await aiBilgi.hazirla(iett); } catch (e) {}
  const sonuclar = aiBilgi.durakAra(q, 30);
  return c.json({ sonuclar: sonuclar.map(d => ({ kod: d.kod, ad: d.ad, ilce: d.ilce, yon: d.yon })) });
});

app.get('/api/durak/yakin', async (c) => {
  const lat = parseFloat(c.req.query('lat')); const lng = parseFloat(c.req.query('lng'));
  if (!isFinite(lat) || !isFinite(lng)) return c.json({ error: 'lat ve lng gerekli' }, 400);
  const liste = await _tumDuraklariYukle(); 
  if (!liste.length) return c.json({ duraklar: [], sebep: 'durak listesi boş' });
  const sonuclar = []; const cosLat = Math.cos(lat * Math.PI / 180);
  for (const st of liste) {
    const koord = _koordAl(st); if (!koord) continue; 
    const [stLat, stLng] = koord; const dLat = stLat - lat; const dLng = (stLng - lng) * cosLat; const distKm = Math.sqrt(dLat * dLat + dLng * dLng) * 111; 
    if (distKm <= 0.6) {
      const kod = String(st.SDURAKKODU || st.sDurakKodu || st.DURAKKODU || '').trim(); const ad = String(st.SDURAKADI || st.sDurakAdi || '').trim();
      if (kod) sonuclar.push({ kod, ad, ilce: String(st.ILCEADI || '').trim(), yon: String(st.SYON || '').trim(), mesafe_m: Math.round(distKm * 1000), lat: stLat, lng: stLng });
    }
  }
  sonuclar.sort((a, b) => a.mesafe_m - b.mesafe_m);
  return c.json({ duraklar: sonuclar });
});

app.get('/api/durak/:kod', async (c) => { const d = await _durakBilgiGetir(c.req.param('kod')); return c.json(d); });
app.get('/api/durak/:kod/hatlar', async (c) => { const d = await iett.stationLines(c.req.param('kod')); return c.json(d); });

app.get('/api/durak/:kod/varislar', async (c) => {
  const kod = c.req.param('kod'); const dk = String(kod); const key = `varis:${dk}`; const cached = cacheGet(key); if (cached) return c.json(cached);
  let durakLat = null, durakLng = null, durakAd = '';
  const info = await _durakBilgiGetir(dk); const i = Array.isArray(info) ? info[0] : info;
  if (i) { durakAd = String(i.SDURAKADI || '').trim(); const koord = _koordAl(i); if (koord) { durakLat = koord[0]; durakLng = koord[1]; } }
  const varislar = await iett.stationArrivalsWithDistance(dk, durakLat, durakLng, true);
  const ozellikler = await iett.getAracOzellikleri();
  const hatKodlari = varislar.map(x => x.hat); const hatKapilar = await iett.hatlarIcinKapilar(hatKodlari, true);
  const sayac = {}; const gorulen = new Set(); const tekil = [];
  for (const x of varislar) {
    let kapi = x.kapi;
    if (!kapi) { const kapList = hatKapilar[x.hat] || []; const s = sayac[x.hat] || 0; sayac[x.hat] = s + 1; kapi = s < kapList.length ? kapList[s] : null; }
    const anahtar = `${x.hat}|${x.yon}|${kapi || ''}|${x.saat}`; if (gorulen.has(anahtar)) continue; gorulen.add(anahtar);
    const oz = (kapi && ozellikler[kapi]) ? ozellikler[kapi] : {};
    tekil.push({ hatkodu: x.hat, hatadi: x.yon, kapino: kapi, saat: x.saat, dakika: x.kalan_dk, son_hiz: x.hiz || 0, son_konum: (x.lat && x.lng) ? `${x.lng},${x.lat}` : null, son_konum_saati: x.saat, ototip: oz.ototip || '', wifi: oz.wifi || false, klima: oz.klima || false, usb: oz.usb || false, engelli: oz.engelli || false, bisiklet: oz.bisiklet || false });
  }
  const yanit = { durak: dk, ad: durakAd, durakLat, durakLng, varislar: tekil };
  cacheSet(key, yanit, 15 * 1000); return c.json(yanit);
});

app.get('/api/durak/:kod/yaklasan-konum', async (c) => {
  const kod = c.req.param('kod'); const dk = String(kod).trim(); const key = `yaklasan-konum:${dk}`; const cached = cacheGet(key); if (cached) return c.json(cached);
  let durakLat = null, durakLng = null, durakAd = '';
  const info = await _durakBilgiGetir(dk); const i = Array.isArray(info) ? info[0] : info;
  if (i) { durakAd = String(i.SDURAKADI || '').trim(); const koord = _koordAl(i); if (koord) { durakLat = koord[0]; durakLng = koord[1]; } }
  const varislar = await iett.stationArrivalsV2(dk, true);
  const hatSet = [...new Set(varislar.map(v => v.hat).filter(Boolean))];
  const hatKonumlari = {};
  await Promise.all(hatSet.map(async h => { try { const araclar = await iett.hatAktifAraclarKonumlu(h); if (araclar && araclar.length) hatKonumlari[h] = araclar; } catch (e) {} }));
  const yaklasan = varislar.map(v => { const hatAraclar = hatKonumlari[v.hat] || []; let eslesen = null; if (v.kapi) eslesen = hatAraclar.find(a => a.kapi === v.kapi); if (!eslesen && hatAraclar.length) eslesen = hatAraclar[0]; return { ...v, lat: eslesen?.lat ?? null, lng: eslesen?.lng ?? null, hiz: eslesen?.hiz ?? 0, kapi: eslesen?.kapi || v.kapi || null }; });
  const yanit = { durak: dk, durakAd, durakLat, durakLng, yaklasan, hatKonumlari };
  cacheSet(key, yanit, 20 * 1000); return c.json(yanit);
});

app.get('/api/durak/:kod/duyurular', async (c) => {
  const kod = c.req.param('kod'); const dk = String(kod); const key = `durak-duyuru:${dk}`; const cached = cacheGet(key); if (cached) return c.json(cached);
  let hatlar = [];
  try { const h = await iett.stationLines(dk); hatlar = (Array.isArray(h) ? h : []).map(x => String(x.hat || '').trim().toUpperCase()).filter(Boolean); } catch (e) {}
  let soapFiltreli = [];
  try { const soapDuyurular = await _tumDuyurulariCek(); soapFiltreli = soapDuyurular.filter(x => x && hatlar.some(hk => _duyuruHatiIceriyorMu(x, hk))).map(x => ({ HAT: String(x.HATKODU || x.HAT || '').trim(), HATKODU: String(x.HATKODU || '').trim(), HAT_ADI: String(x.HAT || '').trim(), TIP: String(x.TIP || '').trim(), GUNCELLEME_SAATI: String(x.GUNCELLEME_SAATI || '').trim(), MESAJ: String(x.MESAJ || '').trim() })).filter(x => x.MESAJ); } catch (e) {}
  let htmlDuyurular = [];
  try { const dd = await iett.durakDuyurulariHtml(dk); htmlDuyurular = dd.filter(d => hatlar.includes(d.HATKODU)).map(d => ({ HAT: d.HATKODU, HATKODU: d.HATKODU, HAT_ADI: '', TIP: 'Günlük', GUNCELLEME_SAATI: '', MESAJ: d.MESAJ })); } catch (e) {}
  const tumDuyurular = [...soapFiltreli]; const mevcut = new Set(soapFiltreli.map(d => `${d.HATKODU || ''}|${d.MESAJ.toLowerCase().slice(0, 60)}`));
  for (const d of htmlDuyurular) { const anahtar = `${d.HATKODU || ''}|${d.MESAJ.toLowerCase().slice(0, 60)}`; if (mevcut.has(anahtar)) continue; mevcut.add(anahtar); tumDuyurular.push(d); }
  tumDuyurular.sort((a, b) => String(b.GUNCELLEME_SAATI).localeCompare(String(a.GUNCELLEME_SAATI)));
  const yanit = { durak: dk, hatlar: hatlar.sort(), toplam: tumDuyurular.length, duyurular: tumDuyurular, kaynaklar: { soap: soapFiltreli.length, html: htmlDuyurular.length } };
  cacheSet(key, yanit, 5 * 60 * 1000); return c.json(yanit);
});

app.get('/api/duyurular', async (c) => { const key = 'duyurular'; const cached = cacheGet(key); if (cached) return c.json(cached); const d = await _tumDuyurulariCek(); cacheSet(key, d, 5 * 60 * 1000); return c.json(d); });

app.get('/api/filo/hat/:kod', async (c) => {
  const hk = c.req.param('kod');
  const d = await iett.hatAktifAraclarKonumlu(hk);
  return c.json(d || []);
});

app.get('/api/arac/ara/:q', async (c) => {
  const q = String(c.req.param('q') || '').trim();
  if (!q) return c.json({ sonuclar: [] });
  try {
    const r = await fetchIett('https://arac.iett.gov.tr/Home/GetAllVehicleSelectList', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ page: 1, pageSize: 20, search: q })
    });
    if (!r.ok) return c.json({ sonuclar: [] });
    const data = await r.json();
    if (data && data.data) {
      const sonuclar = data.data.map(item => ({ kod: item.doorNumber || item.DoorNumber || '', plaka: item.plate || item.Plate || '', durum: item.status || item.Status || 'AKTİF', sifreliId: item.value || item.Value || '' }));
      return c.json({ sonuclar });
    }
    return c.json({ sonuclar: [] });
  } catch (e) { return c.json({ error: 'Araç aranamadı.' }, 500); }
});

app.get('/api/arac/captcha', async (c) => {
  try {
    if (!iettJar.getCookieString()) await fetchIett('https://arac.iett.gov.tr/').catch(()=>{});
    const r = await fetchIett('https://arac.iett.gov.tr/Home/Captcha', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) });
    if (!r.ok) return c.json({ error: 'İETT bot koruması.' }, r.status);
    const data = await r.json();
    if (data && data.captchaImage) return c.json(data);
    return c.json({ error: 'Captcha verisi tanınamadı.' }, 500);
  } catch (e) { return c.json({ error: 'İETT sunucusuna ulaşılamadı.' }, 500); }
});

app.post('/api/arac/coz', async (c) => {
  const body = await c.req.json();
  const { captchaCode, sifreliId } = body;
  try {
    const ctrl = await fetchIett('https://arac.iett.gov.tr/Home/Control', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ DoorNumber: sifreliId, CaptchaText: captchaCode }) });
    const ctrlData = await ctrl.json();
    if (!ctrlData || !ctrlData.isSuccess) return c.json({ error: ctrlData?.message || 'Güvenlik kodu yanlış.' }, 400);
    const detail = await fetchIett('https://arac.iett.gov.tr/Home/GetDetail', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ DoorNumber: sifreliId }) });
    const detailData = await detail.json();
    if (detailData && detailData.isSuccess) return c.json(detailData);
    return c.json({ error: 'İETT detay verisini reddetti.' }, 400);
  } catch (e) { return c.json({ error: 'İETT sunucusuna bağlanılamadı.' }, 500); }
});

app.get('/api/arac-detay/:kapino', async (c) => {
  const kod = c.req.param('kapino'); const kapino = String(kod).trim().toLocaleUpperCase('tr-TR');
  try {
    let arac = null;
    const d = await iett.hatAktifAraclarKonumlu(kapino);
    if (d && d.length) arac = d[0];
    if (arac) {
      return c.json({ isSuccess: true, isFallback: true, dataVehicle: { vehicleDoorCode: kapino, numberPlate: String(arac.Plaka || '').trim(), operatorType: String(arac.Operator || '').trim(), hasWifi: false, hasUsbCharger: false, isAirConditioned: null, accessibility: false, hasBicycleRack: false, fullCapacity: null, latitude: parseFloat(arac.Enlem || 0), longitude: parseFloat(arac.Boylam || 0), lastLocationDate: new Date().toLocaleDateString('tr-TR'), lastLocationTime: String(arac.Saat || '') }, dataTask: [] });
    }
  } catch(e) {}
  return c.json({ isSuccess: false, error: 'Araç konumu bulunamadı.' }, 404);
});

app.get('/api/arsiv/:tarih', async (c) => {
  const t = String(c.req.param('tarih')); if (!/^\d{8}$/.test(t)) return c.json({ error: 'Tarih YYYYMMDD formatında olmalı' }, 400);
  const hat = String(c.req.query('hat') || '').trim().toUpperCase(); const key = `arsiv:${t}:${hat}`; const cached = cacheGet(key); if (cached) return c.json(cached);
  const d = await iett.getJson(iett.BASE_IBB360, 'GetIettArsivGorev_json', { Tarih: t }); let yanit;
  if (!d) { yanit = { tarih: t, hat: hat || null, toplam: 0, durumlar: {}, hatlar: {}, kayitlar: [] }; }
  else { const rows = Array.isArray(d) ? d : [d]; const f = hat ? rows.filter(r => r && String(r.SHATKODU || '').trim().toUpperCase() === hat) : rows; const durumSayac = {}; const hatSayac = {}; for (const r of f) { const dur = String(r.SGOREVDURUM || '?').trim(); durumSayac[dur] = (durumSayac[dur] || 0) + 1; const h = String(r.SHATKODU || '').trim(); if (h) hatSayac[h] = (hatSayac[h] || 0) + 1; } yanit = { tarih: t, hat: hat || null, toplam: f.length, durumlar: durumSayac, hatlar: hatSayac, kayitlar: f.slice(0, 300) }; }
  cacheSet(key, yanit, 10 * 60 * 1000); return c.json(yanit);
});

app.get('/api/populer/:tarih', async (c) => {
  const t = String(c.req.param('tarih')); if (!/^\d{8}$/.test(t)) return c.json({ error: 'Tarih YYYYMMDD olmalı' }, 400);
  const limit = Math.min(100, parseInt(c.req.query('limit') || '30', 10)); const key = `populer:${t}:${limit}`; const cached = cacheGet(key); if (cached) return c.json(cached);
  const d = await iett.getJson(iett.BASE_IBB360, 'GetIettYolculukHat_json', { Tarih: t }); let yanit;
  if (!d) { yanit = { tarih: t, toplamYolculuk: 0, hatSayisi: 0, hatlar: [] }; }
  else { const rows = Array.isArray(d) ? d : [d]; const map = {}; let toplam = 0; for (const r of rows) { const h = String(r.Hat || r.HATKODU || r.SHATKODU || '').trim(); const y = parseInt(r.Yolculuk || r.YOLCU || '0', 10) || 0; if (!h) continue; map[h] = (map[h] || 0) + y; toplam += y; } const sirali = Object.entries(map).sort((a,b) => b[1]-a[1]).slice(0, limit); const hatlar = sirali.map(([h, y], i) => ({ sira: i+1, hat: h, yolculuk: y, pay: toplam > 0 ? ((y/toplam)*100).toFixed(2) : '0' })); yanit = { tarih: t, toplamYolculuk: toplam, hatSayisi: Object.keys(map).length, hatlar }; }
  cacheSet(key, yanit, 15 * 60 * 1000); return c.json(yanit);
});

app.post('/api/ai', async (c) => {
  const body = await c.req.json();
  const messages = Array.isArray(body?.messages) ? body.messages : [];
  if (!messages.length) return c.json({ error: 'messages gerekli' }, 400);
  try { await aiBilgi.hazirla(iett); } catch (e) {}
  const gecmis = messages.slice(-10).map(m => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: String(m.content || '').slice(0, 2000) }));
  const mesaj = await ai.aiCevap(gecmis, iett); return c.json({ mesaj, kullanilanAraclar: [] });
});

app.get('/api/ai/durum', async (c) => { try { await aiBilgi.hazirla(iett); } catch {} const durum = await ai.aiDurum(); return c.json(durum); });

app.get('/api/resmi-rota', async (c) => {
  const from = c.req.query('from'); const to = c.req.query('to');
  const time = c.req.query('time'); const date = c.req.query('date');
  const isArrival = c.req.query('isArrival'); const optimizefor = c.req.query('optimizefor');
  if (!from || !to) return c.json({ error: 'from ve to parametreleri gerekli (lat,lng formatında)' }, 400);
  try {
    const iettUrl = new URL('https://nasilgiderim.iett.gov.tr/router');
    iettUrl.searchParams.append('from', from); iettUrl.searchParams.append('to', to);
    if (time) iettUrl.searchParams.append('time', time); if (date) iettUrl.searchParams.append('date', date);
    if (isArrival) iettUrl.searchParams.append('isArrival', isArrival); if (optimizefor) iettUrl.searchParams.append('optimizefor', optimizefor);
    const response = await fetch(iettUrl.toString(), { headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json', 'Origin': 'https://nasilgiderim.iett.gov.tr', 'Referer': 'https://nasilgiderim.iett.gov.tr/' } });
    return c.json(await response.json());
  } catch (error) { return c.json({ error: 'İETT rota servisine ulaşılamadı.' }, 500); }
});


export default app;


if (typeof process !== 'undefined' && process.versions && process.versions.node) {
  const dynamicRequire = eval('require');
  try {
    const { serve } = dynamicRequire('@hono/node-server');
    const PORT = process.env.PORT || 3000;
    serve({ fetch: app.fetch, port: PORT }, (info) => {
      console.log(`\n  🚌  kactakalkar web (Node.js)\n  ➜  http://localhost:${info.port}\n`);
    });
  } catch (e) { console.error("Node sunucusu başlatılamadı:", e.message); }
}