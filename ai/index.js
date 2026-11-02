'use strict';

const beyin = require('./beyin.js');
const bilgi = require('./bilgi.js');

function _listeYaz(arr, limit = 10) {
  return arr.slice(0, limit).map(x => `• ${x}`).join('\n');
}

function _saatSirala(a, b) {
  const dk = s => {
    const m = String(s).match(/(\d{1,2}):(\d{2})/);
    return m ? (+m[1]) * 60 + (+m[2]) : 9999;
  };
  return dk(a) - dk(b);
}

function _bugunYmd() {
  const d = new Date();
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth()+1)}${p(d.getDate())}`;
}

async function _cevapHatSefer(hk, iett) {
  const parsed = await iett.seferSaatleriAl(hk);
  if (!parsed || !parsed.length) return `**${hk}** hattı için sefer saati bulunamadı.`;

  const hat = bilgi.hatGetir(hk);
  const parcalar = [];
  if (hat) parcalar.push(`**${hk}** — ${hat.ad}\n`);

  const simdi = new Date();
  const sdk = simdi.getHours() * 60 + simdi.getMinutes();
  const dow = simdi.getDay();
  const gunAd = dow === 0 ? 'sunday' : dow === 6 ? 'saturday' : 'workday';
  const gunTr = dow === 0 ? 'Pazar' : dow === 6 ? 'Cumartesi' : 'İş Günleri';

  for (const blok of parsed.slice(0, 3)) {
    const liste = blok[gunAd] || [];
    const sonraki = liste
      .map(s => String(s).replace(/^\*/, '').replace(/\s*\(-1\)\s*$/, ''))
      .filter(s => /\d{1,2}:\d{2}/.test(s))
      .filter(s => {
        const m = s.match(/(\d{1,2}):(\d{2})/);
        if (!m) return false;
        let dk = (+m[1]) * 60 + (+m[2]);
        if (dk < 5 * 60) dk += 24 * 60;
        let sdkT = sdk; if (sdkT < 5 * 60) sdkT += 24 * 60;
        return dk >= sdkT;
      })
      .sort(_saatSirala)
      .slice(0, 6);

    if (sonraki.length) {
      parcalar.push(`**${blok.direction}** (${gunTr}) — sıradaki kalkışlar:`);
      parcalar.push(sonraki.map(s => `  • ${s}`).join('\n'));
      parcalar.push('');
    }
  }

  if (parcalar.length === 1) {
    const blok = parsed[0];
    const ilk = (blok[gunAd] || []).slice(0, 6);
    parcalar.push('Bugünkü ilk seferler:');
    parcalar.push(ilk.map(s => `  • ${s}`).join('\n'));
  }
  return parcalar.join('\n');
}

async function _cevapHatBilgi(hk) {
  const h = bilgi.hatGetir(hk);
  if (!h) return `**${hk}** kodlu bir hat bulunamadı.`;
  return `**${h.kod}** — ${h.ad}\n\n` +
    `• Tarife: ${h.tarife || '—'}\n` +
    `• Uzunluk: ${h.uzunluk || '?'} km\n` +
    `• Ortalama sefer süresi: ${h.sure ? Math.round(h.sure) : '?'} dakika`;
}

async function _cevapHatDuraklari(hk, iett) {
  const hat = bilgi.hatGetir(hk);
  const bas = hat ? `**${hk}** — ${hat.ad}\n\n` : `**${hk}**\n\n`;
  const parcalar = [bas];

  for (const [yk, ya] of [['G_D0', 'GİDİŞ'], ['D_D0', 'DÖNÜŞ']]) {
    try {
      const d = await iett.istGet('GetRoutePinV2', { q: `${hk}_${yk}` }, hk);
      if (Array.isArray(d) && d.length) {
        const k = d[0];
        const yerler = (k.stationPlaces || [])
          .map(s => String(s.stationName || '').trim()).filter(Boolean);
        if (yerler.length) {
          parcalar.push(`**${ya} yönü** (${yerler.length} durak):`);
          parcalar.push(_listeYaz(yerler, 20));
          if (yerler.length > 20) parcalar.push(`  ... ve ${yerler.length - 20} durak daha`);
          parcalar.push('');
        }
      }
    } catch {}
  }
  return parcalar.join('\n');
}

async function _cevapHatFilo(hk, iett) {
  const hat = bilgi.hatGetir(hk);
  let d = await iett.getJson(iett.BASE_FILO, 'GetHatOtoKonum_json',
                              { HatKodu: hk }, { isFilo: true, quiet: true });
  if (!d) d = await iett.getJson(iett.BASE_FILO, 'GetHatOtoKonum_json',
                                 { HatNo: hk }, { isFilo: true, quiet: true });
  const rows = Array.isArray(d) ? d : [];
  const bas = hat ? `**${hk}** — ${hat.ad}\n\n` : `**${hk}**\n\n`;
  if (!rows.length) return bas + 'Şu an bu hatta aktif araç görünmüyor.';

  const liste = rows.slice(0, 15).map(r => {
    const kapi = String(r.KapiNo || r.KAPINO || '').trim();
    const yon = String(r.Yon || '').trim();
    const hiz = r.Hiz ?? r.HIZ ?? '';
    return `• ${kapi}${yon ? ' · ' + yon : ''}${hiz ? ' · ' + hiz + ' km/s' : ''}`;
  });
  return bas + `Aktif araç sayısı: **${rows.length}**\n\n` +
    'Araçlar:\n' + liste.join('\n') +
    (rows.length > 15 ? `\n  ... ve ${rows.length - 15} araç daha` : '');
}

async function _cevapDurakVarislar(dk, iett) {
  const durak = bilgi.durakGetir(dk);
  const v = await iett.stationArrivalsV2(dk, true);
  const aktif = v.filter(x => x.kalan_dk > 0);

  const bas = durak
    ? `**${durak.ad}** (${durak.kod})${durak.ilce ? ' · ' + durak.ilce : ''}\n\n`
    : `Durak **${dk}**\n\n`;

  if (!aktif.length) return bas + 'Şu an durağa yaklaşan araç yok.';

  const satirlar = aktif.slice(0, 12).map(x =>
    `• **${x.hat}** — ${x.kalan_dk} dk (saat ${x.saat})${x.kapi ? ' · kapı ' + x.kapi : ''}`
  );
  return bas + `Yaklaşan araç sayısı: **${aktif.length}**\n\n` + satirlar.join('\n');
}

async function _cevapAracKonum(kod, iett) {
  let arac = null;
  try {
    let d = await iett.getJson(iett.BASE_FILO, 'GetAracKonum_json', { KapiNo: kod }, { isFilo: true, quiet: true });
    if (!d) d = await iett.getJson(iett.BASE_FILO, 'GetAracKonum_json', { kapiNo: kod }, { isFilo: true, quiet: true });
    if (d && (Array.isArray(d) ? d.length : true)) arac = Array.isArray(d) ? d[0] : d;
  } catch (e) {}

  if (!arac) {
    try {
      let dTum = await iett.getJson(iett.BASE_FILO, 'GetFiloAracKonum_json', {}, { isFilo: true, quiet: true });
      const rows = Array.isArray(dTum) ? dTum : [];
      arac = rows.find(r => r && typeof r === 'object' && iett.kapiEsles(r, kod));
    } catch (e) {}
  }

  if (!arac) return `**${kod}** şu an aktif konumda bulunamadı.`;

  const lat = parseFloat(arac.Enlem || 0);
  const lng = parseFloat(arac.Boylam || 0);
  const plaka = String(arac.Plaka || '').trim();
  const operator = String(arac.Operator || '').trim();
  const hiz = parseFloat(arac.Hiz || 0);
  const saat = String(arac.Saat || '');
  const haritaLink = (lat && lng) ? `https://www.google.com/maps?q=${lat},${lng}` : null;

  return `🚌 **${kod}**\n\n` +
    `• Plaka: ${plaka || '—'}\n` +
    `• Operatör: ${operator || '—'}\n` +
    `• Anlık Hız: ${hiz} km/sa\n` +
    `• Son Güncelleme: ${saat || '—'}\n` +
    (haritaLink ? `\n📍 [Haritada Gör](${haritaLink})` : '');
}

async function _cevapAracGorev(kod, iett) {
  let arac = null;
  try {
    let d = await iett.getJson(iett.BASE_FILO, 'GetAracKonum_json', { KapiNo: kod }, { isFilo: true, quiet: true });
    if (!d) d = await iett.getJson(iett.BASE_FILO, 'GetAracKonum_json', { kapiNo: kod }, { isFilo: true, quiet: true });
    if (d && (Array.isArray(d) ? d.length : true)) arac = Array.isArray(d) ? d[0] : d;
  } catch (e) {}

  if (!arac) {
    try {
      let dTum = await iett.getJson(iett.BASE_FILO, 'GetFiloAracKonum_json', {}, { isFilo: true, quiet: true });
      const rows = Array.isArray(dTum) ? dTum : [];
      arac = rows.find(r => r && typeof r === 'object' && iett.kapiEsles(r, kod));
    } catch (e) {}
  }

  if (!arac) return `**${kod}** şu an aktif konumda bulunamadı. Görev listesi için siteyi kullan: arac.iett.gov.tr`;

  return `🚌 **${kod}** için detaylı görev listesi İETT'nin yeni API'sinde CAPTCHA korumalı. ` +
    `Uygulamanın **Araç** sekmesinden sorgulayıp CAPTCHA'yı çözerek görevleri görebilirsin. ` +
    `\n\n📍 Haritada: https://www.google.com/maps?q=${arac.Enlem},${arac.Boylam}`;
}



async function _cevapDurakBilgi(dk) {
  const d = bilgi.durakGetir(dk);
  if (!d) return `**${dk}** kodlu bir durak bulunamadı.`;
  return `**${d.ad}** (${d.kod})\n\n` +
    `• İlçe: ${d.ilce || '—'}\n` +
    `• Yön: ${d.yon || '—'}`;
}

async function _cevapDuyurular(iett) {
  const d = await iett.getJson(iett.BASE_DUYURU, 'GetDuyurular_json');
  const rows = Array.isArray(d) ? d : [];
  if (!rows.length) return 'Şu an aktif duyuru yok.';

  const ozet = rows.slice(0, 10).map(r =>
    `• **${r.HATKODU || '—'}** (${r.TIP || '—'})\n  ${String(r.MESAJ || '').slice(0, 180)}`
  );
  return `**Anlık duyurular** (${rows.length} adet, ilk 10):\n\n` + ozet.join('\n\n');
}

async function _cevapPopuler(tarih, iett) {
  if (!tarih) return 'Hangi tarih için? "bugün" veya "dün" diyebilirsin.';
  const d = await iett.getJson(iett.BASE_IBB360, 'GetIettYolculukHat_json', { Tarih: tarih });
  const rows = Array.isArray(d) ? d : [];
  if (!rows.length) return `${tarih} için yolcu verisi yok.`;

  const map = {}; let toplam = 0;
  for (const r of rows) {
    const h = String(r.Hat || r.HATKODU || r.SHATKODU || '').trim();
    const y = parseInt(r.Yolculuk || r.YOLCU || '0', 10) || 0;
    if (!h) continue;
    map[h] = (map[h] || 0) + y;
    toplam += y;
  }
  const sirali = Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 10);
  const satirlar = sirali.map(([h, y], i) =>
    `${i+1}. **${h}** — ${y.toLocaleString('tr-TR')} yolculuk`
  );
  return `**En yoğun 10 hat** (${tarih})\n\n` +
    `Toplam yolculuk: ${toplam.toLocaleString('tr-TR')}\n\n` +
    satirlar.join('\n');
}

function _cevapYardim() {
  return 'Sana şu konularda yardımcı olabilirim:\n\n' +
    '🚌 **Hat bilgisi** — "KM11 nereden nereye gidiyor?"\n' +
    '🕐 **Sefer saatleri** — "KM11 kaçta kalkıyor?"\n' +
    '📍 **Hat durakları** — "KM11 hangi duraklardan geçiyor?"\n' +
    '🚍 **Canlı araçlar** — "KM11\'de kaç araç var?"\n' +
    '🚏 **Durak yaklaşan** — "209081 durağına ne geliyor?"\n' +
    '🚕 **Araç konumu** — "C-358 nerede?" · "M-1234 şu an nerede?"\n' +
    '📢 **Duyurular** — "Anlık duyuru var mı?"\n' +
    '📊 **Popüler hatlar** — "Dün en yoğun hatlar hangileriydi?"\n\n' +
    'Kod yerine isim de yazabilirsin: "TUZLA EMLAK durağı" gibi.';
}

async function aiCevap(messages, iett) {
  const sonSoru = messages.filter(m => m.role === 'user').slice(-1)[0]?.content || '';
  const { niyet, hat, durak, arac, tarih } = beyin.analiz(sonSoru); 

  let bulunanDurak = durak ? bilgi.durakGetir(durak) : null;
  let bulunanHat = hat ? bilgi.hatGetir(hat) : null;

  if (!bulunanDurak) {
    const adaylar = bilgi.durakAra(sonSoru, 1);
    if (adaylar.length && (!niyet || niyet.startsWith('durak'))) bulunanDurak = adaylar[0];
  }
  if (!bulunanHat) {
    const adaylar = bilgi.hatlariAra(sonSoru, 1);
    if (adaylar.length && (!niyet || niyet.startsWith('hat'))) bulunanHat = adaylar[0];
  }

  const hk = bulunanHat?.kod || hat;
  const dk = bulunanDurak?.kod || durak;

  try {
    switch (niyet) {
      case 'arac_konum':
        if (!arac) return 'Hangi araç? Örnek: "C-358 nerede?"';
        return await _cevapAracKonum(arac, iett);
      case 'arac_gorev':
        if (!arac) return 'Hangi aracın görevlerini sormak istiyorsun? Örnek: "C-358 hangi seferleri yapacak?"';
        return await _cevapAracGorev(arac, iett);
      case 'hat_sefer': SadJohnshermish
        if (!hk) return 'Hangi hat? Örnek: "KM11 kaçta kalkıyor?"';
        return await _cevapHatSefer(hk, iett);
      case 'hat_bilgi':
        if (!hk) return 'Hangi hat hakkında bilgi istiyorsun?';
        return await _cevapHatBilgi(hk);
      case 'hat_duraklari':
        if (!hk) return 'Hangi hattın duraklarını görmek istersin?';
        return await _cevapHatDuraklari(hk, iett);
      case 'hat_filo':
        if (!hk) return 'Hangi hattın araçlarını sormak istiyorsun?';
        return await _cevapHatFilo(hk, iett);
      case 'durak_varis':
        if (!dk) return 'Hangi durak? Örnek: "209081 durağına ne geliyor?"';
        return await _cevapDurakVarislar(dk, iett);
      case 'durak_bilgi':
        if (!dk) return 'Hangi durak hakkında bilgi istiyorsun?';
        return await _cevapDurakBilgi(dk);
      case 'duyurular':
        return await _cevapDuyurular(iett);
      case 'populer':
        return await _cevapPopuler(tarih || _bugunYmd(), iett);
      case 'yardim':
        return _cevapYardim();
      default: {
        const oneriler = [];
        if (bulunanHat) oneriler.push(`"${bulunanHat.kod} hakkında bilgi"`);
        if (bulunanDurak) oneriler.push(`"${bulunanDurak.ad} durağına ne geliyor"`);
        return 'Sorunu tam anlayamadım. Şunları deneyebilirsin:\n' +
          (oneriler.length ? oneriler.map(o => '• ' + o).join('\n')
                           : '• "yardım" yaz, ne yapabildiğimi gör');
      }
    }
  } catch (e) {
    return 'Bir hata oldu: ' + e.message;
  }
}

async function aiDurum() {
  return {
    mod: 'yerel-kural',
    dis: false,
    bilgi: bilgi.durum(),
    niyetSayisi: beyin.NIYETLER.length,
  };
}

module.exports = { aiCevap, aiDurum };