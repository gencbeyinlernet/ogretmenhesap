# Öğretmen Defteri

Türkçe ve mobil uyumlu öğretmen/öğrenci çalışma alanı. Statik arayüz GitHub Pages üzerinde, kimlik doğrulama ve uygulama kayıtları Supabase üzerinde çalışır.

## İlk Supabase kurulumu

1. Uygulamadaki sol **SQL kurulumu** düğmesini açın.
2. Öğretmenin başlangıç parolasını girin. İlk girişten sonra Profilim ekranından başlangıç parolasını değiştirebilirsiniz. Parola kaynak dosyalarına kaydedilmez; yalnızca kopyalanan SQL'e eklenir. Kopyaladığınız SQL'i paylaşmayın.
3. SQL'i projenin **SQL Editor** ekranında çalıştırın. Kaynak şablon `supabase/schema.sql` dosyasıdır; elle çalıştıracaksanız `__TEACHER_PASSWORD__` yerini kendi parolanızla değiştirin (tek tırnakları SQL kurallarına göre iki kez yazarak kaçırın).
4. **Authentication → Sign In / Providers → Email**: Email sağlayıcısını ve yeni kullanıcı kaydını açık tutun, **Confirm email** seçeneğini kapatın. Kullanıcılar gerçek e-posta vermediği için e-posta doğrulama/sıfırlama desteklenmez. Supabase güçlü parola kuralı açılmışsa buna uygun parola seçilmelidir.
5. `burakturgut` ve başlangıç parolanızla giriş yapın. Diğer kayıtlar yalnızca öğrenci rolüyle açılır. Kullanıcı adları 3–24 küçük Latin harfi, rakam veya alt çizgidir; büyük harfler girişte küçültülür.

Supabase adresi ve **anon** anahtarı `backend.js` içindedir. Anon anahtarı tarayıcı kullanımı için herkese açık kimliktir; yetkilendirme RLS ile sağlanır. Service-role veya veritabanı parolası tarayıcıya eklenmez. Verilen anon anahtarı SQL çalıştırma veya Auth yönetimi yetkisi vermez: ilk kurulum SQL Editor'da proje sahibi tarafından yapılmalıdır.

SQL yeniden çalıştırılabilir; kayıtları ve mevcut öğretmenin parolasını değiştirmez. Tek öğretmen kısıtı veritabanında uygulanır. Öğretmen hesabı yalnızca yönetici SQL'i ile oluşturulur. Supabase Auth parolaları hash olarak saklar. Başlangıç SQL'i tamamlanmadan kayıt/giriş çalışmaz.

## Giriş/kayıt sorunu giderme

- SQL Editor **Success** sonucu, kurulumun tamamlandığını gösterir. Öğretmen girişi SQL paneline yazılan parola ile yapılır; uygulama otomatik bir başlangıç parolası atamaz. Ana kurulum SQL'ini tekrar çalıştırmak mevcut parolayı değiştirmez.
- Parola uyuşmuyorsa **SQL kurulumu → Yapılacak işlem → Giriş onarımı** seçin. Yeni öğretmen parolasını girip SQL'i kopyalayın ve SQL Editor'da çalıştırın. `supabase/repair-auth.sql` şablonu yalnızca mevcut `burakturgut` öğretmeninin parolasını değiştirir, mevcut uygulama öğrencilerinin e-posta onay durumunu düzeltir. Öğrenci parolaları, mesajlar, ödevler ve puanlar silinmez. Yeni kayıtlar için **Confirm email** ayrıca kapatılmalıdır.
- Öğretmen hesabı **Giriş yap** sekmesini kullanır; **Öğrenci kaydı** sekmesinden oluşturulmaz. Onaysız öğrenci hesabı varsa silmek yerine onarım SQL'i ile onaylayıp mevcut kullanıcı adı/parola ile giriş yapılabilir.
- HTTP **429** bir Supabase sınırıdır. Uygulama sunucunun `Retry-After` süresini (yoksa en az 60 saniyeyi) gösterir ve bekleme sırasında aynı kayıt/giriş isteğini yeniden yollamaz. `over_email_send_rate_limit` kodu e-posta gönderim sınırıdır; Confirm email ayarını kontrol edin. Uygulama Supabase'in sunucu sınırını kaldıramaz, bekleme sonunda sınır sürerse Authentication Logs/Rate Limits ayarlarını kontrol edin.
- HTTP **400** tek başına neden belirtmez. `invalid_credentials`, `email_not_confirmed`, `weak_password`, kapalı sağlayıcı/kayıt ve veritabanı trigger hataları ayrı mesajlarla gösterilir. Supabase Response/Auth Logs hata kodunu kullanın; şifre veya access token paylaşmayın.
- Canlı Supabase üzerinde SQL çalıştırma ve Auth ayarlarını değiştirme proje sahibi oturumu gerektirir. Public anon anahtarı bu yetkiyi sağlamaz. Yerel ve taklit API testleri canlı proje doğrulaması yerine geçmez.

## Özellikler ve gizlilik

- Öğretmen: tüm kayıtlı öğrenciler, öğrenci profilleri, tüm uygulama etkinlikleri ve iki kişi arasındaki konuşmalar.
- Öğretmen menüsündeki **Not ve devamsızlık** bağlantısı ve Öğrencilerim ekranındaki kısayol, paylaşılan Google Sheets dosyasını yeni sekmede açar. Bu bir dış bağlantıdır; tablodaki veriler Supabase ile eşitlenmez. Dosyaya erişim Google paylaşım izinleriyle belirlenir; bu bağlantı öğrenci menüsünde gösterilmez.
- Öğrenci: kendi profilini güncelleme; atanmış ödevlerini görme, teslim etme, iade edilmiş ödevi yeniden gönderme; kendi puan ve geri bildirimleri.
- Mesajlar: gönderici, alıcı ve tek öğretmen okuyabilir. Öğrenciler diğer konuşmaları okuyamaz. İletişim dizini yalnızca kullanıcı adı, görünen ad ve rol paylaşır.
- Ödevler: seçilen öğrencilere toplu ve atomik dağıtım; metin/çalışma bağlantısı teslimi; 0–100 puan veya geri gönderme. Ek katılım puanları ayrı kayıtlardır. Toplam puan, güncel ödev puanları ve ek puanların toplamıdır. Dosya yükleme bu sürüme dahil değildir.
- Öğretmenin özel yıllık planları, ders modülleri, günlük aktiviteleri, ders programı ve notları.
- **Uygulamalarım** menüsü öğretmen ve öğrenci panelinde bulunur. Çevrimiçi kaynaklar doğrudan açılır; Drive kaynakları Google Drive bağlantısı olarak açılır. Paylaşılan Drive oyun klasörü başlangıç bağlantısı olarak eklenmiştir; klasör içeriği otomatik listelenmez. Öğretmen yeni uygulama bağlantılarını Supabase üzerinde saklayarak ekleyebilir.
- Kaynak/oyun bağlantıları ve 10 soruluk dahili matematik oyunu. Öğrenci girişleri, sayfa geçişleri, bu uygulamadan kaynak açma ve oyun sonuçları kaydedilir. Etkinlik geçmişini sadece öğretmen okuyabilir. Bu, güvenilir bir sınav denetimi değildir; istemciden gönderilen oyun puanları eğitim amaçlıdır, öğrenci teknik yollarla etkinlik göndermeyi durdurabilir veya sahte oyun sonucu gönderebilir. Diğer web sitelerindeki tarayıcı geçmişini okumaz/izlemez.
- Mesajlar açıkken 10 saniyede bir yenilenir; önceki mesajlar ve geçmiş sayfalı yüklenir. Diğer listeler sayfa açılışında alınır, Yenile ile güncellenir.
- İlk sürümün yerel kayıtları eski `ogretmen-defteri-v1` anahtarında korunur; otomatik olarak hesaplarla ilişkilendirilmez. Yeni uygulama kayıtları Supabase veritabanındadır. Oturum belirteçleri bu tarayıcıda saklanır; paylaşılan cihazlarda çıkış yapın.

## Yerel geliştirme

```sh
python3 -m http.server 8000 --bind 0.0.0.0
```

Uygulamanın çalışması için npm paketi veya derleme gerekmez. Test bağımlılıkları için Node.js 22+ ve `npm ci` kullanın.

```sh
npm test
# Sunucu açıkken, Chromium kurulu ortamda:
CHROMIUM_PATH=/usr/bin/chromium npm run test:browser
```

`npm test`, PGlite PostgreSQL üzerinde gerçek şemayı iki kez çalıştırır; anonim erişim, öğrenci rolünü yükseltme, konuşma gizliliği, ödev yetkileri, teslim/iade/puanlama, özel öğretmen kayıtları ve geçmiş politikalarını sınar. Supabase'in `auth.users`, `auth.identities` ve `auth.uid()` sözleşmeleri yerel testte taklit edilir; bu test gerçek GoTrue servisini doğrulamaz.

Tarayıcı testi giriş/kayıt, SQL kopyalama, öğretmen/öğrenci ekranları, mesajlar, ödevler, yıllık plan, oyun ve mobil görünümü API taklidiyle sınar. Gerçek Supabase kurulumundan sonra en az iki ayrı öğrenci ve bir öğretmen oturumuyla uçtan uca kontrol yapılmalıdır.

## Yayın

**GitHub Settings → Pages → Source: GitHub Actions** seçilmelidir. `main` dalına gönderim `.github/workflows/pages.yml` iş akışını çalıştırır. Statik uygulama ve parolasız SQL şablonu yayımlanır. Supabase kullanıcı kayıtları veya öğretmen parolası Git deposuna yazılmaz. SQL düğmesi kurulumdan sonra ayrı bir değişiklikle kaldırılabilir.
