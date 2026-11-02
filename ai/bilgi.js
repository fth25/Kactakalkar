'use strict';

const fs = require('fs');
const path = require('path');

const CACHE_DIR = path.join(process.env.HOME || process.env.USERPROFILE, '.iett_cache');
const HAT_INDEX_FILE   = path.join(CACHE_DIR, 'ai_hat_index.json');
const DURAK_INDEX_FILE = path.join(CACHE_DIR, 'ai_durak_index.json');
const DURAK_TOKEN_FILE = path.join(CACHE_DIR, 'ai_durak_token.json');

let _hatlar = null;
let _duraklar = null;
let _durakToken = null;

/* ============================================================
   TÜRKÇE NORMALİZASYON — İ/I, Ş/Ğ/Ü/Ö/Ç ve aksan tam çözüm
   ============================================================ */
const TR_MAP = {
  'İ':'i','I':'i','ı':'i','i':'i',
  'Ş':'s','ş':'s',
  'Ğ':'g','ğ':'g',
  'Ü':'u','ü':'u',
  'Ö':'o','ö':'o',
  'Ç':'c','ç':'c',
  'Â':'a','â':'a','Î':'i','î':'i','Û':'u','û':'u',
};

function _norm(s) {
  if (s == null) return '';
  let t = String(s).trim();
  t = t.replace(/[İIıiŞşĞğÜüÖöÇçÂâÎîÛû]/g, ch => TR_MAP[ch] || ch);
  t = t.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  return t.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
}

function _tokenize(s) {
  return _norm(s).split(/\s+/).filter(Boolean);
}

function _yukleDosya(f) {
  if (!fs.existsSync(f)) return null;
  try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; }
}

function _kaydetDosya(f, data) {
  try {
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, JSON.stringify(data));
  } catch (e) { console.warn('[bilgi] kayıt hatası:', e.message); }
}

/* ============================================================
   HAZIRLA
   ============================================================ */
async function hazirla(iett) {
  if (_hatlar && _duraklar && _durakToken) {
    return { hat: _hatlar.size, durak: _duraklar.size };
  }

  /* --- HATLAR --- */
  let hatRaw = _yukleDosya(HAT_INDEX_FILE);
  if (!hatRaw || !hatRaw.length) {
    console.log('[bilgi] hat index yükleniyor...');
    const d = await iett.getJson(iett.BASE_HAT_DURAK, 'GetHat_json', { HatKodu: '' });
    const rows = Array.isArray(d) ? d : (d ? [d] : []);
    hatRaw = rows.map(r => ({
      kod: String(r.SHATKODU || '').trim().toUpperCase(),
      ad: String(r.SHATADI || '').trim(),
      tarife: String(r.TARIFE || '').trim(),
      uzunluk: Number(r.HAT_UZUNLUGU || 0),
      sure: Number(r.SEFER_SURESI || 0),
    })).filter(h => h.kod);
    if (hatRaw.length) _kaydetDosya(HAT_INDEX_FILE, hatRaw);
    console.log(`[bilgi] ${hatRaw.length} hat yüklendi`);
  }
  _hatlar = new Map(hatRaw.map(h => [h.kod, h]));

  /* --- DURAKLAR --- */
  let durakRaw = _yukleDosya(DURAK_INDEX_FILE);
  if (!durakRaw || !durakRaw.length) {
    console.log('[bilgi] durak index yükleniyor (biraz sürebilir)...');
    let d = await iett.getJson(iett.BASE_HAT_DURAK, 'GetDurak_json', {});
    let rows = Array.isArray(d) ? d : (d ? [d] : []);

    if (!rows.length) {
      d = await iett.getJson(iett.BASE_HAT_DURAK, 'GetDurak_json', { DurakKodu: '' });
      rows = Array.isArray(d) ? d : (d ? [d] : []);
    }

    durakRaw = rows.map(r => ({
      kod: String(r.SDURAKKODU || r.sDurakKodu || '').trim(),
      ad: String(r.SDURAKADI || r.sDurakAdi || '').trim(),
      ilce: String(r.ILCEADI || '').trim(),
      yon: String(r.SYON || '').trim(),
    })).filter(x => x.kod && x.ad);

    if (durakRaw.length) _kaydetDosya(DURAK_INDEX_FILE, durakRaw);
    console.log(`[bilgi] ${durakRaw.length} durak yüklendi`);
  }
  _duraklar = new Map(durakRaw.map(x => [x.kod, x]));

  /* --- TOKEN INDEX --- */
  let tokenRaw = _yukleDosya(DURAK_TOKEN_FILE);
  if (!tokenRaw || tokenRaw.surum !== durakRaw.length) {
    console.log('[bilgi] token index kuruluyor...');
    const t = {};
    for (const d of _duraklar.values()) {
      const toks = new Set(_tokenize(d.ad));
      for (const tok of toks) {
        if (!t[tok]) t[tok] = [];
        t[tok].push(d.kod);
      }
    }
    tokenRaw = { surum: durakRaw.length, index: t };
    _kaydetDosya(DURAK_TOKEN_FILE, tokenRaw);
    console.log(`[bilgi] ${Object.keys(t).length} token indexlendi`);
  }
  _durakToken = new Map();
  for (const [tok, kodlar] of Object.entries(tokenRaw.index || {})) {
    _durakToken.set(tok, new Set(kodlar));
  }

  return { hat: _hatlar.size, durak: _duraklar.size };
}

function hatGetir(kod) {
  if (!_hatlar) return null;
  return _hatlar.get(String(kod).toUpperCase()) || null;
}

function durakGetir(kod) {
  if (!_duraklar) return null;
  return _duraklar.get(String(kod)) || null;
}

function hatBul(metin) {
  if (!_hatlar) return [];
  const m = String(metin).toUpperCase().match(/\b[A-ZÇĞİÖŞÜ]{0,3}\d{1,4}[A-ZÇĞİÖŞÜ]{0,3}\b/g) || [];
  const bulunan = [];
  for (const k of m) if (_hatlar.has(k)) bulunan.push(_hatlar.get(k));
  return bulunan;
}

/* ============================================================
   DURAK ARA — Token index + prefix + cümle + ilçe bonusu
   ============================================================ */
function durakAra(metin, limit = 30) {
  if (!_duraklar || !_durakToken) return [];
  const qTokens = _tokenize(metin);
  if (!qTokens.length) return [];

  const skor = new Map();

  for (const qt of qTokens) {
    const tamSet = _durakToken.get(qt);
    if (tamSet) {
      for (const kod of tamSet) {
        const e = skor.get(kod) || { durak: _duraklar.get(kod), skor: 0 };
        e.skor += 10;
        skor.set(kod, e);
      }
    }
    if (qt.length >= 2) {
      for (const [tok, kodSet] of _durakToken) {
        if (tok === qt) continue;
        if (tok.startsWith(qt)) {
          for (const kod of kodSet) {
            const e = skor.get(kod) || { durak: _duraklar.get(kod), skor: 0 };
            e.skor += 5;
            skor.set(kod, e);
          }
        }
      }
    }
  }

  const qFull = _norm(metin);
  if (qFull.length >= 4) {
    for (const [, e] of skor) {
      const dNorm = _norm(e.durak.ad);
      if (dNorm === qFull) e.skor += 100;
      else if (dNorm.startsWith(qFull)) e.skor += 30;
      else if (dNorm.includes(qFull)) e.skor += 15;
    }
  }

  for (const [, e] of skor) {
    const ilceNorm = _norm(e.durak.ilce);
    if (ilceNorm && qTokens.some(qt => ilceNorm.includes(qt))) e.skor += 2;
  }

  return [...skor.values()]
    .sort((a, b) => b.skor - a.skor)
    .slice(0, limit)
    .map(s => s.durak);
}

function hatlariAra(metin, limit = 10) {
  if (!_hatlar) return [];
  const norm = _norm(metin);
  if (norm.length < 3) return [];
  const kelimeler = norm.split(/\s+/).filter(k => k.length >= 3);
  if (!kelimeler.length) return [];

  const skorlu = [];
  for (const h of _hatlar.values()) {
    const hNorm = _norm(h.ad);
    let skor = 0;
    for (const k of kelimeler) if (hNorm.includes(k)) skor++;
    if (skor > 0) skorlu.push({ hat: h, skor });
  }
  skorlu.sort((a, b) => b.skor - a.skor);
  return skorlu.slice(0, limit).map(s => s.hat);
}

function durum() {
  return {
    hazir: !!(_hatlar && _duraklar),
    hatSayisi: _hatlar ? _hatlar.size : 0,
    durakSayisi: _duraklar ? _duraklar.size : 0,
    tokenSayisi: _durakToken ? _durakToken.size : 0,
    dosyalar: { hat: HAT_INDEX_FILE, durak: DURAK_INDEX_FILE, token: DURAK_TOKEN_FILE },
  };
}

module.exports = { hazirla, hatGetir, durakGetir, hatBul, durakAra, hatlariAra, durum, _norm };