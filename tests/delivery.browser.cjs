// UI + actual PostgreSQL schema/RLS/RPC integration. Only HTTP transport/Auth are simulated.
const { PGlite } = require("@electric-sql/pglite");
const { pgcrypto } = require("@electric-sql/pglite/contrib/pgcrypto");
const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { randomUUID } = require("node:crypto");
const BASE = "https://rfmelsdtasxoddtolqpb.supabase.co";
const SPEAKLAB =
  "https://speaklab-ingilizce-atolyesi.gencbeyinlernet.chatgpt.site";
(async () => {
  const pg = new PGlite({ extensions: { pgcrypto } });
  let browser;
  try {
    await pg.exec(`create role anon; create role authenticated; create schema auth;
 create table auth.users(instance_id uuid,id uuid primary key,aud text,role text,email text unique,encrypted_password text,email_confirmed_at timestamptz,raw_app_meta_data jsonb,raw_user_meta_data jsonb,created_at timestamptz,updated_at timestamptz,confirmation_token text,recovery_token text,email_change_token_new text,email_change text,email_change_token_current text,reauthentication_token text);
 create table auth.identities(id uuid primary key,user_id uuid,provider_id text,identity_data jsonb,provider text,created_at timestamptz,updated_at timestamptz);
 create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 grant usage on schema auth,public to authenticated,anon; grant execute on function auth.uid() to authenticated,anon;`);
    await pg.exec(
      readFileSync("supabase/schema.sql", "utf8").replace(
        "__TEACHER_PASSWORD__",
        "test-only-password",
      ),
    );
    const teacher = (
      await pg.query("select id from od_profiles where role='teacher'")
    ).rows[0].id;
    const student = randomUUID(),
      outsider = randomUUID();
    for (const [id, username] of [
      [student, "deniz"],
      [outsider, "eren"],
    ])
      await pg.query("insert into auth.users(id,email) values($1,$2)", [
        id,
        username + "@login.ogretmendefteri.invalid",
      ]);
    const acting = (id, fn) =>
      pg.transaction(async (tx) => {
        await tx.query("select set_config('request.jwt.claim.sub',$1,true)", [
          id,
        ]);
        await tx.exec("set local role authenticated");
        return fn(tx);
      });
    const makeAssignment = (title) =>
      acting(
        teacher,
        async (tx) =>
          (
            await tx.query(
              "select od_create_assignment($1,$2,current_date,array[$3::uuid]) id",
              [title, "Çalışmanızı buradan teslim edin.", student],
            )
          ).rows[0].id,
      );
    const assignment = await makeAssignment("Kesirler teslim testi");
    const tables = new Set([
      "od_profiles",
      "od_assignments",
      "od_assignment_recipients",
      "od_submissions",
      "od_point_awards",
      "od_resources",
      "od_teacher_entries",
      "od_activity_log",
    ]);
    let teacherOffline = false,
      failStudentReadback = false;
    async function transport(route) {
      const req = route.request(),
        url = new URL(req.url()),
        path = url.pathname,
        method = req.method();
      const actor = req.headers().authorization?.replace("Bearer ", "");
      if (![teacher, student, outsider].includes(actor))
        return route.fulfill({
          status: 401,
          json: { message: "Invalid session" },
        });
      if (
        path.endsWith("/od_submissions") &&
        method === "GET" &&
        ((actor === teacher && teacherOffline) ||
          (actor === student &&
            failStudentReadback &&
            url.searchParams.has("assignment_id")))
      ) {
        if (actor === student) failStudentReadback = false;
        return route.fulfill({
          status: 503,
          json: { message: "Test bağlantı kesintisi" },
        });
      }
      try {
        const result = await acting(actor, async (tx) => {
          const table = path.split("/").pop();
          const body = req.postDataJSON();
          if (path.includes("/rpc/")) {
            const calls = {
              od_contacts: ["select * from od_contacts()", []],
              od_submit_assignment: [
                "select od_submit_assignment($1,$2)",
                [body?.p_assignment, body?.p_content],
              ],
              od_review_submission: [
                "select od_review_submission($1,$2,$3,$4,$5)",
                [
                  body?.p_assignment,
                  body?.p_student,
                  body?.p_status,
                  body?.p_score,
                  body?.p_feedback,
                ],
              ],
            };
            if (!calls[table]) throw Error("Unsupported RPC in test: " + table);
            const [sql, args] = calls[table],
              res = await tx.query(sql, args);
            return table === "od_contacts" ? res.rows : null;
          }
          if (!tables.has(table)) throw Error("Unknown table");
          if (method === "GET") {
            const args = [],
              filters = [];
            for (const [key, value] of url.searchParams) {
              if (value.startsWith("eq.")) {
                assert.match(key, /^[a-z_]+$/);
                args.push(value.slice(3));
                filters.push(`${key}=$${args.length}`);
              }
            }
            const order = url.searchParams
              .get("order")
              ?.split(",")
              .map((part) => {
                assert.match(part, /^[a-z_]+(?:\.(?:asc|desc))?$/);
                return part.replace(".", " ");
              })
              .join(",");
            return (
              await tx.query(
                `select * from ${table}${filters.length ? " where " + filters.join(" and ") : ""}${order ? " order by " + order : ""} limit $${args.length + 1} offset $${args.length + 2}`,
                [
                  ...args,
                  Number(url.searchParams.get("limit") || 1000),
                  Number(url.searchParams.get("offset") || 0),
                ],
              )
            ).rows;
          }
          if (method === "POST") {
            const keys = Object.keys(body);
            keys.forEach((k) => assert.match(k, /^[a-z_]+$/));
            await tx.query(
              `insert into ${table}(${keys.join(",")}) values(${keys.map((_, i) => "$" + (i + 1)).join(",")})`,
              Object.values(body),
            );
            return null;
          }
          throw Error("Unsupported request");
        });
        await route.fulfill({ status: 200, json: result });
      } catch (error) {
        await route.fulfill({
          status: 400,
          json: { message: error.message, code: error.code },
        });
      }
    }
    browser = await chromium.launch({
      executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
      headless: true,
      args: ["--no-sandbox"],
    });
    const errors = [];
    async function panel(id, hash) {
      const context = await browser.newContext({
        viewport: { width: 1280, height: 900 },
      });
      await context.addInitScript((id) => {
        localStorage.setItem(
          "od-supabase-session-v1",
          JSON.stringify({
            access_token: id,
            expires_at: Math.floor(Date.now() / 1000) + 3600,
            user: { id },
          }),
        );
        Object.defineProperty(document, "hidden", { get: () => false });
      }, id);
      await context.route(BASE + "/**", transport);
      await context.route(SPEAKLAB + "/**", (r) =>
        r.fulfill({ body: "SpeakLab test target" }),
      );
      const page = await context.newPage();
      page.on("pageerror", (e) => errors.push(e.message));
      await page.clock.install();
      await page.goto("http://127.0.0.1:8000/#" + hash);
      await page.locator('nav a[data-nav="assignments"]').waitFor();
      await page.locator("#sync-status-text").waitFor();
      return page;
    }
    const teacherPage = await panel(teacher, "assignments/" + assignment);
    const studentPage = await panel(student, "assignments/" + assignment);
    assert.match(
      await teacherPage.locator(".submission").innerText(),
      /Henüz teslim edilmedi/,
    );
    await studentPage
      .getByLabel("Yanıtınız (metin veya çalışma bağlantısı)")
      .fill("Birinci öğrenci teslimi");
    await studentPage.getByRole("button", { name: "Öğretmene gönder" }).click();
    await studentPage
      .getByRole("heading", { name: "Teslimim · Gönderildi" })
      .waitFor();
    await teacherPage.clock.fastForward(10010);
    await teacherPage
      .getByText("Birinci öğrenci teslimi", { exact: true })
      .waitFor();
    assert.equal(
      await teacherPage.locator('nav a[data-nav="assignments"] b').innerText(),
      "1",
    );
    const privateRows = await acting(
      outsider,
      async (tx) => (await tx.query("select * from od_submissions")).rows,
    );
    assert.equal(privateRows.length, 0);
    // Returning an assignment updates the already-open student page.
    await teacherPage
      .getByRole("button", { name: "Değerlendir / geri gönder" })
      .click();
    await teacherPage
      .getByLabel("İşlem", { exact: true })
      .selectOption("returned");
    await teacherPage
      .getByLabel("Öğrenciye geri bildirim")
      .fill("İkinci soruyu düzelt.");
    await teacherPage
      .getByRole("button", { name: "Kaydet", exact: true })
      .click();
    await teacherPage
      .getByText("İkinci soruyu düzelt.", { exact: true })
      .waitFor();
    await studentPage.clock.fastForward(10010);
    await studentPage
      .getByRole("heading", { name: "Teslimim · İade edildi" })
      .waitFor();
    await studentPage
      .getByLabel("Yanıtınız (metin veya çalışma bağlantısı)")
      .fill("Kaybolmaması gereken düzeltilmiş taslak");
    await acting(teacher, (tx) =>
      tx.query(
        "insert into od_point_awards(student_id,awarded_by,points,reason) values($1,$2,10,$3)",
        [student, teacher, "Katılım"],
      ),
    );
    await studentPage.clock.fastForward(10010);
    assert.equal(
      await studentPage
        .getByLabel("Yanıtınız (metin veya çalışma bağlantısı)")
        .inputValue(),
      "Kaybolmaması gereken düzeltilmiş taslak",
    );
    await studentPage
      .getByRole("button", { name: "Düzelterek tekrar gönder" })
      .click();
    await studentPage
      .getByRole("heading", { name: "Teslimim · Gönderildi" })
      .waitFor();
    await teacherPage.clock.fastForward(10010);
    await teacherPage
      .getByText("Kaybolmaması gereken düzeltilmiş taslak", { exact: true })
      .waitFor();
    // Fail an actual refresh: retain known rows and show a visible error, then recover.
    teacherOffline = true;
    await teacherPage.clock.fastForward(10010);
    await teacherPage
      .locator("#sync-status-text")
      .filter({ hasText: "güncellenemedi" })
      .waitFor();
    assert.equal(
      await teacherPage
        .getByText("Kaybolmaması gereken düzeltilmiş taslak", { exact: true })
        .count(),
      1,
    );
    teacherOffline = false;
    await teacherPage
      .getByRole("button", { name: "Teslimleri yenile" })
      .click();
    await teacherPage
      .locator("#sync-status-text")
      .filter({ hasText: "Son kontrol:" })
      .waitFor();
    // Readback failure must not display an unverified success or let the student double-send.
    const second = await makeAssignment("İkinci çalışma");
    await studentPage.goto("http://127.0.0.1:8000/#assignments/" + second);
    await studentPage
      .getByLabel("Yanıtınız (metin veya çalışma bağlantısı)")
      .fill("İkinci teslim");
    failStudentReadback = true;
    await studentPage.getByRole("button", { name: "Öğretmene gönder" }).click();
    await studentPage
      .locator(".submission-result")
      .filter({ hasText: "kayıt henüz doğrulanamadı" })
      .waitFor();
    assert.equal(
      await studentPage
        .getByRole("button", { name: "Öğretmene gönder" })
        .isDisabled(),
      true,
    );
    await studentPage
      .getByRole("button", { name: "Teslimleri yenile" })
      .click();
    await studentPage
      .getByRole("heading", { name: "Teslimim · Gönderildi" })
      .waitFor();
    const count = (
      await pg.query(
        "select count(*)::int n from od_submissions where assignment_id=$1",
        [second],
      )
    ).rows[0].n;
    assert.equal(count, 1);
    // A new submission appears in the teacher dashboard without a browser reload.
    await teacherPage.locator('nav a[href="#home"]').click();
    await teacherPage
      .getByRole("heading", { name: "Gelen ödevler", exact: true })
      .waitFor();
    await teacherPage.clock.fastForward(10010);
    await teacherPage
      .locator(".incoming-card")
      .getByRole("link", { name: /İkinci çalışma/ })
      .waitFor();
    // SpeakLab is available to both roles and records the student's launch using the real log policy.
    for (const page of [teacherPage, studentPage]) {
      await page.locator('nav a[href="#apps"]').click();
      const card = page
        .locator(".student-card")
        .filter({
          has: page.getByRole("heading", {
            name: "SpeakLab İngilizce Atölyesi",
            exact: true,
          }),
        });
      await card.waitFor();
      const popup = page.waitForEvent("popup");
      await card.getByRole("button", { name: "Uygulamayı aç ↗" }).click();
      const game = await popup;
      await game.waitForURL(SPEAKLAB + "/**");
      await game.close();
    }
    const logs = await acting(
      teacher,
      async (tx) =>
        (
          await tx.query(
            "select * from od_activity_log where event_type='resource' and label='SpeakLab İngilizce Atölyesi'",
          )
        ).rows,
    );
    assert.equal(logs.length, 1);
    assert.equal(logs[0].student_id, student);
    assert.deepEqual(errors, []);
    console.log(
      "PASS: two independent panels with real PostgreSQL RLS/RPC: automatic student→teacher delivery, teacher→student return, draft preservation, sync error/recovery, readback failure/recovery without duplicate delivery, teacher inbox, outsider privacy, SpeakLab launch/history in both panels. Hosted Supabase Auth/deployment are not simulated as successful.",
    );
  } finally {
    if (browser) await browser.close();
    await pg.close();
  }
})().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
