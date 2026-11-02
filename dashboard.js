#!/usr/bin/env node
'use strict';

require('dotenv').config();


const BASE_HAT_DURAK    = process.env.BASE_HAT_DURAK || 'https://api.ibb.gov.tr/iett/UlasimAnaVeri/HatDurakGuzergah.asmx';
const BASE_DUYURU       = process.env.BASE_DUYURU || 'https://api.ibb.gov.tr/iett/UlasimDinamikVeri/Duyurular.asmx';
const BASE_FILO         = process.env.BASE_FILO || 'https://api.ibb.gov.tr/iett/FiloDurum/SeferGerceklesme.asmx';
const BASE_IBB          = process.env.BASE_IBB || 'https://api.ibb.gov.tr/iett/ibb/ibb.asmx';
const BASE_AKARYAKIT    = process.env.BASE_AKARYAKIT || 'https://api.ibb.gov.tr/iett/AracAnaVeri/AracOzellik.asmx';
const BASE_IBB360       = process.env.BASE_IBB360 || 'https://api.ibb.gov.tr/iett/ibb/ibb360.asmx';
const BASE_PLANLANAN_SEFER = process.env.BASE_PLANLANAN_SEFER || 'https://api.ibb.gov.tr/iett/UlasimAnaVeri/PlanlananSeferSaati.asmx';

const IETT_IST_BASE         = process.env.IETT_IST_BASE || 'https://iett.istanbul/tr/RouteStation';
const IETT_IST_STATION_INFO = process.env.IETT_IST_STATION_INFO || 'https://iett.istanbul/tr/RouteStation/GetStationInfo';
const IETT_IST_BY_STATION   = process.env.IETT_IST_BY_STATION || 'https://iett.istanbul/tr/RouteStationAgent/GetRouteByStation';
const IETT_IST_SCHEDULE     = process.env.IETT_IST_SCHEDULE || 'https://iett.istanbul/tr/RouteStation/GetScheduledDepartureTimes';

const TEMPURI_NS = process.env.TEMPURI_NS || 'http://tempuri.org/';
const UA = process.env.USER_AGENT || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const _memoryCache = new Map();
const _filoCallLog = [];
const FILO_LIMIT_PER_HOUR = 80;

function trackFiloCall() {
  const now = Date.now() / 1000;
  _filoCallLog.push(now);
  const cutoff = now - 3600;
  while (_filoCallLog.length && _filoCallLog[0] < cutoff) _filoCallLog.shift();
  return _filoCallLog.length;
}

let _tumFiloCache = null;
let _tumFiloCacheTs = 0;
const TUM_FILO_CACHE_TTL = 60 * 1000;

function cacheRead(file, ttl) { const record = _memoryCache.get(file); if (!record) return [null, null]; const age = Date.now() / 1000 - record.ts; return age > ttl ? [null, age] : [record.data, age]; }
function cacheWrite(file, data) { _memoryCache.set(file, { ts: Date.now() / 1000, data }); }
function cacheDelete(file) { _memoryCache.delete(file); }

const _DOTNET_DATE_RE = /^\/Date\((-?\d+)([+-]\d{4})?\)\/$/;
function convertDotnetDates(obj) {
  if (Array.isArray(obj)) return obj.map(convertDotnetDates);
  if (obj && typeof obj === 'object') { const out = {}; for (const k of Object.keys(obj)) out[k] = convertDotnetDates(obj[k]); return out; }
  if (typeof obj === 'string') {
    const m = obj.trim().match(_DOTNET_DATE_RE);
    if (m) { try { const d = new Date(parseInt(m[1], 10)); const p = n => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`; } catch { return obj; } }
  }
  return obj;
}

function decodeHtml(s) {
  if (s == null) return '';
  return String(s).replace(/&#x([0-9a-fA-F]+);/g, (_, h) => { try { return String.fromCodePoint(parseInt(h, 16)); } catch { return _; } }).replace(/&#(\d+);/g, (_, d) => { try { return String.fromCodePoint(parseInt(d, 10)); } catch { return _; } }).replace(/&(amp|lt|gt|quot|apos|nbsp);/g, (_, name) => ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' })[name] || _);
}

function escapeXml(s) { const map = { '<':'&lt;', '>':'&gt;', '&':'&amp;', "'":'&apos;', '"':'&quot;' }; return String(s).replace(/[<>&'"]/g, ch => map[ch]); }
function kodYonBul(kod) { const m = String(kod || '').toUpperCase().match(/_([GD])_D\d+/); if (m) return m[1] === 'G' ? 'Gidiş' : 'Dönüş'; return '—'; }
function isaretTemizle(v) { const s = String(v == null ? '' : v).trim(); if (!s || s === '-1' || s === '0' || s === 'null' || s === 'undefined') return '—'; return s; }

function buildSoapEnvelope(method, params) {
  const inner = Object.entries(params || {}).filter(([, v]) => v !== null && v !== undefined).map(([k, v]) => `<${k}>${escapeXml(v)}</${k}>`).join('');
  return `<?xml version="1.0" encoding="utf-8"?>\n<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"\n xmlns:xsd="http://www.w3.org/2001/XMLSchema"\n xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">\n <soap:Header><AuthHeader xmlns="http://tempuri.org/" /></soap:Header>\n <soap:Body><${method} xmlns="${TEMPURI_NS}">${inner}</${method}></soap:Body>\n</soap:Envelope>`;
}

function soapFault(xml) { const m = xml.match(/<(?:\w+:)?Fault[\s\S]*?>([\s\S]*?)<\/(?:\w+:)?Fault>/i); if (!m) return null; return m[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 400); }
function extractSoapResult(xml, method) { const re = new RegExp(`<(?:\\w+:)?${method}Result[^>]*>([\\s\\S]*?)</(?:\\w+:)?${method}Result>`, 'i'); const m = xml.match(re); if (!m) return null; return m[1].replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&'); }

async function callSoap(url, method, params) {
  const env = buildSoapEnvelope(method, params);
  try {
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'text/xml; charset=utf-8', 'SOAPAction': `"${TEMPURI_NS}${method}"`, 'User-Agent': UA }, body: env });
    if (!res.ok) return null;
    const xml = await res.text();
    const fault = soapFault(xml); if (fault) return null;
    return extractSoapResult(xml, method);
  } catch (e) { return null; }
}

async function getJson(url, method, params) {
  const text = await callSoap(url, method, params);
  if (text == null) return null;
  const t = text.trim(); if (!t) return null;
  try { return convertDotnetDates(JSON.parse(t)); } catch { return null; }
}

async function istGet(pathname, params, refererHat, raw = false) {
  let url = `${IETT_IST_BASE}/${pathname}`;
  if (params) url = `${url}?${new URLSearchParams(params).toString()}`;
  const h = { 'accept': '*/*', 'accept-language': 'tr-TR,tr;q=0.9', 'x-requested-with': 'XMLHttpRequest', 'user-agent': UA, 'referer': refererHat ? `https://iett.istanbul/RouteDetail?hkod=${refererHat}` : 'https://iett.istanbul/' };
  try { const r = await fetch(url, { headers: h }); if (!r.ok) return null; return raw ? await r.text() : await r.json(); } catch (e) { return null; }
}

async function _tumFiloVerisiniAl() {
  if (_tumFiloCache && Date.now() - _tumFiloCacheTs < TUM_FILO_CACHE_TTL) return _tumFiloCache;
  if (trackFiloCall() > FILO_LIMIT_PER_HOUR) return _tumFiloCache || [];
  try {
    const env = buildSoapEnvelope('GetFiloAracKonum_json', {});
    const res = await fetch(BASE_FILO, {
      method: 'POST',
      headers: { 'Content-Type': 'text/xml; charset=utf-8', 'SOAPAction': `"${TEMPURI_NS}GetFiloAracKonum_json"`, 'User-Agent': UA },
      body: env
    });
    if (!res.ok) return _tumFiloCache || [];
    const xml = await res.text();
    const text = extractSoapResult(xml, 'GetFiloAracKonum_json');
    if (!text) return _tumFiloCache || [];
    const parsed = convertDotnetDates(JSON.parse(text));
    _tumFiloCache = Array.isArray(parsed) ? parsed : [parsed];
    _tumFiloCacheTs = Date.now();
    return _tumFiloCache;
  } catch (e) {
    return _tumFiloCache || [];
  }
}

async function durakDuyurulariHtml(dk) {
  const html = await istGet('GetStationInfo', { dcode: dk, langid: 1 }, dk, true); if (!html) return [];
  const duyurular = []; const pRe = /<p><b>([^<]+)<\/b>:\s*([\s\S]*?)<\/p>/gi; let m;
  while ((m = pRe.exec(html))) {
    const hatKodu = m[1].trim().toUpperCase(); const icerik = decodeHtml(m[2]).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    if (!icerik) continue; if (/^\s*\(\d{2}:\d{2}\)\s*$/.test(icerik)) continue;
    const temiz = icerik.replace(/\(\d{2}:\d{2}\)/g, '').replace(/\s*\|\s*/g, ' ').replace(/\s+/g, ' ').trim();
    if (temiz.length < 15) continue;
    duyurular.push({ HAT: hatKodu, HATKODU: hatKodu, MESAJ: temiz, TIP: 'Günlük', GUNCELLEME_SAATI: '' });
  }
  return duyurular;
}

async function hatDuyurulariHtml(hk) {
  const hedef = String(hk).toUpperCase().trim(); const out = []; const gorulen = new Set();
  const yonler = await hatIkiYonDuraklar(hk); if (!yonler || !yonler.length) return [];
  for (const yon of yonler) {
    const duraklar = (yon.duraklar || []).slice(0, 3);
    for (const st of duraklar) {
      const dk = String(st.dcode || st.stationCode || st.kod || st.DCODE || st.SDURAKKODU || '').trim(); if (!dk) continue;
      try { const dd = await durakDuyurulariHtml(dk); for (const d of dd) { if (d.HATKODU !== hedef) continue; const anahtar = d.MESAJ.toLowerCase().slice(0, 60); if (gorulen.has(anahtar)) continue; gorulen.add(anahtar); out.push(d); } } catch (e) {}
      if (out.length >= 3) break;
    }
    if (out.length >= 3) break;
  }
  return out;
}

async function deparListesi(hk) { return await istGet('GetAllRoute', { rcode: hk }, hk); }
async function deparDuraklari(dk) { const ref = dk.includes('_') ? dk.split('_')[0] : dk; const d = await istGet('GetRoutePinV2', { q: dk }, ref); if (!Array.isArray(d) || !d.length) return null; const k = d[0]; return k && typeof k === 'object' ? (k.stationPlaces || []) : null; }
async function hatIkiYonDuraklar(hk) {
  const out = [];
  for (const [yk, ya] of [['G_D0','GİDİŞ'], ['D_D0','DÖNÜŞ']]) {
    const d = await istGet('GetRoutePinV2', { q: `${hk}_${yk}` }, hk);
    if (Array.isArray(d) && d.length) { const k = d[0]; if (k && typeof k === 'object') { const p = k.stationPlaces || []; if (p.length) out.push({ yon: ya, yon_kod: yk, duraklar: p }); } }
  }
  return out;
}

function _parseSaat(raw) { const s = String(raw || '').trim(); const star = s.startsWith('*'); const clean = star ? s.slice(1) : s; const m = clean.match(/^(\d{1,2}):(\d{2})\s*(.*)$/); if (!m) return null; const hhmm = `${String(m[1]).padStart(2,'0')}:${m[2]}`; const note = (m[3] || '').trim(); const dk = parseInt(m[1], 10) * 60 + parseInt(m[2], 10); return { hhmm, star, note, dk }; }
function _saatStrSirala(a, b) { const pa = _parseSaat(a), pb = _parseSaat(b); if (!pa || !pb) return 0; let da = pa.dk, db = pb.dk; if (da < 5 * 60) da += 24 * 60; if (db < 5 * 60) db += 24 * 60; return da - db; }

function _htmlSeferParse(html) {
  const out = []; const tableRe = /<table[^>]*class="[^"]*line-table[^"]*"[^>]*>([\s\S]*?)<\/table>/gi; let tm;
  while ((tm = tableRe.exec(html))) {
    const table = tm[1]; const dirM = table.match(/<th[^>]*class="[^"]*routedetailstartend[^"]*"[^>]*>([\s\S]*?)<\/th>/i); if (!dirM) continue;
    const direction = decodeHtml(dirM[1]).replace(/<[^>]+>/g, '').trim(); if (!direction) continue;
    const theadM = table.match(/<thead[^>]*>[\s\S]*?<\/thead>/i); const noHead = theadM ? table.replace(theadM[0], '') : table;
    const workday = [], saturday = [], sunday = []; const rowRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi; let rm;
    while ((rm = rowRe.exec(noHead))) {
      const row = rm[1]; const cells = []; const cellRe = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi; let cm;
      while ((cm = cellRe.exec(row))) { cells.push(decodeHtml(cm[1]).replace(/<[^>]+>/g, '').trim()); }
      if (cells.length >= 3) { if (cells[0]) workday.push(cells[0]); if (cells[1]) saturday.push(cells[1]); if (cells[2]) sunday.push(cells[2]); }
    }
    if (workday.length || saturday.length || sunday.length) { out.push({ direction, workday: [...new Set(workday)].sort(_saatStrSirala), saturday: [...new Set(saturday)].sort(_saatStrSirala), sunday: [...new Set(sunday)].sort(_saatStrSirala) }); }
  }
  return out;
}

async function seferSaatleriAl(kod) {
  const body = `timeschedule=&freq=&langid=1&hCode=${encodeURIComponent(kod)}`;
  try {
    const r = await fetch(IETT_IST_SCHEDULE, { method: 'POST', headers: { 'Accept': '*/*', 'Accept-Language': 'tr-TR,tr;q=0.9', 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', 'X-Requested-With': 'XMLHttpRequest', 'Referer': 'https://iett.istanbul/', 'User-Agent': UA }, body: body });
    if (!r.ok) return null;
    const html = await r.text(); if (!html || !/<table[^>]*line-table/i.test(html)) return null;
    const parsed = _htmlSeferParse(html); if (!parsed.length) return null; return parsed;
  } catch (e) { return null; }
}

async function seferleriCokKaynakliTopla(hk) { const parsed = await seferSaatleriAl(hk); if (!parsed || !parsed.length) return { yonler: [], bulundu: false }; return { yonler: parsed.map(b => ({ direction: b.direction, workday: b.workday || [], saturday: b.saturday || [], sunday: b.sunday || [] })), bulundu: true }; }

async function stationLines(dk) {
  const h = { 'accept': '*/*', 'accept-language': 'tr-TR,tr;q=0.9', 'x-requested-with': 'XMLHttpRequest', 'referer': `https://iett.istanbul/StationDetail?dkod=${dk}`, 'user-agent': UA };
  const url = `${IETT_IST_BY_STATION}?dcode=${dk}&langid=1&debug=0`;
  try { 
    const r = await fetch(url, { headers: h }); if (!r.ok) return [];
    let html = await r.text(); try { const js = JSON.parse(html); if (js && js.html) html = js.html; } catch {}
    const out = []; const blockRe = /<div[^>]*class="[^"]*line-item[^"]*"[^>]*>([\s\S]*?)<\/div>/gi; let b;
    while ((b = blockRe.exec(html))) {
      const blok = b[1]; const mk = blok.match(/<span[^>]*>([^<]+)<\/span>/i); const ma = blok.match(/<p[^>]*>([^<]+)<\/p>/i); const mh = blok.match(/href="([^"]*)"/i);
      const hk = mk ? mk[1].trim() : ''; const ha = ma ? decodeHtml(ma[1].trim()) : ''; let yon = '';
      if (mh) { const mrn = mh[1].match(/routename=([^&"]+)/); if (mrn) yon = decodeHtml(mrn[1].replace(/\+/g, ' ')); }
      if (hk) out.push({ hat: hk, ad: ha || yon, yon });
    }
    return out;
  } catch (e) { return []; }
}

const _ARRIVAL_RE = /<span>\s*([^<]+?)\s*<\/span>\s*<p>\s*([\s\S]*?)<b>\s*\((.*?)\)\s*([^<]+?)\s*<\/b>\s*<\/p>/gi;

function _saatDkCevir(saatStr) { const m = String(saatStr || '').match(/(\d{1,2}):(\d{2})/); if (!m) return null; return parseInt(m[1], 10) * 60 + parseInt(m[2], 10); }
function _simdiDk() { try { const s = new Intl.DateTimeFormat('tr-TR', { timeZone: 'Europe/Istanbul', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date()); const [h, m] = s.split(':').map(Number); if (isFinite(h) && isFinite(m)) return h * 60 + m; } catch (_) {} const n = new Date(); return n.getHours() * 60 + n.getMinutes(); }

function parseBusArrivals(html) {
  const out = []; let m; _ARRIVAL_RE.lastIndex = 0; const simdi = _simdiDk();
  while ((m = _ARRIVAL_RE.exec(html))) {
    const hat = m[1].trim(); const yon = decodeHtml(m[2]).replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
    const saat = m[3].trim(); const kalanMetin = m[4].trim();
    const varisDk = _saatDkCevir(saat); let kalanDk = 9999;
    if (varisDk != null) { let fark = varisDk - simdi; if (fark < -60) fark += 24 * 60; kalanDk = fark >= 0 ? fark : 0; } else { const dm = kalanMetin.match(/(\d+)/); if (dm) kalanDk = parseInt(dm[1], 10); }
    out.push({ hat, yon, saat, kalan_dk: kalanDk, kalan_metin: kalanMetin });
  }
  out.sort((a, b) => a.kalan_dk - b.kalan_dk); return out;
}

async function stationArrivalsV2(dk, sessiz = false) {
  const h = { 'accept': '*/*', 'accept-language': 'tr-TR,tr;q=0.6', 'x-requested-with': 'XMLHttpRequest', 'referer': `https://iett.istanbul/StationDetail?dkod=${dk}`, 'user-agent': UA };
  const url = `${IETT_IST_STATION_INFO}?dcode=${dk}&langid=1`;
  try { const r = await fetch(url, { headers: h }); if (!r.ok) return []; const html = await r.text(); return parseBusArrivals(html); } catch (e) { return []; }
}

function haversineKm(lat1, lng1, lat2, lng2) { const R = 6371; const dLat = (lat2 - lat1) * Math.PI / 180; const dLng = (lng2 - lng1) * Math.PI / 180; const a = Math.sin(dLat/2) ** 2 + Math.cos(lat1 * Math.PI/180) * Math.cos(lat2 * Math.PI/180) * Math.sin(dLng/2) ** 2; return 2 * R * Math.asin(Math.sqrt(a)); }

const _hizCache = new Map(); const _aracKonumCache = new Map(); const ARAC_CACHE_TTL = 20 * 1000; const _mesafeGecmisi = new Map();

function _tsParse(s) { const m = String(s || '').match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/); if (!m) return null; return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]).getTime(); }
function _hizCacheTemizle() { const now = Date.now(); for (const [kapi, v] of _hizCache) { if (now - v.ts > 600_000) _hizCache.delete(kapi); } }

function _konumdanHizHesapla(kapi, lat, lng, ts) {
  if (!isFinite(lat) || !isFinite(lng) || !ts) return 0;
  const prev = _hizCache.get(kapi); _hizCache.set(kapi, { lat, lng, ts });
  if (!prev) return 0;
  const dtSn = (ts - prev.ts) / 1000; if (dtSn < 10 || dtSn > 300) return 0;
  const dkm = haversineKm(prev.lat, prev.lng, lat, lng); let hiz = (dkm / dtSn) * 3600;
  if (!isFinite(hiz) || hiz > 120) return 0; return Math.round(hiz * 10) / 10;
}

function _varsayilanHiz() { const h = new Date().getHours(); if (h >= 7 && h < 10) return 15; if (h >= 17 && h < 20) return 15; if (h >= 23 || h < 6) return 30; return 22; }

function _yonUyuyorMu(arac, yon) {
  if (!arac || !yon) return true;
  const aracYon = String(arac.yon || '').trim().toUpperCase();
  const hedefYon = String(yon || '').trim().toUpperCase();
  if (!aracYon) return true;
  if (hedefYon.includes('GİDİŞ') || hedefYon === 'G') return aracYon === '1' || aracYon === 'G' || aracYon.includes('GİDİŞ');
  if (hedefYon.includes('DÖNÜŞ') || hedefYon === 'D') return aracYon === '2' || aracYon === 'D' || aracYon.includes('DÖNÜŞ');
  return aracYon === hedefYon;
}

async function stationArrivalsWithDistance(dk, durakLat, durakLng, sessiz = true) {
  const varislar = await stationArrivalsV2(dk, sessiz); if (!varislar.length) return [];
  if (!isFinite(durakLat) || !isFinite(durakLng)) { return varislar.map(v => ({ ...v, hesap: 'iett', kaynak: 'iett-saat' })); }
  const hatlar = [...new Set(varislar.map(x => x.hat))].filter(Boolean); const hatKonumlari = {};
  await Promise.all(hatlar.map(async h => { try { const araclar = await hatAktifAraclarKonumlu(h); if (araclar && araclar.length) { hatKonumlari[h] = araclar.filter(a => a.lat && a.lng).map(a => ({ ...a, _mesafe: haversineKm(durakLat, durakLng, a.lat, a.lng) })).sort((a, b) => a._mesafe - b._mesafe); } } catch (e) {} }));
  const hatGruplari = {}; varislar.forEach(v => { if (!hatGruplari[v.hat]) hatGruplari[v.hat] = []; hatGruplari[v.hat].push(v); });
  const sonuc = []; 
  for (const [hat, grup] of Object.entries(hatGruplari)) {
    const tumAraclar = hatKonumlari[hat] || []; grup.sort((a, b) => String(a.saat).localeCompare(String(b.saat))); let aracIndex = 0; 
    for (const item of grup) {
      const uygunAraclar = tumAraclar.filter(a => _yonUyuyorMu(a, item.yon));
      if (!uygunAraclar.length) { sonuc.push({ ...item, kalan_dk: item.kalan_dk ?? 9999, mesafe_km: null, kapi: null, lat: null, lng: null, hiz: 0, hesap: 'iett', kaynak: 'iett-saat' }); continue; }
      let eslesen = null; if (item.kapi) eslesen = uygunAraclar.find(a => a.kapi === item.kapi);
      if (!eslesen) { eslesen = uygunAraclar[aracIndex % uygunAraclar.length]; aracIndex++; }
      if (!eslesen) { sonuc.push({ ...item, kalan_dk: item.kalan_dk ?? 9999, mesafe_km: null, kapi: null, lat: null, lng: null, hiz: 0, hesap: 'iett', kaynak: 'iett-saat' }); continue; }
      const mesafeKm = eslesen._mesafe; const hizAnlik = eslesen.hiz || 0; let kalanDk; let hesapTipi;
      if (hizAnlik > 3 && mesafeKm != null) { kalanDk = Math.max(0, Math.round((mesafeKm / hizAnlik) * 60)); hesapTipi = 'hareket'; } 
      else if (mesafeKm != null) { const hiz = _varsayilanHiz(); kalanDk = Math.max(0, Math.round((mesafeKm / hiz) * 60)); hesapTipi = 'mesafe-varsayim'; } 
      else { const iettDk = parseInt(String(item.kalan_metin || '').match(/\d+/)?.[0] || '0', 10); if (iettDk > 0 && iettDk < 120) { kalanDk = iettDk; hesapTipi = 'iett-metin'; } else { kalanDk = item.kalan_dk ?? 9999; hesapTipi = 'iett-saat'; } }
      sonuc.push({ ...item, kalan_dk: kalanDk, mesafe_km: mesafeKm != null ? Math.round(mesafeKm * 100) / 100 : null, kapi: eslesen.kapi || item.kapi || null, yakinDurakKodu: eslesen.yakinDurakKodu || null, lat: eslesen.lat || null, lng: eslesen.lng || null, hiz: hizAnlik, hesap: 'konum', kaynak: hesapTipi });
    }
  }
  return sonuc.sort((a, b) => (a.kalan_dk ?? 9999) - (b.kalan_dk ?? 9999));
}

async function hatAktifKapilar(hk) {
  const tumFilo = await _tumFiloVerisiniAl();
  const set = new Set();
  for (const r of tumFilo) {
    if (!r || typeof r !== 'object') continue;
    const hatKodu = String(r.HatKodu ?? r.HATKODU ?? r.HatNo ?? '').trim().toUpperCase();
    if (hatKodu !== String(hk).toUpperCase()) continue;
    const k = r.KapiNo ?? r.KAPINO ?? r.kapino ?? r.Kapi_No ?? r.KAPI_NO ?? '';
    const s = String(k).trim(); if (s) set.add(s);
  }
  return [...set].sort();
}

async function hatAktifAraclarKonumlu(hk) {
  const _cached = _aracKonumCache.get(hk); if (_cached && Date.now() - _cached.ts < ARAC_CACHE_TTL) return _cached.data;
  const tumFilo = await _tumFiloVerisiniAl();
  const rows = tumFilo.filter(r => {
    if (!r || typeof r !== 'object') return false;
    const hatKodu = String(r.HatKodu ?? r.HATKODU ?? r.HatNo ?? '').trim().toUpperCase();
    return !hatKodu || hatKodu === String(hk).toUpperCase();
  });
  if (!rows.length) { if (_cached) return _cached.data; return []; }
  const out = []; const gorulen = new Set();
  for (const r of rows) {
    let kapi = ''; for (const f of ['KapiNo','KAPINO','kapino','Kapi_No','KAPI_NO']) { if (r[f] != null && String(r[f]).trim()) { kapi = String(r[f]).trim(); break; } }
    if (!kapi) { for (const [k, v] of Object.entries(r)) { if (k.toUpperCase().includes('KAPI') && String(v).trim()) { kapi = String(v).trim(); break; } } }
    if (!kapi || gorulen.has(kapi)) continue; gorulen.add(kapi);
    const lat = parseFloat(r.Enlem ?? r.ENLEM ?? r.enlem ?? r.Y ?? r.y ?? r.LAT ?? r.lat); const lng = parseFloat(r.Boylam ?? r.BOYLAM ?? r.boylam ?? r.X ?? r.x ?? r.LNG ?? r.lng);
    const yon = String(r.Yon ?? r.YON ?? r.yon ?? '').trim(); const saat = String(r.Saat ?? r.SAAT ?? r.Tarih ?? '').trim();
    const hatKodu = String(r.HatKodu ?? r.HATKODU ?? r.HatNo ?? '').trim(); const guzergahkodu = String(r.guzergahkodu ?? r.GUZERGAHKODU ?? r.GuzergahKodu ?? '').trim();
    const yakinDurakKodu = String(r.yakinDurakKodu ?? r.YakinDurakKodu ?? r.YAKIN_DURAK_KODU ?? '').trim();
    let hiz = parseFloat(r.Hiz ?? r.HIZ ?? r.hiz ?? 0);
    if (!hiz || hiz === 0) { 
      const tsRaw = String(r.son_konum_zamani ?? r.SonKonumZamani ?? r.SON_KONUM_ZAMANI ?? r.Tarih ?? r.SAAT ?? r.Saat ?? '').trim(); 
      let ts = _tsParse(tsRaw);
      if (!ts && /^\d{1,2}:\d{2}:\d{2}$/.test(tsRaw)) { const bugun = new Date().toISOString().slice(0, 10); ts = _tsParse(`${bugun} ${tsRaw}`); }
      hiz = _konumdanHizHesapla(kapi, lat, lng, ts); 
    }
    if (_hizCache.size % 100 === 0) _hizCacheTemizle();
    out.push({ kapi, hat: hatKodu || hk, guzergahkodu, yakinDurakKodu, lat: isFinite(lat) ? lat : null, lng: isFinite(lng) ? lng : null, hiz: isFinite(hiz) ? hiz : 0, yon, saat });
  }
  if (out.length) _aracKonumCache.set(hk, { data: out, ts: Date.now() });
  return out;
}

async function hatlarIcinKapilar(hatlar, sessiz = false) {
  const out = {}; const uniq = [...new Set(hatlar.filter(Boolean))].sort(); if (!uniq.length) return out;
  const [cache, yas] = cacheRead('hat_kapilar.json', 30); let cacheD = (cache && typeof cache === 'object' && !Array.isArray(cache)) ? { ...cache } : {};
  const cacheGuncel = yas != null && yas <= 30; const eksik = cacheGuncel ? uniq.filter(h => !(h in cacheD)) : uniq;
  if (eksik.length) { if (!cacheGuncel) cacheD = {}; for (const h of eksik) { try { cacheD[h] = await hatAktifKapilar(h); } catch { cacheD[h] = []; } } cacheWrite('hat_kapilar.json', cacheD); }
  for (const h of uniq) out[h] = cacheD[h] || [];
  return out;
}

async function durakAdiBul(dk) { const d = await getJson(BASE_HAT_DURAK, 'GetDurak_json', { DurakKodu: dk }); if (Array.isArray(d) && d.length) return String(d[0].SDURAKADI || '').trim().toUpperCase(); if (d && typeof d === 'object') return String(d.SDURAKADI || '').trim().toUpperCase(); return null; }
function kapiEsles(k, a) { for (const f of ['KapiNo','KAPINO','kapino','Kapi_No','KAPI_NO']) { if (f in k && String(k[f] ?? '').trim().toUpperCase() === String(a).trim().toUpperCase()) return true; } for (const [kk, vv] of Object.entries(k)) { if (kk.toUpperCase().includes('KAPI') && String(vv).trim().toUpperCase() === String(a).trim().toUpperCase()) return true; } return false; }

async function durakaGelenDeparlar(dk, zorla = false) {
  if (!zorla) { const [c] = cacheRead('durak_depar.json', 3600); if (c && typeof c === 'object' && dk in c) return c[dk]; }
  const ad = await durakAdiBul(dk); if (!ad) return []; const adUp = ad.trim().toUpperCase(); const hatlar = await stationLines(dk); if (!hatlar.length) return [];
  const out = [];
  for (const h of hatlar) {
    const hk = h.hat; const depList = (await deparListesi(hk)) || [];
    for (const dep of depList) { const kod = String(dep.GUZERGAH_GUZERGAH_KODU || '').trim(); if (!kod) continue; const places = await deparDuraklari(kod); if (!places) continue; if (places.some(st => String(st.stationName || '').trim().toUpperCase() === adUp)) { out.push({ hat: hk, depar_kodu: kod, depar_adi: String(dep.GUZERGAH_GUZERGAH_ADI || dep.GUZERGAH_ADI || '').trim(), isaret: isaretTemizle(dep.GUZERGAH_GUZERGAH_ISARETI), yon: kodYonBul(kod) }); } }
  }
  const [e] = cacheRead('durak_depar.json', 3600); const y = (e && typeof e === 'object') ? { ...e } : {}; y[dk] = out; cacheWrite('durak_depar.json', y); return out;
}

let _aracOzellikCache = null; let _aracOzellikTs = 0;

async function getAracOzellikleri(kapiNo = null) {
  if (kapiNo) {
    let sonuc = null;
    const cek = async (method) => {
      try {
        const d = await getJson(BASE_AKARYAKIT, method, { KapiNo: kapiNo });
        const rows = Array.isArray(d) ? d : (d ? [d] : []);
        for (const r of rows) {
          const kapi = String(r.KapiNo || r.KAPINO || r.Kapi_No || '').trim();
          if (!kapi || kapi !== kapiNo) continue;
          const ozMetin = String(r.Ozellikler || r.OZELLIKLER || r.ACIKLAMA || '').toUpperCase();
          sonuc = { ototip: String(r.Ototip || r.Marka || r.MARKA || r.Model || '').trim(), wifi: ozMetin.includes('WIFI') || ozMetin.includes('WI-FI') || String(r.Wifi) === '1' || String(r.WIFI) === '1', klima: ozMetin.includes('KLIMA') || String(r.Klima) === '1' || String(r.KLIMA) === '1', usb: ozMetin.includes('USB') || String(r.Usb) === '1' || String(r.USB) === '1', engelli: ozMetin.includes('ENGELLI') || String(r.Engelli) === '1' || String(r.ENGELLI) === '1', bisiklet: ozMetin.includes('BISIKLET') || String(r.Bisiklet) === '1' || String(r.BISIKLET) === '1' };
          break;
        }
      } catch (e) {}
    };
    await cek('GetAracOzellikleriIETT_json'); if (!sonuc) await cek('GetAracOzellikleriOHO_json');
    return sonuc ? { [kapiNo]: sonuc } : {};
  }

  if (_aracOzellikCache && Date.now() - _aracOzellikTs < 24 * 60 * 60 * 1000) return _aracOzellikCache;
  const map = {};
  try {
    const d1 = await getJson(BASE_AKARYAKIT, 'GetAracOzellikleriIETT_json', {});
    const rows1 = Array.isArray(d1) ? d1 : (d1 ? [d1] : []);
    for (const r of rows1) {
      const kapi = String(r.KapiNo || r.KAPINO || r.Kapi_No || '').trim(); if (!kapi) continue;
      const ozMetin = String(r.Ozellikler || r.OZELLIKLER || r.ACIKLAMA || '').toUpperCase();
      map[kapi] = { ototip: String(r.Ototip || r.Marka || r.MARKA || r.Model || '').trim(), wifi: ozMetin.includes('WIFI') || ozMetin.includes('WI-FI') || String(r.Wifi) === '1' || String(r.WIFI) === '1', klima: ozMetin.includes('KLIMA') || String(r.Klima) === '1' || String(r.KLIMA) === '1', usb: ozMetin.includes('USB') || String(r.Usb) === '1' || String(r.USB) === '1', engelli: ozMetin.includes('ENGELLI') || String(r.Engelli) === '1' || String(r.ENGELLI) === '1', bisiklet: ozMetin.includes('BISIKLET') || String(r.Bisiklet) === '1' || String(r.BISIKLET) === '1' };
    }
    _aracOzellikCache = map; _aracOzellikTs = Date.now(); return map;
  } catch (e) { return {}; }
}

let _tumDurakCache = null; let _tumDurakTs = 0; let _tumDurakPromise = null;
const TUM_DURAK_TTL = 6 * 60 * 60 * 1000;

async function _tumDuraklariYukle() {
  if (_tumDurakCache && _tumDurakCache.length && Date.now() - _tumDurakTs < TUM_DURAK_TTL) return _tumDurakCache;
  if (_tumDurakPromise) return _tumDurakPromise;
  _tumDurakPromise = (async () => {
    try {
      let liste = [];
      try { const d = await getJson(BASE_HAT_DURAK, 'GetDurak_json', {}); liste = Array.isArray(d) ? d : (d ? [d] : []); } catch (e) {}
      if (!liste.length) { try { const d = await getJson(BASE_HAT_DURAK, 'GetDurak_json', { DurakKodu: '' }); liste = Array.isArray(d) ? d : (d ? [d] : []); } catch (e) {} }
      if (liste.length) { _tumDurakCache = liste; _tumDurakTs = Date.now(); }
      return liste;
    } finally { _tumDurakPromise = null; }
  })();
  return _tumDurakPromise;
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

function _duyuruHatiIceriyorMu(duyuru, hk) {
  const hedef = String(hk).toUpperCase().trim(); if (!hedef) return false;
  const hatKodu = String(duyuru.HATKODU || '').toUpperCase();
  if (hatKodu) { const parcalar = hatKodu.split(/[\s,;\/\-]+/).filter(Boolean); if (parcalar.includes(hedef)) return true; if (hatKodu === hedef) return true; }
  const hatAdi = String(duyuru.HAT || '').toUpperCase();
  if (hatAdi) { const parcalar = hatAdi.split(/[\s,;\/\-]+/).filter(Boolean); if (parcalar.includes(hedef)) return true; }
  const mesaj = String(duyuru.MESAJ || '').toUpperCase();
  if (mesaj) { const escaped = hedef.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); const re = new RegExp(`(^|[^A-Z0-9])${escaped}([^A-Z0-9]|$)`); if (re.test(mesaj)) return true; }
  return false;
}

async function _tumDuyurulariCek() {
  const denemeler = [{ method: 'GetDuyurular_json', params: undefined }, { method: 'GetDuyurular_json', params: {} }, { method: 'GetDuyurular_json', params: { Tarih: '' } }, { method: 'GetDuyurular_json', params: { HatKodu: '' } }, { method: 'GetDuyurular_json', params: { hatKodu: '' } }, { method: 'GetDuyurular', params: {} }];
  for (const d of denemeler) {
    try { const ham = await getJson(BASE_DUYURU, d.method, d.params); const rows = Array.isArray(ham) ? ham : (ham ? [ham] : []); if (rows.length) { return rows; } } catch (e) {}
  }
  return [];
}

async function _duraklaraKodEkle(out) {
  const eksikler = [];
  for (const yk of Object.keys(out.yonler || {})) { for (const d of out.yonler[yk].duraklar || []) { if (!d.kod && d.ad) eksikler.push(d); } }
  if (!eksikler.length) return;
  try {
    const tum = await _tumDuraklariYukle();
    if (tum.length) {
      const parsed = [];
      for (const st of tum) { const koord = _koordAl(st); if (!koord) continue; const kod = String(st.SDURAKKODU || st.sDurakKodu || '').trim(); if (!kod) continue; parsed.push({ lat: koord[0], lng: koord[1], kod, ilce: String(st.ILCEADI || '').trim() }); }
      for (const d of eksikler) {
        if (d.kod) continue; const lat = parseFloat(d.lat), lng = parseFloat(d.lng); if (!isFinite(lat) || !isFinite(lng)) continue;
        let enIyi = null, minDist = Infinity; const cosLat = Math.cos(lat * Math.PI / 180);
        for (const p of parsed) { const dLat = p.lat - lat; const dLng = (p.lng - lng) * cosLat; const dist = dLat * dLat + dLng * dLng; if (dist < minDist) { minDist = dist; enIyi = p; } }
        if (enIyi && Math.sqrt(minDist) * 111 < 0.05) { const ilceUyum = !d.ilce || !enIyi.ilce || String(d.ilce).toLocaleUpperCase('tr-TR') === String(enIyi.ilce).toLocaleUpperCase('tr-TR'); if (ilceUyum) { d.kod = enIyi.kod; } }
      }
    }
  } catch (e) {}
}

async function _duraklariGYYdenCek(hk) {
  const adaylar = [{ hat_kodu: hk }, { hatKodu: hk }, { HAT_KODU: hk }, { HatKodu: hk }];
  for (const p of adaylar) {
    try {
      const detay = await getJson(BASE_IBB, 'DurakDetay_GYY', p);
      const rows = Array.isArray(detay) ? detay : (detay ? [detay] : []); if (!rows.length) continue;
      const yonMap = {};
      for (const r of rows) {
        const yon = String(r.YON || '').trim().toUpperCase() || 'G'; const yk = (yon === 'D' || yon === 'DÖNÜŞ' || yon === 'DONUS') ? 'D_D0' : 'G_D0';
        if (!yonMap[yk]) yonMap[yk] = { ad: yk === 'D_D0' ? 'DÖNÜŞ' : 'GİDİŞ', kod: `${hk}_${yk}`, duraklar: [] };
        const kod = String(r.DURAKKODU || '').trim(); const ad = String(r.DURAKADI || '').trim(); const x = parseFloat(r.XKOORDINATI); const y = parseFloat(r.YKOORDINATI);
        yonMap[yk].duraklar.push({ ad, kod, ilce: String(r.ILCEADI || '').trim(), lat: isFinite(y) ? y : null, lng: isFinite(x) ? x : null, sira: parseInt(r.SIRANO, 10) || null });
      }
      for (const y of Object.values(yonMap)) y.duraklar.sort((a, b) => (a.sira || 0) - (b.sira || 0));
      if (Object.values(yonMap).flatMap(y => y.duraklar).filter(d => d.kod).length > 0) return yonMap;
    } catch (e) {}
  }
  return null;
}

function _operatorTip(kapi) { const k = String(kapi || '').trim().toUpperCase(); if (!k) return 'bilinmiyor'; if (k.startsWith('C-') || k.startsWith('B-') || k.startsWith('M-') || k.startsWith('A-')) return 'garaj'; if (k.startsWith('O') || k.startsWith('K') || k.startsWith('T-')) return 'oho'; return 'bilinmiyor'; }
function _saatDk(hhmm) { const m = String(hhmm || '').match(/^(\d{1,2}):(\d{2})$/); if (!m) return -1; return parseInt(m[1], 10) * 60 + parseInt(m[2], 10); }

let _tumHatlarCache = null; let _tumHatlarTs = 0; let _tumHatlarPromise = null;
const HATLAR_TTL = 12 * 60 * 60 * 1000;

async function _tumHatlar() {
  if (_tumHatlarCache && Date.now() - _tumHatlarTs < HATLAR_TTL) return _tumHatlarCache;
  if (_tumHatlarPromise) return _tumHatlarPromise;
  _tumHatlarPromise = (async () => {
    try { 
      let d = await getJson(BASE_HAT_DURAK, 'GetHat_json', { HatKodu: '' }); 
      if (!d) d = await getJson(BASE_HAT_DURAK, 'GetHat_json', {});
      _tumHatlarCache = Array.isArray(d) ? d : (d ? [d] : []); 
      _tumHatlarTs = Date.now(); 
    }
    catch (e) { if (!_tumHatlarCache) _tumHatlarCache = []; }
    finally { _tumHatlarPromise = null; }
    return _tumHatlarCache;
  })();
  return _tumHatlarPromise;
}

module.exports = {
  getJson, istGet, hatDuyurulariHtml, durakDuyurulariHtml,
  decodeHtml, kodYonBul, isaretTemizle,
  stationLines, stationArrivalsV2, stationArrivalsWithDistance, haversineKm, durakAdiBul,
  hatIkiYonDuraklar, durakaGelenDeparlar, deparListesi, deparDuraklari,
  hatAktifKapilar, hatlarIcinKapilar, hatAktifAraclarKonumlu,
  seferSaatleriAl, seferleriCokKaynakliTopla,
  BASE_HAT_DURAK, BASE_DUYURU, BASE_FILO, BASE_IBB, BASE_AKARYAKIT, BASE_IBB360, BASE_PLANLANAN_SEFER,
  convertDotnetDates, kapiEsles, getAracOzellikleri,
  _tumDuraklariYukle, _koordAl, _duyuruHatiIceriyorMu, _tumDuyurulariCek, _duraklaraKodEkle, _duraklariGYYdenCek, _operatorTip, _saatDk, _tumHatlar
};