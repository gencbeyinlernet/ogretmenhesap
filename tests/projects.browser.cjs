const APP_URL = process.env.TEST_BASE_URL || "http://127.0.0.1:8000";
// Project UI contract uses simulated HTTP; database policies and Gemini server code are tested separately.
const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const JSZip = require("jszip");
const { mkdirSync, readFileSync } = require("node:fs");
const BASE = "https://rfmelsdtasxoddtolqpb.supabase.co";
const ids = {
  teacher: "11111111-1111-4111-8111-111111111111",
  student: "22222222-2222-4222-8222-222222222222",
  other: "33333333-3333-4333-8333-333333333333",
};
const profiles = Object.entries(ids).map(([key, id]) => ({
  id,
  role: key === "teacher" ? "teacher" : "student",
  username: key === "teacher" ? "burakturgut" : key,
  display_name: key === "teacher" ? "Burak" : "Deniz",
  bio: "",
  school: "",
  class_name: "",
  created_at: new Date().toISOString(),
}));
const rows = [];
let aiCalls = 0,
  conflict = false;
async function transport(route, { offline = false } = {}) {
  const req = route.request(),
    url = new URL(req.url()),
    actor = req.headers().authorization?.replace("Bearer ", ""),
    method = req.method(),
    body = req.postDataJSON(),
    table = url.pathname.split("/").pop();
  if (url.pathname.includes("/functions/")) {
    if (offline)
      return route.fulfill({ status: 404, json: { message: "Not deployed" } });
    if (body.mode === "status")
      return route.fulfill({
        json: { configured: true, model: "gemini-2.5-flash" },
      });
    aiCalls++;
    assert.equal(body.project.problem, "Okulumuzda enerji israfı");
    return route.fulfill({
      json: {
        sections: {
          purpose: "Gemini taslak amacı — öğrenci incelemesi gerekir.",
          findings: "Henüz veri toplanmamıştır. <img src=x onerror=alert(1)>",
        },
        warnings: ["Gerçek verilerinle güncelle."],
      },
    });
  }
  if (table === "od_projects") {
    if (offline)
      return route.fulfill({
        status: 404,
        json: { code: "PGRST205", message: "Missing project table" },
      });
    const visible = (r) => r.owner_id === actor || actor === ids.teacher;
    if (method === "GET")
      return route.fulfill({
        json: rows
          .filter(visible)
          .filter(
            (r) =>
              !url.searchParams.has("id") ||
              r.id === url.searchParams.get("id").slice(3),
          ),
      });
    if (method === "POST") {
      assert.equal(body.owner_id, actor);
      const row = {
        ...body,
        revision: 1,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      rows.push(row);
      return route.fulfill({ status: 201, json: [row] });
    }
    if (method === "PATCH") {
      if (conflict) {
        conflict = false;
        return route.fulfill({ json: [] });
      }
      const row = rows.find(
        (r) =>
          r.id === url.searchParams.get("id").slice(3) &&
          r.owner_id === actor &&
          r.revision === Number(url.searchParams.get("revision").slice(3)),
      );
      if (!row) return route.fulfill({ json: [] });
      Object.assign(row, body, {
        revision: row.revision + 1,
        updated_at: new Date().toISOString(),
      });
      return route.fulfill({ json: [row] });
    }
  }
  if (table === "od_profiles")
    return route.fulfill({
      json: profiles.filter((p) =>
        url.searchParams.has("id")
          ? p.id === url.searchParams.get("id").slice(3)
          : actor === ids.teacher || p.id === actor,
      ),
    });
  if (table === "od_contacts") return route.fulfill({ json: profiles });
  return route.fulfill({ json: [] });
}
(async () => {
  mkdirSync("test-results", { recursive: true });
  const browser = await chromium.launch({
    executablePath: "/usr/bin/chromium",
    headless: true,
    args: ["--no-sandbox"],
  });
  const errors = [];
  try {
    async function panel(role, offline = false) {
      const context = await browser.newContext({
        permissions: ["clipboard-read", "clipboard-write"],
        viewport: { width: 1440, height: 1000 },
      });
      await context.addInitScript(
        (id) =>
          localStorage.setItem(
            "od-supabase-session-v1",
            JSON.stringify({
              access_token: id,
              user: { id },
              expires_at: Math.floor(Date.now() / 1000) + 3600,
            }),
          ),
        ids[role],
      );
      await context.route(BASE + "/**", (r) => transport(r, { offline }));
      const page = await context.newPage();
      page.on("pageerror", (e) => errors.push(e.message));
      await page.clock.install();
      await page.goto(APP_URL + "/#projects");
      await page
        .getByRole("button", { name: "✦ Yeni proje hazırla", exact: true })
        .waitFor();
      return page;
    }
    const page = await panel("student");
    assert.match(
      await page.locator("nav a.project-nav").innerText(),
      /TÜBİTAK Projesi Hazırla/,
    );
    await page
      .getByRole("button", { name: "✦ Yeni proje hazırla", exact: true })
      .click();
    await page
      .getByLabel("Projenin adı", { exact: true })
      .fill("Akıllı Okul Enerji Araştırması");
    await page
      .getByLabel("Proje ana alanı", { exact: true })
      .selectOption("Fizik");
    await page
      .getByLabel("Proje tematik alanı", { exact: true })
      .selectOption("Yenilenebilir Enerji");
    await page
      .getByLabel(/Çevrende fark ettiğin sorun nedir/)
      .fill("Okulumuzda enerji israfı");
    await page
      .getByLabel(/Araştırma sorun ne/)
      .fill("Enerji kullanımını nasıl ölçebiliriz?");
    await page.getByRole("button", { name: "Kaydet", exact: true }).click();
    await page
      .locator("#project-save-status")
      .filter({ hasText: "Supabase’e kaydedildi" })
      .waitFor();
    assert.equal(rows.length, 1);
    await page.getByRole("button", { name: "Sonraki adım →" }).click();
    await page.getByLabel(/Amaç ve somut hedefler/).fill("Kendi özgün amacım");
    await page
      .getByLabel(/Giriş ve kaynak taraması/)
      .fill("Gerçek kaynakları okuyup araştıracağım.");
    await page
      .getByLabel(/Araştırma yöntemi/)
      .fill("Ölçüm ve gözlem yapacağım.");
    const ai = page.getByRole("button", {
      name: "✧ Yapay zekâ ile taslak hazırla",
      exact: true,
    });
    await ai.waitFor();
    await ai.click();
    await page
      .getByRole("heading", {
        name: "Asistanın önerisi — önce sen değerlendir",
      })
      .waitFor();
    assert.equal(
      await page.getByLabel(/Amaç ve somut hedefler/).inputValue(),
      "Kendi özgün amacım",
    );
    assert.equal(await page.locator("#project-ai-review img").count(), 0);
    await page.getByRole("button", { name: "Vazgeç", exact: true }).click();
    assert.equal(
      await page.getByLabel(/Amaç ve somut hedefler/).inputValue(),
      "Kendi özgün amacım",
    );
    await ai.click();
    await page.locator('input[name="ai-section"][value="purpose"]').check();
    await page.getByRole("button", { name: "Seçili bölümleri kullan" }).click();
    assert.match(
      await page.getByLabel(/Amaç ve somut hedefler/).inputValue(),
      /Gemini taslak amacı/,
    );
    await page.locator('[data-p-action="step"][data-step="2"]').click();
    for (const row of await page.locator("[data-timeline-row]").all()) {
      await row.locator('input[data-key="start"]').fill("2027-01-01");
      await row.locator('input[data-key="end"]').fill("2027-02-01");
    }
    await page.locator('[data-p-action="step"][data-step="4"]').click();
    await page
      .getByLabel(/Proje özeti/)
      .fill(Array(150).fill("araştırma").join(" "));
    await page
      .getByLabel("Anahtar kelimeler (en fazla 5 kelime)")
      .fill("enerji güneş okul çevre ölçüm");
    await page
      .getByLabel("Kaynaklar", { exact: false })
      .last()
      .fill("TÜBİTAK. (2027). 2204-A proje rehberi.");
    await page.getByRole("button", { name: "Kaydet", exact: true }).click();
    await page
      .locator("#project-save-status")
      .filter({ hasText: "Supabase’e kaydedildi" })
      .waitFor();
    await page.locator('[data-p-action="step"][data-step="5"]').click();
    await page
      .getByText("Özet 150–250 kelime (150)", { exact: false })
      .waitFor();
    const downloadPromise = page.waitForEvent("download");
    await page.locator('[data-p-action="word"]').first().click();
    const download = await downloadPromise;
    await download.saveAs("test-results/project-browser.docx");
    const zip = await JSZip.loadAsync(
      readFileSync("test-results/project-browser.docx"),
    );
    const xml = await zip.file("word/document.xml").async("string");
    assert.match(xml, /Akıllı Okul Enerji Araştırması/);
    assert.match(xml, /Gemini taslak amacı/);
    assert.match(xml, /Times New Roman/);
    assert.match(xml, /ÇALIŞMA TASLAĞI/);
    assert.equal(aiCalls, 2);
    await page.reload();
    await page.getByLabel("Projenin adı", { exact: true }).waitFor();
    assert.equal(
      await page.getByLabel("Projenin adı", { exact: true }).inputValue(),
      "Akıllı Okul Enerji Araştırması",
    );
    const revisionBefore = rows[0].revision;
    await page.clock.fastForward(1900);
    await page
      .locator("#project-save-status")
      .filter({ hasText: "Supabase’e kaydedildi" })
      .waitFor();
    assert.ok(
      rows[0].revision > revisionBefore,
      "Recovered local draft is automatically synced",
    );
    await page.setViewportSize({ width: 375, height: 850 });
    await page.screenshot({
      path: "test-results/projects-mobile.png",
      fullPage: true,
    });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    const other = await panel("other");
    assert.equal(
      await other
        .getByRole("heading", {
          name: "Akıllı Okul Enerji Araştırması",
          exact: true,
        })
        .count(),
      0,
    );
    const teacher = await panel("teacher");
    await teacher.getByRole("link", { name: "İncele →" }).click();
    await teacher
      .getByText("Öğrencinin projesini inceliyorsunuz.", { exact: false })
      .waitFor();
    assert.equal(
      await teacher.getByLabel("Projenin adı", { exact: true }).isDisabled(),
      true,
    );
    assert.equal(
      await teacher
        .getByRole("button", { name: "Kaydet", exact: true })
        .count(),
      0,
    );
    await teacher
      .getByText("Öğretmen: bulut ve Gemini bağlantısı", { exact: true })
      .click();
    await teacher.getByRole("button", { name: "Proje SQL’ini aç →" }).click();
    await teacher.waitForFunction(() =>
      document
        .querySelector("#setup-dialog")
        .dataset.template?.includes("od_projects"),
    );
    assert.equal(await teacher.locator("#setup-password").isVisible(), false);
    await teacher.getByRole("button", { name: "SQL kodunu kopyala" }).click();
    assert.match(
      await teacher.evaluate(() => navigator.clipboard.readText()),
      /od_reserve_project_ai_request/,
    );
    await teacher.getByRole("button", { name: "Kapat", exact: true }).click();
    await teacher
      .getByRole("button", { name: "Gemini sunucu kodunu kopyala →" })
      .click();
    await teacher
      .locator("#toast")
      .filter({ hasText: "Sunucu kodu kopyalandı" })
      .waitFor();
    assert.match(
      await teacher.evaluate(() => navigator.clipboard.readText()),
      /Deno.serve/,
    );
    const offline = await panel("other", true);
    await offline
      .getByRole("button", { name: "✦ Yeni proje hazırla", exact: true })
      .click();
    await offline
      .getByLabel("Projenin adı", { exact: true })
      .fill("Bağlantısız taslak");
    await offline.reload();
    await offline.getByLabel("Projenin adı", { exact: true }).waitFor();
    assert.equal(
      await offline.getByLabel("Projenin adı", { exact: true }).inputValue(),
      "Bağlantısız taslak",
    );
    assert.equal(
      await offline
        .getByRole("button", { name: "✧ Yapay zekâ ile taslak hazırla" })
        .isDisabled(),
      true,
    );
    await offline
      .locator("#project-save-status")
      .filter({ hasText: "bu tarayıcıda" })
      .waitFor();
    assert.deepEqual(errors, []);
    console.log(
      "PASS: both role menus, six-step authoring, cloud save/reload, real DOCX download, Gemini preview/cancel/apply, XML escaping, student privacy, teacher readonly review, password-free project SQL, offline draft recovery, mobile layout. Hosted Gemini and Supabase are not exercised.",
    );
  } finally {
    await browser.close();
  }
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
