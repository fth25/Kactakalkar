# 🚌 kactakalkar — İstanbul Canlı Ulaşım

İstanbul toplu taşıması için geliştirilmiş, İETT/İBB açık verilerine dayanan **bağımsız**, **açık kaynak** ve **yapay zeka destekli** bir canlı ulaşım uygulamasıdır.

> **⚠️ Yasal Uyarı:** kactakalkar, İETT (İstanbul Elektrik Tramvay ve Tünel İşletmeleri) veya İBB (İstanbul Büyükşehir Belediyesi) ile **resmi hiçbir bağı olmayan** bağımsız bir projedir. Verilerin doğruluğu ve kesintisizliği garanti edilmez. Uygulama "olduğu gibi" (as-is) sunulmaktadır.

## ✨ Özellikler

- **🚏 Durak Sorgulama:** Durak kodu veya ismiyle arama, durağa yaklaşan araçların canlı listesi.
- **🚌 Hat Detayı:** Hat güzergahı, duraklar, sefer saatleri, deparlar ve duyurular.
- **📡 Canlı Filo:** Hat bazında aktif çalışan araçların harita üzerinde anlık takibi.
- **🔍 Araç Sorgulama:** Plaka veya kapı kodu ile araç detayları (İETT CAPTCHA doğrulamalı).
- **🗺️ Rota Oluşturucu:** İETT'nin resmi `nasilgiderim` servisi ile en iyi aktarmalı güzergah hesaplama.
- **📍 Yakınımdaki Duraklar:** Konum tabanlı (600m yarıçapında) durak listeleme.
- **📅 Sefer Arşivi & Popüler Hatlar:** Geçmiş günlerin sefer kayıtları ve en çok kullanılan hatlar.
- **🤖 AI Asistan:** Yerel kural tabanlı yapay zeka ile hat, durak ve araç sorgulama.
- **📱 PWA Desteği:** Ana ekrana eklenebilir, çevrimdışı çalışabilir mobil uygulama deneyimi.

## 🛠️ Teknolojiler

- **Frontend:** Vanilla JavaScript, HTML5, CSS3, Leaflet.js (Harita)
- **Backend:** Node.js, Hono (Express yerine), Native Fetch API
- **Deployment:** Cloudflare Workers & Assets
- **Veri Kaynakları:** İBB Açık Veri Portalı (SOAP API), iett.istanbul (HTML Scraping)

## 🚀 Kurulum ve Çalıştırma

### Gereksinimler
- Node.js (v18 veya üzeri)
- npm

### 1. Projeyi Klonlayın
```bash
git clone https://github.com/fth25/kactakalkar.git
cd kactakalkar