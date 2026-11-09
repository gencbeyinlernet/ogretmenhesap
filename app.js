import { db, friendlyError } from "./backend.js";
const $ = (s) => document.querySelector(s);
const e = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const today = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Istanbul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
const date = (s) =>
  s
    ? new Date(s.length === 10 ? s + "T12:00:00" : s).toLocaleString("tr-TR", {
        day: "numeric",
        month: "long",
        ...(s.length > 10 ? { hour: "2-digit", minute: "2-digit" } : {}),
      })
    : "—";
const initials = (s) =>
  (s || "Ö")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((s) => s[0])
    .join("")
    .toLocaleUpperCase("tr-TR");
let me = null,
  data = {},
  authMode = "login",
  loadVersion = 0,
  modalSave = null,
  pollTimer = null,
  busy = false,
  toastTimer;
let conversation = { peer: "", a: "", b: "" },
  game = null;
const teacher = () => me?.role === "teacher";
const route = () => location.hash.slice(1) || "home";
const name = (id) =>
  data.contacts?.find((p) => p.id === id)?.display_name ||
  data.contacts?.find((p) => p.id === id)?.username ||
  "Kullanıcı";
const students = () => data.profiles?.filter((p) => p.role === "student") || [];
const labels = {
  home: "Genel bakış",
  students: "Öğrencilerim",
  student: "Öğrenci profili",
  assignments: "Ödevler",
  messages: "Mesajlar",
  monitor: "Konuşma denetimi",
  history: "Etkinlik geçmişi",
  resources: "Oyunlar ve siteler",
  annual: "Yıllık planlar",
  modules: "Ders modülleri",
  activity: "Günlük aktiviteler",
  notes: "Not defterim",
  plan: "Ders programım",
  profile: "Profilim",
  game: "Matematik oyunu",
};
const kinds = {
  annual: "annual",
  modules: "module",
  activity: "activity",
  notes: "note",
  plan: "plan",
};
function toast(s) {
  $("#toast").textContent = s;
  $("#toast").classList.add("visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $("#toast").classList.remove("visible"), 4500);
}
const errorText = (err) => friendlyError(err);
function fail(err) {
  toast(errorText(err));
}
function heading(title, description = "", buttons = "") {
  return `<div class="page-heading"><div><p class="eyebrow">${teacher() ? "ÖĞRETMEN PANELİ" : "ÖĞRENCİ PANELİ"}</p><h1>${e(title)}</h1><p class="subtitle">${e(description)}</p></div>${buttons}</div>`;
}
const button = (action, label, attrs = "", secondary = false) =>
  `<button class="button ${secondary ? "secondary" : ""}" data-action="${action}" ${attrs}>${label}</button>`;
const empty = (text) =>
  `<div class="empty"><span class="empty-icon">✧</span>${e(text)}</div>`;
const field = (key, label, value = "", type = "text", required = false) =>
  `<div class="field"><label for="f-${key}">${e(label)}</label><input id="f-${key}" name="${key}" type="${type}" value="${e(value)}" ${required ? "required" : ""} maxlength="${type === "password" ? 128 : 180}"></div>`;
const textarea = (key, label, value = "", max = 20000) =>
  `<div class="field"><label for="f-${key}">${e(label)}</label><textarea id="f-${key}" name="${key}" maxlength="${max}">${e(value)}</textarea></div>`;
function select(key, label, options, value = "") {
  return `<div class="field"><label for="f-${key}">${e(label)}</label><select id="f-${key}" name="${key}">${options.map(([v, l]) => `<option value="${e(v)}" ${v === value ? "selected" : ""}>${e(l)}</option>`).join("")}</select></div>`;
}
function showModal(title, fields, save) {
  $("#modal-title").textContent = title;
  $("#modal-fields").innerHTML = fields;
  modalSave = save;
  $("#modal").showModal();
}
function shell() {
  const nav = teacher()
    ? [
        "home",
        "students",
        "assignments",
        "messages",
        "monitor",
        "history",
        "resources",
        "plan",
        "annual",
        "modules",
        "activity",
        "notes",
        "profile",
      ]
    : ["home", "assignments", "messages", "resources", "profile"];
  const icons = ["▦", "♧", "▤", "✉", "◉", "◷", "✧"];
  $("#navigation").innerHTML =
    nav
      .map(
        (key, i) =>
          `<a href="#${key}" data-nav="${key}"><span>${icons[i % icons.length]}</span>${labels[key]}</a>`,
      )
      .join("") +
    (me
      ? '<button class="nav-logout" data-action="logout">↪ Güvenli çıkış</button>'
      : "");
  $("#workspace-label").textContent = me
    ? teacher()
      ? "ÖĞRETMEN ÇALIŞMA ALANIM"
      : "ÖĞRENCİ ÇALIŞMA ALANIM"
    : "HOŞ GELDİNİZ";
  $("#side-name").textContent =
    me?.display_name || me?.username || "Öğretmen Defteri";
  $("#side-initials").textContent = initials(me?.display_name || me?.username);
  $("#side-role").textContent = me
    ? teacher()
      ? "Öğretmen hesabı"
      : "Öğrenci hesabı"
    : "Giriş yapın";
  $("#side-role").closest("a").href = me ? "#profile" : "#home";
  $(".sidebar-bottom").hidden = !!me;
}
function login() {
  shell();
  $("#navigation").innerHTML = "";
  $("#content").innerHTML =
    `<div class="auth-layout"><section class="auth-welcome"><p class="eyebrow">BİRLİKTE ÖĞRENİYORUZ</p><h1>Bir öğretmen.<br>Bir sınıf dolusu<br><span>yeni ihtimal.</span></h1><p>Ödevlerin, mesajların ve öğrenme yolculuğun<br>tek bir yerde.</p><div class="auth-illustration" aria-hidden="true">▥ <span>✳</span></div><p class="privacy">Öğrenciler: Bu sistemdeki mesajlarınızı (öğrenciler arası konuşmalar dahil), açtığınız oyun ve kaynakları öğretmeniniz görebilir. Diğer sitelerdeki tarayıcı geçmişiniz izlenmez.</p></section><section class="card auth-card"><p class="eyebrow">ÖĞRETMEN DEFTERİ</p><h2>${authMode === "login" ? "Yeniden hoş geldiniz." : "Öğrenme alanına katılın."}</h2><p class="subtitle">${authMode === "login" ? "Hesabınızla giriş yaparak devam edin." : "Kayıt için yalnızca kullanıcı adı ve şifre yeterli."}</p><div class="auth-tabs"><button data-action="auth-login" class="${authMode === "login" ? "selected" : ""}">Giriş yap</button><button data-action="auth-register" class="${authMode === "register" ? "selected" : ""}">Öğrenci kaydı</button></div><form id="auth-form"><div class="field"><label for="username">Kullanıcı adı</label><input id="username" name="username" autocomplete="username" required pattern="[a-zA-Z0-9_]{3,24}" minlength="3" maxlength="24" placeholder="kullanici_adiniz" autocapitalize="none" spellcheck="false"><small>3–24 karakter: harf (a–z), rakam veya alt çizgi.</small></div><div class="field"><label for="password">Şifre</label><input id="password" name="password" type="password" autocomplete="${authMode === "login" ? "current-password" : "new-password"}" required minlength="6" maxlength="128" placeholder="En az 6 karakter"></div><p class="auth-error" id="auth-error" role="alert"></p><button class="button" type="submit">${authMode === "login" ? "Giriş yap →" : "Öğrenci hesabı oluştur →"}</button></form><p class="notice">${authMode === "register" ? "Hesabınız öğrenci olarak açılır. Öğretmen yetkisi kayıt formundan alınamaz." : "İlk kurulum için sol menüdeki “SQL kurulumu” düğmesini kullanın."}</p></section></div>`;
  $("#breadcrumb").textContent = "Öğretmen ve öğrenci giriş alanı";
}
async function all(table, query = "") {
  let result = [],
    offset = 0;
  for (;;) {
    const rows = await db.get(table, query + "&limit=1000&offset=" + offset);
    result.push(...rows);
    if (rows.length < 1000) break;
    offset += 1000;
  }
  return result;
}
async function load() {
  const queries = {
    contacts: db.rpc("od_contacts"),
    profiles: all("od_profiles", "order=created_at.desc"),
    assignments: all("od_assignments", "order=created_at.desc"),
    recipients: all(
      "od_assignment_recipients",
      "order=assignment_id,student_id",
    ),
    submissions: all("od_submissions", "order=submitted_at.desc"),
    awards: all("od_point_awards", "order=created_at.desc"),
    resources: all("od_resources", "order=created_at.desc"),
  };
  if (teacher())
    queries.entries = all("od_teacher_entries", "order=created_at.desc");
  const values = await Promise.all(Object.values(queries));
  data = Object.fromEntries(Object.keys(queries).map((k, i) => [k, values[i]]));
}
async function init() {
  const version = ++loadVersion;
  clearInterval(pollTimer);
  me = null;
  data = {};
  if (!db.session) {
    login();
    return;
  }
  $("#content").innerHTML = empty("Hesabınız yükleniyor…");
  try {
    const profiles = await db.get("od_profiles", "id=eq." + db.session.user.id);
    if (version !== loadVersion) return;
    if (!profiles[0])
      throw Error(
        "Hesap profili bulunamadı. SQL kurulumunu ve öğrenci kayıt ayarlarını kontrol edin.",
      );
    me = profiles[0];
    await load();
    if (version !== loadVersion) return;
    shell();
    render();
    await log("login", "Sisteme giriş");
  } catch (err) {
    if (version !== loadVersion) return;
    $("#content").innerHTML =
      `<div class="card profile-card"><h2>Hesabınıza bağlanamadık</h2><p class="subtitle">${e(errorText(err))}</p><div class="form-actions">${button("retry", "Yeniden dene")}${button("logout", "Giriş ekranına dön", "", true)}</div></div>`;
  }
}
function studentCard(p) {
  const count = data.recipients.filter((r) => r.student_id === p.id).length,
    submitted = data.submissions.filter((s) => s.student_id === p.id).length;
  return `<a class="student-card" href="#student/${e(p.id)}"><div class="student-card-top"><span class="avatar">${e(initials(p.display_name || p.username))}</span><div><h3>${e(p.display_name || p.username)}</h3><small>@${e(p.username)} · ${e(p.class_name || "Sınıf belirtilmedi")}</small></div></div><div class="student-card-bottom"><span>${submitted}/${count} ödev teslimi</span><span>Profili gör ↗</span></div></a>`;
}
function stat(icon, label, value, suffix = "") {
  return `<div class="stat"><span class="stat-icon">${icon}</span><div><small>${e(label)}</small><strong>${value}</strong><em>${e(suffix)}</em></div></div>`;
}
function points(id) {
  return (
    data.awards
      .filter((a) => a.student_id === id)
      .reduce((a, b) => a + b.points, 0) +
    data.submissions
      .filter((s) => s.student_id === id && s.status === "graded")
      .reduce((a, b) => a + (b.score || 0), 0)
  );
}
function home() {
  const ownSubs = data.submissions.filter((s) => s.student_id === me.id);
  return (
    heading(
      `${me.display_name || me.username}, hoş geldiniz.`,
      teacher()
        ? "Sınıfınızın bütün hikâyesi, tek bir çalışma alanında."
        : "Bugün yeni bir şey öğrenmek için güzel bir gün.",
      teacher()
        ? button("add-assignment", "＋ Ödev gönder")
        : `<a class="button" href="#assignments">Ödevlerime git →</a>`,
    ) +
    `<section class="hero"><div class="hero-text"><p class="eyebrow">HER GÜN YENİ BİR BAŞLANGIÇ</p><h2>${teacher() ? "Bir öğretmen dokunur,<br>bir gelecek değişir." : "Küçük adımlar at,<br>büyük hayaller kur."}</h2><p>${teacher() ? "Öğrencilerinize rehberlik edin, öğrenmeyi birlikte büyütün." : "Ödevlerini tamamla, oyunlarla pratik yap, sorularını paylaş."}</p><a class="text-button" href="#${teacher() ? "plan" : "resources"}">${teacher() ? "Günlük planımı aç" : "Oyunları keşfet"} ↗</a></div><div class="dashboard-flower" aria-hidden="true">✳</div></section><section class="stats">${teacher() ? stat("♧", "Öğrenciler", students().length) + stat("▤", "Gönderilen ödevler", data.assignments.length) + stat("✓", "Değerlendirilecek", data.submissions.filter((s) => s.status === "submitted").length) + stat("✎", "Kişisel kayıtlar", data.entries.length) : stat("▤", "Atanan ödevler", data.assignments.length) + stat("✓", "Teslim ettiklerim", ownSubs.length) + stat("↻", "İade edilenler", ownSubs.filter((s) => s.status === "returned").length) + stat("✧", "Toplam puanım", points(me.id))}</section><div class="columns"><section class="card"><div class="card-head"><h2>${teacher() ? "Son ödevler" : "Ödevlerim"}</h2><a class="text-button" href="#assignments">Tümünü gör ↗</a></div><div class="card-body">${assignmentRows(data.assignments.slice(0, 4))}</div></section><section class="card"><div class="card-head"><h2>${teacher() ? "Bugünün planı" : "Puanlarım ve geri bildirimler"}</h2><a class="text-button" href="#${teacher() ? "plan" : "profile"}">Tümünü gör ↗</a></div><div class="card-body">${teacher() ? entryRows(data.entries.filter((x) => x.scheduled_date === today()).slice(0, 5)) : awardsList(me.id)}</div></section></div>${teacher() ? `<div class="section-title"><h2>Öğrencilerim</h2><a class="text-button" href="#students">Tümünü gör ↗</a></div><div class="student-grid">${students().slice(0, 6).map(studentCard).join("") || empty("Öğrenciler kayıt olduğunda burada görünecek.")}</div>` : `<p class="privacy">Mesajlarınızı ve uygulama içi oyun/kaynak etkinliklerinizi öğretmeniniz görebilir. Bu takip yalnızca bu sistem içindeki etkinlikleri kapsar.</p>`}`
  );
}
function studentList() {
  return (
    heading(
      "Her öğrenci, yeni bir hikâye.",
      "Kayıt olan tüm öğrencileri ve öğrenme süreçlerini takip edin.",
      button("reload", "↻ Yenile", "", true),
    ) +
    `<input class="search" id="student-search" placeholder="İsim, kullanıcı adı veya sınıf ara…" aria-label="Öğrenci ara"><div class="student-grid" id="student-results">${students().map(studentCard).join("") || empty("Henüz kayıtlı öğrenci yok.")}</div>`
  );
}
function awardsList(id) {
  const awards = data.awards.filter((a) => a.student_id === id).slice(0, 10);
  const graded = data.submissions
    .filter((a) => a.student_id === id && a.reviewed_at)
    .slice(0, 5);
  return (
    awards
      .map(
        (a) =>
          `<div class="schedule"><span class="badge">＋${a.points}</span><div class="schedule-info"><strong>${e(a.reason)}</strong><small>${date(a.created_at)}</small></div></div>`,
      )
      .join("") +
      graded
        .map(
          (s) =>
            `<div class="schedule"><span class="badge ${s.status === "returned" ? "warm" : ""}">${s.status === "returned" ? "İade" : s.score + "/100"}</span><div class="schedule-info"><strong>${e(data.assignments.find((a) => a.id === s.assignment_id)?.title)}</strong><small>${e(s.feedback || "Geri bildirim eklenmedi.")}</small></div></div>`,
        )
        .join("") || empty("Henüz puan veya geri bildirim yok.")
  );
}
function studentDetail(id) {
  const p = students().find((p) => p.id === id);
  if (!p) return empty("Öğrenci bulunamadı.");
  return (
    `<a class="back" href="#students">← Öğrencilerime dön</a>` +
    heading(
      p.display_name || p.username,
      "@" + p.username,
      button("award", "＋ Puan ver", `data-id="${e(id)}"`),
    ) +
    `<section class="card profile-card" style="max-width:none;margin-bottom:24px"><div class="profile-banner"><span class="avatar">${e(initials(p.display_name || p.username))}</span><div><h2>${e(p.display_name || p.username)}</h2><p>${e(p.class_name || "Sınıf belirtilmedi")}</p></div></div><div class="detail-info"><div>Okul<strong>${e(p.school || "—")}</strong></div><div>Toplam puan<strong>${points(id)}</strong></div><div>Kayıt tarihi<strong>${date(p.created_at)}</strong></div></div><p class="text-content">${e(p.bio)}</p><a class="button small" href="#messages/${e(id)}">Mesaj gönder</a> <a class="button small secondary" href="#history/${e(id)}">Etkinlik geçmişi</a></section><div class="columns"><section class="card"><div class="card-head"><h2>Ödevler ve teslimler</h2></div><div class="card-body">${assignmentRows(data.assignments.filter((a) => data.recipients.some((r) => r.assignment_id === a.id && r.student_id === id)))}</div></section><section class="card"><div class="card-head"><h2>Puanlar ve geri bildirimler</h2></div><div class="card-body">${awardsList(id)}</div></section></div>`
  );
}
function assignmentRows(items) {
  return (
    items
      .map(
        (a) =>
          `<a class="schedule" href="#assignments/${e(a.id)}"><span class="stat-icon">▤</span><div class="schedule-info"><strong>${e(a.title)}</strong><small>Son teslim: ${date(a.due_date)}</small></div><span class="badge">${teacher() ? data.recipients.filter((r) => r.assignment_id === a.id).length + " öğrenci" : statusLabel(data.submissions.find((s) => s.assignment_id === a.id)?.status)}</span></a>`,
      )
      .join("") || empty("Henüz ödev yok.")
  );
}
const statusLabel = (status) =>
  ({ submitted: "Gönderildi", graded: "Puanlandı", returned: "İade edildi" })[
    status
  ] || "Bekliyor";
function assignments(id) {
  const a = data.assignments.find((a) => a.id === id);
  if (id && !a) return empty("Bu ödev bulunamadı veya size atanmadı.");
  if (!id)
    return (
      heading(
        teacher() ? "Ödevler ve öğrenme adımları." : "Ödevlerim",
        "Ödev gönderin, teslimleri ve geri bildirimleri takip edin.",
        teacher() ? button("add-assignment", "＋ Ödev gönder") : "",
      ) +
      `<section class="card"><div class="card-body">${assignmentRows(data.assignments)}</div></section>`
    );
  const subs = data.submissions.filter((s) => s.assignment_id === id);
  const s = subs.find((s) => s.student_id === me.id);
  return (
    `<a class="back" href="#assignments">← Ödevlere dön</a>` +
    heading(a.title, "Son teslim: " + date(a.due_date)) +
    `<section class="card profile-card" style="max-width:none;margin-bottom:24px"><p class="text-content">${e(a.description || "Açıklama eklenmedi.")}</p></section>` +
    (teacher()
      ? `<section class="card"><div class="card-head"><h2>Öğrenci teslimleri</h2></div><div class="card-body">${data.recipients
          .filter((r) => r.assignment_id === id)
          .map((r) => {
            const sub = subs.find((s) => s.student_id === r.student_id);
            return `<article class="submission"><div class="section-title"><h3>${e(name(r.student_id))}</h3><span class="badge ${sub?.status === "returned" ? "warm" : ""}">${statusLabel(sub?.status)}</span></div>${sub ? `<p class="text-content">${e(sub.content)}</p><p class="subtitle">Teslim: ${date(sub.submitted_at)}${sub.score !== null ? " · Puan: " + sub.score + "/100" : ""}</p>${sub.feedback ? `<p class="feedback">${e(sub.feedback)}</p>` : ""}<button class="button small secondary" data-action="review" data-assignment="${e(id)}" data-student="${e(r.student_id)}">Değerlendir / geri gönder</button>` : '<p class="subtitle">Henüz teslim edilmedi.</p>'}</article>`;
          })
          .join("")}</div></section>`
      : `<section class="card profile-card" style="max-width:none"><h2>Teslimim · ${statusLabel(s?.status)}</h2>${s ? `<p class="text-content">${e(s.content)}</p><p class="subtitle">${date(s.submitted_at)}${s.score !== null ? " · Puan: " + s.score + "/100" : ""}</p>${s.feedback ? `<p class="feedback">Öğretmeniniz: ${e(s.feedback)}</p>` : ""}` : ""}${!s || s.status === "returned" ? `<form id="submission-form" data-id="${e(id)}">${textarea("content", "Yanıtınız (metin veya çalışma bağlantısı)", s?.content || "")}<button class="button">${s ? "Düzelterek tekrar gönder" : "Öğretmene gönder"}</button></form>` : '<p class="notice">Tesliminiz kaydedildi. Öğretmeniniz geri gönderirse düzenleyerek yeniden teslim edebilirsiniz.</p>'}</section>`)
  );
}
function entryRows(items) {
  return (
    items
      .map(
        (x) =>
          `<div class="schedule"><span class="time">${e(x.scheduled_time?.slice(0, 5) || "✎")}</span><div class="schedule-info"><strong>${e(x.title)}</strong><small>${date(x.scheduled_date)} · ${e(x.body.slice(0, 80))}</small></div></div>`,
      )
      .join("") || empty("Henüz kayıt eklenmedi.")
  );
}
function entriesPage(page) {
  const kind = kinds[page];
  return (
    heading(
      labels[page],
      "Öğretmene özel alanınız. Bu kayıtları öğrenciler göremez.",
      button("entry", "＋ Yeni kayıt", `data-kind="${kind}"`),
    ) +
    `<div class="note-grid">${
      data.entries
        .filter((x) => x.kind === kind)
        .map(
          (x) =>
            `<article class="note"><h3>${e(x.title)}</h3><p>${e(x.body)}</p><div class="note-foot"><span>${date(x.scheduled_date || x.created_at)} ${e(x.scheduled_time?.slice(0, 5) || "")}</span><div><button class="text-button" data-action="entry" data-kind="${kind}" data-id="${e(x.id)}">Düzenle</button> <button class="icon-button" data-action="delete-entry" data-id="${e(x.id)}" aria-label="Kaydı sil">×</button></div></div></article>`,
        )
        .join("") ||
      `<div class="card full">${empty("İlk kaydınızı ekleyerek başlayın.")}</div>`
    }</div>`
  );
}
function resourcePage() {
  return (
    heading(
      "Öğrenmenin keyifli yolları.",
      "Oyunlar ve öğretmeninizin seçtiği kaynaklar.",
      teacher() ? button("add-resource", "＋ Kaynak ekle") : "",
    ) +
    `<div class="student-grid"><a class="student-card" href="#game"><p class="eyebrow">UYGULAMA İÇİ OYUN</p><h3>✧ Matematik Atölyesi</h3><p class="subtitle">10 soruda dört işlem becerini test et.</p><div class="student-card-bottom"><span>Her seferinde yeni sorular</span><span>Oyna →</span></div></a>${data.resources.map((r) => `<article class="student-card"><p class="eyebrow">${r.kind === "game" ? "OYUN" : "WEB KAYNAĞI"}</p><h3>${e(r.title)}</h3><p class="subtitle resource-url">${e(r.url)}</p><div class="student-card-bottom"><button class="text-button" data-action="open-resource" data-id="${e(r.id)}">Kaynağı aç ↗</button>${teacher() ? `<button class="icon-button" data-action="delete-resource" data-id="${e(r.id)}" aria-label="Kaynağı sil">×</button>` : ""}</div></article>`).join("")}</div><p class="privacy">${teacher() ? "Öğrencilerin bu alandan açtığı kaynaklar ve tamamladığı oyunlar etkinlik geçmişine kaydedilir." : "Bu alandan açtığınız oyun ve sitenin adı ile açılma zamanı öğretmeninize kaydedilir. Harici sitede ne yaptığınız veya başka sitelere geçişiniz izlenmez."}</p>`
  );
}
function profile() {
  return (
    heading("Size ait bir alan.", "Profil bilgilerinizi güncelleyin.") +
    `<section class="card profile-card"><div class="profile-banner"><span class="avatar">${e(initials(me.display_name || me.username))}</span><div><h2>${e(me.display_name || me.username)}</h2><p>@${e(me.username)} · ${teacher() ? "Öğretmen" : "Öğrenci"}</p></div></div><form id="profile-form"><div class="form-grid">${field("display_name", "Ad soyad", me.display_name, "text", true)}${field("school", "Okul", me.school)}${field("class_name", teacher() ? "Branş / sınıf" : "Sınıf", me.class_name)}</div>${textarea("bio", "Hakkımda", me.bio, 3000)}<button class="button">Profilimi kaydet</button></form><hr class="divider"><h2>Şifremi değiştir</h2><p class="notice">En az 6 karakter kullanın. Gerçek e-posta alınmadığından e-posta ile şifre sıfırlama yoktur.</p><form id="password-form">${field("password", "Yeni şifre", "", "password", true)}${field("confirmation", "Yeni şifre tekrar", "", "password", true)}<button class="button secondary">Şifreyi güncelle</button></form>${!teacher() ? `<hr class="divider"><h2>Puanlarım</h2><p class="subtitle">Toplam ${points(me.id)} puan</p>${awardsList(me.id)}<p class="privacy">Öğretmeniniz mesajlarınızı ve bu sistem içindeki etkinliklerinizi görebilir. Diğer öğrenciler özel profil bilgilerinize erişemez; mesajlaşmak için yalnızca adınızı ve kullanıcı adınızı görebilirler.</p>` : ""}</section>`
  );
}
function contactsOptions(excludeMe = false) {
  return data.contacts
    .filter((p) => !excludeMe || p.id !== me.id)
    .map((p) => [
      p.id,
      (p.display_name || p.username) +
        " (@" +
        p.username +
        ")" +
        (p.role === "teacher" ? " · Öğretmen" : ""),
    ]);
}
function messages(monitor = false, peer = "") {
  const contacts = contactsOptions(true);
  if (monitor) {
    const options = contactsOptions(false);
    conversation.a = options.some((x) => x[0] === conversation.a)
      ? conversation.a
      : options[0]?.[0] || "";
    conversation.b =
      options.some((x) => x[0] === conversation.b) &&
      conversation.b !== conversation.a
        ? conversation.b
        : options.find((x) => x[0] !== conversation.a)?.[0] || "";
  } else
    conversation.peer = contacts.some((x) => x[0] === peer)
      ? peer
      : contacts.some((x) => x[0] === conversation.peer)
        ? conversation.peer
        : contacts[0]?.[0] || "";
  return (
    heading(
      monitor ? "Konuşma denetimi" : "Mesajlar",
      monitor
        ? "İki kişi seçerek aralarındaki konuşmayı inceleyin."
        : "Mesajları yalnızca konuşmadaki iki kişi ve öğretmen görebilir.",
    ) +
    `<section class="card chat-card"><div class="chat-controls">${monitor ? select("person-a", "Birinci kişi", contactsOptions(false), conversation.a) + select("person-b", "İkinci kişi", contactsOptions(false), conversation.b) : select("peer", "Kime mesaj göndermek istersiniz?", contacts, conversation.peer)}<button class="button small secondary" data-action="refresh-chat">↻ Yenile</button></div><p class="notice chat-notice">Öğretmen tüm konuşmaları görebilir. Son 200 mesaj gösterilir; eski mesajlar için aşağıdaki düğmeyi kullanın.</p><div class="chat-log" id="chat-log" aria-label="Konuşma" aria-live="polite">${empty("Konuşma yükleniyor…")}</div><div class="chat-bottom"><button class="text-button" data-action="older-messages" id="older-messages" hidden>Önceki mesajları yükle</button><p class="auth-error" id="chat-error" role="alert"></p>${monitor ? '<p class="subtitle">Bu ekranda konuşmaları yalnızca okuyabilirsiniz.</p>' : `<form id="message-form"><label class="sr-only" for="message-body">Mesajınız</label><textarea id="message-body" name="body" required maxlength="5000" placeholder="Mesajınızı yazın…" rows="2"></textarea><button class="button">Gönder →</button></form>`}</div></section>`
  );
}
let historyOffset = 0,
  historyFilter = "";
function historyPage(id = "") {
  historyOffset = 0;
  historyFilter = id;
  return (
    heading(
      "Öğrencilerimin öğrenme izleri.",
      "Yalnızca uygulama içi sayfa, oyun ve kaynak açılışları. Kayıtlar tarayıcı geçmişi değildir.",
    ) +
    `<section class="card"><div class="card-head">${select("history-student", "Öğrenci", [["", "Tüm öğrenciler"], ...students().map((p) => [p.id, p.display_name || p.username])], id)}<button class="button small secondary" data-action="refresh-history">↻ Yenile</button></div><div id="history-log" class="card-body">${empty("Geçmiş yükleniyor…")}</div><div class="card-body"><button class="text-button" data-action="older-history" id="older-history" hidden>Daha eski kayıtlar</button></div></section>`
  );
}
async function log(type, label, url = null, score = null) {
  if (!me || teacher()) return;
  try {
    await db.insert("od_activity_log", {
      student_id: me.id,
      event_type: type,
      label,
      url,
      score,
    });
  } catch (err) {
    toast("Etkinlik kaydı gönderilemedi: " + errorText(err));
  }
}
function gamePage() {
  if (!game)
    game = {
      index: 0,
      correct: 0,
      questions: Array.from({ length: 10 }, () => {
        const a = 1 + Math.floor(Math.random() * 12),
          b = 1 + Math.floor(Math.random() * 12),
          op = ["+", "−", "×"][Math.floor(Math.random() * 3)];
        return {
          a,
          b,
          op,
          answer: op === "+" ? a + b : op === "−" ? a - b : a * b,
        };
      }),
    };
  if (game.index >= 10)
    return (
      heading("Harika bir çalışma!", "Oyun tamamlandı.") +
      `<section class="card game-card"><div class="game-score">${game.correct * 10}<small>/ 100</small></div><h2>10 soruda ${game.correct} doğru</h2><p class="subtitle">${teacher() ? "Öğretmen denemeleri öğrenci geçmişine yazılmaz." : "Oyun sonucunuz öğretmeninize kaydedildi (bağlantı hatası varsa uyarıyı kontrol edin)."}</p><br>${button("restart-game", "Yeniden oyna")}</section>`
    );
  const q = game.questions[game.index];
  return (
    heading("Matematik Atölyesi", "Dört işlemle zihnini çalıştır.") +
    `<section class="card game-card"><p class="eyebrow">SORU ${game.index + 1} / 10</p><div class="game-question">${q.a} ${q.op} ${q.b} = ?</div><form id="game-form"><label for="game-answer">Cevabınız</label><input id="game-answer" name="answer" type="number" required autocomplete="off" autofocus><button class="button">Cevapla →</button></form><p class="subtitle">${game.correct} doğru cevap</p></section>`
  );
}
function render() {
  if (!me) {
    login();
    return;
  }
  clearInterval(pollTimer);
  const [page, id] = route().split("/");
  const teacherPages = [
    "students",
    "student",
    "monitor",
    "history",
    ...Object.keys(kinds),
  ];
  if (teacherPages.includes(page) && !teacher()) {
    location.hash = "home";
    return;
  }
  let html;
  if (page === "home") html = home();
  else if (page === "students") html = studentList();
  else if (page === "student") html = studentDetail(id);
  else if (page === "assignments") html = assignments(id);
  else if (kinds[page]) html = entriesPage(page);
  else if (page === "resources") html = resourcePage();
  else if (page === "profile") html = profile();
  else if (page === "messages" || page === "monitor")
    html = messages(page === "monitor", id);
  else if (page === "history") html = historyPage(id);
  else if (page === "game") html = gamePage();
  else html = home();
  $("#content").innerHTML = html;
  document
    .querySelectorAll("[data-nav]")
    .forEach((a) =>
      a.classList.toggle(
        "active",
        a.dataset.nav === (page === "student" ? "students" : page),
      ),
    );
  $("#breadcrumb").innerHTML =
    `${teacher() ? "Öğretmen paneli" : "Öğrenci paneli"} <span>/</span> ${e(labels[page] || "Genel bakış")}`;
  document.title = (labels[page] || "Genel bakış") + " · Öğretmen Defteri";
  if (page === "messages" || page === "monitor") {
    resetChat();
    pollTimer = setInterval(() => {
      if (!document.hidden) loadChat(false).catch(chatError);
    }, 10000);
  }
  if (page === "history") loadHistory(true).catch(fail);
}
let chatRows = [],
  chatPair = "",
  chatMore = false,
  chatRequest = 0;
function pair() {
  return route().startsWith("monitor")
    ? [conversation.a, conversation.b]
    : [me.id, conversation.peer];
}
function chatError(err) {
  if ($("#chat-error")) $("#chat-error").textContent = errorText(err);
}
function resetChat() {
  chatRows = [];
  chatMore = false;
  chatPair = "";
  loadChat(false).catch(chatError);
}
async function loadChat(older = false) {
  if (!$("#chat-log")) return;
  const [a, b] = pair();
  if (!a || !b || a === b) {
    $("#chat-log").innerHTML = empty(
      "Konuşmak için iki farklı kullanıcı seçin.",
    );
    return;
  }
  const current = a + ":" + b;
  const requestId = ++chatRequest;
  const cursor =
    older && chatRows.length
      ? "&created_at=lt." + encodeURIComponent(chatRows[0].created_at)
      : "";
  const rows = await db.get(
    "od_messages",
    `or=(and(sender_id.eq.${a},recipient_id.eq.${b}),and(sender_id.eq.${b},recipient_id.eq.${a}))&order=created_at.desc,id.desc&limit=200${cursor}`,
  );
  if (
    requestId !== chatRequest ||
    !$("#chat-log") ||
    pair().join(":") !== current
  )
    return;
  chatPair = current;
  const newRows = [...rows].reverse();
  if (older) chatRows = [...newRows, ...chatRows];
  else {
    const map = new Map([...chatRows, ...newRows].map((m) => [m.id, m]));
    chatRows = [...map.values()].sort(
      (a, b) =>
        a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id),
    );
  }
  chatMore = rows.length === 200;
  const nearBottom =
    $("#chat-log").scrollHeight -
      $("#chat-log").scrollTop -
      $("#chat-log").clientHeight <
    100;
  $("#chat-log").innerHTML =
    chatRows
      .map(
        (m) =>
          `<article class="message ${m.sender_id === me.id ? "mine" : ""}"><strong>${e(name(m.sender_id))}</strong><p>${e(m.body)}</p><small>${date(m.created_at)}</small></article>`,
      )
      .join("") || empty("Henüz mesaj yok. İlk mesajı siz gönderin.");
  $("#older-messages").hidden = !chatMore;
  $("#chat-error").textContent = "";
  if (nearBottom && !older)
    $("#chat-log").scrollTop = $("#chat-log").scrollHeight;
}
async function loadHistory(reset = false) {
  if (!teacher() || !$("#history-log")) return;
  const filter = historyFilter;
  const offset = reset ? 0 : historyOffset;
  const rows = await db.get(
    "od_activity_log",
    (filter ? "student_id=eq." + filter + "&" : "") +
      "order=created_at.desc,id.desc&limit=100&offset=" +
      offset,
  );
  if (!$("#history-log") || filter !== historyFilter) return;
  historyOffset = offset + rows.length;
  const html = rows
    .map(
      (r) =>
        `<div class="schedule"><span class="badge">${e({ login: "Giriş", page: "Sayfa", game: "Oyun", resource: "Kaynak" }[r.event_type])}</span><div class="schedule-info"><strong>${e(name(r.student_id))} · ${e(r.label)}</strong><small>${date(r.created_at)}${r.score !== null ? " · Sonuç: " + r.score + "/100" : ""}${r.url ? " · " + e(r.url) : ""}</small></div></div>`,
    )
    .join("");
  if (reset)
    $("#history-log").innerHTML = html || empty("Henüz etkinlik kaydı yok.");
  else $("#history-log").insertAdjacentHTML("beforeend", html);
  $("#older-history").hidden = rows.length < 100;
}
async function refreshPage() {
  await load();
  shell();
  render();
}
async function setup() {
  const dlg = $("#setup-dialog");
  dlg.innerHTML = `<div class="dialog-head"><h2>Supabase kurulumu</h2><button class="icon-button" data-action="close-sql" aria-label="SQL penceresini kapat">×</button></div><p class="subtitle">Proje: <strong>rfmelsdtasxoddtolqpb</strong></p><ol class="setup-steps"><li>Öğretmen başlangıç şifresini aşağıya girin. Bu alan yalnızca kopyalanan SQL'e eklenir; dosyalara kaydedilmez.</li><li>SQL'i kopyalayıp <a href="https://supabase.com/dashboard/project/rfmelsdtasxoddtolqpb/sql/new" target="_blank" rel="noopener noreferrer">Supabase SQL Editor</a> içinde çalıştırın.</li><li><strong>Authentication → Sign In / Providers → Email</strong> bölümünde e-posta ile girişi açık tutun, <strong>Confirm email</strong> seçeneğini kapatın. Kayıtta gerçek e-posta alınmaz.</li><li>Bu pencereyi kapatın, <strong>burakturgut</strong> kullanıcı adı ve belirlediğiniz şifreyle giriş yapın.</li></ol><div class="field"><label for="setup-password">Öğretmen başlangıç şifresi</label><input type="password" id="setup-password" minlength="6" maxlength="128" autocomplete="new-password" placeholder="İstediğiniz başlangıç şifresini girin"></div><p class="notice">Tekrar çalıştırmak mevcut verileri veya öğretmen parolasını değiştirmez. Öğretmen parolası SQL içinde şifrelenerek saklanır. SQL'i paylaşmayın.</p><label class="sr-only" for="setup-sql">Kurulum SQL kodu</label><textarea id="setup-sql" class="sql-code" readonly spellcheck="false">SQL yükleniyor…</textarea><div class="dialog-actions">${button("copy-sql", "SQL kodunu kopyala")}${button("close-sql", "Kapat", "", true)}</div><p id="setup-status" role="status"></p>`;
  dlg.showModal();
  try {
    const response = await fetch("./supabase/schema.sql");
    if (!response.ok) throw Error("SQL dosyası yüklenemedi.");
    const sql = await response.text();
    dlg.dataset.template = sql;
    $("#setup-sql").value = sql;
  } catch (err) {
    $("#setup-status").textContent = errorText(err);
  }
}
async function action(key, el) {
  if (key === "sql") return setup();
  if (key === "close-sql") {
    $("#setup-dialog").close();
    $("#setup-dialog").innerHTML = "";
    delete $("#setup-dialog").dataset.template;
    return;
  }
  if (key === "copy-sql") {
    const password = $("#setup-password").value;
    if (password.length < 6) {
      $("#setup-status").textContent =
        "En az 6 karakterli başlangıç şifresi girin.";
      $("#setup-password").focus();
      return;
    }
    const sql = $("#setup-dialog").dataset.template;
    if (!sql) throw Error("SQL dosyası henüz yüklenmedi.");
    if (password.includes("$$"))
      throw Error(
        "Başlangıç şifresinde $$ dizisini kullanmayın. Girişten sonra şifrenizi değiştirebilirsiniz.",
      );
    $("#setup-sql").value = sql.replace("__TEACHER_PASSWORD__", () =>
      password.replaceAll("'", "''"),
    );
    try {
      await navigator.clipboard.writeText($("#setup-sql").value);
      $("#setup-status").textContent =
        "SQL kopyalandı. Supabase SQL Editor içine yapıştırıp Run düğmesine basın.";
    } catch {
      $("#setup-sql").focus();
      $("#setup-sql").select();
      $("#setup-status").textContent =
        "Otomatik kopyalama kullanılamadı. Seçili SQL’i Ctrl+C ile kopyalayın.";
    }
    return;
  }
  if (key === "auth-login" || key === "auth-register") {
    authMode = key === "auth-login" ? "login" : "register";
    login();
    return;
  }
  if (key === "logout") {
    ++loadVersion;
    clearInterval(pollTimer);
    try {
      await db.signOut();
    } catch {}
    me = null;
    data = {};
    game = null;
    authMode = "login";
    location.hash = "home";
    shell();
    login();
    return;
  }
  if (key === "retry") return init();
  if (!me) return;
  if (key === "reload") {
    await refreshPage();
    toast("Bilgiler yenilendi.");
  }
  if (key === "add-assignment" && teacher()) {
    if (!students().length)
      throw Error("Önce en az bir öğrencinin kayıt olması gerekiyor.");
    showModal(
      "Ödev gönder",
      field("title", "Ödev başlığı", "", "text", true) +
        textarea("description", "Açıklama ve yönergeler") +
        field("due_date", "Son teslim tarihi", today(), "date", true) +
        `<fieldset class="recipient-list"><legend>Gönderilecek öğrenciler</legend><label><input type="checkbox" id="select-all-students"> Tüm öğrencileri seç</label>${students()
          .map(
            (p) =>
              `<label><input type="checkbox" name="students" value="${e(p.id)}"> ${e(p.display_name || p.username)} (@${e(p.username)})</label>`,
          )
          .join("")}</fieldset>`,
      async (form) => {
        const ids = form.getAll("students");
        if (!ids.length) throw Error("En az bir öğrenci seçin.");
        await db.rpc("od_create_assignment", {
          p_title: form.get("title"),
          p_description: form.get("description"),
          p_due_date: form.get("due_date"),
          p_students: ids,
        });
      },
    );
  }
  if (key === "review" && teacher()) {
    const s = data.submissions.find(
      (s) =>
        s.assignment_id === el.dataset.assignment &&
        s.student_id === el.dataset.student,
    );
    showModal(
      name(el.dataset.student) + " · Değerlendirme",
      select(
        "status",
        "İşlem",
        [
          ["graded", "Puanla"],
          ["returned", "Düzeltmesi için geri gönder"],
        ],
        s.status === "returned" ? "returned" : "graded",
      ) +
        field("score", "Puan (0–100)", s.score ?? "", "number") +
        textarea("feedback", "Öğrenciye geri bildirim", s.feedback, 5000),
      async (form) => {
        const score = form.get("score");
        if (
          form.get("status") === "graded" &&
          (score === "" ||
            !Number.isInteger(Number(score)) ||
            Number(score) < 0 ||
            Number(score) > 100)
        )
          throw Error("0–100 arasında tam sayı puan girin.");
        await db.rpc("od_review_submission", {
          p_assignment: s.assignment_id,
          p_student: s.student_id,
          p_status: form.get("status"),
          p_score: form.get("status") === "graded" ? Number(score) : null,
          p_feedback: form.get("feedback"),
        });
      },
    );
    $("#f-score").min = 0;
    $("#f-score").max = 100;
  }
  if (key === "award" && teacher()) {
    showModal(
      name(el.dataset.id) + " · Ek puan",
      field("points", "Puan (1–1000)", "", "number", true) +
        field("reason", "Puanın nedeni", "", "text", true),
      async (form) => {
        await db.insert("od_point_awards", {
          student_id: el.dataset.id,
          awarded_by: me.id,
          points: Number(form.get("points")),
          reason: form.get("reason"),
        });
      },
    );
    $("#f-points").min = 1;
    $("#f-points").max = 1000;
  }
  if (key === "entry" && teacher()) {
    const x = data.entries.find((x) => x.id === el.dataset.id) || {};
    showModal(
      x.id ? "Kaydı düzenle" : "Yeni kayıt",
      field("title", "Başlık", x.title, "text", true) +
        textarea("body", "İçerik", x.body) +
        field("scheduled_date", "Tarih", x.scheduled_date || today(), "date") +
        field(
          "scheduled_time",
          "Saat",
          x.scheduled_time?.slice(0, 5) || "",
          "time",
        ),
      async (form) => {
        const body = Object.fromEntries(form);
        body.scheduled_date ||= null;
        body.scheduled_time ||= null;
        if (x.id) await db.update("od_teacher_entries", "id=eq." + x.id, body);
        else
          await db.insert("od_teacher_entries", {
            ...body,
            owner_id: me.id,
            kind: el.dataset.kind,
          });
      },
    );
  }
  if (key === "add-resource" && teacher())
    showModal(
      "Oyun veya site ekle",
      field("title", "Kaynak adı", "", "text", true) +
        field("url", "HTTPS bağlantısı", "", "url", true) +
        select("kind", "Tür", [
          ["site", "Web sitesi"],
          ["game", "Oyun"],
        ]),
      async (form) => {
        const url = new URL(form.get("url"));
        if (url.protocol !== "https:")
          throw Error("https:// ile başlayan bir adres girin.");
        await db.insert("od_resources", {
          created_by: me.id,
          ...Object.fromEntries(form),
        });
      },
    );
  if (key === "delete-entry" || key === "delete-resource") {
    if (!teacher() || !confirm("Bu kayıt silinsin mi?")) return;
    await db.remove(
      key === "delete-entry" ? "od_teacher_entries" : "od_resources",
      "id=eq." + el.dataset.id,
    );
    await refreshPage();
    toast("Kayıt silindi.");
  }
  if (key === "open-resource") {
    const r = data.resources.find((r) => r.id === el.dataset.id);
    if (!r) return;
    const url = new URL(r.url);
    if (url.protocol !== "https:") throw Error("Geçersiz kaynak bağlantısı.");
    const win = window.open("about:blank", "_blank");
    if (win) win.opener = null;
    await log("resource", r.title, r.url);
    if (win) win.location = url.href;
    else
      toast(
        "Tarayıcı yeni pencereyi engelledi. Bu site için açılır pencerelere izin verin.",
      );
  }
  if (key === "refresh-chat") await loadChat(false);
  if (key === "older-messages") await loadChat(true);
  if (key === "refresh-history") await loadHistory(true);
  if (key === "older-history") await loadHistory(false);
  if (key === "restart-game") {
    game = null;
    await log("game", "Matematik Atölyesi başlatıldı");
    render();
  }
}
async function submit(form) {
  if (form.id === "auth-form") {
    const username = form.username.value.trim().toLowerCase(),
      password = form.password.value;
    if (!/^[a-z0-9_]{3,24}$/.test(username))
      throw Error(
        "Kullanıcı adında yalnızca a–z harfleri, rakamlar ve alt çizgi kullanın.",
      );
    if (authMode === "register" && username === "burakturgut")
      throw Error("Bu kullanıcı adı öğretmen hesabına ayrılmıştır.");
    if (authMode === "login") await db.signIn(username, password);
    else {
      const result = await db.signUp(username, password);
      if (!result.access_token)
        throw Error(
          "Hesap için oturum açılamadı. Supabase Email sağlayıcısında Confirm email seçeneğini kapatın. Önceki onaysız hesabı Authentication → Users bölümünden kaldırıp yeniden kaydolun.",
        );
    }
    await init();
    return;
  }
  if (form.id === "modal-form") {
    const formData = new FormData(form);
    for (const [key, value] of formData.entries())
      if (typeof value === "string" && key !== "students")
        formData.set(key, value.trim());
    await modalSave(formData);
    $("#modal").close();
    await refreshPage();
    toast("Kaydedildi.");
    return;
  }
  if (!me) return;
  if (form.id === "profile-form") {
    const body = Object.fromEntries(new FormData(form));
    if (!body.display_name.trim()) throw Error("Ad soyad boş olamaz.");
    await db.update("od_profiles", "id=eq." + me.id, body);
    me = { ...me, ...body };
    await refreshPage();
    toast("Profiliniz kaydedildi.");
  }
  if (form.id === "password-form") {
    if (form.password.value.length < 6)
      throw Error("Şifre en az 6 karakter olmalı.");
    if (form.password.value !== form.confirmation.value)
      throw Error("Şifreler eşleşmiyor.");
    await db.changePassword(form.password.value);
    form.reset();
    toast("Şifreniz güncellendi.");
  }
  if (form.id === "submission-form") {
    const content = form.content.value.trim();
    if (!content) throw Error("Teslim içeriği boş olamaz.");
    await db.rpc("od_submit_assignment", {
      p_assignment: form.dataset.id,
      p_content: content,
    });
    await refreshPage();
    toast("Ödeviniz öğretmeninize gönderildi.");
  }
  if (form.id === "message-form") {
    const body = form.body.value.trim();
    if (!body) throw Error("Mesajınız boş olamaz.");
    if (!conversation.peer) throw Error("Mesaj göndermek için bir kişi seçin.");
    await db.insert("od_messages", {
      sender_id: me.id,
      recipient_id: conversation.peer,
      body,
    });
    form.reset();
    await loadChat(false);
    $("#chat-log").scrollTop = $("#chat-log").scrollHeight;
  }
  if (form.id === "game-form") {
    const answer = Number(form.answer.value);
    if (answer === game.questions[game.index].answer) game.correct++;
    game.index++;
    if (game.index === 10)
      await log(
        "game",
        "Matematik Atölyesi tamamlandı",
        null,
        game.correct * 10,
      );
    render();
  }
}
// A shared guard prevents double submits while preserving entered values on failures.
document.addEventListener("click", (event) => {
  const el = event.target.closest("[data-action]");
  if (!el) return;
  const key = el.dataset.action;
  if (busy && !["close-sql"].includes(key)) return;
  el.disabled = true;
  Promise.resolve(action(key, el))
    .catch(fail)
    .finally(() => (el.disabled = false));
});
document.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (busy) return;
  busy = true;
  const form = event.target,
    btn = form.querySelector('button[type="submit"],button:not([type])');
  if (btn) btn.disabled = true;
  if (form.id === "auth-form") $("#auth-error").textContent = "";
  try {
    await submit(form);
  } catch (err) {
    if (form.id === "auth-form" && $("#auth-error"))
      $("#auth-error").textContent = errorText(err);
    else if (form.id === "message-form") chatError(err);
    else fail(err);
  } finally {
    busy = false;
    if (btn) btn.disabled = false;
  }
});
document.addEventListener("input", (event) => {
  if (event.target.id === "student-search") {
    const q = event.target.value.toLocaleLowerCase("tr-TR");
    const filtered = students().filter((p) =>
      [p.username, p.display_name, p.class_name]
        .join(" ")
        .toLocaleLowerCase("tr-TR")
        .includes(q),
    );
    $("#student-results").innerHTML =
      filtered.map(studentCard).join("") ||
      empty("Eşleşen öğrenci bulunamadı.");
  }
});
document.addEventListener("change", (event) => {
  const el = event.target;
  if (el.id === "select-all-students")
    document
      .querySelectorAll('input[name="students"]')
      .forEach((x) => (x.checked = el.checked));
  if (el.id === "f-peer") {
    conversation.peer = el.value;
    resetChat();
  }
  if (el.id === "f-person-a" || el.id === "f-person-b") {
    conversation[el.id === "f-person-a" ? "a" : "b"] = el.value;
    resetChat();
  }
  if (el.id === "f-history-student") {
    historyFilter = el.value;
    loadHistory(true).catch(fail);
  }
});
$("#close-modal").onclick = $("#cancel-modal").onclick = () =>
  $("#modal").close();
$("#setup-dialog").addEventListener("close", () => {
  $("#setup-dialog").innerHTML = "";
  delete $("#setup-dialog").dataset.template;
});
window.addEventListener("od-signed-out", () => {
  me = null;
  data = {};
  clearInterval(pollTimer);
  login();
  toast("Oturumunuz sona erdi. Lütfen yeniden giriş yapın.");
});
window.addEventListener("storage", (event) => {
  if (event.key === "od-supabase-session-v1") location.reload();
});
window.addEventListener("hashchange", () => {
  if (me) {
    render();
    log("page", labels[route().split("/")[0]] || "Genel bakış");
    if (route() === "game") log("game", "Matematik Atölyesi başlatıldı");
  } else login();
  window.scrollTo(0, 0);
});
$("#today").textContent =
  "◷ " +
  new Date().toLocaleDateString("tr-TR", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Europe/Istanbul",
  });
init();
