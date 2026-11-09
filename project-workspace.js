import {
  MAIN_AREAS,
  THEMES,
  SECTIONS,
  blankProject,
  normalizeProject,
  wordCount,
  projectChecks,
  validateGenerated,
} from "./supabase/functions/_shared/project-rules.js";
const e = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const STEPS = [
  ["Fikrini keşfet", "Hangi soruna çözüm arıyorsun?"],
  ["Araştırmanı planla", "Amacını ve yöntemini netleştir."],
  ["Zamanını planla", "Küçük işleri bir takvime dönüştür."],
  ["Bulgularını paylaş", "Yalnızca gerçekten gözlemlediklerini yaz."],
  ["Özet ve kaynaklar", "Araştırmanı kısa ve açık anlat."],
  ["Kontrol ve Word", "Son kez gözden geçir, belgeni indir."],
];
const HELP = {
  problem: [
    "Çevrende fark ettiğin sorun nedir?",
    "Örneğin: Okuldaki hangi alışkanlığın nedenini araştırmak istiyorsun?",
  ],
  question: ["Araştırma sorun ne?", "Ölçebileceğin, tek bir açık soru yaz."],
  hypothesis: [
    "Varsa hipotezin nedir?",
    "Veriyle sınayabileceğin tahminini yaz. Her proje hipotez gerektirmez.",
  ],
  purpose: [
    "Amaç ve somut hedefler",
    "Neyi, nasıl iyileştirmeyi veya anlamayı hedefliyorsun? Genel tarihçe yerine kendi hedefine odaklan.",
  ],
  introduction: [
    "Giriş ve kaynak taraması",
    "Benzer çalışmalar ne söylüyor? Senin çalışmanın farkı ne? Okuduğun gerçek kaynaklara atıf yap.",
  ],
  method: [
    "Araştırma yöntemi",
    "Desenini, çalışma grubunu/yerini, araçlarını, uygulama adımlarını ve verileri nasıl analiz edeceğini anlat.",
  ],
  findings: [
    "Gerçek bulguların",
    "Topladığın veri ve analiz sonuçlarını yaz. Veri toplamadıysan boş bırak; sonuç uydurma.",
  ],
  conclusion: [
    "Sonuç ve tartışma",
    "Bulguların araştırma sorunu nasıl yanıtlıyor? Sınırlılıkları ve gerçek kaynaklarla karşılaştırmaları belirt.",
  ],
  suggestions: [
    "Önerilerin",
    "Bu çalışmayı devam ettirecek birine ne önerirsin?",
  ],
  abstract: [
    "Proje özeti",
    "Amaç, yöntem, temel bulgular ve sonucu 150–250 kelimeyle özetle. Çalışma planlanıyorsa bunun bir taslak olduğunu açıkça belirt.",
  ],
  references: [
    "Kaynaklar",
    "Gerçekten okuduğun ve metinde atıf yaptığın kaynakları APA biçiminde yaz. Yazarı, yılı, başlığı, yayın bilgisi ve varsa gerçek DOI/URL’yi kontrol et.",
  ],
  appendices: [
    "Ekler",
    "Ek 1, Ek 2… biçiminde eklerini tanımla. Uzun tablolar, veri araçları ve izin belgelerini gerekirse başvuru sisteminde ayrı sun.",
  ],
  permissions: [
    "İzin ve onam durumu",
    "Hangi kurum, katılımcı veya veli izni gerekli? Alınan izinleri gerçek durumuyla yaz. Henüz almadığın izinleri alınmış gibi gösterme.",
  ],
};
const textField = (key, p) =>
  `<div class="project-field"><label for="pr-${key}">${HELP[key][0]} <small data-count="${key}"></small></label><p>${HELP[key][1]}</p><textarea id="pr-${key}" name="${key}" maxlength="12000" rows="${["abstract", "method", "introduction"].includes(key) ? 8 : 5}" placeholder="Kendi cümlelerinle yaz…">${e(p[key])}</textarea></div>`;
function input(key, label, p, placeholder = "") {
  return `<div class="project-field"><label for="pr-${key}">${label}</label><input id="pr-${key}" name="${key}" value="${e(p[key])}" maxlength="180" placeholder="${e(placeholder)}"></div>`;
}
function select(key, label, list, p) {
  return `<div class="project-field"><label for="pr-${key}">${label}</label><select id="pr-${key}" name="${key}"><option value="">Seçiniz</option>${list.map((item) => `<option ${p[key] === item ? "selected" : ""}>${e(item)}</option>`).join("")}</select></div>`;
}
const dateLabel = (s) =>
  s
    ? new Date(s).toLocaleString("tr-TR", {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "Yeni taslak";
export function createProjectWorkspace({ db, getUser, toast, onSetup }) {
  const boundRoots = new WeakSet();
  let root = null,
    account = null,
    records = [],
    current = null,
    step = 0,
    cloud = false,
    cloudError = "",
    aiReady = false,
    aiResult = null,
    timer,
    savePromise = null,
    generation = 0,
    loading = false;
  const cacheKey = () => `od-project-drafts-v1-${account}`;
  const own = () => current?.owner_id === getUser()?.id;
  function cache() {
    if (!account) return;
    try {
      localStorage.setItem(
        cacheKey(),
        JSON.stringify(records.filter((r) => r.owner_id === account)),
      );
    } catch {
      toast(
        "Tarayıcı yedeği yazılamadı. Projeni Word olarak indir veya buluta kaydet.",
      );
    }
  }
  function localRecords() {
    try {
      const rows = JSON.parse(localStorage.getItem(cacheKey())) || [];
      return Array.isArray(rows)
        ? rows
            .filter((r) => r.owner_id === account && typeof r.id === "string")
            .map((r) => ({ ...r, report: normalizeProject(r.report) }))
        : [];
    } catch {
      return [];
    }
  }
  function status() {
    if (!root) return;
    const el = root.querySelector("#project-save-status");
    if (!el) return;
    el.textContent = savePromise
      ? "Buluta kaydediliyor…"
      : !cloud
        ? "Bulut bağlantısı hazır değil. Taslak bu tarayıcıda korunuyor."
        : current?.dirty
          ? "Değişiklikler bu tarayıcıda; buluta kaydedilecek."
          : current?.revision
            ? "Supabase’e kaydedildi · " + dateLabel(current.updated_at)
            : "Yeni taslak · Henüz buluta kaydedilmedi.";
    root
      .querySelectorAll('[data-p-action="save"]')
      .forEach((b) => (b.disabled = !!savePromise));
  }
  function counts() {
    if (!root || !current) return;
    root.querySelectorAll("[data-count]").forEach((el) => {
      const key = el.dataset.count,
        n = wordCount(current.report[key]);
      el.textContent = `${n} kelime`;
      el.className =
        key === "abstract"
          ? n >= 150 && n <= 250
            ? "count-good"
            : "count-warn"
          : "";
    });
    const title = root.querySelector("#title-count");
    if (title) {
      const n = wordCount(current.report.title);
      title.textContent = `${n} / 15 kelime`;
      title.className = n > 15 ? "count-warn" : "";
    }
  }
  function snapshot() {
    if (!root || !current || !own()) return;
    const form = root.querySelector("#project-editor");
    if (!form) return;
    for (const el of form.elements) {
      if (
        el.name &&
        el.name in current.report &&
        el.dataset.timeline === undefined
      )
        current.report[el.name] =
          el.type === "checkbox" ? el.checked : el.value;
    }
    const rows = [...root.querySelectorAll("[data-timeline-row]")];
    if (rows.length)
      current.report.timeline = rows.map((row) =>
        Object.fromEntries(
          [...row.querySelectorAll("input")].map((el) => [
            el.dataset.key,
            el.value,
          ]),
        ),
      );
    current.report = normalizeProject(current.report);
    current.title = current.report.title.trim() || "Yeni proje";
    current.dirty = true;
    current.local_updated_at = new Date().toISOString();
    cache();
    counts();
    status();
  }
  function schedule() {
    clearTimeout(timer);
    if (cloud && own())
      timer = setTimeout(() => save().catch((err) => toast(err.message)), 1800);
  }
  async function save() {
    if (!current || !own()) return;
    if (savePromise) return savePromise;
    if (!cloud) {
      toast(
        "Bulut kaydı henüz hazır değil. Taslağın bu tarayıcıda korunuyor; Word olarak indirebilirsin.",
      );
      return;
    }
    const record = current,
      user = account,
      report = normalizeProject(record.report),
      fingerprint = JSON.stringify(report),
      payload = { title: report.title.trim() || "Yeni proje", report };
    const operation = (async () => {
      try {
        let rows;
        if (record.revision)
          rows = await db.updateReturning(
            "od_projects",
            `id=eq.${record.id}&revision=eq.${record.revision}`,
            payload,
          );
        else {
          try {
            rows = await db.insertReturning("od_projects", {
              id: record.id,
              owner_id: user,
              ...payload,
            });
          } catch (err) {
            if (err.code !== "23505") throw err;
            rows = await db.get("od_projects", "id=eq." + record.id);
            if (
              JSON.stringify(normalizeProject(rows[0]?.report)) !== fingerprint
            )
              throw Error(
                "Bu taslak başka bir oturumda kaydedilmiş. Mevcut metnini Word olarak indirip projeyi yeniden aç.",
              );
          }
        }
        if (!rows?.[0])
          throw Error(
            "Bu proje başka bir cihazda değiştirildi. Metnin korunuyor; Word yedeği alıp projeyi yeniden aç.",
          );
        record.revision = rows[0].revision;
        record.updated_at = rows[0].updated_at;
        record.dirty = JSON.stringify(record.report) !== fingerprint;
        if (account === user) {
          cache();
          cloudError = "";
        }
      } catch (err) {
        if (account === user) cloudError = err.message;
        throw err;
      } finally {
        if (savePromise === operation) savePromise = null;
        status();
      }
    })();
    savePromise = operation;
    status();
    return operation;
  }
  function help() {
    return `<details class="project-guide"><summary>Rehber ve yazım kuralları</summary><p>2027 2204-A lise araştırma projeleri rehberi s.69–73: başlık en fazla 15 kelime, özet 150–250 kelime, anahtar kelimeler en fazla 5 kelime. Rapor sınırı 20 sayfa; son sayfa sayısını Word’de kontrol et. Uzun ekler ayrıca sunulur.</p><p>Word şablonu: Times New Roman 12 punto, tek satır, iki yana yaslı, her kenarda 2,5 cm. Sağlanan 2024–2025 şablonundaki 4 anahtar kelime yerine güncel rehberin 5 kelime sınırı kullanılır.</p><p>Bu ekran bir yazım yardımcısıdır; resmî başvuru yapmaz. Bulgular ve kaynaklar gerçek olmalı; çalışma öğrenciye ait olmalıdır. İnsanlarla araştırma yapılacaksa gönüllü katılım, veli ve kurum/MEB izinlerini danışmanınla kontrol et (rehber s.59–63).</p></details>`;
  }
  function setupHelp() {
    return getUser()?.role === "teacher"
      ? `<details class="project-guide"><summary>Öğretmen: bulut ve Gemini bağlantısı</summary><p>Önce SQL kurulumu ekranından “TÜBİTAK proje tabloları” SQL’ini Supabase SQL Editor’da çalıştırın. Sonra aşağıdaki düğmeden sunucu kodunu kopyalayın. Supabase → Edge Functions → Deploy a new function → Via Editor ekranında fonksiyon adını project-assistant yapın, kodu yapıştırıp yayımlayın. GEMINI_API_KEY anahtarını yalnızca Edge Functions → Secrets bölümüne ekleyin. Model ayarı GEMINI_MODEL (varsayılan gemini-2.5-flash).</p><p>API anahtarı öğrencilere veya GitHub’a yazılmaz. Yapay zekâ için kişi başı dakikada 3, günde 20 istek sınırı vardır. Dağıtım adımları depodaki docs/tubitak-setup.md dosyasındadır.</p><button type="button" class="text-button" data-p-action="setup">Proje SQL’ini aç →</button><br><button type="button" class="text-button" data-p-action="copy-edge">Gemini sunucu kodunu kopyala →</button></details>`
      : "";
  }
  function dashboard() {
    current = null;
    root.innerHTML = `<section class="project-hero"><div><p class="eyebrow">MERAK ET · ARAŞTIR · KEŞFET</p><h1>Küçük bir fikir,<br>büyük bir projeye dönüşebilir.</h1><p>Adım adım araştırmanı tasarla, kendi cümlelerinle yaz,<br>TÜBİTAK proje şablonunda Word belgeni hazırla.</p><button class="button" data-p-action="new">✦ Yeni proje hazırla</button></div><div class="project-orbit" aria-hidden="true">✧<span>⚛</span>✦</div></section><div class="project-feature-row"><span>01 · Fikrini bul</span><span>02 · Araştırmanı geliştir</span><span>03 · Word olarak indir</span></div><div class="section-title"><h2>${getUser()?.role === "teacher" ? "Projeler ve öğrenci taslakları" : "Projelerim"}</h2><button class="text-button" data-p-action="refresh">↻ Yenile</button></div>${!cloud ? `<p class="project-connection">Bulut kaydı hazır değil. Bu tarayıcıdaki kendi taslaklarını kullanabilir, Word indirebilirsin. ${getUser()?.role === "teacher" ? "Proje SQL kurulumunu tamamlayın." : "Bulut kaydı için öğretmeninden yardım iste."}</p>` : ""}<div class="project-list">${records.length ? records.map((r) => `<article class="student-card"><p class="eyebrow">${r.owner_id === account ? "BENİM PROJEM" : "ÖĞRENCİ PROJESİ · SALT OKUNUR"}</p><h3>${e(r.title || "Yeni proje")}</h3><p class="subtitle">${e(r.report.main_area || "Alanını seçerek başla")} · ${e(r.report.theme || "Tematik alan bekliyor")}</p><div class="student-card-bottom"><span>${r.dirty ? "Bu cihazda taslak" : dateLabel(r.updated_at)}</span><a class="text-button" href="#projects/${e(r.id)}">${r.owner_id === account ? "Devam et" : "İncele"} →</a></div></article>`).join("") : `<div class="card full">${loading ? "Projeler yükleniyor…" : "İlk araştırma fikrin için burada yer var. “Yeni proje hazırla” ile başlayabilirsin."}</div>`}</div>${help()}${setupHelp()}`;
  }
  function fields() {
    const p = current.report;
    if (step === 0)
      return `<div class="project-two">${input("title", "Projenin adı", p, "Konunu anlatan kısa bir başlık")}<p class="project-hint" id="title-count"></p>${select("main_area", "Proje ana alanı", MAIN_AREAS, p)}${select("theme", "Proje tematik alanı", THEMES, p)}</div><div class="project-field"><label for="pr-stage">Araştırman hangi aşamada?</label><select id="pr-stage" name="stage"><option value="planning" ${p.stage === "planning" ? "selected" : ""}>Henüz planlıyorum</option><option value="ongoing" ${p.stage === "ongoing" ? "selected" : ""}>Araştırmam devam ediyor</option><option value="completed" ${p.stage === "completed" ? "selected" : ""}>Araştırmam tamamlandı</option></select></div>${textField("problem", p)}${textField("question", p)}${textField("hypothesis", p)}`;
    if (step === 1)
      return `${textField("purpose", p)}${textField("introduction", p)}${textField("method", p)}<label class="project-checkbox"><input name="research_humans" type="checkbox" ${p.research_humans ? "checked" : ""}> Anket, görüşme veya insan katılımcı içeren bir araştırma yapıyorum.</label>${textField("permissions", p)}<label class="project-checkbox"><input type="checkbox" name="permissions_ready" ${p.permissions_ready ? "checked" : ""}> Gerekli izin ve onamları danışmanımla kontrol ettim; aldıklarımı yukarıda doğru biçimde açıkladım.</label>`;
    if (step === 2)
      return `<p class="project-tip">Önce küçük hedefler belirle. Haftalık veya aylık çalışma dönemlerini başlangıç/bitiş tarihleriyle göster.</p><div id="project-timeline">${p.timeline.map((t, i) => `<div class="project-timeline-row" data-timeline-row><label>İşin tanımı<input data-timeline="1" data-key="task" value="${e(t.task)}" maxlength="160"></label><label>Başlangıç<input type="date" data-timeline="1" data-key="start" value="${e(t.start)}"></label><label>Bitiş<input type="date" data-timeline="1" data-key="end" value="${e(t.end)}"></label><button type="button" class="icon-button" data-p-action="remove-task" data-index="${i}" aria-label="İşi sil">×</button></div>`).join("")}</div><button type="button" class="button secondary small" data-p-action="add-task">＋ İş ekle</button>`;
    if (step === 3)
      return `<p class="project-tip">Henüz veri toplamadıysan sonuç yazmak zorunda değilsin. Bu alanları araştırmanı gerçekten tamamladığında doldur. Asistan sonuç veya ölçüm uydurmaz.</p>${textField("findings", p)}${textField("conclusion", p)}${textField("suggestions", p)}`;
    if (step === 4)
      return `${textField("abstract", p)}${input("keywords", "Anahtar kelimeler (en fazla 5 kelime)", p, "Örneğin: enerji, güneş, sürdürülebilirlik")}${textField("references", p)}${textField("appendices", p)}`;
    const checks = projectChecks(p);
    return `<div class="project-checks">${checks.map((c) => `<p class="${c.ok ? "check-ok" : "check-missing"}"><span>${c.ok ? "✓" : "○"}</span>${e(c.label)}</p>`).join("")}</div><p class="project-tip">Eksikler varken de taslak Word indirebilirsin. İndirme, projenin resmî başvuruya uygun olduğuna dair otomatik onay değildir. 20 sayfa sınırını Word’de kontrol et.</p><div class="project-preview">${SECTIONS.map(([k, label]) => `<h3>${label}</h3><p>${e(p[k] || "Henüz yazılmadı.")}</p>`).join("")}</div>`;
  }
  function editor() {
    if (!current) return;
    const readOnly = !own();
    const completed = projectChecks(current.report).filter((c) => c.ok).length;
    root.innerHTML = `<a class="back" href="#projects">← Projelere dön</a><div class="project-editor-head"><div><p class="eyebrow">TÜBİTAK 2204-A · 2027 REHBERİ</p><h1>${e(current.title || "Yeni projen")}</h1><p id="project-save-status" class="subtitle"></p></div><div class="heading-actions">${!readOnly ? '<button class="button secondary" data-p-action="save">Kaydet</button>' : ""}<button class="button" data-p-action="word">↓ Word indir</button></div></div>${readOnly ? '<p class="project-connection">Öğrencinin projesini inceliyorsunuz. Bu ekranda metinleri değiştiremezsiniz.</p>' : ""}<div class="project-stepper">${STEPS.map(([label], i) => `<button type="button" data-p-action="step" data-step="${i}" class="${i === step ? "active" : ""}" ${i === step ? 'aria-current="step"' : ""}><span>${i + 1}</span>${label}</button>`).join("")}</div><div class="project-work-grid"><section class="card project-writing"><p class="eyebrow">ADIM ${step + 1} / ${STEPS.length}</p><h2>${STEPS[step][0]}</h2><p class="subtitle">${STEPS[step][1]}</p><form id="project-editor"><fieldset ${readOnly ? "disabled" : ""}>${fields()}</fieldset></form><div class="project-step-actions">${step ? '<button class="button secondary" data-p-action="prev">← Önceki adım</button>' : "<span></span>"}${step < 5 ? '<button class="button" data-p-action="next">Sonraki adım →</button>' : '<button class="button" data-p-action="word">↓ Word belgesini indir</button>'}</div></section><aside class="project-coach"><div class="project-ai-card"><span class="project-spark">✦</span><h3>Birlikte geliştirelim.</h3><p>Problemini ve araştırma sorunu yaz. Gemini, kendi araştırman için inceleyip düzenleyebileceğin bir taslak önersin. Proje notların Gemini’ye gönderilir; katılımcı adı veya özel veri paylaşma.</p><button class="button" data-p-action="ai" ${!aiReady || readOnly ? "disabled" : ""}>✧ Yapay zekâ ile taslak hazırla</button><small>${aiReady ? "Öneriler mevcut metnine kendiliğinden yazılmaz. Önce okuyup seçersin." : "Yapay zekâ bağlantısı henüz etkin değil. Yazmaya ve Word indirmeye devam edebilirsin."}</small></div><div class="card project-check-card"><h3>Adım adım ilerliyorsun.</h3><div class="progress"><span style="width:${completed * 10}%"></span></div><p>${completed}/10 kontrol tamamlandı</p><p class="subtitle">Gerçek veriler, kendi cümlelerin ve doğru kaynaklar iyi bir projenin temeli.</p></div>${help()}${setupHelp()}</aside></div><dialog id="project-ai-review" class="setup-dialog"></dialog>`;
    root.querySelector("form").addEventListener("submit", (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
    });
    counts();
    status();
  }
  async function loadList() {
    const token = ++generation,
      user = account;
    loading = true;
    let remote = [];
    try {
      for (let offset = 0; ; offset += 100) {
        const rows = await db.get(
          "od_projects",
          `order=updated_at.desc&limit=100&offset=${offset}`,
        );
        remote.push(...rows);
        if (rows.length < 100) break;
      }
      if (token !== generation || user !== account) return;
      cloud = true;
      cloudError = "";
      const dirty = records.filter((r) => r.owner_id === account && r.dirty);
      records = [
        ...dirty,
        ...remote
          .filter((r) => !dirty.some((d) => d.id === r.id))
          .map((r) => ({
            ...r,
            report: normalizeProject(r.report),
            dirty: false,
          })),
      ];
      cache();
    } catch (err) {
      if (token !== generation) return;
      cloud = false;
      cloudError = err.message;
    } finally {
      if (token === generation) loading = false;
    }
  }
  async function ai() {
    snapshot();
    if (!current || !own()) return;
    if (
      !current.report.problem.trim() ||
      !current.report.question.trim() ||
      !current.report.main_area
    ) {
      toast("Önce ana alanı, problemini ve araştırma sorunu yaz.");
      return;
    }
    const id = current.id,
      token = generation;
    const btn = root.querySelector('[data-p-action="ai"]');
    btn.disabled = true;
    btn.textContent = "Taslak hazırlanıyor…";
    try {
      const result = validateGenerated(
        await db.edge("project-assistant", {
          mode: "draft",
          project: current.report,
        }),
      );
      if (token !== generation || current?.id !== id || !root) return;
      aiResult = result;
      const dlg = root.querySelector("#project-ai-review");
      dlg.innerHTML = `<div class="dialog-head"><h2>Asistanın önerisi — önce sen değerlendir</h2><button class="icon-button" data-p-action="close-ai" aria-label="Öneriyi kapat">×</button></div><p class="project-tip">Yalnızca işaretlediğin bölümler mevcut metninle değiştirilecek. Kaynakları, bulguları ve izinleri kendin doğrula.</p>${result.warnings.map((w) => `<p class="project-connection">${e(w)}</p>`).join("")}${SECTIONS.filter(
        ([k]) => result.sections[k],
      )
        .map(
          ([k, label]) =>
            `<article class="project-ai-section"><label><input type="checkbox" name="ai-section" value="${k}" ${current.report[k].trim() ? "" : "checked"}> ${label}</label><p>${e(result.sections[k])}</p></article>`,
        )
        .join(
          "",
        )}<div class="dialog-actions"><button class="button secondary" data-p-action="close-ai">Vazgeç</button><button class="button" data-p-action="apply-ai">Seçili bölümleri kullan</button></div>`;
      dlg.showModal();
    } catch (err) {
      toast(err.message);
    } finally {
      if (root && current?.id === id) {
        const button = root.querySelector('[data-p-action="ai"]');
        if (button) {
          button.disabled = !aiReady;
          button.textContent = "✧ Yapay zekâ ile taslak hazırla";
        }
      }
    }
  }
  async function act(key, el) {
    if (key === "new") {
      const record = {
        id: crypto.randomUUID(),
        owner_id: account,
        title: "Yeni proje",
        report: blankProject(),
        dirty: true,
      };
      records.unshift(record);
      current = record;
      step = 0;
      cache();
      location.hash = "projects/" + record.id;
      return;
    }
    if (key === "refresh") {
      await mount(root);
      return;
    }
    if (key === "setup") return onSetup();
    if (key === "copy-edge") {
      if (getUser()?.role !== "teacher") return;
      const response = await fetch("./deployment/project-assistant.js");
      if (!response.ok)
        throw Error("Sunucu kodu yüklenemedi. Yayını yenileyin.");
      const code = await response.text();
      try {
        await navigator.clipboard.writeText(code);
        toast(
          "Sunucu kodu kopyalandı. Supabase Edge Function editörüne yapıştırıp project-assistant adıyla yayımlayın.",
        );
      } catch {
        const area = document.createElement("textarea");
        area.value = code;
        area.className = "sql-code";
        area.setAttribute("aria-label", "Gemini sunucu kodu");
        el.parentElement.append(area);
        area.select();
        toast("Kod seçildi; Ctrl+C ile kopyalayın.");
      }
      return;
    }
    if (!current) return;
    if (key === "save") {
      snapshot();
      await save();
      status();
      return;
    }
    if (["next", "prev", "step"].includes(key)) {
      if (own()) snapshot();
      step =
        key === "step"
          ? Number(el.dataset.step)
          : Math.max(0, Math.min(5, step + (key === "next" ? 1 : -1)));
      editor();
      schedule();
      return;
    }
    if (key === "add-task" || key === "remove-task") {
      if (!own()) return;
      snapshot();
      if (key === "add-task") {
        if (current.report.timeline.length >= 20) {
          toast("En fazla 20 iş ekleyebilirsin.");
          return;
        }
        current.report.timeline.push({ task: "", start: "", end: "" });
      } else current.report.timeline.splice(Number(el.dataset.index), 1);
      cache();
      editor();
      schedule();
      return;
    }
    if (key === "word") {
      if (own()) snapshot();
      const project = normalizeProject(current.report);
      const module = await import("./vendor/project-document.js");
      const bytes = await module.buildProjectDocument(project);
      const blob = new Blob([bytes], {
        type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      });
      const url = URL.createObjectURL(blob),
        a = document.createElement("a");
      a.href = url;
      const draft = projectChecks(project).some((c) => !c.ok);
      a.download = `${draft ? "Taslak-" : ""}${(project.title || "TUBITAK-Projem").replace(/[\\/:*?"<>|]/g, "").slice(0, 80)}.docx`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast(
        "Word belgen indirildi. Son sayfa sayısını ve içeriğini Word’de kontrol et.",
      );
      schedule();
      return;
    }
    if (key === "ai") return ai();
    if (key === "close-ai") {
      root.querySelector("#project-ai-review").close();
      aiResult = null;
      return;
    }
    if (key === "apply-ai") {
      if (!own() || !aiResult) return;
      const selected = [
        ...root.querySelectorAll('input[name="ai-section"]:checked'),
      ].map((el) => el.value);
      if (!selected.length) {
        toast("Kullanmak istediğin en az bir bölümü seç.");
        return;
      }
      for (const k of selected)
        if (aiResult.sections[k]) current.report[k] = aiResult.sections[k];
      current.dirty = true;
      aiResult = null;
      cache();
      editor();
      schedule();
      toast("Seçtiğin öneriler taslağına eklendi. Son kontrol sende.");
    }
  }
  async function mount(container, id = "") {
    clearTimeout(timer);
    root = container;
    const user = getUser();
    if (!user) return;
    if (account !== user.id) {
      account = user.id;
      records = localRecords();
      current = null;
      step = 0;
      cloud = false;
      aiReady = false;
      savePromise = null;
    }
    root.innerHTML = '<div class="empty">Proje atölyen hazırlanıyor…</div>';
    if (!boundRoots.has(root)) {
      boundRoots.add(root);
      root.addEventListener("input", () => {
        snapshot();
        schedule();
      });
      root.addEventListener("change", () => {
        snapshot();
        schedule();
      });
      root.addEventListener("click", (ev) => {
        const el = ev.target.closest("[data-p-action]");
        if (!el || el.disabled) return;
        el.disabled = true;
        Promise.resolve(act(el.dataset.pAction, el))
          .catch((err) => toast(err.message))
          .finally(() => {
            if (el.isConnected) el.disabled = false;
          });
      });
    }
    const pendingLoad = loadList(),
      mountGeneration = generation;
    await pendingLoad;
    if (
      mountGeneration !== generation ||
      root !== container ||
      !root?.isConnected ||
      getUser()?.id !== account
    )
      return;
    current = id ? records.find((r) => r.id === id) : null;
    if (id && !current) {
      root.innerHTML =
        '<div class="empty">Bu proje bulunamadı veya görüntüleme iznin yok. <a href="#projects">Projelere dön</a></div>';
      return;
    }
    if (current) {
      editor();
      if (current.dirty && own()) schedule();
    } else dashboard();
    const token = generation;
    db.edge("project-assistant", { mode: "status" })
      .then((status) => {
        if (token !== generation || !root) return;
        aiReady = status.configured === true;
        if (current) {
          const btn = root.querySelector('[data-p-action="ai"]');
          if (btn) {
            btn.disabled = !aiReady || !own();
            const label = btn.nextElementSibling;
            if (label)
              label.textContent = aiReady
                ? "Öneriler mevcut metnine kendiliğinden yazılmaz. Önce okuyup seçersin."
                : "Yapay zekâ bağlantısı henüz etkin değil. Yazmaya ve Word indirmeye devam edebilirsin.";
          }
        }
      })
      .catch(() => {
        if (token === generation) aiReady = false;
      });
  }
  function unmount() {
    clearTimeout(timer);
    ++generation;
    root = null;
  }
  return { mount, unmount };
}
