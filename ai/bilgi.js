'use strict';

let _hatlar = null;
let _duraklar = null;
let _durakToken = null;

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

async function hazirla(iett) {
  if (_hatlar && _duraklar && _durakToken) {
    return { hat: _hatlar.size, durak: _duraklar.size };
  }

  if (!_hatlar) {
    const d = await iett.getJson(iett.BASE_HAT_DURAK, 'GetHat_json', { HatKodu: '' }, { quiet: true });
    const rows = Array.isArray(d) ? d : (d ? [d] : []);
    const hatRaw = rows.map(r => ({
      kod: String(r.SHATKODU || '').trim().toUpperCase(),
      ad: String(r.SHATADI || '').trim(),
      tarife: String(r.TARIFE || '').trim(),
      uzunluk: Number(r.HAT_UZUNLUGU || 0),
      sure: Number(r.SEFER_SURESI || 0),
    })).filter(h => h.kod);
    _hatlar = new Map(hatRaw.map(h => [h.kod, h]));
  }

  if (!_duraklar) {
    let d = await iett.getJson(iett.BASE_HAT_DURAK, 'GetDurak_json', {}, { quiet: true });
    let rows = Array.isArray(d) ? d : (d ? [d] : []);
    if (!rows.length) {
      d = await iett.getJson(iett.BASE_HAT_DURAK, 'GetDurak_json', { DurakKodu: '' }, { quiet: true });
      rows = Array.isArray(d) ? d : (d ? [d] : []);
    }
    const durakRaw = rows.map(r => ({
      kod: String(r.SDURAKKODU || r.sDurakKodu || '').trim(),
      ad: String(r.SDURAKADI || r.sDurakAdi || '').trim(),
      ilce: String(r.ILCEADI || '').trim(),
      yon: String(r.SYON || '').trim(),
    })).filter(x => x.kod && x.ad);
    _duraklar = new Map(durakRaw.map(x => [x.kod, x]));
  }

  if (!_durakToken) {
    const t = {};
    for (const d of _duraklar.values()) {
      const toks = new Set(_tokenize(d.ad));
      for (const tok of toks) {
        if (!t[tok]) t[tok] = [];
        t[tok].push(d.kod);
      }
    }
    _durakToken = new Map();
    for (const [tok, kodlar] of Object.entries(t)) {
      _durakToken.set(tok, new Set(kodlar));
    }
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
  };
}

module.exports = { hazirla, hatGetir, durakGetir, hatBul, durakAra, hatlariAra, durum, _norm };