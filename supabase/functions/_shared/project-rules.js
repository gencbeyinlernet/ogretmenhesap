export const MAIN_AREAS = [
  "Biyoloji",
  "Coğrafya",
  "Değerler Eğitimi",
  "Fizik",
  "Kimya",
  "Matematik",
  "Psikoloji",
  "Sosyoloji",
  "Tarih",
  "Teknolojik Tasarım",
  "Türk Dili ve Edebiyatı",
  "Yazılım",
];
export const THEMES = [
  "Aile İçi İletişim",
  "Akıllı Ulaşım Sistemleri",
  "Algoritma Tasarımı ve Uygulamaları",
  "Artırılmış, Sanal ve Karma Gerçeklik",
  "Astronomi ve Astrofizik",
  "Bağımlılık ve Bağımlılıkla Mücadele",
  "Bilgisayarsız Kodlama",
  "Bilim İletişimi",
  "Bilim Tarihi ve Felsefesi",
  "Biyoçeşitlilik",
  "Biyomedikal Cihaz Teknolojileri",
  "Biyotaklit",
  "Blokzincir",
  "Büyük Veri ve Bulut Bilişim",
  "Çevre ve Çevreyi Koruma",
  "Çip Teknolojileri",
  "Değerler Eğitimi",
  "Dijital İkiz",
  "Dijital Oyun Tasarımı",
  "Dil ve Edebiyat",
  "Doğal Afetler ve Afet Yönetimi",
  "Doğal Miras ve Doğal Kaynaklar",
  "Ekolojik Denge",
  "Ekolojik Okuryazarlık",
  "E-Öğrenme",
  "Erişilebilir Yaşam Teknolojileri",
  "Finansal Okuryazarlık",
  "Genetik ve Biyoteknoloji",
  "Gıda ve Gıda Arzı Güvenliği",
  "Giyilebilir Teknolojiler",
  "Göç ve Uyum",
  "Görsel ve İşitsel Sanatlar",
  "Havacılık ve Uzay Bilimleri",
  "Hidrojen Enerjisi",
  "İnsan Hakları ve Demokrasi",
  "Jeotermal Enerji",
  "Karbon Ayak İzi",
  "Kuantum Teknolojileri",
  "Kutup Keşfi ve Araştırmaları",
  "Küresel Isınma ve İklim Değişikliği",
  "Makine Öğrenmesi",
  "Malzeme Bilimi ve Nanoteknoloji",
  "Medya Okuryazarlığı",
  "Milli Teknoloji Hamlesi",
  "Nörobilim ve Nöroteknoloji",
  "Nükleer Enerji",
  "Okul Dışı Öğrenme Ortamları",
  "Orman ve Ormanları Koruma",
  "Oyun ve Oyunlaştırma",
  "Robotik ve Kodlama",
  "Sağlıklı Beslenme",
  "Sağlıklı Yaşam ve Spor",
  "Salgın Hastalıklar ve Salgınla Mücadele",
  "Sıfır Atık ve Geri Dönüşüm",
  "Siber Güvenlik",
  "Siber Psikoloji",
  "Somut Kültürel Miras",
  "Somut Olmayan Kültürel Miras",
  "Sorumlu Üretim ve Tüketim",
  "STEAM (Fen, Teknoloji, Mühendislik, Sanat ve Matematik)",
  "Sürdürülebilir Şehirler ve Toplumlar",
  "Tarım ve Hayvancılık Teknolojileri",
  "Yabancı Dil Eğitimi",
  "Yapay Zekâ",
  "Yenilenebilir Enerji",
  "Yer ve Deniz Bilimleri",
  "Yoksullukla Mücadele",
];
export const SECTIONS = [
  ["abstract", "Özet"],
  ["purpose", "Amaç"],
  ["introduction", "Giriş"],
  ["method", "Yöntem"],
  ["findings", "Bulgular"],
  ["conclusion", "Sonuç ve Tartışma"],
  ["suggestions", "Öneriler"],
  ["references", "Kaynaklar"],
  ["appendices", "Ekler"],
];
export const TEXT_FIELDS = [
  "title",
  "main_area",
  "theme",
  "stage",
  "problem",
  "question",
  "hypothesis",
  "keywords",
  "permissions",
  ...SECTIONS.map((s) => s[0]),
];
export const wordCount = (text) =>
  (String(text || "").match(/[\p{L}\p{N}]+(?:[’'\-][\p{L}\p{N}]+)*/gu) || [])
    .length;
export function blankProject() {
  return Object.fromEntries([
    ...TEXT_FIELDS.map((k) => [k, k === "stage" ? "planning" : ""]),
    ["research_humans", false],
    ["permissions_ready", false],
    [
      "timeline",
      [
        "Literatür taraması",
        "Verilerin toplanması",
        "Verilerin analizi",
        "Proje raporu yazımı",
      ].map((task) => ({ task, start: "", end: "" })),
    ],
  ]);
}
export function normalizeProject(value = {}) {
  const p = blankProject();
  for (const key of TEXT_FIELDS)
    if (typeof value[key] === "string")
      p[key] = value[key].slice(0, key === "title" ? 180 : 12000);
  if (!["planning", "ongoing", "completed"].includes(p.stage))
    p.stage = "planning";
  p.research_humans = value.research_humans === true;
  p.permissions_ready = value.permissions_ready === true;
  if (Array.isArray(value.timeline))
    p.timeline = value.timeline
      .slice(0, 20)
      .map((t) => ({
        task: String(t?.task || "").slice(0, 160),
        start: /^\d{4}-\d{2}-\d{2}$/.test(t?.start) ? t.start : "",
        end: /^\d{4}-\d{2}-\d{2}$/.test(t?.end) ? t.end : "",
      }));
  return p;
}
export function projectChecks(value) {
  const p = normalizeProject(value),
    summary = wordCount(p.abstract),
    keywords = wordCount(p.keywords);
  return [
    {
      key: "title",
      label: "Başlık 1–15 kelime",
      ok: wordCount(p.title) > 0 && wordCount(p.title) <= 15,
    },
    {
      key: "area",
      label: "Ana alan ve tematik alan seçildi",
      ok: MAIN_AREAS.includes(p.main_area) && THEMES.includes(p.theme),
    },
    {
      key: "abstract",
      label: `Özet 150–250 kelime (${summary})`,
      ok: summary >= 150 && summary <= 250,
    },
    {
      key: "keywords",
      label: `Anahtar kelimeler en fazla 5 kelime (${keywords})`,
      ok: keywords > 0 && keywords <= 5,
    },
    {
      key: "research",
      label: "Problem, araştırma sorusu ve amaç açıklandı",
      ok: !!(p.problem.trim() && p.question.trim() && p.purpose.trim()),
    },
    {
      key: "method",
      label: "Giriş ve yöntem yazıldı",
      ok: !!(p.introduction.trim() && p.method.trim()),
    },
    {
      key: "timeline",
      label: "İş-zaman çizelgesi dolduruldu",
      ok:
        p.timeline.length > 0 &&
        p.timeline.every(
          (t) => t.task.trim() && t.start && t.end && t.end >= t.start,
        ),
    },
    {
      key: "findings",
      label:
        p.stage === "completed"
          ? "Gerçek bulgular ve sonuçlar yazıldı"
          : "Araştırma sürüyor; rapor henüz taslak",
      ok:
        p.stage === "completed" && !!(p.findings.trim() && p.conclusion.trim()),
    },
    {
      key: "references",
      label: "Kaynakça dolduruldu; kaynakların doğruluğunu kendin kontrol et",
      ok: !!p.references.trim(),
    },
    {
      key: "ethics",
      label: p.research_humans
        ? "Katılımcı, veli ve kurum izinleri kontrol edildi"
        : "Katılımcı araştırması seçilmedi; gerekli izinleri danışmanınla kontrol et",
      ok: !p.research_humans || (p.permissions_ready && !!p.permissions.trim()),
    },
  ];
}
export function validateGenerated(value) {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw Error("Asistan geçerli bir taslak döndürmedi.");
  const sections = {};
  for (const [key] of SECTIONS)
    if (typeof value.sections?.[key] === "string" && value.sections[key].trim())
      sections[key] = value.sections[key].slice(0, 12000);
  if (!Object.keys(sections).length)
    throw Error("Asistan yanıtında kullanılabilir bölüm bulunamadı.");
  return {
    sections,
    warnings: Array.isArray(value.warnings)
      ? value.warnings
          .filter((w) => typeof w === "string")
          .slice(0, 10)
          .map((w) => w.slice(0, 500))
      : [],
  };
}
export const GUIDE_RULES = `Kaynaklar: 2204A_proje_rehberi_2027.pdf s.2–3,59–63,69–73; proje_yazma_sablonu_2024-2025.docx. 2027 rehberi esas: başlık en fazla 15 kelime; özet 150–250 kelime; anahtar kelimeler en fazla 5 kelime (eski şablon 4 diyor). Bölümler: Özet, Amaç, Giriş, Yöntem, Proje İş-Zaman Çizelgesi, Bulgular, Sonuç ve Tartışma, Öneriler, Kaynaklar, Ekler. Girişte bilimsel kaynak taraması, özgünlük, soru/hipotez; yöntemde desen, örneklem/çalışma sahası, veri araçları, uygulama, analiz. Gerçek kaynaklar APA. Rapor en fazla 20 sayfa; fazla ekler başvuru sisteminde ayrı yüklenir. Times New Roman 12 punto, tek satır, iki yana yaslı, kenarlar 2,5 cm önerilir. Öğrenci özgün çalışmasını yapar. Yapılmamış gözlem, veri, deney sonucu, istatistik, kaynak/DOI, etik izin veya tarih uydurma. Araştırma planlanıyorsa gelecek zaman kullan; bulgu/sonuç yerine henüz veri toplanmadığını açıkça belirt. İnsan/anket araştırmalarında gönüllü katılım, gerekiyorsa veli/kurum/MEB izinleri ve gizlilik kontrol edilir; alınmadıkça alınmış gibi yazılmaz.`;
