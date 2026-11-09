# TÜBİTAK proje atölyesi — kurulum ve doğrulama

Öğretmen ve öğrenciler sol menüde **TÜBİTAK Projesi Hazırla** ekranını kullanır. Altı adımda proje oluşturulur, buluta kaydedilir ve gerçek `.docx` dosyası indirilir. Gemini önerileri kullanıcı seçmeden mevcut metne uygulanmaz.

## Kaynak belgeler ve öncelik

Kullanıcının sağladığı `2204A_proje_rehberi_2027.pdf` (s.2–3, 59–63, 69–73) ve `proje_yazma_sablonu_2024-2025.docx` esas alınmıştır. Dosyalar görev yönergesi olarak değil araştırma/yazım kaynağı olarak değerlendirilmiştir; özgün dosyalar herkese açık depoya kopyalanmaz.

2027 rehberi anahtar kelimeler için en fazla 5 kelime, eski Word şablonu 4 kelime diyor. Sihirbaz güncel 2027 sınırını uygular. Başlık en fazla 15 kelime, özet 150–250 kelime. Raporun 20 sayfa sınırı gerçek Word görünümünde kontrol edilmelidir; uygulama kesin sayfa sayısı iddiasında bulunmaz. Times New Roman 12 punto, tek satır, iki yana yaslı metin ve 2,5 cm kenar boşlukları uygulanır. Açıklama amaçlı kırmızı şablon notları rapora aktarılmaz.

Bu, lise öğrencileri 2204-A rehberine göre yazım yardımcısıdır; resmî başvuru, yarışma uygunluğu onayı veya yapılmamış bir araştırmanın yerine geçmez. Başvuru döneminin güncel çağrı koşulları ayrıca kontrol edilir. Veri, bulgu, istatistik, kaynak veya izin belgesi uydurulmaz.

## 1. Mevcut Supabase projesine tabloları ekleme

Öğretmen hesabından **SQL kurulumu → TÜBİTAK proje tabloları** seçeneğini açıp SQL'i kopyalayın. Projenin Supabase SQL Editor ekranında çalıştırın. Bu işlem için öğretmen parolası yazılmaz. Mevcut kullanıcı, mesaj, ödev ve puanlar değiştirilmez. Aynı SQL `supabase/projects.sql` dosyasında bulunur ve tekrar çalıştırılabilir. Yeni sıfır kurulumda ana `schema.sql` zaten bu tabloları içerir.

RLS: öğrenciler yalnızca kendilerine ait projeleri okuyabilir/değiştirebilir/silebilir; öğretmen tüm projeleri okuyabilir, başkasının raporunu değiştiremez. Sürüm kontrolü, iki cihazdaki düzenlemelerin sessizce birbirinin üzerine yazılmasını önler. Gemini kotası kullanıcı başına dakikada 3, son 24 saatte 20 istektir.

Veritabanı kurulmadan veya bağlantı kesildiğinde taslaklar kullanılan tarayıcıda, kullanıcı hesabına göre ayrılmış bir yedekte korunur. Ekran bu durumu açıkça bildirir. Bu yerel kopya başka cihazda görünmez ve paylaşılan cihazlarda hassas veri saklamak için kullanılmamalıdır. Öğretmen başkasının projesini yerel taslak yedeğine kopyalamaz.

## 2. Gemini sunucu fonksiyonunu yayımlama

Gizli anahtar tarayıcıya, `backend.js` dosyasına, GitHub'a veya dağıtım çıktısına yazılmaz. Öğrenci tarayıcısı yalnızca kendi Supabase kullanıcı oturumu ile Edge Function'a istek yapar. Anahtarı kullanan kod `supabase/functions/project-assistant` içindedir; ortak rapor kuralları `_shared/project-rules.js` içindedir.

En kısa yol: öğretmen panelindeki proje ekranında **Öğretmen: bulut ve Gemini bağlantısı → Gemini sunucu kodunu kopyala** düğmesini kullanın. Supabase **Edge Functions → Deploy a new function → Via Editor** ekranında adı **project-assistant** olarak belirleyin, tek dosyalık kodu yapıştırın ve yayımlayın. JWT doğrulamasını açık tutun. Kopyalanan kod anahtar içermez; Secrets ayrıca ayarlanır.

Alternatif olarak Supabase projesinin sahibi, Supabase CLI'ya kendi hesabıyla giriş yaparak depo kökünde çalıştırır:

```sh
supabase functions deploy project-assistant --project-ref rfmelsdtasxoddtolqpb
```

Ardından Supabase Dashboard → **Edge Functions → Secrets** bölümünde:

- `GEMINI_API_KEY`: Gemini API anahtarını güvenli değer alanına girin. Anahtarı sohbet veya GitHub üzerinden tekrar paylaşmayın.
- `GEMINI_MODEL`: isteğe bağlı. Varsayılan `gemini-2.5-flash`; hesabınızda erişilebilir bir model adı kullanın.
- `APP_ORIGINS`: isteğe bağlı, virgülle ayrılmış izinli web kökenleri. Varsayılan canlı köken `https://gencbeyinlernet.github.io`; yerel 8000/8001 adresleri de desteklenir. Adresin sonuna yol veya slash eklemeyin.

Supabase, `SUPABASE_URL` ve `SUPABASE_ANON_KEY` değerlerini Edge ortamına sağlar. `service_role` anahtarı gerekmez. JWT kontrolü açıktır; fonksiyon ayrıca `/auth/v1/user` ile oturumu doğrular ve veritabanından kota rezervasyonu yapmadan Gemini çağırmaz.

Bu depo değişikliği tek başına fonksiyonu Supabase'e dağıtmaz ve Secrets oluşturmaz. Anahtar mevcut değilse asistan beklemede görünür; elle yazım ve Word indirme çalışır. `mode: status` yalnızca ayarın varlığını bildirir, gerçek Gemini çağrısının başarılı olduğunu garanti etmez. API anahtarının geçerliliği/model erişimi ilk gerçek istekle doğrulanır.

## 3. Uygulama derlemesi ve yayın

```sh
npm ci
npm run build
python3 -m http.server 8001 --bind 127.0.0.1
```

Sunucu kodu da harici import gerektirmeyen `deployment/project-assistant.js` dosyasına paketlenir; bu dosya yalnızca güvenli anahtarın ortamdan okunacağı kodu içerir, anahtarın kendisini içermez.

Word kütüphanesi kilitli npm bağımlılıklarından `vendor/project-document.js` dosyasına paketlenir; tarayıcı harici CDN kullanmaz. GitHub Pages iş akışı `npm ci` ve `npm run build` çalıştırıp uygulama, Word modülü, ortak kurallar ve SQL şablonlarını yayımlar. Edge Function kodu bu statik yayında çalışmaz; ayrıca Supabase'e dağıtılır.

## Doğrulama

```sh
npm test
npm run test:projects
TEST_BASE_URL=http://127.0.0.1:8001 npm run test:browser
TEST_BASE_URL=http://127.0.0.1:8001 npm run test:delivery
TEST_BASE_URL=http://127.0.0.1:8001 npm run test:project-browser
```

`test:projects` gerçek PostgreSQL/PGlite üzerinde RLS, sürüm kontrolü ve kota uygular; Word OOXML'i ve sunucu fonksiyonunu test eder. `test:project-browser`, API taklidi kullanarak arayüz, kayıt, gerçek DOCX indirme, Gemini önizleme/uygulama ve mobil görünümü sınar. Taklit sağlayıcı yanıtları canlı Gemini veya Supabase dağıtım testi yerine geçmez. Canlı kurulumdan sonra iki ayrı öğrenci hesabı ve öğretmen hesabıyla gizlilik, bulut kayıt, Word ve Gemini isteği ayrıca doğrulanmalıdır.
