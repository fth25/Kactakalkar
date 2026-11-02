'use strict';

const NIYETLER = [
  {
    ad: 'hat_sefer',
    ornek: ['kaçta kalkıyor', 'sefer saatleri', 'kalkış saatleri', 'ne zaman kalkar',
            'saat kaçta', 'seferler', 'programı', 'kaçta hareket'],
    gerekli: ['hat'],
  },
  {
    ad: 'hat_bilgi',
    ornek: ['nereden nereye', 'güzergah', 'hattı nereden geçiyor',
            'nerelere gidiyor', 'hattı nedir', 'hakkında bilgi', 'kaç km',
            'ne kadar sürer', 'nasıl bir hat'],
    gerekli: ['hat'],
  },
  {
    ad: 'hat_duraklari',
    ornek: ['durakları', 'hangi duraklar', 'hangi duraklardan geçiyor',
            'durak listesi', 'duraklarını göster'],
    gerekli: ['hat'],
  },
  {
    ad: 'hat_filo',
    ornek: ['kaç araç', 'kaç otobüs', 'araçlar', 'filo', 'şu an nerede',
            'aktif araç', 'yolda kaç', 'şu anda'],
    gerekli: ['hat'],
  },
  {
    ad: 'durak_varis',
    ornek: ['durağa ne geliyor', 'ne zaman gelir', 'yaklaşan', 'gelen araçlar',
            'kaç dakika', 'ne kadar kaldı', 'sıradaki araç'],
    gerekli: ['durak'],
  },
  {
    ad: 'durak_bilgi',
    ornek: ['durak nerede', 'durak bilgisi', 'hangi ilçede', 'durağı hakkında'],
    gerekli: ['durak'],
  },
  {
    ad: 'duyurular',
    ornek: ['duyuru', 'duyurular', 'anlık duyuru', 'ne var ne yok', 'iptal',
            'güzergah değişikliği', 'sorun var mı', 'aksilik'],
    gerekli: [],
  },
  {
    ad: 'populer',
    ornek: ['en yoğun', 'en çok', 'popüler', 'en kalabalık', 'top hat',
            'en çok kullanılan', 'en fazla yolcu'],
    gerekli: [],
  },
  {
    ad: 'arac_konum',
    ornek: ['araç nerede', 'otobüs nerede', 'canlı konum', 'nerede şu an',
            'araç konumu', 'araç nerede şu an', 'nerede', 'konum'],
    gerekli: ['arac'],
  },
  {
    ad: 'arac_gorev',
    ornek: ['hangi seferleri', 'ne yapacak', 'görevleri', 'seferleri neler',
            'bugün hangi sefer', 'hangi hatta', 'sefer listesi'],
    gerekli: ['arac'],
  },
  {
    ad: 'yardim',
    ornek: ['yardım', 'ne yapabilirsin', 'nasıl kullanılır', 'komutlar',
            'neler yapabilirsin', 'ne biliyorsun'],
    gerekli: [],
  },
];

function _norm(s) {
  return String(s || '').toLocaleLowerCase('tr-TR')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function _benzerlik(soru, ornek) {
  const sK = new Set(_norm(soru).split(' '));
  const oK = _norm(ornek).split(' ').filter(Boolean);
  if (!oK.length) return 0;
  let hit = 0;
  for (const k of oK) if (sK.has(k)) hit++;
  return hit / oK.length;
}

function _aracKoduBul(metin) {
  const m = String(metin).toUpperCase()
    .match(/\b([A-ZÇĞİÖŞÜ]{1,3}-?\d{1,4})\b/g);
  if (!m) return null;
  for (const aday of m) {
    if (/^[A-ZÇĞİÖŞÜ]-/.test(aday) || /^[A-ZÇĞİÖŞÜ]{1,3}\d{2,4}$/.test(aday)) return aday;
  }
  return null;
}


function _hatKoduBul(metin) {
  const m = String(metin).toUpperCase()
    .match(/\b([A-Z]{0,3}\d{1,4}[A-ZÇĞİÖŞÜ]{0,3}|\d{1,3}[A-ZÇĞİÖŞÜ]{1,3})\b/g);
  if (!m) return null;
  const aday = m.filter(x => /[A-Z]/.test(x) || x.length >= 2);
  return aday[0] || null;
}

function _durakKoduBul(metin) {
  const m = String(metin).match(/\b(\d{4,7})\b/);
  return m ? m[1] : null;
}

function _tarihBul(metin) {
  const s = String(metin).toLowerCase();
  const d = new Date();
  const p = n => String(n).padStart(2, '0');
  const ymd = (dt) => `${dt.getFullYear()}${p(dt.getMonth()+1)}${p(dt.getDate())}`;

  if (/\bbug[üu]n\b/.test(s)) return ymd(d);
  if (/\bd[üu]n\b/.test(s)) { d.setDate(d.getDate() - 1); return ymd(d); }
  if (/\bevvelsi\s*g[üu]n\b/.test(s)) { d.setDate(d.getDate() - 2); return ymd(d); }

  const m = s.match(/\b(\d{4})[-\/]?(\d{2})[-\/]?(\d{2})\b/);
  if (m) return `${m[1]}${m[2]}${m[3]}`;
  const m2 = s.match(/\b(\d{1,2})[.\/](\d{1,2})[.\/](\d{4})\b/);
  if (m2) return `${m2[3]}${p(m2[2])}${p(m2[1])}`;
  return null;
}

function analiz(soru) {
  const hat = _hatKoduBul(soru);
  const durak = _durakKoduBul(soru);
  const arac = _aracKoduBul(soru);
  const tarih = _tarihBul(soru);

  const skorlar = NIYETLER.map(n => {
    let s = 0;
    for (const o of n.ornek) s = Math.max(s, _benzerlik(soru, o));
    if (n.gerekli.includes('hat') && !hat) s *= 0.4;
    if (n.gerekli.includes('durak') && !durak) s *= 0.4;
    if (n.gerekli.includes('arac') && !arac) s *= 0.4;
    if (n.gerekli.includes('hat') && hat) s += 0.3;
    if (n.gerekli.includes('durak') && durak) s += 0.3;
    if (n.gerekli.includes('arac') && arac) s += 0.3;
    return { niyet: n.ad, skor: s };
  }).sort((a, b) => b.skor - a.skor);

  const enIyi = skorlar[0];
  let niyet = enIyi.skor >= 0.15 ? enIyi.niyet : null;

  if (!niyet) {
    if (arac) niyet = 'arac_konum';
    else if (hat) niyet = 'hat_bilgi';
    else if (durak) niyet = 'durak_varis';
    else niyet = 'bilinmiyor';
  }

  return { niyet, skorlar: skorlar.slice(0, 3), hat, durak, arac, tarih };
}

module.exports = { analiz, NIYETLER };