'use strict';

function temaDegistir() {
  const aktif = document.documentElement.getAttribute('data-theme') || 'dark';
  const yeni = aktif === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', yeni);
  try { localStorage.setItem('kactakalkar_tema', yeni); } catch (e) {}
}

const $ = s => document.querySelector(s);
const $$ = s => document.querySelectorAll(s);

function el(tag, attrs = {}, ...children) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') e.className = v;
    else if (k === 'html') e.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function')
      e.addEventListener(k.slice(2).toLowerCase(), v);
    else if (v === true) e.setAttribute(k, '');
    else if (v !== false && v != null) e.setAttribute(k, v);
  }
  children.flat().forEach(c => {
    if (c == null || c === false) return;
    e.append(c.nodeType ? c : document.createTextNode(String(c)));
  });
  return e;
}

async function api(path) {
  const r = await fetch(path);
  if (!r.ok) {
    let m = `HTTP ${r.status}`;
    try { const j = await r.json(); if (j && j.error) m = j.error; } catch {}
    throw new Error(m);
  }
  return r.json();
}

const loader = () => el('div', { class: 'info' }, el('span', { class: 'loader' }), 'Yükleniyor...');
const hata   = msg => el('div', { class: 'error' }, msg);
const info   = msg => el('div', { class: 'info' }, msg);

function _htmlEsc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function _pad(n) { return String(n).padStart(2, '0'); }

function _durakFavoriler() {
  try { return JSON.parse(localStorage.getItem('kactakalkar_durak_fav') || '[]'); }
  catch { return []; }
}

function _date2ymd(s) { return s ? s.replace(/-/g, '') : ''; }
function _bugunDate() {
  const d = new Date();
  return `${d.getFullYear()}-${_pad(d.getMonth()+1)}-${_pad(d.getDate())}`;
}
function _gunOnceDate(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return `${d.getFullYear()}-${_pad(d.getMonth()+1)}-${_pad(d.getDate())}`;
}

function yonTuret(guzergahkodu, iettYon) {
  const g = String(guzergahkodu || '').toUpperCase();
  if (g.includes('_G_') || g.includes('_G_D') || g.endsWith('_G_D0')) return 'Gidiş →';
  if (g.includes('_D_') || g.includes('_D_D') || g.endsWith('_D_D0')) return 'Dönüş ←';
  return iettYon || '—';
}

function saatGuncelle() {
  const n = new Date();
  const p = x => String(x).padStart(2, '0');
  const clockEl = $('#clock');
  if(clockEl) clockEl.textContent = `${p(n.getHours())}:${p(n.getMinutes())}:${p(n.getSeconds())}`;
}
setInterval(saatGuncelle, 1000);
saatGuncelle();

const BASLIKLAR = {
  yolculuk: 'Yolculuk',
  durak:   'Durak Sorgulama',
  rota:    'Rota Oluştur',
  hat:     'Hat Detayı',
  filo:    'Canlı Filo',
  arac:    'Araç Sorgulama',
  duyuru:  'Duyurular',
  arsiv:   'Sefer Arşivi',
  populer: 'Popüler Hatlar',
  ai:      'AI Asistan',
  yakin:   'Yakınımdaki Duraklar'
};

let duyuruLoaded = false;
let _aktifTab = 'home';
let _oncekiTab = null;

function anaSayfaGoster() {
  $('#home-screen').classList.remove('gizli');
  $('#icerik').classList.add('gizli');
  $('#geriBtn').classList.remove('aktif');
  $('#sayfaBaslik').classList.remove('aktif');
  $('#brandLogo').style.display = 'flex';
  
  const nav = $('#bottomNav');
  if(nav) nav.style.display = 'none'; 
  
  $$('#bottomNav .nav-item').forEach(n =>
    n.classList.toggle('active', n.dataset.tab === 'home'));
  _aktifTab = 'home';
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function bolumGoster(tab) {
  if (!tab || tab === 'home') return anaSayfaGoster();

  if (tab !== 'durak-detay') {
    if (window._durakRefreshTimer) {
      clearInterval(window._durakRefreshTimer);
      window._durakRefreshTimer = null;
    }
    if (window._durakRefreshAbort) {
      window._durakRefreshAbort.abort();
      window._durakRefreshAbort = null;
    }
  }
  
  if (tab !== 'arac') {
    if (window._aracRefreshTimer) {
      clearInterval(window._aracRefreshTimer);
      window._aracRefreshTimer = null;
    }
  }

  $('#home-screen').classList.add('gizli');
  $('#icerik').classList.remove('gizli');
  $('#geriBtn').classList.add('aktif');
  $('#sayfaBaslik').classList.add('aktif');
  $('#sayfaBaslik').textContent = BASLIKLAR[tab] || tab;
  $('#brandLogo').style.display = 'none';

  const nav = $('#bottomNav');
  if(nav) nav.style.display = 'flex'; 

  $$('#icerik > section').forEach(s => s.classList.add('gizli'));
  const sec = $('#tab-' + tab);
  if (sec) sec.classList.remove('gizli');

  $$('#bottomNav .nav-item').forEach(n =>
    n.classList.toggle('active', n.dataset.tab === tab));

  if (tab === 'duyuru' && !duyuruLoaded) { duyuruLoaded = true; duyuruYukle(); }
  if (tab === 'arsiv'   && !$('#arsivTarih').value)   $('#arsivTarih').value = _bugunDate();
  if (tab === 'populer' && !$('#populerTarih').value) $('#populerTarih').value = _gunOnceDate(1);
  
  if (tab === 'ai' && !AI_STATE.durumKontrol) {
    AI_STATE.durumKontrol = true;
    aiDurumKontrol();
  }

  if (tab === 'arac' && !$('#aracSonuc').dataset.rnInit) {
    $('#aracSonuc').dataset.rnInit = '1';
    _aracEkraniKur();
  }

  _aktifTab = tab;
  _oncekiTab = null;
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

$$('#bottomNav .nav-item').forEach(n => {
  n.addEventListener('click', () => bolumGoster(n.dataset.tab));
});

$$('#menuGrid .menu-card, #tab-yolculuk .menu-card').forEach(c => {
  c.addEventListener('click', () => bolumGoster(c.dataset.git));
});

$('#geriBtn').addEventListener('click', () => {
  if (_aktifTab === 'durak-detay') {
    const hedef = _oncekiTab || 'durak';
    _oncekiTab = null;
    if (hedef === 'home') return anaSayfaGoster();
    return bolumGoster(hedef);
  }
  anaSayfaGoster();
});

document.addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT') return;
  if (e.key === 'Escape') {
    if (_aktifTab === 'durak-detay') return $('#geriBtn').click();
    anaSayfaGoster();
  }
  const km = { '1':'durak', '2':'hat', '3':'filo', '4':'arac', '5':'duyuru', '6':'arsiv', '7':'populer', '8':'ai', '9':'rota' };
  if (km[e.key]) bolumGoster(km[e.key]);
});

$('#durakBtn').addEventListener('click', durakSorgula);
$('#durakKod').addEventListener('keydown', e => {
  if (e.key === 'Enter' && (!$('#durakDropdown') || $('#durakDropdown').style.display !== 'block')) {
    durakSorgula();
  }
});
$('#hatKod').addEventListener('keydown',   e => { if (e.key === 'Enter' && $('#hatDropdown').style.display !== 'block') hatSorgula(); });
$('#filoKod').addEventListener('keydown',  e => { if (e.key === 'Enter') filoGetir(); });

async function durakSorgula() {
  const girdi = $('#durakKod').value.trim();
  if (!girdi) return;

  let kod = girdi;

  if (!/^\d{4,}$/.test(girdi)) {
    $('#durakBtn').disabled = true;
    try {
      const r = await fetch(`/api/durak-ara/${encodeURIComponent(girdi)}`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = await r.json();
      const liste = j.sonuclar || [];
      if (!liste.length) {
        alert(`"${girdi}" için durak bulunamadı.\n\nFarklı bir kelime deneyin veya durak kodunu yazın.`);
        return;
      }
      const upGirdi = girdi.toLocaleUpperCase('tr-TR');
      const tam = liste.find(x => x.ad && x.ad.toLocaleUpperCase('tr-TR') === upGirdi);
      kod = (tam || liste[0]).kod;
      $('#durakKod').value = kod;
    } catch (e) {
      alert('Durak arama hatası: ' + e.message);
      return;
    } finally {
      $('#durakBtn').disabled = false;
    }
  }

  await _durakDetayGoster(kod, '');
}

async function _durakDetayGoster(kod, ad) {
  _oncekiTab = _aktifTab || 'hat';

  if (window._durakRefreshTimer) {
    clearInterval(window._durakRefreshTimer);
    window._durakRefreshTimer = null;
  }
  if (window._durakRefreshAbort) {
    window._durakRefreshAbort.abort();
    window._durakRefreshAbort = null;
  }

  $('#home-screen').classList.add('gizli');
  $('#icerik').classList.remove('gizli');
  $$('#icerik > section').forEach(s => s.classList.add('gizli'));
  $('#tab-durak-detay').classList.remove('gizli');
  $('#geriBtn').classList.add('aktif');
  $('#sayfaBaslik').classList.add('aktif');
  $('#sayfaBaslik').textContent = 'Durak';
  $('#brandLogo').style.display = 'none';

  $$('#bottomNav .nav-item').forEach(n => n.classList.toggle('active', n.dataset.tab === 'durak'));

  _aktifTab = 'durak-detay';

  const out = $('#durakDetayIcerik');
  out.innerHTML = '';
  out.append(loader());
  window.scrollTo({ top: 0, behavior: 'smooth' });

  try {
    const [infoR, hatR, duyR] = await Promise.allSettled([
      api(`/api/durak/${kod}`),
      api(`/api/durak/${kod}/hatlar`),
      api(`/api/durak/${kod}/duyurular`),
    ]);
    const info_     = infoR.status === 'fulfilled' ? infoR.value : null;
    const hatlar    = hatR.status  === 'fulfilled' ? hatR.value  : [];
    const duyurular = duyR.status  === 'fulfilled' ? duyR.value  : null;

    let varis = { varislar: [] };
    try {
      const r = await fetch(`/api/rednexie-arrivals`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stopId: Number(kod) })
      });
      if (r.ok) {
        const arr = await r.json();
        if (Array.isArray(arr)) varis.varislar = arr;
      }
    } catch (e) {}

    out.innerHTML = '';
    const i = Array.isArray(info_) ? info_[0] : info_;
    const durakAd = (i && i.SDURAKADI) || ad || 'Durak';
    const durakYon = (i && i.SYON) || '';
    const durakIlce = (i && i.ILCEADI) || '';

    const favoriMi = _durakFavoriler().some(f => String(f.kod) === String(kod));
    out.append(el('div', { class: 'durak-detay-hero' },
      el('h1', { class: 'durak-detay-baslik' }, durakAd),
      (durakYon || durakIlce) && el('div', { class: 'durak-detay-yon' },
        durakYon && `${durakYon} yönü`,
        durakIlce && el('span', { class: 'dim' }, ` · ${durakIlce}`)
      ),
      el('div', { class: 'durak-detay-butonlar' },
        el('button', { onclick: () => _durakDetayGoster(kod, durakAd), type: 'button' }, '🔄 Yenile'),
        el('button', {
          type: 'button',
          onclick: (e) => {
            const list = _durakFavoriler();
            const mevcut = list.some(f => String(f.kod) === String(kod));
            const yeni = list.filter(f => String(f.kod) !== String(kod));
            if (!mevcut) yeni.push({ kod, ad: durakAd, yon: durakYon || '' });
            try { localStorage.setItem('kactakalkar_durak_fav', JSON.stringify(yeni)); } catch {}
            e.currentTarget.textContent = mevcut ? '☆ Favori' : '★ Favori';
          },
        }, favoriMi ? '★ Favori' : '☆ Favori'),
        el('button', { type: 'button', onclick: () => _durakDuyurulariModalGoster(durakAd, duyurular) }, '📢 Duyuru'),
        el('button', { type: 'button', onclick: () => {
          const url = `https://iett.istanbul/StationDetail?dkod=${kod}`;
          if (navigator.clipboard) { navigator.clipboard.writeText(url); alert('Bağlantı kopyalandı'); }
          else alert(url);
        }}, '🔗 Paylaş')
      )
    ));

    const aktif = (varis.varislar || []).filter(x => x.dakika > 0);
    out.append(el('div', { class: 'otobus-bolum-baslik' },
      `Yaklaşan Otobüsler${aktif.length ? ' (' + aktif.length + ')' : ''}`));

    out.append(el('div', {
      class: 'dim2',
      style: 'font-size:11px;margin-bottom:12px;text-align:right',
      id: 'durakSonGuncelleme',
    }, `Son güncelleme: ${new Date().toLocaleTimeString('tr-TR')}`));

    if (aktif.length) {
      aktif.slice(0, 30).forEach(x => out.append(_otobusKart(x)));
    } else {
      out.append(el('div', { class: 'durak-bos-mesaj' },
        el('span', { class: 'ic-buyuk' }, '🚏'),
        'Şu an durağa yaklaşan otobüs yok.'));
    }

    if (Array.isArray(hatlar) && hatlar.length) {
      out.append(el('div', { class: 'otobus-bolum-baslik', style: 'margin-top:28px' },
        `Bu Durağa Gelen Hatlar (${hatlar.length})`));
      const t = el('table');
      t.append(el('thead', {}, el('tr', {},
        el('th', { style: 'width:80px' }, 'Hat'),
        el('th', {}, 'Ad / Yön'))));
      const tb = el('tbody');
      hatlar.forEach(h => {
        const tr = el('tr', { style: 'cursor:pointer' },
          el('td', {}, el('b', { style: 'color:var(--accent)' }, h.hat)),
          el('td', { class: 'dim' }, h.ad || h.yon || '')
        );
        tr.addEventListener('click', () => {
          _oncekiTab = 'durak-detay';
          bolumGoster('hat');
          $('#hatKod').value = h.hat;
          hatSorgula();
        });
        tb.append(tr);
      });
      t.append(tb);
      out.append(el('div', { class: 'card' }, t));
    }

  } catch (e) {
    out.innerHTML = '';
    out.append(hata(e.message));
  }

  const _aktifKod = kod;
  window._durakRefreshAbort = new AbortController();

  window._durakRefreshTimer = setInterval(async () => {
    if (_aktifTab !== 'durak-detay') {
      clearInterval(window._durakRefreshTimer);
      window._durakRefreshTimer = null;
      return;
    }
    try {
      const r = await fetch(`/api/rednexie-arrivals`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stopId: Number(_aktifKod) })
      });
      if (!r.ok) return;
      const data = await r.json();
      if (Array.isArray(data)) {
        _yaklasanOtobuslerGuncelle(out, data);
      }
    } catch (e) {}
  }, 60000);
}

function _durakDuyurulariModalGoster(durakAd, duyurularObj) {
  const duyListe = (duyurularObj && Array.isArray(duyurularObj.duyurular)) ? duyurularObj.duyurular : [];
  
  const arka = el('div', { class: 'modal-arka' });
  const kapatBtn = el('button', { class: 'modal-kapat', type: 'button' }, '×');
  
  const govde = el('div', { class: 'modal-body' });
  
  if (!duyListe.length) {
    govde.append(el('div', { class: 'durak-bos-mesaj' }, 
      el('span', { class: 'ic-buyuk' }, '📢'),
      'Bu durakla ilgili aktif duyuru bulunmuyor.'
    ));
  } else {
    const duyWrap = el('div', { class: 'durak-duyurular' });
    duyListe.forEach(d => {
      duyWrap.append(el('div', { class: 'duyuru-kart' },
        el('div', { class: 'duyuru-ust' },
          el('span', { class: 'duyuru-hat' }, d.HAT || '—'),
          d.TIP && el('span', { class: 'duyuru-tip' }, d.TIP),
          d.GUNCELLEME_SAATI && el('span', { class: 'duyuru-zaman' }, d.GUNCELLEME_SAATI)
        ),
        el('div', { class: 'duyuru-mesaj' }, d.MESAJ || '')
      ));
    });
    govde.append(duyWrap);
  }
  
  const kutu = el('div', { class: 'modal-kutu', style: 'max-width:680px;' },
    el('div', { class: 'modal-head' },
      el('div', { style: 'flex:1;min-width:0' },
        el('div', { class: 'modal-baslik' }, 'Durak Duyuruları'),
        el('div', { class: 'modal-alt' }, `${durakAd} (${duyListe.length} duyuru)`)
      ),
      kapatBtn
    ),
    govde
  );
  
  arka.append(kutu);
  document.body.append(arka);
  
  const kapat = () => {
    arka.remove();
    document.removeEventListener('keydown', escHandler);
  };
  kapatBtn.addEventListener('click', kapat);
  arka.addEventListener('click', (e) => { if (e.target === arka) kapat(); });
  
  const escHandler = (e) => { if (e.key === 'Escape') kapat(); };
  document.addEventListener('keydown', escHandler);
}

function _yaklasanOtobuslerGuncelle(kapsayici, yeniVarislar) {
  const aktif = (yeniVarislar || []).filter(x => x.dakika > 0);
  const basliklar = kapsayici.querySelectorAll('.otobus-bolum-baslik');
  let baslik = null;
  for (const b of basliklar) {
    if (b.textContent.includes('Yaklaşan Otobüsler')) { baslik = b; break; }
  }
  if (!baslik) return;

  baslik.textContent = `Yaklaşan Otobüsler${aktif.length ? ' (' + aktif.length + ')' : ''}`;

  let next = baslik.nextElementSibling;
  const silinecek = [];
  while (next && !next.classList.contains('otobus-bolum-baslik')) {
    if (next.id !== 'durakSonGuncelleme') silinecek.push(next);
    next = next.nextElementSibling;
  }
  silinecek.forEach(el => el.remove());

  const ts = kapsayici.querySelector('#durakSonGuncelleme');
  if (ts) ts.textContent = `Son güncelleme: ${new Date().toLocaleTimeString('tr-TR')}`;

  let referans = baslik;
  if (aktif.length) {
    aktif.slice(0, 30).forEach(x => {
      const kart = _otobusKart(x);
      referans.insertAdjacentElement('afterend', kart);
      referans = kart;
    });
  } else {
    const bos = el('div', { class: 'durak-bos-mesaj' }, el('span', { class: 'ic-buyuk' }, '🚏'), 'Şu an durağa yaklaşan otobüs yok.');
    referans.insertAdjacentElement('afterend', bos);
  }
}

function _otobusKart(x) {
  const dk = x.dakika || 0;
  const acil = dk <= 3;

  const ozellikler = [
    { key: 'wifi', ikon: '📶', ad: 'Wi-Fi' },
    { key: 'klima', ikon: '❄', ad: 'Klima' },
    { key: 'usb', ikon: '🔌', ad: 'USB' },
    { key: 'engelli', ikon: '♿', ad: 'Engelli' },
    { key: 'bisiklet', ikon: '🚲', ad: 'Bisiklet' },
  ];

  const ozWrap = el('div', { class: 'otobus-ozellikler' },
    ...ozellikler.map((o) => el('span', { class: 'oz ' + (x[o.key] ? 'aktif' : 'pasif'), title: o.ad }, o.ikon))
  );

  let lat = null, lon = null;
  if (x.son_konum && x.son_konum.includes(',')) {
    const p = x.son_konum.split(',');
    if (p.length === 2) {
      let p1 = parseFloat(p[0]), p2 = parseFloat(p[1]);
      if (p1 >= 36 && p1 <= 42 && p2 >= 26 && p2 <= 45) { lat = p1; lon = p2; }
      else if (p2 >= 36 && p2 <= 42 && p1 >= 26 && p1 <= 45) { lat = p2; lon = p1; }
    }
  }

  const haritaBtn = (lat && lon) ? el('button', {
    class: 'otobus-link',
    type: 'button',
    style: 'background: none; border: none; cursor: pointer; padding: 0; font-weight: 600; color: var(--accent); text-decoration: underline;',
    onclick: () => _aracKonumModalGoster(x, lat, lon) 
  }, '📍 Haritada Göster') : el('span', { class: 'dim2', style: 'font-size: 11px;' }, 'Konum bilgisi yok');

  return el('div', { class: 'otobus-kart' },
    el('div', { class: 'otobus-ust' },
      el('span', { class: 'otobus-hat' }, x.hatkodu || ''),
      el('span', { class: 'otobus-ok' }, '→'),
      el('span', {}, x.saat || ''),
      el('span', { class: 'otobus-kalan' + (acil ? ' acil' : '') }, `(${dk} dk)`),
      Number(x.son_hiz) > 0 ? el('span', { class: 'otobus-hiz' }, `${x.son_hiz} km/sa`) : null
    ),
    el('div', { class: 'otobus-alt' }, x.hatadi || ''),
    el('div', { class: 'otobus-meta' },
      x.kapino ? el('span', { class: 'otobus-kapi' }, `${x.kapino}${x.ototip ? ` (${x.ototip})` : ''}`) : null,
      el('span', { style: 'flex:1' }),
      ozWrap
    ),
    el('div', { class: 'otobus-actions', style: 'margin-top: 10px; padding-top: 10px; border-top: 1px solid var(--line); display: flex; justify-content: flex-end;' },
      haritaBtn
    )
  );
}

function _aracKonumModalGoster(x, lat, lon) {
  const arka = el('div', { class: 'modal-arka' });
  const kapatBtn = el('button', { class: 'modal-kapat', type: 'button' }, '×');

  const kutuStil = 'background: var(--card2); border: 1px solid var(--line); border-radius: 12px; padding: 16px; display: flex; flex-direction: column; gap: 4px;';
  const etiketStil = 'font-size: 10px; text-transform: uppercase; letter-spacing: 0.05em; color: var(--dim); font-weight: 600;';
  const degerStil = 'font-size: 15px; font-weight: 700; color: var(--fg);';

  const kutu = el('div', { class: 'modal-kutu', style: 'max-width: 600px; border-radius: 20px;' },
    el('div', { class: 'modal-head', style: 'border-bottom: none; padding-bottom: 10px;' },
      el('div', { class: 'modal-baslik', style: 'color: var(--accent2); font-size: 20px; letter-spacing: 0.05em;' }, 'ÇALIŞAN ARAÇ'),
      kapatBtn
    ),
    el('div', { class: 'modal-body', style: 'padding-top: 10px; display: grid; grid-template-columns: 1fr 1fr; gap: 12px;' },
      el('div', { style: kutuStil },
        el('div', { style: etiketStil }, 'HAT / ARAÇ'),
        el('div', { style: degerStil }, `${x.hatkodu} (${x.kapino || '—'})`)
      ),
      el('div', { style: kutuStil },
        el('div', { style: etiketStil }, 'TAHMİNİ VARIŞ'),
        el('div', { style: degerStil + ' color: var(--accent2);' }, `${x.saat} (${x.dakika} dk)`)
      ),
      el('div', { style: kutuStil },
        el('div', { style: etiketStil }, 'OPERATÖR'),
        el('div', { style: degerStil }, x.ototip || '—')
      ),
      el('div', { style: kutuStil },
        el('div', { style: etiketStil }, 'ANLIK HIZ'),
        el('div', { style: degerStil }, `${x.son_hiz || 0} km/sa`)
      ),
      el('div', { style: kutuStil + ' grid-column: 1 / -1;' },
        el('div', { style: etiketStil }, 'YÖN / GÜZERGAH'),
        el('div', { style: degerStil }, x.hatadi || '—')
      ),
      el('div', { style: kutuStil + ' grid-column: 1 / -1; padding: 12px;' },
        el('div', { style: 'display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;' },
          el('div', { style: etiketStil }, 'ARAÇ KONUMU (HARİTA)'),
          el('div', { style: 'display: flex; gap: 6px;' },
            el('a', { href: `https://www.google.com/maps?q=${lat},${lon}`, target: '_blank', style: 'background: var(--card); border: 1px solid var(--line); color: var(--dim); border-radius: 6px; width: 28px; height: 28px; display: grid; place-items: center; text-decoration: none;', title: 'Google Maps' }, '↗')
          )
        ),
        el('div', { style: 'font-family: ui-monospace, monospace; font-size: 12px; color: var(--dim); margin-bottom: 8px;' }, `${lat.toFixed(5)}, ${lon.toFixed(5)}`),
        el('div', { id: 'miniHarita', style: 'height: 220px; width: 100%; border-radius: 8px; overflow: hidden; border: 1px solid var(--line); z-index: 1;' })
      )
    )
  );

  arka.append(kutu);
  document.body.append(arka);

  const kapat = () => {
    arka.remove();
    document.removeEventListener('keydown', escHandler);
  };
  kapatBtn.addEventListener('click', kapat);
  arka.addEventListener('click', (e) => { if (e.target === arka) kapat(); });
  const escHandler = (e) => { if (e.key === 'Escape') kapat(); };
  document.addEventListener('keydown', escHandler);

  let miniMap = null;
  setTimeout(() => {
    if (typeof L !== 'undefined') {
      miniMap = L.map('miniHarita', { zoomControl: true, attributionControl: false }).setView([lat, lon], 16);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(miniMap);
      
      const icon = L.divIcon({
        className: '',
        html: `<div style="background: var(--accent2); color: #fff; padding: 5px 12px; border-radius: 12px; font-weight: 800; font-size: 12.5px; white-space: nowrap; border: 2px solid #fff; box-shadow: 0 3px 10px rgba(0,0,0,.5); font-family: system-ui; display: inline-block;">${x.kapino || 'Araç'} (${x.hatkodu})</div>`,
        iconSize: [140, 30],
        iconAnchor: [70, 15]
      });

      L.marker([lat, lon], { icon }).addTo(miniMap);
      
      setTimeout(() => { if(miniMap) miniMap.invalidateSize(); }, 200);
    }
  }, 100);
}

async function _hatAraclariHaritaGoster(hatKodu, vurguKapi) {
  if (typeof L === 'undefined') { alert('Harita kütüphanesi yüklenemedi.'); return; }
  const arka = el('div', { class: 'modal-arka' });
  const kapatBtn = el('button', { class: 'modal-kapat', type: 'button' }, '×');
  const haritaDiv = el('div', { style: 'height:540px;width:100%;border-radius:0 0 16px 16px;overflow:hidden;' });
  const altEl = el('div', { class: 'modal-alt' }, 'Yükleniyor...');
  const kutu = el('div', { class: 'modal-kutu', style: 'max-width:960px;' },
    el('div', { class: 'modal-head' },
      el('div', { style: 'flex:1;min-width:0' }, el('div', { class: 'modal-baslik' }, `${hatKodu} — Canlı Araçlar`), altEl),
      kapatBtn
    ),
    el('div', { class: 'modal-body', style: 'padding:0;overflow:hidden;' }, haritaDiv)
  );
  arka.append(kutu); document.body.append(arka);
  
  const kapat = () => { arka.remove(); document.removeEventListener('keydown', escHandler); };
  kapatBtn.addEventListener('click', kapat);
  arka.addEventListener('click', (e) => { if (e.target === arka) kapat(); });
  const escHandler = (e) => { if (e.key === 'Escape') kapat(); };
  document.addEventListener('keydown', escHandler);

  const map = L.map(haritaDiv, { zoomControl: true }).setView([41.0082, 28.9784], 11);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(map);

  try {
    const araclar = await api(`/api/filo/hat/${hatKodu}`);
    if (!Array.isArray(araclar) || !araclar.length) { altEl.textContent = 'Şu an bu hatta aktif araç yok.'; return; }
    const konumluAraclar = araclar.filter(a => {
      if (!a || typeof a !== 'object') return false;
      const lat = parseFloat(a.Enlem ?? a.ENLEM ?? a.enlem ?? a.Y ?? a.y ?? a.LAT ?? a.lat);
      const lng = parseFloat(a.Boylam ?? a.BOYLAM ?? a.boylam ?? a.X ?? a.x ?? a.LNG ?? a.lng);
      return isFinite(lat) && isFinite(lng) && !(lat === 0 && lng === 0);
    });
    altEl.textContent = `${konumluAraclar.length}/${araclar.length} araç konumda`;
    if (!konumluAraclar.length) { altEl.textContent = `${araclar.length} araç var ama konum bilgisi yok.`; return; }
    const latlngs = []; let vurguMarker = null;
    konumluAraclar.forEach(a => {
      const lat = parseFloat(a.Enlem ?? a.ENLEM ?? a.enlem ?? a.Y ?? a.y ?? a.LAT ?? a.lat);
      const lng = parseFloat(a.Boylam ?? a.BOYLAM ?? a.boylam ?? a.X ?? a.x ?? a.LNG ?? a.lng);
      let kapi = '';
      for (const f of ['KapiNo','KAPINO','kapino','Kapi_No','KAPI_NO']) { if (a[f] != null && String(a[f]).trim()) { kapi = String(a[f]).trim(); break; } }
      if (!kapi) { for (const [k, v] of Object.entries(a)) { if (k.toUpperCase().includes('KAPI') && String(v).trim()) { kapi = String(v).trim(); break; } } }
      const guzergah = String(a.guzergahkodu || a.GUZERGAHKODU || a.GuzergahKodu || '').trim();
      const iettYon = String(a.Yon ?? a.YON ?? a.yon ?? '').trim();
      const yon = yonTuret(guzergah, iettYon);
      const hiz = parseFloat(a.Hiz ?? a.HIZ ?? a.hiz ?? 0);
      const vurgulu = vurguKapi && kapi === vurguKapi;
      const ll = [lat, lng]; latlngs.push(ll);
      const renk = vurgulu ? '#7c5cff' : '#4ea1ff';
      const fontSize = vurgulu ? 12 : 11; const padding = vurgulu ? '5px 11px' : '4px 9px';
      const icon = L.divIcon({ 
        className: '', 
        html: `<div style="background:${renk};color:#fff;padding:${padding};border-radius:14px;font-weight:800;font-size:${fontSize}px;white-space:nowrap;border:2px solid #fff;box-shadow:0 3px 10px rgba(0,0,0,.5);font-family:system-ui;display:inline-block;">🚌 ${_htmlEsc(kapi || hatKodu)}</div>`, 
        iconSize: [100, 26], 
        iconAnchor: [50, 13] 
      });
      const marker = L.marker(ll, { icon, zIndexOffset: vurgulu ? 1000 : 0 }).addTo(map).bindPopup(`<div style="font-family:system-ui,sans-serif;min-width:160px;"><b style="color:${renk}">${_htmlEsc(hatKodu)}</b><br><span style="color:#666">Kapı:</span> ${_htmlEsc(kapi || '—')}<br><span style="color:#666">Yön:</span> <b>${_htmlEsc(yon)}</b><br><span style="color:#666">Hız:</span> ${isFinite(hiz) ? hiz : 0} km/s${guzergah ? `<br><span style="color:#999;font-size:11px;font-family:ui-monospace,monospace">${_htmlEsc(guzergah)}</span>` : ''}</div>`);
      if (vurgulu) vurguMarker = marker;
    });
    setTimeout(() => {
      map.invalidateSize();
      if (latlngs.length > 1) { try { map.fitBounds(L.latLngBounds(latlngs).pad(0.2), { maxZoom: 13 }); } catch {} }
      else if (latlngs.length === 1) { map.setView(latlngs[0], 15, { animate: true }); }
      if (vurguMarker) setTimeout(() => vurguMarker.openPopup(), 250);
    }, 200);
  } catch (e) { altEl.textContent = 'Hata: ' + e.message; }
}

function _parseSaat(raw) {
  const s = String(raw || '').trim();
  const star = s.startsWith('*');
  const clean = star ? s.slice(1) : s;
  const m = clean.match(/^(\d{1,2}:\d{2})\s*(.*)$/);
  return { display: m ? m[1] : clean, note: m ? (m[2] || '').trim() : '', star, raw: s };
}

function _makeSeferCard(b, operator) {
  const dir = b.direction || 'Sefer';
  const dayData = {
    workday:  Array.isArray(b.workday)  ? b.workday  : [],
    saturday: Array.isArray(b.saturday) ? b.saturday : [],
    sunday:   Array.isArray(b.sunday)   ? b.sunday   : [],
  };
  const total = dayData.workday.length + dayData.saturday.length + dayData.sunday.length;
  const eslesme = (operator && operator.eslesmeler) || {};

  const chipsContainer = el('div', { class: 'sefer-chips' });
  const tabsContainer  = el('div', { class: 'sefer-daytabs' });

  function renderDay(day) {
    chipsContainer.innerHTML = '';
    const list = dayData[day] || [];
    if (!list.length) {
      chipsContainer.append(el('div', { class: 'dim2', style: 'padding:8px 0;grid-column:1/-1' }, 'Bu gün için sefer yok.'));
      return;
    }
    list.forEach(t => {
      const p = _parseSaat(t);
      const op = eslesme[p.display] || null;
      const classes = ['chip-time'];
      if (p.star) classes.push('star');
      if (p.note) classes.push('note');
      if (op === 'garaj') classes.push('opr-garaj');
      else if (op === 'oho') classes.push('opr-oho');
      else if (op === 'karisik') classes.push('opr-karisik');

      const titleMap = { garaj: 'İETT garaj aracı', oho: 'Özel Halk Otobüsü (ÖHO)', karisik: 'Karışık işletme' };
      const title = [p.star ? 'Değişken saat' : null, p.note ? `Not: ${p.note}` : null, op ? titleMap[op] : null].filter(Boolean).join(' · ') || '';

      const chip = el('span', { class: classes.join(' '), title }, p.display);
      if (p.note) {
        const badgeText = p.note.replace(/[()]/g, '').trim() || '!';
        chip.append(el('span', { class: 'note-badge' }, badgeText));
      }
      chipsContainer.append(chip);
    });
  }

  const dayDefs = [{ key: 'workday', label: 'İş Günleri' }, { key: 'saturday', label: 'Cumartesi' }, { key: 'sunday', label: 'Pazar' }];
  let activeDay = dayDefs.find(d => (dayData[d.key] || []).length > 0)?.key || 'workday';

  dayDefs.forEach(d => {
    const count = (dayData[d.key] || []).length;
    const btn = el('button', {
      class: 'day-tab' + (d.key === activeDay ? ' active' : ''),
      'data-day': d.key,
      disabled: count === 0,
      onclick: () => {
        activeDay = d.key;
        tabsContainer.querySelectorAll('.day-tab').forEach(x => x.classList.toggle('active', x.dataset.day === d.key));
        renderDay(d.key);
      }
    }, d.label);
    btn.append(el('span', { class: 'cnt' }, String(count)));
    tabsContainer.append(btn);
  });

  renderDay(activeDay);

  const head = el('div', { class: 'sefer-head' },
    el('div', { class: 'sefer-dir' },
      el('span', { class: 'sefer-arrow' }, '▶'),
      el('span', { class: 'sefer-text' }, dir)
    ),
    el('span', { class: 'sefer-total' }, `${total} sefer`)
  );

  const hasOpr = Object.keys(eslesme).length > 0;
  const legendItems = [
    el('span', {}, el('span', { class: 'dot' }), 'normal'),
    el('span', {}, el('span', { class: 'dot star' }), 'değişken'),
    el('span', {}, el('span', { class: 'dot note' }), 'önceki gün'),
  ];
  if (hasOpr) {
    legendItems.push(el('span', {}, el('span', { class: 'dot garaj' }), 'garaj'));
    legendItems.push(el('span', {}, el('span', { class: 'dot oho' }), 'ÖHO'));
  }
  const legend = el('div', { class: 'sefer-legend' }, ...legendItems);

  return el('div', { class: 'sefer-card' }, head, tabsContainer, chipsContainer, legend);
}

$('#hatBtn').addEventListener('click', hatSorgula);

async function _durakKoduBulIsimle(ad) {
  try {
    const r = await fetch(`/api/durak-ara/${encodeURIComponent(ad)}`);
    if (!r.ok) return null;
    const j = await r.json();
    const liste = j.sonuclar || [];
    const upAd = ad.toLocaleUpperCase('tr-TR');
    const tam = liste.find(x => x.ad && x.ad.toLocaleUpperCase('tr-TR') === upAd);
    const bas = liste.find(x => x.ad && x.ad.toLocaleUpperCase('tr-TR').startsWith(upAd));
    return (tam || bas || liste[0])?.kod || null;
  } catch { return null; }
}

function _icDuraklar(duraklar) {
  const wrap = el('div');
  const yonObj = (duraklar && duraklar.yonler) || {};
  const ykList = Object.keys(yonObj);

  if (!ykList.length) {
    wrap.append(info('Bu hat için durak listesi bulunamadı.'));
    return wrap;
  }

  const defaultYk = ykList.includes('G_D0') ? 'G_D0' : ykList.includes('G') ? 'G' : ykList[0];

  const yonbar = el('div', { class: 'yonbar' }, el('span', { class: 'lab' }, 'Yön:'));
  const grid = el('div', { class: 'durak-grid' });

  function renderDuraklar(y) {
    grid.innerHTML = '';
    (y.duraklar || []).forEach((d, i) => {
      const kod = (d.kod || '').trim();
      const ad  = (d.ad  || '').trim();
      const meta = [];
      if (kod)    meta.push('Kod: ' + kod);
      if (d.ilce) meta.push(d.ilce);

      const item = el('div', { class: 'durak-item tiklanabilir' },
        el('div', { class: 'durak-no' }, String(i + 1)),
        el('div', { class: 'durak-info' },
          el('div', { class: 'durak-name' }, ad || '(bilinmiyor)'),
          meta.length ? el('div', { class: 'durak-meta' }, meta.join(' · ')) : null
        ),
        el('div', { class: 'durak-ok' }, '→')
      );
      if (kod) {
        item.addEventListener('click', () => _durakDetayGoster(kod, ad));
      }
      grid.appendChild(item);
    });
  }

  ykList.forEach(yk => {
    const btn = el('button', { class: 'chip' + (yk === defaultYk ? ' active' : ''), 'data-yk': yk, type: 'button' }, `${yonObj[yk].ad} (${yonObj[yk].duraklar.length})`);
    btn.addEventListener('click', () => {
      yonbar.querySelectorAll('.chip').forEach(b => b.classList.toggle('active', b.dataset.yk === yk));
      renderDuraklar(yonObj[yk]);
    });
    yonbar.append(btn);
  });

  renderDuraklar(yonObj[defaultYk]);
  wrap.append(yonbar, grid);
  return wrap;
}

function _icHarita(kod, duraklarData) {
  const wrap = el('div');
  const yonObj = (duraklarData && duraklarData.yonler) || {};
  const ykList = Object.keys(yonObj);

  if (!ykList.length) {
    wrap.append(info('Bu hat için harita verisi bulunamadı.'));
    return wrap;
  }

  const defaultYk = ykList.includes('G_D0') ? 'G_D0' : ykList.includes('G') ? 'G' : ykList[0];

  const yonbar = el('div', { class: 'yonbar' }, el('span', { class: 'lab' }, 'Yön:'));
  const haritaDiv = el('div', { id: `hatHarita_${kod}`, style: 'height: 500px; width: 100%; border-radius: 12px; border: 1px solid var(--line); margin-top: 10px; z-index: 1; background: var(--card2);' });
  
  let cizimKatmani = null;

  function renderHarita(y) {
    if (!haritaDiv._leaflet_map) {
      haritaDiv._leaflet_map = L.map(haritaDiv).setView([41.0, 29.0], 11);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(haritaDiv._leaflet_map);
      cizimKatmani = L.layerGroup().addTo(haritaDiv._leaflet_map);
    }
    
    cizimKatmani.clearLayers();
    const latlngs = [];
    
    (y.duraklar || []).forEach((d, i) => {
      if (d.lat && d.lng) {
        const ll = [parseFloat(d.lat), parseFloat(d.lng)];
        latlngs.push(ll);
        
        const marker = L.circleMarker(ll, { 
          radius: 6, color: '#fff', fillColor: '#4ea1ff', fillOpacity: 1, weight: 2 
        }).addTo(cizimKatmani);
        
        marker.bindPopup(`<b>${i + 1}. ${d.ad}</b><br><span style="color:#666">Kod: ${d.kod || '—'}</span>`);
      }
    });

    if (latlngs.length > 0) {
      L.polyline(latlngs, { color: '#4ea1ff', weight: 4, opacity: 0.8, lineJoin: 'round' }).addTo(cizimKatmani);
      haritaDiv._leaflet_map.fitBounds(L.latLngBounds(latlngs), { padding: [30, 30] });
    } else {
      const uyari = el('div', { class: 'dim2', style: 'margin-top:10px; color:var(--warn)' }, 'Dikkat: Bu hattın duraklarında koordinat bilgisi eksik olduğu için haritada çizilemiyor.');
      if (!wrap.querySelector('.dim2')) wrap.prepend(uyari);
    }
  }

  ykList.forEach(yk => {
    const btn = el('button', { class: 'chip' + (yk === defaultYk ? ' active' : ''), 'data-yk': yk, type: 'button' }, `${yonObj[yk].ad} (${yonObj[yk].duraklar.length})`);
    btn.addEventListener('click', () => {
      yonbar.querySelectorAll('.chip').forEach(b => b.classList.toggle('active', b.dataset.yk === yk));
      renderHarita(yonObj[yk]);
      setTimeout(() => { if(haritaDiv._leaflet_map) haritaDiv._leaflet_map.invalidateSize(); }, 100);
    });
    yonbar.append(btn);
  });

  wrap.append(yonbar, haritaDiv);
  
  setTimeout(() => {
    renderHarita(yonObj[defaultYk]);
    if (haritaDiv._leaflet_map) {
      haritaDiv._leaflet_map.invalidateSize();
    }
  }, 300);

  return wrap;
}

function _icSeferler(sefer, operator) {
  const wrap = el('div');
  const bloklar = (sefer && sefer.yonler) || [];
  if (!bloklar.length) {
    const dbg = (sefer && sefer.debug) || [];
    wrap.append(info('Bu hat için sefer saati bulunamadı.'));
    if (dbg.length) {
      wrap.append(el('div', { class: 'dim2', style: 'margin-top:8px' },
        el('div', { style: 'font-weight:700;color:var(--dim);margin-bottom:6px' }, 'Tanılama:'),
        ...dbg.map(d => el('div', { style: 'font-family:ui-monospace,monospace;font-size:12px' }, '• ' + d))
      ));
    }
    return wrap;
  }
  bloklar.forEach(b => wrap.append(_makeSeferCard(b, operator)));
  return wrap;
}

function _icAktifAraclar(kod) {
  const wrap = el('div');
  wrap.append(loader());
  (async () => {
    try {
      const d = await api(`/api/filo/hat/${kod}`);
      wrap.innerHTML = '';
      if (!Array.isArray(d) || !d.length) {
        wrap.append(info('Bu hatta şu an aktif araç yok.'));
        return;
      }
      const stats = el('div', { class: 'stats' },
        el('div', { class: 'stat' },
          el('b', {}, String(d.length)),
          el('span', {}, 'aktif araç')
        )
      );
      wrap.append(stats);
      
      const cols = [];
      const seen = new Set();
      d.forEach(x => Object.keys(x).forEach(k => { if (!seen.has(k)) { seen.add(k); cols.push(k); } }));
      
      const t = el('table');
      t.append(el('thead', {}, el('tr', {}, ...cols.map(c => el('th', {}, c)))));
      const tb = el('tbody');
      d.forEach(x => tb.append(el('tr', {}, ...cols.map(c => el('td', {}, String(x[c] ?? ''))))));
      t.append(tb);
      wrap.append(t);
    } catch (e) {
      wrap.innerHTML = '';
      wrap.append(hata(e.message));
    }
  })();
  return wrap;
}

function _icDeparlar(dep) {
  const wrap = el('div');
  if (!Array.isArray(dep) || !dep.length) {
    wrap.append(info('Bu hat için depar bilgisi bulunamadı.'));
    return wrap;
  }
  const t = el('table');
  t.append(el('thead', {}, el('tr', {},
    el('th', { style: 'width:50px' }, '#'),
    el('th', { style: 'width:90px' }, 'Yön'),
    el('th', { style: 'width:80px' }, 'İşaret'),
    el('th', { style: 'width:180px' }, 'Kod'),
    el('th', {}, 'Ad')
  )));
  const tb = el('tbody');
  dep.forEach((d, n) => {
    const cls = d.yon === 'Gidiş' ? 'g' : d.yon === 'Dönüş' ? 'd' : 'n';
    tb.append(el('tr', {},
      el('td', { class: 'dim' }, String(n + 1)),
      el('td', {}, el('span', { class: 'badge ' + cls }, d.yon)),
      el('td', {}, d.isaret || '—'),
      el('td', { style: 'font-family:ui-monospace,monospace;font-size:12px' }, d.kod || ''),
      el('td', { class: 'dim' }, d.ad || '')
    ));
  });
  t.append(tb);
  wrap.append(t);
  return wrap;
}

function _icDuyurular(kod) {
  const wrap = el('div');
  wrap.append(loader());
  (async () => {
    try {
      const d = await api(`/api/hat/${kod}/duyurular?nocache=1`);
      wrap.innerHTML = '';
      const liste = (d && Array.isArray(d.duyurular)) ? d.duyurular : [];

      if (!liste.length) {
        let genelSayi = 0;
        let ornekHatlar = [];
        try {
          const genel = await api('/api/duyurular');
          const rows = Array.isArray(genel) ? genel : [];
          genelSayi = rows.length;
          const gorulen = new Set();
          for (const r of rows) {
            const h = String(r.HATKODU || '').trim();
            if (!h || gorulen.has(h)) continue;
            gorulen.add(h);
            ornekHatlar.push(h);
            if (ornekHatlar.length >= 3) break;
          }
        } catch {}

        const bos = el('div', { class: 'durak-bos-mesaj' },
          el('span', { class: 'ic-buyuk' }, '📢'),
          el('div', { style: 'font-weight:700;color:var(--fg);margin-bottom:8px;font-size:15px' }, `${kod} için aktif duyuru yok`),
          el('div', { class: 'dim2', style: 'line-height:1.6;max-width:480px;margin:0 auto' }, genelSayi > 0 ? `Şu an İstanbul genelinde ${genelSayi} duyuru var ama bu hatla ilgili değil.` : 'Şu an sistemde hiç aktif duyuru yok.')
        );

        if (ornekHatlar.length) {
          bos.append(el('div', { style: 'margin-top:16px' },
            el('div', { class: 'dim2', style: 'margin-bottom:8px' }, 'Duyurusu olan hatlar:'),
            el('div', { style: 'display:flex;gap:6px;justify-content:center;flex-wrap:wrap' },
              ...ornekHatlar.map(h => el('button', {
                type: 'button', class: 'chip',
                onclick: () => {
                  const icerik = $('#hatSonuc')?.querySelector('.sub-icerik');
                  if (icerik) { icerik.innerHTML = ''; icerik.append(_icDuyurular(h)); }
                }
              }, h))
            )
          ));
        }
        wrap.append(bos);
        return;
      }

      const duyWrap = el('div', { class: 'durak-duyurular' });
      liste.forEach(x => {
        duyWrap.append(el('div', { class: 'duyuru-kart' },
          el('div', { class: 'duyuru-ust' },
            el('span', { class: 'duyuru-hat' }, x.HAT || kod),
            x.TIP && el('span', { class: 'duyuru-tip' }, x.TIP),
            x.GUNCELLEME_SAATI && el('span', { class: 'duyuru-zaman' }, x.GUNCELLEME_SAATI)
          ),
          el('div', { class: 'duyuru-mesaj' }, x.MESAJ || '')
        ));
      });

      wrap.append(el('div', { class: 'dim2', style: 'margin-bottom:12px;font-size:12px;font-variant-numeric:tabular-nums' }, `${liste.length} duyuru`));
      wrap.append(duyWrap);
    } catch (e) {
      wrap.innerHTML = '';
      wrap.append(hata(e.message));
    }
  })();
  return wrap;
}

function _icPlanlananSeferler(kod) {
  const wrap = el('div');
  wrap.append(loader());
  (async () => {
    try {
      const d = await api(`/api/hat/${kod}/planlanan-seferler`);
      wrap.innerHTML = '';
      const gruplar = (d && Array.isArray(d.gruplar)) ? d.gruplar : [];
      if (!gruplar.length) {
        wrap.append(info('Bu hat için planlanan sefer saati bulunamadı.'));
        return;
      }
      const yonAd = { 'G': 'Gidiş', 'D': 'Dönüş' };
      const gunAd = { 'I': 'İş Günleri', 'C': 'Cumartesi', 'P': 'Pazar' };
      const yonMap = {};
      gruplar.forEach(g => {
        const y = g.yon || '?';
        if (!yonMap[y]) yonMap[y] = [];
        yonMap[y].push(g);
      });
      for (const [yon, yonGruplar] of Object.entries(yonMap)) {
        const dayTabs = el('div', { class: 'sefer-daytabs' });
        const chipsWrap = el('div', { class: 'sefer-chips' });
        const card = el('div', { class: 'sefer-card' });

        const baslik = el('div', { class: 'sefer-head' },
          el('div', { class: 'sefer-dir' }, el('span', { class: 'sefer-arrow' }, yon === 'G' ? '▶' : '◀'), el('span', { class: 'sefer-text' }, yonAd[yon] || yon || 'Yön')),
          el('span', { class: 'sefer-total' }, `${yonGruplar.reduce((t, g) => t + g.saatler.length, 0)} sefer`)
        );

        function renderSaatler(g) {
          chipsWrap.innerHTML = '';
          g.saatler.forEach(s => { chipsWrap.append(el('span', { class: 'chip-time' }, s)); });
        }

        let aktifGun = null;
        yonGruplar.forEach((g, i) => {
          const gun = g.gun || '?';
          const btn = el('button', {
            class: 'day-tab' + (i === 0 ? ' active' : ''),
            'data-gun': gun,
            onclick: () => {
              dayTabs.querySelectorAll('.day-tab').forEach(x => x.classList.toggle('active', x.dataset.gun === gun));
              renderSaatler(g);
            }
          }, gunAd[gun] || gun);
          btn.append(el('span', { class: 'cnt' }, String(g.saatler.length)));
          dayTabs.append(btn);
          if (i === 0) aktifGun = g;
        });

        if (aktifGun) renderSaatler(aktifGun);
        card.append(baslik, dayTabs, chipsWrap);
        wrap.append(card);
      }
    } catch (e) {
      wrap.innerHTML = '';
      wrap.append(hata(e.message));
    }
  })();
  return wrap;
}

function _sekmeAdet(id, duraklar, sefer, dep) {
  if (id === 'duraklar') { const y = (duraklar && duraklar.yonler) || {}; return Object.values(y).reduce((t, x) => t + (x.duraklar?.length || 0), 0); }
  if (id === 'seferler') { const b = (sefer && sefer.yonler) || []; return b.reduce((t, x) => t + (x.workday?.length || 0) + (x.saturday?.length || 0) + (x.sunday?.length || 0), 0); }
  if (id === 'dep') return Array.isArray(dep) ? dep.length : 0;
  return 0;
}

function _makeSubTabCard(kod, duraklar, sefer, dep, operator) {
  const sekmeler = [
    { id: 'duraklar',   ad: 'Duraklar',           icerik: () => _icDuraklar(duraklar) },
    { id: 'harita',     ad: 'Güzergah Haritası',  icerik: () => _icHarita(kod, duraklar) },
    { id: 'seferler',   ad: 'Sefer Saatleri',     icerik: () => _icSeferler(sefer, operator) },
    { id: 'planlanan',  ad: 'Planlanan Seferler', icerik: () => _icPlanlananSeferler(kod) },
    { id: 'araclar',    ad: 'Aktif Araçlar',      icerik: () => _icAktifAraclar(kod) },
    { id: 'dep',        ad: 'Deparlar',           icerik: () => _icDeparlar(dep) },
    { id: 'duyurular',  ad: 'Duyurular',          icerik: () => _icDuyurular(kod) },
  ];
  const tabBar = el('div', { class: 'sub-tabs' });
  const icerikDiv = el('div', { class: 'sub-icerik' });
  
  sekmeler.forEach((s, i) => {
    const count = _sekmeAdet(s.id, duraklar, sefer, dep);
    const btn = el('button', {
      class: 'sub-tab' + (i === 0 ? ' active' : ''),
      'data-sekme': s.id,
      onclick: () => {
        tabBar.querySelectorAll('.sub-tab').forEach(x => x.classList.toggle('active', x.dataset.sekme === s.id));
        icerikDiv.innerHTML = '';
        icerikDiv.append(s.icerik());
        
        if (s.id === 'harita') {
          setTimeout(() => {
            const mapEl = document.getElementById(`hatHarita_${kod}`);
            if (mapEl && mapEl._leaflet_map) {
              mapEl._leaflet_map.invalidateSize();
            }
          }, 200);
        }
      }
    }, s.ad);
    
    if (count > 0) btn.append(el('span', { class: 'cnt' }, String(count)));
    tabBar.append(btn);
  });
  
  icerikDiv.append(sekmeler[0].icerik());
  return el('div', { class: 'card' }, tabBar, icerikDiv);
}

async function hatSorgula() {
  const kod = $('#hatKod').value.trim().toUpperCase();
  if (!kod) return;
  const out = $('#hatSonuc');
  out.innerHTML = '';
  out.append(loader());
  $('#hatBtn').disabled = true;

  try {
    const [infoR, durakR, seferR, depR] = await Promise.allSettled([
      api(`/api/hat/${kod}`),
      api(`/api/hat/${kod}/duraklar`),
      api(`/api/hat/${kod}/seferler`),
      api(`/api/hat/${kod}/deparlar`)
    ]);

    const info_    = infoR.status  === 'fulfilled' ? infoR.value  : null;
    const duraklar = durakR.status === 'fulfilled' ? durakR.value : null;
    const sefer    = seferR.status === 'fulfilled' ? seferR.value : null;
    const dep      = depR.status   === 'fulfilled' ? depR.value   : null;

    out.innerHTML = '';
    if (info_) {
      const i = Array.isArray(info_) ? info_[0] : info_;
      if (i && i.SHATKODU) {
        out.append(el('div', { class: 'card hero' },
          el('h2', {}, 'Hat'),
          el('div', { class: 'hero-line' },
            el('span', { class: 'hero-code' }, i.SHATKODU),
            el('span', { class: 'hero-ad' }, i.SHATADI || '')
          ),
          el('div', { class: 'hero-meta' },
            i.TARIFE       && el('span', { class: 'badge' }, i.TARIFE),
            i.HAT_UZUNLUGU && el('span', { class: 'badge' }, i.HAT_UZUNLUGU + ' km'),
            i.SEFER_SURESI && el('span', { class: 'badge' }, Math.round(i.SEFER_SURESI) + ' dk')
          )
        ));
      }
    }
    out.append(_makeSubTabCard(kod, duraklar, sefer, dep, { eslesmeler: {} }));
    _operatorAsyncYukle(kod, out);
  } catch (e) {
    out.innerHTML = '';
    out.append(hata(e.message));
  } finally {
    $('#hatBtn').disabled = false;
  }
}

async function _operatorAsyncYukle(kod, out) {
  try {
    const operator = await api(`/api/hat/${kod}/sefer-operator?gun=7&tol=3`);
    if (!operator || !operator.eslesmeler) return;
    const chipMap = operator.eslesmeler;
    let eklenen = 0;
    out.querySelectorAll('.chip-time').forEach(chip => {
      let saat = '';
      for (const node of chip.childNodes) {
        if (node.nodeType === 3) { saat = node.nodeValue.trim(); break; }
      }
      if (!saat) saat = chip.textContent.trim().slice(0, 5);
      const op = chipMap[saat];
      if (!op) return;
      
      chip.classList.remove('opr-garaj', 'opr-oho', 'opr-karisik');
      if (op === 'garaj') { chip.classList.add('opr-garaj'); eklenen++; }
      else if (op === 'oho') { chip.classList.add('opr-oho'); eklenen++; }
      else if (op === 'karisik') chip.classList.add('opr-karisik');

      const titleMap = { garaj: 'İETT garaj aracı', oho: 'Özel Halk Otobüsü (ÖHO)', karisik: 'Karışık işletme' };
      if (titleMap[op]) {
        const cur = chip.getAttribute('title') || '';
        chip.setAttribute('title', (cur ? cur + ' · ' : '') + titleMap[op]);
      }
    });
    if (eklenen > 0) {
      out.querySelectorAll('.sefer-legend').forEach(legend => {
        if (legend.querySelector('.dot.garaj')) return;
        legend.append(el('span', {}, el('span', { class: 'dot garaj' }), 'garaj'), el('span', {}, el('span', { class: 'dot oho' }), 'ÖHO'));
      });
    }
  } catch (e) {}
}

$('#filoBtn').addEventListener('click', filoGetir);

async function filoGetir() {
  const kod = $('#filoKod').value.trim().toUpperCase();
  if (!kod) return;
  const out = $('#filoSonuc');
  out.innerHTML = '';
  out.append(loader());
  $('#filoBtn').disabled = true;
  try {
    const d = await api(`/api/filo/hat/${kod}`);
    out.innerHTML = '';
    if (!Array.isArray(d) || !d.length) {
      out.append(el('div', { class: 'card' }, 'Bu hatta şu an araç yok.'));
      return;
    }
    const cols = []; const seen = new Set();
    d.forEach(x => Object.keys(x).forEach(k => { if (!seen.has(k)) { seen.add(k); cols.push(k); } }));
    
    const t = el('table');
    t.append(el('thead', {}, el('tr', {}, ...cols.map(c => el('th', {}, c)))));
    const tb = el('tbody');
    d.forEach(x => tb.append(el('tr', {}, ...cols.map(c => el('td', {}, String(x[c] ?? ''))))));
    t.append(tb);
    
    out.append(el('div', { class: 'card' },
      el('h2', {}, `Canlı Filo — ${kod} (${d.length} araç)`),
      el('div', { class: 'stats' },
        el('div', { class: 'stat' }, el('b', {}, String(d.length)), el('span', {}, 'araç'))
      ),
      t
    ));
  } catch (e) {
    out.innerHTML = '';
    out.append(hata(e.message));
  } finally {
    $('#filoBtn').disabled = false;
  }
}

async function duyuruYukle() {
  const out = $('#duyuruSonuc');
  out.innerHTML = '';
  out.append(loader());
  $('#duyuruBtn').disabled = true;
  try {
    const d = await api('/api/duyurular?nocache=1');
    out.innerHTML = '';
    if (!Array.isArray(d) || !d.length) {
      out.append(el('div', { class: 'card' }, 'Duyuru yok.'));
      return;
    }
    const t = el('table');
    t.append(el('thead', {}, el('tr', {},
      el('th', { style: 'width:90px' }, 'Hat'),
      el('th', { style: 'width:80px' }, 'Tip'),
      el('th', { style: 'width:180px' }, 'Saat'),
      el('th', {}, 'Mesaj')
    )));
    const tb = el('tbody');
    d.slice(0, 200).forEach(x => tb.append(el('tr', {},
      el('td', {}, el('b', { style: 'color:var(--accent)' }, x.HATKODU || '')),
      el('td', {}, x.TIP || ''),
      el('td', { class: 'dim' }, x.GUNCELLEME_SAATI || ''),
      el('td', {}, x.MESAJ || '')
    )));
    t.append(tb);
    
    out.append(el('div', { class: 'card' }, el('h2', {}, `Duyurular (${d.length})`), t));
    
    const now = new Date();
    const p = n => String(n).padStart(2, '0');
    $('#duyuruTs').textContent = `Son güncelleme: ${p(now.getHours())}:${p(now.getMinutes())}`;
  } catch (e) {
    out.innerHTML = '';
    out.append(hata(e.message));
  } finally {
    $('#duyuruBtn').disabled = false;
  }
}

$('#duyuruBtn').addEventListener('click', () => {
  duyuruLoaded = true;
  duyuruYukle();
});

$('#arsivBtn').addEventListener('click', arsivGetir);

async function arsivGetir() {
  const ymd = _date2ymd($('#arsivTarih').value);
  const h = $('#arsivHat').value.trim().toUpperCase();
  const out = $('#arsivSonuc');
  
  if (!/^\d{8}$/.test(ymd)) {
    out.innerHTML = '';
    out.append(hata('Lütfen tarih seçin'));
    return;
  }
  
  out.innerHTML = '';
  out.append(loader());
  $('#arsivBtn').disabled = true;
  
  try {
    const url = h ? `/api/arsiv/${ymd}?hat=${encodeURIComponent(h)}` : `/api/arsiv/${ymd}`;
    const d = await api(url);
    out.innerHTML = '';
    
    const etiket = { T: 'Tamamlandı', I: 'İptal', A: 'Aktif', B: 'Bekliyor' };
    const stats = el('div', { class: 'stats' });
    stats.append(el('div', { class: 'stat' }, el('b', {}, String(d.toplam || 0)), el('span', {}, 'toplam sefer')));
    
    for (const [k, v] of Object.entries(d.durumlar || {})) {
      stats.append(el('div', { class: 'stat' }, el('b', {}, String(v)), el('span', {}, etiket[k] || k)));
    }
    
    out.append(el('div', { class: 'card' },
      el('h2', {}, `Arşiv — ${d.tarih}${d.hat ? ' (' + d.hat + ')' : ''}`),
      stats
    ));
    
    const kayitlar = d.kayitlar || [];
    if (kayitlar.length) {
      const durumAd = { T: 'Tamamlandı', I: 'İptal', A: 'Aktif', B: 'Bekliyor' };
      const t3 = el('table');
      t3.append(el('thead', {}, el('tr', {},
        el('th', { style: 'width:80px' }, 'Hat'),
        el('th', {}, 'Güzergah'),
        el('th', { style: 'width:100px' }, 'Kapı'),
        el('th', { style: 'width:180px' }, 'Başlangıç'),
        el('th', { style: 'width:110px' }, 'Durum')
      )));
      const tb = el('tbody');
      kayitlar.slice(0, 100).forEach(r => tb.append(el('tr', {},
        el('td', {}, el('b', { style: 'color:var(--accent)' }, String(r.SHATKODU || ''))),
        el('td', { class: 'dim', style: 'font-family:ui-monospace,monospace;font-size:12px' }, String(r.SGUZERGAHKODU || '')),
        el('td', {}, String(r.SKAPINUMARA || '')),
        el('td', {}, String(r.DTBASLAMAZAMANI || '')),
        el('td', {}, durumAd[r.SGOREVDURUM] || r.SGOREVDURUM || '')
      )));
      t3.append(tb);
      out.append(el('div', { class: 'card' }, el('h2', {}, `Seferler (${kayitlar.length})`), t3));
    }
  } catch (e) {
    out.innerHTML = '';
    out.append(hata(e.message));
  } finally {
    $('#arsivBtn').disabled = false;
  }
}

$$('.hizli-arsiv').forEach(b => {
  b.addEventListener('click', () => {
    const n = parseInt(b.dataset.gun, 10);
    $('#arsivTarih').value = _gunOnceDate(n);
    $('#arsivHat').value = '';
    arsivGetir();
  });
});

$('#populerBtn').addEventListener('click', populerGetir);

async function populerGetir() {
  const ymd = _date2ymd($('#populerTarih').value);
  const lim = parseInt($('#populerLimit').value, 10) || 50;
  const out = $('#populerSonuc');
  
  if (!/^\d{8}$/.test(ymd)) {
    out.innerHTML = '';
    out.append(hata('Lütfen tarih seçin'));
    return;
  }
  
  out.innerHTML = '';
  out.append(loader());
  $('#populerBtn').disabled = true;
  
  try {
    const d = await api(`/api/populer/${ymd}?limit=${lim}`);
    out.innerHTML = '';
    out.append(el('div', { class: 'card' },
      el('h2', {}, `Popüler Hatlar — ${d.tarih}`),
      el('div', { class: 'stats' },
        el('div', { class: 'stat' },
          el('b', {}, (d.toplamYolculuk || 0).toLocaleString('tr-TR')),
          el('span', {}, 'toplam yolculuk')),
        el('div', { class: 'stat' },
          el('b', {}, String(d.hatSayisi || 0)),
          el('span', {}, 'hat'))
      )
    ));
    
    const hatlar = d.hatlar || [];
    if (hatlar.length) {
      const maxYol = hatlar[0].yolculuk || 1;
      const t2 = el('table');
      t2.append(el('thead', {}, el('tr', {},
        el('th', { style: 'width:50px' }, '#'),
        el('th', { style: 'width:100px' }, 'Hat'),
        el('th', { style: 'width:150px' }, 'Yolculuk'),
        el('th', {}, 'Yoğunluk'),
        el('th', { style: 'width:80px' }, 'Pay')
      )));
      const tb = el('tbody');
      hatlar.forEach(x => {
        const oran = (x.yolculuk / maxYol) * 100;
        tb.append(el('tr', {},
          el('td', { class: 'dim' }, String(x.sira)),
          el('td', {}, el('b', { style: 'color:var(--accent)' }, x.hat)),
          el('td', {}, Number(x.yolculuk).toLocaleString('tr-TR')),
          el('td', {}, el('span', { class: 'rank-bar', style: `width:${Math.max(2, oran)}%;min-width:24px;max-width:180px` })),
          el('td', {}, el('span', { class: 'badge n' }, x.pay + '%'))
        ));
      });
      t2.append(tb);
      out.append(el('div', { class: 'card' }, el('h2', {}, `Top ${hatlar.length} Hat`), t2));
    } else {
      out.append(el('div', { class: 'card' }, info('Bu tarih için yolcu verisi yok.')));
    }
  } catch (e) {
    out.innerHTML = '';
    out.append(hata(e.message));
  } finally {
    $('#populerBtn').disabled = false;
  }
}

$$('.hizli-populer').forEach(b => {
  b.addEventListener('click', () => {
    const n = parseInt(b.dataset.gun, 10);
    $('#populerTarih').value = _gunOnceDate(n);
    populerGetir();
  });
});

const AI_STATE = { messages: [], yukleniyor: false, durumKontrol: false };

function aiRender() {
  const chat = $('#aiChat');
  if (!chat) return;

  const ilkMsj = chat.querySelector('.ai-msg-asistan');
  const karsilama = ilkMsj && !chat.dataset.gecmisVar ? ilkMsj.querySelector('.ai-balon').innerHTML : null;

  if (!AI_STATE.messages.length && karsilama) {
    chat.dataset.gecmisVar = '1';
    chat.innerHTML = '';
    chat.append(el('div', { class: 'ai-msg ai-msg-asistan' }, el('div', { class: 'ai-balon', html: karsilama })));
    return;
  }

  chat.innerHTML = '';
  AI_STATE.messages.forEach(m => {
    const isKullanici = m.role === 'user';
    const cls = isKullanici ? 'ai-msg-kullanici' : (m.sistem ? 'ai-msg-sistem' : 'ai-msg-asistan');
    const balon = el('div', { class: 'ai-balon' }, document.createTextNode(String(m.content || '')));
    
    if (m.araclar && m.araclar.length) {
      balon.append(el('div', { style: 'margin-top:8px' }, ...m.araclar.map(a => el('span', { class: 'ai-arac' }, '🔧 ' + a.ad))));
    }
    chat.append(el('div', { class: 'ai-msg ' + cls }, balon));
  });

  if (AI_STATE.yukleniyor) {
    chat.append(el('div', { class: 'ai-msg ai-msg-asistan' }, el('div', { class: 'ai-balon' }, el('span', { class: 'loader' }), 'Düşünüyor...')));
  }
  chat.scrollTop = chat.scrollHeight;
}

async function aiDurumKontrol() {
  const durum = $('#aiDurum');
  const dot = $('#aiDot');
  if (!durum || !dot) return;
  try {
    const r = await fetch('/api/ai/durum');
    const j = await r.json();
    dot.classList.add('aktif');
    dot.classList.remove('kapali');
    durum.textContent = ''; 
  } catch {
    dot.classList.add('kapali');
    durum.textContent = ''; 
  }
}

async function aiGonder() {
  if (AI_STATE.yukleniyor) return;
  const input = $('#aiInput');
  const icerik = (input.value || '').trim();
  if (!icerik) return;

  AI_STATE.messages.push({ role: 'user', content: icerik });
  input.value = '';
  AI_STATE.yukleniyor = true;
  aiRender();

  try {
    const r = await fetch('/api/ai', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages: AI_STATE.messages }) });
    const j = await r.json();
    AI_STATE.yukleniyor = false;
    if (!r.ok) {
      AI_STATE.messages.push({ role: 'assistant', sistem: true, content: '⚠️ ' + (j.error || `HTTP ${r.status}`) });
    } else {
      AI_STATE.messages.push({ role: 'assistant', content: j.mesaj || '(boş cevap)', araclar: j.kullanilanAraclar || [] });
    }
  } catch (e) {
    AI_STATE.yukleniyor = false;
    AI_STATE.messages.push({ role: 'assistant', sistem: true, content: '⚠️ Bağlantı hatası: ' + e.message });
  }
  aiRender();
}

$('#aiGonderBtn')?.addEventListener('click', aiGonder);
$('#aiInput')?.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); aiGonder(); } });
$('#aiTemizleBtn')?.addEventListener('click', () => {
  AI_STATE.messages = [];
  AI_STATE.yukleniyor = false;
  const chat = $('#aiChat');
  chat.dataset.gecmisVar = '';
  chat.innerHTML = '';
  chat.append(el('div', { class: 'ai-msg ai-msg-asistan' }, el('div', { class: 'ai-balon' }, 'Sohbet temizlendi. Yeni soru sorabilirsin.')));
});

(function durakAramaKur() {
  const input = $('#durakKod');
  if (!input) return;
  const parent = input.parentElement;
  parent.style.position = 'relative';
  const dropdown = el('div', { id: 'durakDropdown' });
  dropdown.style.cssText = `position:absolute;background:var(--card);border:1px solid var(--line);border-radius:10px;box-shadow:0 10px 30px rgba(0,0,0,.3);max-height:320px;overflow-y:auto;z-index:100;display:none;`;
  parent.append(dropdown);
  
  let timer = null, aktifIndex = -1, sonuclar = [];
  function kapat() { dropdown.style.display = 'none'; aktifIndex = -1; sonuclar = []; }
  function vurgula() { dropdown.querySelectorAll('div[data-i]').forEach((d, i) => { d.style.background = i === aktifIndex ? 'rgba(78,161,255,.1)' : 'transparent'; }); }
  
  function goster(liste) {
    dropdown.innerHTML = '';
    sonuclar = liste; aktifIndex = -1;
    if (!liste.length) { kapat(); return; }
    liste.forEach((s, i) => {
      const item = el('div', {
        'data-i': String(i),
        style: 'padding:10px 14px;cursor:pointer;border-bottom:1px solid var(--line);font-size:13px;transition:background .1s;',
        onmouseenter: () => { aktifIndex = i; vurgula(); },
        onclick: () => { input.value = s.kod; kapat(); durakSorgula(); }
      },
        el('div', { style: 'font-weight:600;color:var(--fg)' }, s.ad || '(bilinmiyor)'),
        el('div', { style: 'font-size:11px;color:var(--dim);margin-top:2px;font-family:ui-monospace,monospace' }, `${s.kod}${s.ilce ? ' · ' + s.ilce : ''}${s.yon ? ' · ' + s.yon : ''}`)
      );
      dropdown.append(item);
    });
    dropdown.style.display = 'block';
    const rect = input.getBoundingClientRect();
    const parentRect = parent.getBoundingClientRect();
    dropdown.style.top = (rect.bottom - parentRect.top + 4) + 'px';
    dropdown.style.left = input.offsetLeft + 'px';
    dropdown.style.width = input.offsetWidth + 'px';
  }
  
  async function ara(q) {
    if (q.length < 1) { kapat(); return; }
    try {
      const r = await fetch(`/api/durak-ara/${encodeURIComponent(q)}`);
      if (!r.ok) { kapat(); return; }
      const j = await r.json();
      goster(j.sonuclar || []);
    } catch (e) { kapat(); }
  }
  
  input.addEventListener('input', () => {
    clearTimeout(timer);
    const v = input.value.trim();
    if (v.length < 1) { kapat(); return; }
    timer = setTimeout(() => ara(v), 250);
  });
  
  input.addEventListener('keydown', (e) => {
    if (dropdown.style.display !== 'block') return;
    if (e.key === 'ArrowDown') { e.preventDefault(); aktifIndex = Math.min(aktifIndex + 1, sonuclar.length - 1); vurgula(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); aktifIndex = Math.max(aktifIndex - 1, 0); vurgula(); }
    else if (e.key === 'Enter') { if (aktifIndex >= 0 && sonuclar[aktifIndex]) { e.preventDefault(); input.value = sonuclar[aktifIndex].kod; kapat(); durakSorgula(); } }
    else if (e.key === 'Escape') kapat();
  });
  
  document.addEventListener('click', (e) => {
    if (!parent.contains(e.target)) kapat();
  });
})();

$('#temaBtn').addEventListener('click', temaDegistir);
anaSayfaGoster();

(function hatAramaKur() {
  const input = $('#hatKod');
  if (!input) return;
  const parent = input.parentElement;
  parent.style.position = 'relative';
  
  const dropdown = el('div', { id: 'hatDropdown' });
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';

  // Dropdown genel kutu stili
  dropdown.style.cssText = `
    position: absolute;
    top: calc(100% + 6px);
    left: 0;
    right: 0;
    background: ${isDark ? '#141924' : '#ffffff'};
    border-radius: 12px;
    box-shadow: 0 10px 30px rgba(0,0,0,0.4);
    max-height: 320px;
    overflow-y: auto;
    z-index: 1000;
    display: none;
    padding: 6px;
    border: 1px solid ${isDark ? '#232a3a' : '#e2e8f0'};
  `;
  parent.append(dropdown);

  let timer = null, aktifIndex = -1, sonuclar = [];

  function kapat() { dropdown.style.display = 'none'; aktifIndex = -1; sonuclar = []; }
  
  function vurgula() {
    dropdown.querySelectorAll('.dd-item').forEach((d, i) => {
      d.style.background = (i === aktifIndex) ? (isDark ? 'rgba(78,161,255,0.1)' : 'rgba(78,161,255,0.05)') : 'transparent';
    });
  }

  function goster(liste) {
    dropdown.innerHTML = '';
    sonuclar = liste; aktifIndex = -1;
    if (!liste.length) { kapat(); return; }

    liste.forEach((s, i) => {
      const item = el('div', {
        class: 'dd-item',
        style: 'display: flex; align-items: center; gap: 12px; padding: 10px 12px; cursor: pointer; border-radius: 8px; transition: background 0.1s; border-bottom: 1px solid ' + (isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.03)'),
        onmouseenter: () => { aktifIndex = i; vurgula(); },
        onclick: () => { input.value = s.kod; kapat(); hatSorgula(); }
      },
       
        el('div', { style: 'width: 24px; height: 24px; display: flex; align-items: center; justify-content: center; color: var(--accent);' },
          el('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': 2.5, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' },
            el('rect', { x: 3, y: 5, width: 18, height: 12, rx: 2 }),
            el('path', { d: 'M3 11h18' }),
            el('circle', { cx: 7, cy: 19.5, r: 1.4 }),
            el('circle', { cx: 17, cy: 19.5, r: 1.4 })
          )
        ),
      
        el('div', { style: 'background: rgba(78, 161, 255, 0.15); color: var(--accent); border: 1px solid rgba(78, 161, 255, 0.3); font-weight: 800; font-size: 13px; padding: 6px 10px; border-radius: 8px; font-family: ui-monospace, monospace; min-width: 50px; text-align: center;' }, s.kod),
        el('div', { style: 'font-weight: 600; color: var(--fg); font-size: 13.5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1;' }, s.ad || '')
      );
      dropdown.append(item);
    });
    dropdown.style.display = 'block';
  }

  async function ara(q) {
    if (q.length < 1) { kapat(); return; }
    try {
      const r = await fetch(`/api/hat-ara/${encodeURIComponent(q)}`);
      if (!r.ok) { kapat(); return; }
      const j = await r.json();
      goster(j.sonuclar || []);
    } catch (e) { kapat(); }
  }

  input.addEventListener('input', () => {
    clearTimeout(timer);
    const v = input.value.trim();
    if (v.length < 1) { kapat(); return; }
    timer = setTimeout(() => ara(v), 250);
  });

  input.addEventListener('keydown', (e) => {
    if (dropdown.style.display !== 'block') {
      if (e.key === 'Enter') hatSorgula();
      return;
    }
    if (e.key === 'ArrowDown') { e.preventDefault(); aktifIndex = Math.min(aktifIndex + 1, sonuclar.length - 1); vurgula(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); aktifIndex = Math.max(aktifIndex - 1, 0); vurgula(); }
    else if (e.key === 'Enter') {
      if (aktifIndex >= 0 && sonuclar[aktifIndex]) {
        e.preventDefault(); input.value = sonuclar[aktifIndex].kod; kapat(); hatSorgula();
      } else { kapat(); hatSorgula(); }
    } else if (e.key === 'Escape') { kapat(); }
  });

  document.addEventListener('click', (e) => {
    if (!parent.contains(e.target)) kapat();
  });
})();

(function pwaKur() {
  const banner = $('#pwaBanner');
  const yukleBtn = $('#pwaYukleBtn');
  const kapatBtn = $('#pwaKapatBtn');
  if (!banner || !yukleBtn || !kapatBtn) return;

  let deferredPrompt = null;
  if (localStorage.getItem('kactakalkar_pwa_kapat') === '1') return;

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    banner.classList.remove('gizli');
  });

  yukleBtn.addEventListener('click', async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') banner.classList.add('gizli');
    deferredPrompt = null;
  });

  kapatBtn.addEventListener('click', () => {
    banner.classList.add('gizli');
    try { localStorage.setItem('kactakalkar_pwa_kapat', '1'); } catch {}
  });

  if (window.matchMedia('(display-mode: standalone)').matches) banner.classList.add('gizli');

  window.addEventListener('appinstalled', () => {
    banner.classList.add('gizli');
    try { localStorage.setItem('kactakalkar_pwa_kapat', '1'); } catch {}
  });
})();

function _aracEkraniKur() {
  const sonuc = $('#aracSonuc');
  const input = $('#aracKod');
  const btn = $('#aracBtn');
  if (!input || !btn || !sonuc) return;

  input.placeholder = "Kapı Kodu (Örn: C-358)";

  const LS_ARAC_FAV = 'kactakalkar_arac_fav';
  const getAracFavs = () => { try { return JSON.parse(localStorage.getItem(LS_ARAC_FAV) || '[]'); } catch { return []; } };
  const setAracFavs = (l) => { try { localStorage.setItem(LS_ARAC_FAV, JSON.stringify(l)); } catch {} };

  function renderFavoriler() {
    const favs = getAracFavs();
    const eski = document.getElementById('aracFavorilerWrap');
    if (eski) eski.remove();
    if (!favs.length) return;

    const wrap = el('div', { id: 'aracFavorilerWrap', style: 'margin-bottom:16px;' });
    wrap.append(el('div', { class: 'dim2', style: 'margin-bottom:6px;' }, 'Favori Araçlar'));
    const row = el('div', { style: 'display:flex;gap:6px;flex-wrap:wrap;' });
    
    favs.forEach((f) => {
      const val = f.kapiNo || '';
      const chip = el('button', { class: 'chip', type: 'button', onclick: () => { input.value = val; ara(true); } }, val);
      const sil = el('button', { class: 'chip', type: 'button', style: 'padding:4px 8px;margin-left:4px;color:var(--err)', title: 'Favoriden çıkar', onclick: (e) => { e.stopPropagation(); setAracFavs(getAracFavs().filter((x) => x.kapiNo !== f.kapiNo)); renderFavoriler(); } }, '×');
      row.append(el('span', { style: 'display:inline-flex;' }, chip, sil));
    });
    wrap.append(row);
    sonuc.parentElement.insertBefore(wrap, sonuc);
  }

    function _captchaModalAc(kapino, sifreliId) {
    const arka = el('div', { class: 'modal-arka' });
    const kapatBtn = el('button', { class: 'modal-kapat', type: 'button' }, '×');
    
    const resimAlani = el('div', { style: 'height: 100px; background: var(--card2); border: 1px dashed var(--line); border-radius: 8px; display: flex; flex-direction: column; align-items: center; justify-content: center; margin: 15px 0; position: relative; overflow: hidden;' });
    const imgEl = el('img', { style: 'max-height: 100%; max-width: 100%; display: none; border-radius: 8px;' });
    const yukleniyorEl = el('span', { class: 'loader' });
    
    const resmiYukle = () => {
      imgEl.style.display = 'none';
      yenileBtn.style.display = 'none';
      hataEl.style.display = 'none';
      yukleniyorEl.style.display = 'inline-block';
      hataKutu.style.display = 'none';
      input.value = '';
      
      fetch('/api/arac/captcha').then(r => r.json()).then(data => {
        yukleniyorEl.style.display = 'none';
        if (data && data.captchaImage) {
          imgEl.src = `data:image/jpeg;base64,${data.captchaImage}`;
          imgEl.style.display = 'block';
          yenileBtn.style.display = 'block';
        } else {
          hataEl.style.display = 'flex';
          hataEl.querySelector('span').textContent = data.error || 'Resim yüklenemedi.';
        }
      }).catch(() => { 
        yukleniyorEl.style.display = 'none';
        hataEl.style.display = 'flex';
        hataEl.querySelector('span').textContent = 'Bağlantı hatası.';
      });
    };

    const hataEl = el('div', { style: 'display: none; flex-direction: column; align-items: center; gap: 8px; font-size: 12px; color: var(--dim);' }, 
      el('span', {}, 'Resim yüklenemedi.'),
      el('button', { type: 'button', class: 'chip', style: 'padding: 4px 10px; font-size: 11px;', onclick: () => resmiYukle() }, '↻ Yeniden Dene')
    );
    
    const yenileBtn = el('button', { type: 'button', style: 'display: none; position: absolute; top: 8px; right: 8px; background: rgba(0,0,0,0.6); color: #fff; border: 1px solid var(--line); border-radius: 6px; width: 28px; height: 28px; cursor: pointer; z-index: 10;', title: 'Kodu Yenile' }, '↻');
    yenileBtn.addEventListener('click', resmiYukle);
    
    resimAlani.append(yukleniyorEl, imgEl, hataEl, yenileBtn);

    const input = el('input', { type: 'text', placeholder: 'Güvenlik kodunu girin', style: 'width:100%; text-align:center; font-size:18px; letter-spacing:2px; margin-bottom:10px;', maxlength: 10 });
    const hataKutu = el('div', { class: 'error', style: 'display:none; margin-bottom:10px; font-size:12px; text-align:center;' });
    const submitBtn = el('button', { type: 'button', style: 'width:100%;' }, 'Doğrula ve Sorgula');
    
    const kutu = el('div', { class: 'modal-kutu', style: 'max-width: 400px; padding-bottom: 20px;' },
      el('div', { class: 'modal-head', style: 'padding-bottom:10px;' },
        el('div', { class: 'modal-baslik' }, 'İETT Güvenlik Doğrulaması'),
        kapatBtn
      ),
      el('div', { class: 'modal-body', style: 'padding-top:10px;' },
        el('div', { class: 'dim2', style: 'font-size:12px; text-align:center; margin-bottom:5px;' }, `${kapino} için İETT güvenlik kodu istiyor.`),
        resimAlani,
        input,
        hataKutu,
        submitBtn
      )
    );
    
    arka.append(kutu);
    document.body.append(arka);
    
    const kapat = () => arka.remove();
    kapatBtn.addEventListener('click', kapat);
    resmiYukle(); 

    submitBtn.addEventListener('click', async () => {
      const code = input.value.trim();
      if (!code) return;
      
      submitBtn.disabled = true;
      submitBtn.innerHTML = '<span class="loader"></span> Sorgulanıyor...';
      hataKutu.style.display = 'none';
      
      try {
        const res = await fetch('/api/arac/coz', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ captchaCode: code, sifreliId })
        });
        
        const j = await res.json();
        
        if (res.ok && j.isSuccess) {
          kapat();
          _aracVerileriniRenderEt(j, true, kapino);
        } else {
          hataKutu.textContent = j.error || 'Kod yanlış.';
          hataKutu.style.display = 'block';
          submitBtn.disabled = false;
          submitBtn.textContent = 'Doğrula ve Sorgula';
          if (res.status !== 429) {
             resmiYukle();
          }
        }
      } catch (e) {
        hataKutu.textContent = 'Sunucu bağlantı hatası.';
        hataKutu.style.display = 'block';
        submitBtn.disabled = false;
        submitBtn.textContent = 'Doğrula ve Sorgula';
      }
    });
  }

  function _aracVerileriniRenderEt(res, ilkYukleme, raw) {
    const v = res.dataVehicle;
    const task = res.dataTask || [];
    
    sonuc.innerHTML = ''; 
    const isFav = getAracFavs().some((f) => f.kapiNo === v.vehicleDoorCode);

    
    sonuc.append(el('div', { class: 'card hero' },
      el('h2', {}, 'Araç Detayı'),
      el('div', { class: 'hero-line' },
        el('span', { class: 'hero-code', style: 'font-size:32px;' }, v.vehicleDoorCode),
        v.operatorType ? el('span', { class: 'badge', style: 'background:var(--accent);color:#fff;font-size:14px;padding:6px 12px;' }, v.operatorType) : null,
        v.numberPlate ? el('span', { class: 'badge', style: 'font-size:13px; padding:6px 12px; border:1px solid var(--line); background:var(--card2);' }, v.numberPlate) : null,
        el('button', { 
          class: 'chip' + (isFav ? ' active' : ''), 
          type: 'button', style: 'margin-left:auto;',
          onclick: (e) => {
            const list = getAracFavs();
            const yeni = list.filter((f) => f.kapiNo !== v.vehicleDoorCode);
            if (yeni.length === list.length) { yeni.push({ kapiNo: v.vehicleDoorCode }); }
            setAracFavs(yeni);
            e.currentTarget.className = 'chip' + (yeni.some((f) => f.kapiNo === v.vehicleDoorCode) ? ' active' : '');
            e.currentTarget.textContent = yeni.some((f) => f.kapiNo === v.vehicleDoorCode) ? '★ Favori' : '☆ Favori';
            renderFavoriler();
          } 
        }, isFav ? '★ Favori' : '☆ Favori')
      ),
      
      
      el('div', { class: 'arac-ozellikler', style: 'margin-top: 12px; padding-top: 12px; border-top: 1px dashed var(--line); display: flex; gap: 12px; flex-wrap: wrap; align-items: center;' },
        el('span', { class: 'oz' + (v.isAirConditioned ? ' aktif' : ''), title: 'Klima', style: 'font-size: 18px; opacity: ' + (v.isAirConditioned ? '1' : '0.2') + '; cursor:help;' }, '❄'),
        el('span', { class: 'oz' + (v.hasUsbCharger ? ' aktif' : ''), title: 'USB Şarj', style: 'font-size: 18px; opacity: ' + (v.hasUsbCharger ? '1' : '0.2') + '; cursor:help;' }, '🔌'),
        el('span', { class: 'oz' + (v.hasWifi ? ' aktif' : ''), title: 'Wi-Fi', style: 'font-size: 18px; opacity: ' + (v.hasWifi ? '1' : '0.2') + '; cursor:help;' }, '📶'),
        el('span', { class: 'oz' + (v.accessibility ? ' aktif' : ''), title: 'Engelli Erişimi', style: 'font-size: 18px; opacity: ' + (v.accessibility ? '1' : '0.2') + '; cursor:help;' }, '♿'),
        el('span', { class: 'oz' + (v.hasBicycleRack ? ' aktif' : ''), title: 'Bisiklet Taşıyıcı', style: 'font-size: 18px; opacity: ' + (v.hasBicycleRack ? '1' : '0.2') + '; cursor:help;' }, '🚲'),
        v.fullCapacity ? el('span', { class: 'dim2', style: 'margin-left:auto; font-size:12px; font-weight:600;' }, `👥 ${v.fullCapacity} Kişi`) : null
      )
    ));

    
    const kutuStil = 'background: var(--card2); border: 1px solid var(--line); border-radius: 12px; padding: 14px; display: flex; flex-direction: column; gap: 4px;';
    const etiketStil = 'font-size: 10px; text-transform: uppercase; letter-spacing: 0.05em; color: var(--dim); font-weight: 600;';
    const degerStil = 'font-size: 15px; font-weight: 700; color: var(--fg);';

    sonuc.append(el('div', { style: 'display:grid; grid-template-columns: 1fr 1fr; gap:12px; margin-bottom:18px;' },
      el('div', { style: kutuStil }, 
        el('div', { style: etiketStil }, 'Son Güncelleme'), 
        el('div', { style: degerStil, id: 'aracZaman' }, `${v.lastLocationTime || '—'} ${v.lastLocationDate ? '('+v.lastLocationDate+')' : ''}`)
      ),
      el('div', { style: kutuStil }, 
        el('div', { style: etiketStil }, 'Atanmış Görev'), 
        el('div', { style: degerStil + ' color: var(--accent);', id: 'aracGorevSayi' }, `${task.length} Sefer`)
      )
    ));

    const gorevKutu = el('div', { class: 'card' });
    gorevKutu.append(el('h2', {}, 'Aracın Görevleri (Seferler)'));
    
    if (!task.length) {
      gorevKutu.append(el('div', { class: 'durak-bos-mesaj', style: 'padding: 24px;' }, 
        el('span', { class: 'ic-buyuk' }, '🅿️'), 
        'Bu aracın bugün için atanmış bir görevi bulunmuyor.'
      ));
    } else {
      const grid = el('div', { style: 'display:flex; flex-direction:column; gap:8px;' });
      task.forEach(t => {
        grid.append(el('div', { style: 'display:flex; justify-content:space-between; align-items:center; background:var(--card2); padding:10px 14px; border-radius:8px; border:1px solid var(--line);' },
          el('div', { style: 'display:flex; flex-direction:column; gap:4px;' },
            el('span', { style: 'font-weight:800; color:var(--accent); font-family:monospace; font-size:14px;' }, t.lineCode),
            el('span', { style: 'font-size:12px; color:var(--dim);' }, t.firstStop)
          ),
          el('span', { style: 'font-weight:800; font-size:16px; font-family:monospace;' }, t.orer)
        ));
      });
      gorevKutu.append(grid);
    }
    sonuc.append(gorevKutu);

    if (v.latitude && v.longitude) {
      sonuc.append(el('div', { class: 'card', style: 'padding:0;overflow:hidden;' }, el('div', { id: 'aracHarita', style: 'width:100%; height:380px; z-index:1;' })));
      setTimeout(() => {
        if (typeof L !== 'undefined') {
          if (window._aracMap) { window._aracMap.remove(); window._aracMap = null; }
          window._aracMap = L.map('aracHarita', { zoomControl: true }).setView([v.latitude, v.longitude], 16);
          L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(window._aracMap);
          
          const icon = L.divIcon({
            className: '',
            html: `<div style="background: var(--accent); color: #fff; padding: 6px 14px; border-radius: 14px; font-weight: 800; font-size: 14px; white-space: nowrap; border: 2px solid #fff; box-shadow: 0 4px 12px rgba(0,0,0,.4);">🚌 ${v.vehicleDoorCode}</div>`,
            iconSize: [120, 30], iconAnchor: [60, 15]
          });
          
          window._aracMarker = L.marker([v.latitude, v.longitude], { icon }).addTo(window._aracMap);
          
          const gmLink = L.DomUtil.create('a', '');
          gmLink.href = `https://www.google.com/maps?q=${v.latitude},${v.longitude}`; 
          gmLink.target = '_blank'; gmLink.innerHTML = '↗ Google Maps';
          gmLink.style.cssText = 'position:absolute;top:10px;right:10px;z-index:1000;background:var(--card);color:var(--fg);padding:6px 12px;border-radius:8px;font-size:12px;font-weight:700;border:1px solid var(--line);box-shadow:0 4px 10px rgba(0,0,0,.2);text-decoration:none;';
          window._aracMap.getContainer().appendChild(gmLink);
          setTimeout(() => window._aracMap.invalidateSize(), 200);
        }
      }, 100);
    }
  }

  async function ara(ilkYukleme = true) {
    const raw = (input.value || '').trim().toLocaleUpperCase('tr-TR');
    if (!raw) return;
    
    if (ilkYukleme) {
      sonuc.innerHTML = '';
      sonuc.append(loader());
      if (window._aracRefreshTimer) clearInterval(window._aracRefreshTimer);
    }

    try {
      const searchRes = await fetch(`/api/arac/ara/${encodeURIComponent(raw)}`);
      const searchData = await searchRes.json();
      
      if (!searchData.sonuclar || !searchData.sonuclar.length) {
        if (ilkYukleme) { sonuc.innerHTML = ''; sonuc.append(info('Araç bulunamadı. Lütfen kapı kodunu kontrol edin.')); }
        return;
      }
      
      const arac = searchData.sonuclar[0];
      
      if (ilkYukleme) {
        _captchaModalAc(arac.kod, arac.sifreliId);
      }
    } catch (e) {
      if (ilkYukleme) { sonuc.innerHTML = ''; sonuc.append(hata(e.message)); }
    }
  }

  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); ara(true); } });
  btn.addEventListener('click', () => ara(true));
  renderFavoriler();
}

let _aktifRotaMap = null; 

$('#rotaBtn')?.addEventListener('click', async () => {
  let baslangic = $('#rotaBaslangic').value.trim();
  let bitis = $('#rotaBitis').value.trim();
  const sonucKutu = $('#rotaSonuc');

  if (!baslangic || !bitis) {
    sonucKutu.innerHTML = '<div class="error">Lütfen kalkış ve varış duraklarını girin.</div>';
    return;
  }

  if (_aktifRotaMap) { _aktifRotaMap.remove(); _aktifRotaMap = null; }

  sonucKutu.innerHTML = '<div class="info"><span class="loader"></span> Rota hesaplanıyor...</div>';
  $('#rotaBtn').disabled = true;

  try {
    async function koordinatAl(girdi) {
      let kod = girdi;
      if (isNaN(girdi)) {
        const r = await fetch(`/api/durak-ara/${encodeURIComponent(girdi)}`);
        const j = await r.json();
        if (j.sonuclar && j.sonuclar.length) kod = j.sonuclar[0].kod;
        else throw new Error(`"${girdi}" durağı bulunamadı.`);
      }
      const detayRes = await fetch(`/api/durak/${kod}`);
      const detayJson = await detayRes.json();
      const dObj = Array.isArray(detayJson) ? detayJson[0] : detayJson;
      if (!dObj) throw new Error(`"${kod}" durağı için detay bulunamadı.`);
      
      if (dObj.ENLEM && dObj.BOYLAM) return `${dObj.ENLEM},${dObj.BOYLAM}`;
      if (dObj.KOORDINAT) {
        const m = String(dObj.KOORDINAT).match(/POINT\s*\(\s*([-\d.]+)\s+([-\d.]+)\s*\)/i);
        if (m) return `${m[2]},${m[1]}`;
      }
      throw new Error(`"${kod}" durağının koordinat bilgisi eksik.`);
    }

    const fromCoord = await koordinatAl(baslangic);
    const toCoord = await koordinatAl(bitis);

    const simdi = new Date();
    const p = n => String(n).padStart(2, '0');
    const saatStr = `${p(simdi.getHours())}:${p(simdi.getMinutes())}`;
    const tarihStr = `${p(simdi.getDate())}-${p(simdi.getMonth() + 1)}-${simdi.getFullYear()}`;

    const apiUrl = `/api/resmi-rota?from=${fromCoord}&to=${toCoord}&time=${saatStr}&date=${tarihStr}&isArrival=false&optimizefor=time`;
    const res = await fetch(apiUrl);
    const data = await res.json();

    sonucKutu.innerHTML = '';

    if (data.error || data.code === 'NO_ROUTE_POSSIBLE' || (!data.routes && !data.paths)) {
      sonucKutu.innerHTML = `<div class="durak-bos-mesaj">Bu iki nokta arasında uygun bir rota bulunamadı.</div>`;
      return;
    }

    const rotalar = data.routes || data.paths || (Array.isArray(data) ? data : []);
    if (rotalar.length === 0) {
      sonucKutu.innerHTML = `<div class="durak-bos-mesaj">Rota bulundu ancak içeriği boş döndü.</div>`;
      return;
    }

    sonucKutu.innerHTML = `
      <div class="rota-wrapper" style="padding-bottom: 80px;">
        <div class="rota-sidebar" id="rotaSidebar"></div>
        <div class="rota-harita-kutu"><div id="rotaHarita"></div></div>
      </div>
    `;

    const sidebar = document.getElementById('rotaSidebar');

    _aktifRotaMap = L.map('rotaHarita', { zoomControl: true }).setView([41.0082, 28.9784], 11);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(_aktifRotaMap);
    
    setTimeout(() => { if (_aktifRotaMap) _aktifRotaMap.invalidateSize(); }, 300);

    let cizimKatmani = L.layerGroup().addTo(_aktifRotaMap);

    function getDurakAdi(obj) {
      if (!obj) return 'Durak';
      const olasiIsimler = ['name', 'stopName', 'stationName', 'durakAdi', 'durak_adi', 'desc', 'description', 'title'];
      for (let k of olasiIsimler) {
        if (obj[k] && typeof obj[k] === 'string' && obj[k].trim() !== '') return obj[k].trim();
      }
      return 'Durak';
    }

    function parseWKT(wkt) {
      const latlngs = [];
      const match = String(wkt).match(/LINESTRING\s*\(([^)]+)\)/i);
      if (match) {
        const pairs = match[1].split(',');
        pairs.forEach(pair => {
          const parts = pair.trim().split(/\s+/);
          if (parts.length >= 2) {
            const c1 = parseFloat(parts[0]);
            const c2 = parseFloat(parts[1]);
            if (c1 >= 40.5 && c1 <= 41.5 && c2 >= 27.5 && c2 <= 30.0) latlngs.push([c1, c2]);
            else if (c2 >= 40.5 && c2 <= 41.5 && c1 >= 27.5 && c1 <= 30.0) latlngs.push([c2, c1]);
          }
        });
      }
      return latlngs;
    }

    function hesaplaSure(rota) {
      let sureSn = rota.duration || rota.totalDuration || rota.travelTime || 0;
      if (sureSn === 0) {
        const bacaklar = rota.path || rota.legs || [];
        bacaklar.forEach(bacak => {
          const isWalk = String(bacak.type || '').toLowerCase().includes('walk') || String(bacak.lineCode || '').toLowerCase().includes('walk');
          const mesafe = bacak.distance || bacak.walkDistance || 0;
          if (isWalk) sureSn += (mesafe / 1.4);
          else if (bacak.duration) sureSn += (bacak.duration > 300) ? bacak.duration : bacak.duration * 60;
          else sureSn += (mesafe / 4.1) + 120;
        });
      }
      if (sureSn === 0) {
        const bacaklar = rota.path || rota.legs || [];
        const ilkBacak = bacaklar[0]; const sonBacak = bacaklar[bacaklar.length - 1];
        if (ilkBacak?.from?.time && sonBacak?.to?.time) {
          const t1 = new Date(ilkBacak.from.time).getTime();
          const t2 = new Date(sonBacak.to.time).getTime();
          if (t2 > t1) sureSn = (t2 - t1) / 1000;
        }
      }
      if (sureSn === 0) return '—';
      const dk = Math.round(sureSn / 60);
      if (dk < 60) return `${dk} dk`;
      return `${Math.floor(dk / 60)} sa ${dk % 60} dk`;
    }

    function rotaCiz(rota) {
      cizimKatmani.clearLayers();
      const tumKoordinatlar = [];
      const bacaklar = rota.path || rota.legs || [];

      bacaklar.forEach(p => {
        let hatKodu = String(p.lineCode || p.lineId || p.route || p.routeId || p.hatKodu || p.routeCode || '').trim();
        let hatAdi = String(p.lineName || p.name || p.hatAdi || p.description || '').trim();
        const tip = String(p.type || p.transportType || p.mode || hatAdi).toLowerCase();
        
        const isWalking = tip.includes('walk') || hatKodu.toLowerCase().includes('walk') || hatAdi.toLowerCase().includes('walk') || (!hatKodu && !hatAdi);
        if (isWalking) { hatKodu = ''; hatAdi = 'Yürüyüş'; }

        let renk = isWalking ? '#8891a6' : '#4ea1ff'; 
        let dashArray = isWalking ? '5, 8' : null;
        
        if (!isWalking) {
          if (tip.includes('metro') || hatKodu.startsWith('M') || hatAdi.toLowerCase().includes('metro')) renk = '#e11d48';
          else if (tip.includes('metrobus') || hatAdi.toLowerCase().includes('metrobüs')) renk = '#16a34a';
          else if (tip.includes('vapur') || tip.includes('ferry')) renk = '#0284c7';
        }

        let latlngs = [];
        let geo = p.geometry || p.shape || p.polyline || p.wkt;
        if (typeof geo === 'string' && geo.includes('LINESTRING')) latlngs = parseWKT(geo);

        if (latlngs.length === 0 && p.from && p.to) {
          let fLat = p.from.lat || p.from.Lat || p.from.latitude || p.from.ENLEM;
          let fLng = p.from.lng || p.from.Lng || p.from.longitude || p.from.BOYLAM;
          let tLat = p.to.lat || p.to.Lat || p.to.latitude || p.to.ENLEM;
          let tLng = p.to.lng || p.to.Lng || p.to.longitude || p.to.BOYLAM;
          if (fLat && fLng && tLat && tLng) {
             latlngs.push([parseFloat(fLat), parseFloat(fLng)]);
             latlngs.push([parseFloat(tLat), parseFloat(tLng)]);
          }
        }

        if (latlngs.length > 0) {
          tumKoordinatlar.push(...latlngs);
          
          const polyline = L.polyline(latlngs, { 
            color: renk, weight: 6, opacity: 0.85, dashArray: dashArray, lineCap: 'round', lineJoin: 'round'
          }).addTo(cizimKatmani);

          if (!isWalking && typeof L.polylineDecorator !== 'undefined') {
            try {
              L.polylineDecorator(polyline, {
                patterns: [{ offset: '10%', repeat: '15%', symbol: L.Symbol.arrowHead({ pixelSize: 12, polygon: false, pathOptions: { stroke: true, color: '#ffffff', weight: 2, opacity: 0.9 } }) }]
              }).addTo(cizimKatmani);
            } catch(e) {}
          }
          
          const startLL = latlngs[0];
          const startTitle = isWalking ? '🚶 Yürüyüşe başla' : `🚌 ${hatKodu} hattına bin`;
          const startMarker = L.circleMarker(startLL, { radius: 8, color: '#fff', fillColor: isWalking ? '#8891a6' : '#16a34a', fillOpacity: 1, weight: 3 }).addTo(cizimKatmani);
          startMarker.bindPopup(`<b>${startTitle}</b>`);

          if (latlngs.length > 1) {
            const endLL = latlngs[latlngs.length - 1];
            const endTitle = isWalking ? '🚶 Hedefe ulaştın' : `🚏 ${hatKodu} hattından in`;
            const endMarker = L.circleMarker(endLL, { radius: 8, color: '#fff', fillColor: isWalking ? '#8891a6' : '#e11d48', fillOpacity: 1, weight: 3 }).addTo(cizimKatmani);
            endMarker.bindPopup(`<b>${endTitle}</b>`);
          }
        }
      });

      if (tumKoordinatlar.length > 0) {
        _aktifRotaMap.fitBounds(L.latLngBounds(tumKoordinatlar), { padding: [40, 40] });
      } else {
        const ilkBacak = bacaklar[0];
        if (ilkBacak && ilkBacak.from && ilkBacak.from.lat && ilkBacak.from.lng) {
          _aktifRotaMap.setView([parseFloat(ilkBacak.from.lat), parseFloat(ilkBacak.from.lng)], 13);
        }
      }
    }

    rotalar.forEach((r, i) => {
      const sureStr = hesaplaSure(r);
      const bacaklar = r.path || r.legs || [];

      const kart = el('div', { class: 'rota-secenek-kart' + (i === 0 ? ' active' : ''), 'data-index': i },
        el('div', { class: 'rota-secenek-ust' },
          el('span', { style: 'font-weight:700; font-size:14px; color:var(--dim)' }, `Seçenek ${i+1}`),
          el('span', { class: 'rota-sure' }, `⏱️ ${sureStr}`)
        ),
        el('div', { style: 'display:flex; flex-direction:column; gap:8px;' },
          ...bacaklar.map(p => {
            let hatKodu = String(p.lineCode || p.lineId || p.route || p.routeId || p.hatKodu || p.routeCode || '').trim();
            let hatAdi = String(p.lineName || p.name || p.hatAdi || p.description || '').trim();
            const tip = String(p.type || p.transportType || p.mode || hatAdi).toLowerCase();
            
            const isWalking = tip.includes('walk') || hatKodu.toLowerCase().includes('walk') || hatAdi.toLowerCase().includes('walk') || (!hatKodu && !hatAdi);
            
            const binis = getDurakAdi(p.from);
            const inis = getDurakAdi(p.to);

            if (isWalking) {
              const walkDist = Math.round(p.distance || p.walkDistance || p.walkDist || 0);
              return el('div', { class: 'rota-bacak', style: 'align-items:flex-start;' }, 
                el('span', { style: 'font-size:16px; margin-top:2px;' }, '🚶'), 
                el('div', { style: 'display:flex; flex-direction:column; gap:2px;' },
                  el('span', { style: 'color:var(--dim)' }, `${walkDist > 0 ? walkDist + 'm ' : ''}yürüyüş`),
                  el('span', { style: 'font-size:11px; color:var(--dim2)' }, `Hedef: ${inis}`)
                )
              );
            } else {
              let ikon = '🚌'; let renk = '#4ea1ff';
              if (tip.includes('metro') || hatKodu.startsWith('M') || hatAdi.toLowerCase().includes('metro')) { ikon = '🚇'; renk = '#e11d48'; }
              else if (tip.includes('metrobus') || hatAdi.toLowerCase().includes('metrobüs')) { ikon = '🚍'; renk = '#16a34a'; }
              else if (tip.includes('vapur') || tip.includes('ferry') || hatAdi.toLowerCase().includes('vapur')) { ikon = '⛴️'; renk = '#0284c7'; }

              const kodHtml = hatKodu ? `<b style="color:${renk}; background:${renk}1a; padding:2px 6px; border-radius:4px; font-family:ui-monospace,monospace; font-size:12px; margin-right:6px; border:1px solid ${renk}4d;">${hatKodu}</b>` : '';

              return el('div', { class: 'rota-bacak', style: 'align-items:flex-start;' }, 
                el('span', { style: 'font-size:16px; margin-top:2px;' }, ikon), 
                el('div', { style: 'display:flex; flex-direction:column; gap:2px;' },
                  el('span', { html: `${kodHtml}<span style="color:var(--fg); font-weight:600;">${hatAdi}</span>` }),
                  el('span', { style: 'font-size:11px; color:var(--dim)' }, `Biniş: ${binis}`),
                  el('span', { style: 'font-size:11px; color:var(--dim)' }, `İniş: ${inis}`)
                )
              );
            }
          })
        )
      );

      kart.addEventListener('click', () => {
        sidebar.querySelectorAll('.rota-secenek-kart').forEach(c => c.classList.remove('active'));
        kart.classList.add('active');
        rotaCiz(r);
      });

      sidebar.appendChild(kart);
    });

    if (rotalar.length > 0) rotaCiz(rotalar[0]);

  } catch (e) {
    sonucKutu.innerHTML = `<div class="error">Hata: ${e.message}</div>`;
  } finally {
    $('#rotaBtn').disabled = false;
  }
});

const yazilacakMetinler = ["Gerçek zamanlı.", "Canlı veri.", "İstanbul ulaşımı.", "Hep yanınızda."];
let metinIndex = 0;
let harfIndex = 0;
let siliniyor = false;
const typeEl = document.getElementById('typewriterText');

function daktiloYaz() {
  if (!typeEl) return;
  const mevcutMetin = yazilacakMetinler[metinIndex];
  if (siliniyor) {
    typeEl.textContent = mevcutMetin.substring(0, harfIndex - 1);
    harfIndex--;
    if (harfIndex === 0) {
      siliniyor = false;
      metinIndex = (metinIndex + 1) % yazilacakMetinler.length;
      setTimeout(daktiloYaz, 500);
    } else { setTimeout(daktiloYaz, 40); }
  } else {
    typeEl.textContent = mevcutMetin.substring(0, harfIndex + 1);
    harfIndex++;
    if (harfIndex === mevcutMetin.length) {
      siliniyor = true;
      setTimeout(daktiloYaz, 2500);
    } else { setTimeout(daktiloYaz, 100); }
  }
}
if (typeEl) setTimeout(daktiloYaz, 500);

$('#yakinBtn')?.addEventListener('click', () => {
  const btn = $('#yakinBtn');
  const out = $('#yakinSonuc');

  if (!navigator.geolocation) {
    alert("Tarayıcınız konum özelliğini desteklemiyor.");
    return;
  }

  btn.disabled = true;
  btn.textContent = "Konum aranıyor...";
  out.innerHTML = '<div class="info"><span class="loader"></span> Lütfen bekleyin, çevrenizdeki duraklar taranıyor...</div>';

  navigator.geolocation.getCurrentPosition(async (position) => {
    const lat = position.coords.latitude;
    const lng = position.coords.longitude;

    try {
      const res = await fetch(`/api/durak/yakin?lat=${lat}&lng=${lng}`);
      const data = await res.json();

      btn.disabled = false;
      btn.textContent = "🔄 Konumu Yenile";
      out.innerHTML = '';

      if (!data.duraklar || data.duraklar.length === 0) {
        out.append(el('div', { class: 'durak-bos-mesaj' },
          el('span', { class: 'ic-buyuk' }, '📍'),
          'Çevrenizde 600 metre içinde durak bulunamadı.'));
        return;
      }

      out.append(el('div', { class: 'otobus-bolum-baslik' }, `Çevrenizdeki Duraklar (${data.duraklar.length})`));

      const grid = el('div', { class: 'durak-grid' });
      data.duraklar.forEach(d => {
        const item = el('div', { class: 'durak-item tiklanabilir' },
          el('div', { class: 'durak-no', style: 'background: var(--accent2);' }, `${d.mesafe_m}m`),
          el('div', { class: 'durak-info' },
            el('div', { class: 'durak-name' }, d.ad || '(bilinmiyor)'),
            el('div', { class: 'durak-meta' }, `Kod: ${d.kod}${d.ilce ? ' · ' + d.ilce : ''}`)
          ),
          el('div', { class: 'durak-ok' }, '→')
        );
        
        item.addEventListener('click', () => {
          $('#durakKod').value = d.kod;
          _durakDetayGoster(d.kod, d.ad); 
        });
        grid.appendChild(item);
      });
      
      out.append(grid);
    } catch (err) {
      btn.disabled = false;
      btn.textContent = "📍 Konumumu Kullan ve Durakları Bul";
      out.innerHTML = `<div class="error">Sunucuya bağlanılamadı. Lütfen tekrar deneyin.</div>`;
    }
  }, (error) => {
    btn.disabled = false;
    btn.textContent = "📍 Konumumu Kullan ve Durakları Bul";
    out.innerHTML = `<div class="error">Konum izni verilmedi veya konum alınamadı.</div>`;
  }, {
    enableHighAccuracy: true,
    timeout: 10000,
    maximumAge: 0
  });
});

async function iettPopupKontrol() {
  try {
    const res = await fetch('/api/popup');
    if (!res.ok) return;
    
    const data = await res.json();

    if (data && data.IsActive === true && data.ImageUrl) {
      
      let imgUrl = String(data.ImageUrl).replace(/\\/g, '/'); 
      
      if (imgUrl.startsWith('/')) {
        imgUrl = 'https://iett.istanbul' + imgUrl;
      } else if (!imgUrl.startsWith('http')) {
        imgUrl = 'https://iett.istanbul/' + imgUrl;
      }

      let linkUrl = data.ReturnUrl || 'https://iett.istanbul/';
      linkUrl = String(linkUrl).replace(/\\/g, '/');
      const hedefUrl = linkUrl.startsWith('/') ? 'https://iett.istanbul' + linkUrl : linkUrl;

      const arka = el('div', { class: 'modal-arka', style: 'z-index: 9999; display: flex; align-items: center; justify-content: center; padding: 10px;' });

      const kutu = el('div', { class: 'modal-kutu', style: 'width: 100%; max-width: 1100px; padding: 0; background: transparent; border: none; box-shadow: none; position: relative;' },
        
        el('button', { 
          class: 'modal-kapat', 
          type: 'button',
          style: 'position: absolute; top: 10px; right: 10px; z-index: 10; background: rgba(225, 29, 72, 0.9); border-radius: 50%; width: 36px; height: 36px; display: grid; place-items: center; color: #fff; font-size: 22px; font-weight: bold; border: 2px solid #fff; cursor: pointer; box-shadow: 0 4px 10px rgba(0,0,0,0.5);',
        }, '×'),
        
        el('a', { href: hedefUrl, target: '_blank', style: 'display: block; cursor: pointer;' },
          el('img', { 
            src: imgUrl, 
            style: 'width: 100%; max-height: 88vh; display: block; border-radius: 12px; object-fit: contain; box-shadow: 0 15px 50px rgba(0,0,0,0.8);',
            alt: data.Title || 'İETT Duyuru'
          })
        )
      );

      arka.append(kutu);
      document.body.append(arka);

      const kapat = () => {
        arka.remove();
        document.removeEventListener('keydown', escHandler);
      };
      
      kutu.querySelector('.modal-kapat').addEventListener('click', kapat);
      arka.addEventListener('click', (e) => { if (e.target === arka) kapat(); });
      
      const escHandler = (e) => { if (e.key === 'Escape') kapat(); };
      document.addEventListener('keydown', escHandler);
    }
  } catch (e) {
    console.warn('Popup kontrol edilemedi:', e.message);
  }
}
document.getElementById('brandLogo')?.addEventListener('click', () => {
  anaSayfaGoster();
});
setTimeout(iettPopupKontrol, 1500);