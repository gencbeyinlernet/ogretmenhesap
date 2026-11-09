// The browser contract is mocked; actual RLS/RPC behavior is tested in database.test.cjs.
const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const { mkdirSync } = require("node:fs");
const teacher = "11111111-1111-4111-8111-111111111111",
  student = "22222222-2222-4222-8222-222222222222",
  other = "33333333-3333-4333-8333-333333333333";
const aid = "44444444-4444-4444-8444-444444444444";
let serial = 0;
const store = {
  od_profiles: [
    {
      id: teacher,
      username: "burakturgut",
      role: "teacher",
      display_name: "Burak Turgut",
      school: "Örnek Okul",
      class_name: "Matematik",
      bio: "",
      created_at: "2026-11-09T08:00:00Z",
    },
    {
      id: student,
      username: "deniz",
      role: "student",
      display_name: "Deniz Yılmaz",
      school: "",
      class_name: "6/A",
      bio: "",
      created_at: "2026-11-09T08:00:00Z",
    },
    {
      id: other,
      username: "eren",
      role: "student",
      display_name: "Eren",
      school: "",
      class_name: "6/B",
      bio: "",
      created_at: "2026-11-09T08:00:00Z",
    },
  ],
  od_assignments: [
    {
      id: aid,
      title: "Kesirler",
      description: "İşlemleri çözün.",
      due_date: "2026-11-15",
      created_at: "2026-11-09T08:00:00Z",
      created_by: teacher,
    },
  ],
  od_assignment_recipients: [{ assignment_id: aid, student_id: student }],
  od_submissions: [],
  od_point_awards: [],
  od_resources: [],
  od_messages: [],
  od_teacher_entries: [],
  od_activity_log: [],
};
const session = (id) => ({
  access_token: id,
  refresh_token: "refresh",
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  user: { id },
});
async function mock(route) {
  const req = route.request(),
    url = new URL(req.url()),
    method = req.method(),
    body = req.postDataJSON();
  const actor = req.headers().authorization?.replace("Bearer ", "");
  let response = null,
    status = 200;
  const path = url.pathname;
  if (path.startsWith("/auth/")) {
    if (path.endsWith("/signup")) {
      assert.equal(body.email, "yenikayit@login.ogretmendefteri.invalid");
      response = session(student);
    } else if (path.includes("/token"))
      response = session(
        body.email?.startsWith("burakturgut") ? teacher : student,
      );
    else response = {};
  } else {
    const table = path.split("/").pop();
    if (path.includes("/rpc/")) {
      if (table === "od_contacts")
        response = store.od_profiles.map(
          ({ id, username, display_name, role }) => ({
            id,
            username,
            display_name,
            role,
          }),
        );
      if (table === "od_create_assignment") {
        const id = "assignment-" + ++serial;
        store.od_assignments.unshift({
          id,
          title: body.p_title,
          description: body.p_description,
          due_date: body.p_due_date,
        });
        store.od_assignment_recipients.push(
          ...body.p_students.map((student_id) => ({
            student_id,
            assignment_id: id,
          })),
        );
        response = id;
      }
      if (table === "od_submit_assignment") {
        let s = store.od_submissions.find(
          (s) =>
            s.assignment_id === body.p_assignment && s.student_id === actor,
        );
        const record = {
          assignment_id: body.p_assignment,
          student_id: actor,
          content: body.p_content,
          status: "submitted",
          score: null,
          feedback: "",
          submitted_at: new Date().toISOString(),
        };
        if (s) Object.assign(s, record);
        else store.od_submissions.push(record);
      }
      if (table === "od_review_submission") {
        Object.assign(
          store.od_submissions.find(
            (s) =>
              s.assignment_id === body.p_assignment &&
              s.student_id === body.p_student,
          ),
          {
            status: body.p_status,
            score: body.p_score,
            feedback: body.p_feedback,
            reviewed_at: new Date().toISOString(),
          },
        );
      }
    } else if (method === "GET") {
      response = [...(store[table] || [])];
      if (actor !== teacher) {
        if (table === "od_profiles")
          response = response.filter((r) => r.id === actor);
        if (
          [
            "od_assignment_recipients",
            "od_submissions",
            "od_point_awards",
          ].includes(table)
        )
          response = response.filter((r) => r.student_id === actor);
        if (table === "od_assignments")
          response = response.filter((r) =>
            store.od_assignment_recipients.some(
              (x) => x.student_id === actor && x.assignment_id === r.id,
            ),
          );
      }
      for (const [key, value] of url.searchParams) {
        if (value.startsWith("eq."))
          response = response.filter((r) => String(r[key]) === value.slice(3));
      }
      if (table === "od_messages")
        response = response.filter(
          (m) =>
            url.searchParams.get("or").includes(m.sender_id) &&
            url.searchParams.get("or").includes(m.recipient_id),
        );
    } else if (method === "POST") {
      store[table].push({
        id: "record-" + ++serial,
        created_at: new Date().toISOString(),
        ...body,
      });
      status = 201;
    } else if (method === "PATCH") {
      for (const r of store[table]) {
        if (r.id === url.searchParams.get("id")?.slice(3))
          Object.assign(r, body);
      }
    }
  }
  await route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(response),
  });
}
(async () => {
  mkdirSync("test-results", { recursive: true });
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
    headless: true,
    args: ["--no-sandbox"],
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    permissions: ["clipboard-read", "clipboard-write"],
  });
  await context.route("https://rfmelsdtasxoddtolqpb.supabase.co/**", mock);
  await context.route("https://example.org/**", (route) =>
    route.fulfill({ body: "Test application" }),
  );
  await context.route("https://drive.google.com/**", (route) =>
    route.fulfill({ body: "Test Drive folder" }),
  );
  const page = await context.newPage(),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("http://127.0.0.1:8000");
  await page.getByRole("button", { name: "SQL kurulumu" }).click();
  await page.locator("#setup-sql").filter({ hasText: "" }).waitFor();
  await page.waitForFunction(
    () => document.querySelector("#setup-dialog").dataset.template,
  );
  assert.match(
    await page.locator("#setup-sql").inputValue(),
    /__TEACHER_PASSWORD__/,
  );
  await page.getByLabel("Öğretmen başlangıç şifresi").fill("test'quote");
  await page.getByRole("button", { name: "SQL kodunu kopyala" }).click();
  assert.match(
    await page.evaluate(() => navigator.clipboard.readText()),
    /test''quote/,
  );
  await page.getByRole("button", { name: "Kapat", exact: true }).click();
  assert.equal(await page.locator("#setup-password").count(), 0);
  await page.getByLabel("Kullanıcı adı", { exact: true }).fill("burakturgut");
  await page.getByLabel("Şifre", { exact: true }).fill("test-password");
  await page.getByRole("button", { name: "Giriş yap →", exact: true }).click();
  await page
    .getByRole("heading", { name: "Burak Turgut, hoş geldiniz." })
    .waitFor();
  await page.locator('nav a[href="#assignments"]').click();
  await page.getByRole("button", { name: "Ödev gönder" }).click();
  await page.getByLabel("Ödev başlığı").fill("Haftalık okuma");
  await page.getByLabel("Açıklama ve yönergeler").fill("İki sayfa okuyun.");
  await page.locator(`input[name="students"][value="${student}"]`).check();
  await page.getByRole("button", { name: "Kaydet", exact: true }).click();
  await page.getByRole("link", { name: /Haftalık okuma/ }).waitFor();
  assert.equal(
    store.od_assignment_recipients.filter(
      (r) => r.assignment_id === "assignment-1",
    ).length,
    1,
  );
  await page.locator('nav a[href="#apps"]').click();
  const sharedDrive = page.getByRole("link", {
    name: "Drive bağlantısını aç ↗",
  });
  assert.equal(
    await sharedDrive.getAttribute("href"),
    "https://drive.google.com/drive/folders/1YWNJgTheUk5FufTW4qqALOpev5vVUBrz?usp=sharing",
  );
  assert.equal(await sharedDrive.getAttribute("target"), "_blank");
  await page.getByRole("button", { name: "Uygulama ekle" }).click();
  await page.getByLabel("Kaynak adı").fill("Online uygulamam");
  await page.getByLabel("HTTPS bağlantısı").fill("https://example.org/app");
  await page.getByRole("button", { name: "Kaydet", exact: true }).click();
  await page.getByRole("heading", { name: "Online uygulamam" }).waitFor();
  const onlinePopup = page.waitForEvent("popup");
  await page.getByRole("button", { name: "Uygulamayı aç ↗" }).click();
  const onlinePage = await onlinePopup;
  await onlinePage.waitForURL("https://example.org/app");
  await onlinePage.close();
  await page.locator('nav a[href="#annual"]').click();
  await page.getByRole("button", { name: "Yeni kayıt" }).click();
  await page.getByLabel("Başlık", { exact: true }).fill("2026 yıllık plan");
  await page.getByLabel("İçerik").fill("Ders kazanımları");
  await page.getByRole("button", { name: "Kaydet", exact: true }).click();
  await page.getByRole("heading", { name: "2026 yıllık plan" }).waitFor();
  await page.locator('nav a[href="#students"]').click();
  await page.getByLabel("Öğrenci ara").fill("deniz");
  assert.equal(await page.locator(".student-card").count(), 1);
  await page.locator(".student-card").click();
  await page.getByRole("button", { name: "Puan ver" }).click();
  await page.getByLabel("Puan (1–1000)").fill("20");
  await page.getByLabel("Puanın nedeni").fill("Derse katılım");
  await page.getByRole("button", { name: "Kaydet", exact: true }).click();
  await page.getByText("Derse katılım", { exact: true }).waitFor();
  await page.getByRole("link", { name: "Mesaj gönder", exact: true }).click();
  await page.getByLabel("Mesajınız", { exact: true }).fill("Merhaba Deniz");
  await page.getByRole("button", { name: "Gönder →", exact: true }).click();
  await page.getByText("Merhaba Deniz", { exact: true }).waitFor();
  await page.locator('nav a[href="#monitor"]').click();
  await page
    .getByRole("heading", { name: "Konuşma denetimi", exact: true })
    .waitFor();
  assert.equal(await page.locator("#message-form").count(), 0);
  await page.locator('nav a[href="#home"]').click();
  await page.screenshot({
    path: "test-results/teacher-desktop.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Güvenli çıkış" }).click();
  await page
    .getByRole("button", { name: "Öğrenci kaydı", exact: true })
    .click();
  await page.getByLabel("Kullanıcı adı", { exact: true }).fill("yenikayit");
  await page.getByLabel("Şifre", { exact: true }).fill("test-password");
  await page.getByRole("button", { name: "Öğrenci hesabı oluştur →" }).click();
  await page
    .getByRole("heading", { name: "Deniz Yılmaz, hoş geldiniz." })
    .waitFor();
  assert.equal(await page.locator('nav a[href="#monitor"]').count(), 0);
  assert.equal(await page.locator('nav a[href="#annual"]').count(), 0);
  await page.locator('nav a[href="#assignments"]').click();
  await page.getByRole("link", { name: /Kesirler/ }).click();
  await page
    .getByLabel("Yanıtınız (metin veya çalışma bağlantısı)")
    .fill("Çözümlerim burada.");
  await page.getByRole("button", { name: "Öğretmene gönder" }).click();
  await page.getByRole("heading", { name: "Teslimim · Gönderildi" }).waitFor();
  await page.locator('nav a[href="#messages"]').click();
  await page.getByLabel("Kime mesaj göndermek istersiniz?").selectOption(other);
  await page
    .getByLabel("Mesajınız", { exact: true })
    .fill("<img src=x onerror=alert(1)>");
  await page.getByRole("button", { name: "Gönder →", exact: true }).click();
  await page.locator(".message p").filter({ hasText: "<img" }).waitFor();
  assert.equal(await page.locator(".chat-log img").count(), 0);
  await page.locator('nav a[href="#apps"]').click();
  const drivePopup = page.waitForEvent("popup");
  await page.getByRole("link", { name: "Drive bağlantısını aç ↗" }).click();
  const drivePage = await drivePopup;
  await drivePage.waitForURL(/drive.google.com/);
  await drivePage.close();
  assert.equal(
    store.od_activity_log.some(
      (r) => r.event_type === "resource" && r.label === "Drive oyun klasörüm",
    ),
    true,
  );
  await page.locator('nav a[href="#resources"]').click();
  await page.getByRole("link", { name: /Matematik Atölyesi/ }).click();
  for (let i = 0; i < 10; i++) {
    await page.locator("#game-answer").fill("0");
    await page.getByRole("button", { name: "Cevapla →" }).click();
    await page.waitForTimeout(30);
  }
  await page.getByRole("heading", { name: "Harika bir çalışma!" }).waitFor();
  assert.equal(
    store.od_activity_log.some(
      (r) => r.event_type === "game" && r.score !== null,
    ),
    true,
  );
  await page.locator('nav a[href="#home"]').click();
  for (const width of [375, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
  }
  await page.setViewportSize({ width: 375, height: 850 });
  await page.screenshot({
    path: "test-results/student-mobile.png",
    fullPage: true,
  });
  // Teacher evaluates actual student submission and returns it; student can resubmit.
  await page.getByRole("button", { name: "Güvenli çıkış" }).click();
  await page.getByLabel("Kullanıcı adı", { exact: true }).fill("burakturgut");
  await page.getByLabel("Şifre", { exact: true }).fill("test-password");
  await page.getByRole("button", { name: "Giriş yap →", exact: true }).click();
  await page.locator('nav a[href="#assignments"]').waitFor();
  await page.locator('nav a[href="#assignments"]').click();
  await page.getByRole("link", { name: /Kesirler/ }).click();
  await page.getByRole("button", { name: "Değerlendir / geri gönder" }).click();
  await page.getByLabel("İşlem", { exact: true }).selectOption("returned");
  await page
    .getByLabel("Öğrenciye geri bildirim")
    .fill("İkinci soruyu düzelt.");
  await page.getByRole("button", { name: "Kaydet", exact: true }).click();
  await page.getByText("İkinci soruyu düzelt.", { exact: true }).waitFor();
  assert.equal(store.od_submissions[0].status, "returned");
  assert.deepEqual(errors, []);
  await browser.close();
  console.log(
    "PASS: SQL copy/clear, teacher login, selected assignments, annual plans, student search/points, messaging/monitoring, username-only registration, student submissions/game/activity, XSS escaping, responsive widths, teacher returns assignment. Apps menu, direct online popup, shared Drive link and student opening log also verified. Live Supabase is not exercised by this mock test.",
  );
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
