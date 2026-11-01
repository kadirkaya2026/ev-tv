# Ev TV — Android TV kutusu için reklamsız ana ekran

**[⬇️ APK'yı indir (son sürüm)](https://github.com/kadirkaya2026/ev-tv/releases/latest/download/ev-tv.apk)**

![Ana ekran](docs/ana-ekran.png)

| Çizim tahtası | Asistan | Telefon |
|---|---|---|
| ![](docs/cizim.png) | ![](docs/asistan.png) | ![](docs/telefon.png) |

> Ekran görüntüleri örnek verilerle çekildi; kutunda kendi uygulamaların görünür.

Apple TV tarzı sinematik bir ana ekran:

- **Reklamsız ana ekran:** Arkada yavaşça kayıp yakınlaşan 4K manzaralar (her gün yenileri), üstte favori uygulamaların, altta tüm uygulamalar.
- **Film ve dizi rafları:** Türkiye'de bu hafta popüler filmler/diziler. Üzerine gelince arka plan o yapımın sahne görseline geçer; detayda fragman (YouTube), "Netflix'te Aç" gibi yüklü platform düğmeleri ve "Asistana Sor".
- **Ekran koruyucu:** 5 dakika dokunulmazsa saatli manzara gösterisi.
- **Ortak çizim tahtası:** TV'deki QR'ı telefonla okutun. İki telefondan aynı anda çizebilirsiniz, çizimler TV'de anında görünür. Aynı Wi-Fi şart değil; dışarıdan da çizilir.
- **Claude asistanı:** Kumandanın mikrofon tuşuyla ya da telefondan soru sorulur, cevap TV'de çıkar.

Telefonlar `ekatalox.com/tv` sayfası üzerinden internetten bağlanır (Supabase Realtime). İnternet yoksa ev ağı (Wi-Fi) yöntemi yedek olarak çalışır.

## 1. APK'yı indir

[Releases](https://github.com/kadirkaya2026/ev-tv/releases/latest) sayfasından `ev-tv.apk` dosyasını indir. Giriş yapmana gerek yok; kutunun tarayıcısından ya da "Downloader" uygulamasından şu adresle de indirebilirsin:

```
https://github.com/kadirkaya2026/ev-tv/releases/latest/download/ev-tv.apk
```

## 2. TV kutusuna kur

Kolay yol, USB bellekle:
1. `ev-tv.apk` dosyasını USB belleğe kopyala ve kutuya tak.
2. Kutuda bir dosya yöneticisiyle (ör. "File Commander", "X-plore") APK'yı aç.
3. "Bilinmeyen kaynaklar" izni sorarsa o uygulamaya izin ver.

ADB ile (bilgisayardan):
```bash
# Kutuda: Ayarlar → Cihaz Tercihleri → Hakkında → "Derleme"ye 7 kez bas → Geliştirici seçenekleri → USB/Ağ hata ayıklama AÇIK
adb connect KUTU_IP_ADRESI
adb install -r ev-tv.apk
```

## Güncelleme

Yeni sürüm çıkınca ana ekranda **Güncellemeler** kartı "YENİ" etiketiyle görünür → **Şimdi Güncelle** → tarayıcı APK'yı indirir → dosyayı açıp **Yükle**. Eski sürümün üzerine kurulur; favoriler, API anahtarı ve çizimler korunur.

İmza: Android debug anahtarı, GitHub Actions önbelleğinde sabit tutulur (`keepalive.yml` 3 günde bir okuyarak silinmesini önler). Repoda 60 gün hiç işlem olmazsa GitHub zamanlanmış işleri durdurur; anahtar kaybolursa bir kez kaldırıp yeniden kurmak gerekir.

## 3. Ana ekran yap

- **Çoğu Android TV kutusu (ör. çoğu Çin malı kutu, Mi Box eski sürümleri):** Kurduktan sonra kumandada **Home** tuşuna bas. "Ana ekran uygulamasını seç" sorulursa **Ev TV** → **Her zaman**.
- **Soru gelmezse** (Google TV / yeni Android TV kendi ana ekranını zorlar), sistemin kendi ana ekranını ADB ile kapat:
  ```bash
  # Hangisi yüklüyse:
  adb shell pm disable-user --user 0 com.google.android.apps.tv.launcherx   # Google TV
  adb shell pm disable-user --user 0 com.google.android.tvlauncher          # Android TV
  ```
  Geri almak için aynı komutu `disable-user` yerine `enable` ile çalıştır. Hiçbir şey silinmez, sadece devre dışı kalır.

## 4. Kullanım

| Kumanda | Ne yapar |
|---|---|
| Yön tuşları | Gezin |
| OK | Aç |
| OK'a basılı tut / Menü | Uygulamayı üst sıraya ekle ya da çıkar |
| Geri | Ana ekrana dön |
| Mikrofon / Arama | Asistana sesli soru |

**Telefonu bağla:** Ana ekranda **Telefonu Bağla** kartını aç ve QR'ı okut. Telefonun internete bağlı olması yeter; sayfayı ana ekrana eklersen her yerden açarsın. Üç sekme var:
- **Çiz:** Renk ve kalınlık seç, çiz. "Geri al" sadece senin son çizgini siler.
- **Asistan:** Yaz ve gönder. Klavyedeki 🎤 ile sesli de yazabilirsin. Cevap TV'de de görünür.
- **Ayarlar:** Claude API anahtarı. Güvenlik için internetten gönderilmez: TV ile aynı Wi-Fi'dayken Ayarlar'daki bağlantıya dokunup bir kez gir. Anahtarı console.anthropic.com → API Keys'ten alırsın; sadece kutuda saklanır.

## Film rafları için TMDB anahtarı

Film/dizi rafları [TMDB](https://www.themoviedb.org)'den gelir (ücretsiz):
1. themoviedb.org'da hesap aç → Ayarlar → **API** → "API Key" iste (kişisel kullanım).
2. Vercel → ekatalox projesi → Settings → Environment Variables → `TMDB_API_KEY` = anahtar (v3 anahtarı ya da v4 okuma belirteci) → yeniden yayınla.

Anahtar yoksa raflar görünmez; ana ekranın geri kalanı normal çalışır.

## Güvenlik notları

- Her TV'nin rastgele, tahmin edilemez bir oda kodu var; kod QR'ın içinde. QR'ı okutmayan biri odaya giremez.
- Ev ağı modunda da aynı kod erişim kodu olarak kullanılır.
- Sunucu sadece ev ağında, 8765 portunda çalışır. Modeminde bu portu dışarı açma.
- Asistan kullanımı API hesabından ücretlendirilir (model: Claude Opus 5.5, düşük efor).

## Geliştirme

Arayüz `app/src/main/assets/web/` içinde düz HTML/CSS/JS:
- `index.html`, `tv.css`, `tv.js`: TV ekranı. Tarayıcıda `index.html#demo` ile önizleme verisiyle açılır.
- `phone.html`, `phone.css`, `phone.js`: telefon sayfası. Kutudaki sunucudan servis edilir.

Android tarafı (`app/src/main/java/com/evim/tv/`):
- `MainActivity`: WebView'i barındırır, kumanda tuşlarını arayüze iletir.
- `AppRepository`: yüklü uygulamaları listeler ve açar.
- `LocalServer`: telefon sayfası, canlı olaylar (SSE), çizim ve asistan API'si.
- `Assistant`: Claude çağrısı (anthropic-java SDK).

Derleme: `gradle assembleRelease` (Android SDK ve JDK 17 gerekir). `main`'e her push'ta GitHub Actions derler ve APK'yı Releases'e yükler. Sürüm adı `app/build.gradle` içindeki `versionName`'den gelir (ör. `1.0` → `v1.0`).

Yeni sürüm çıkarmak için `app/build.gradle`'da `versionCode`'u bir artır (kutu güncelleme olarak kursun) ve `versionName`'i değiştir (ör. `1.1`).

## Lisans

MIT
