# Öğretmen Defteri

Türkçe, mobil uyumlu öğretmen çalışma alanı. Kişisel profil, öğrenci profilleri, ders programı, görev/ödev takibi, notlar ve JSON yedekleme içerir.

## Yerel çalıştırma

Node veya paket kurulumu gerektirmez. Depo dizininde:

```sh
python3 -m http.server 8000 --bind 0.0.0.0
```

## Veriler ve kapsam

Veriler `localStorage` ile yalnızca kullanılan tarayıcıda saklanır. Öğrenci ekranları öğretmenin takip ettiği profillerdir; ayrı öğrenci hesabı, kimlik doğrulama, bulut veritabanı veya cihazlar arası eşitleme yoktur. Paylaşılan cihazlarda gerçek öğrenci bilgileri kullanmayın. Kişisel bilgilerim ekranından düzenli yedek alın; yedek dosyaları kişisel veri içerir.

## GitHub Pages

Depo **Settings → Pages → Build and deployment → Source: GitHub Actions** seçeneğini kullanmalıdır. `main` dalına gönderim `.github/workflows/pages.yml` iş akışını çalıştırır. Yalnızca uygulamanın üç statik dosyası yayımlanır; kişisel kayıtlar depoya gönderilmez.

Google Fonts erişilemezse sistem yazı tipleri kullanılır. Backend veya gizli anahtar gerekmez.
