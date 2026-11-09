const { test } = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync, mkdirSync, writeFileSync } = require("node:fs");
const { randomUUID } = require("node:crypto");
const { PGlite } = require("@electric-sql/pglite");
const { pgcrypto } = require("@electric-sql/pglite/contrib/pgcrypto");
const JSZip = require("jszip");

test("2027 project rules and a genuine Word document", async () => {
  const rules = await import("../supabase/functions/_shared/project-rules.js");
  assert.equal(rules.wordCount("Öğrencilerin güneş-enerjisi araştırması"), 3);
  const p = rules.blankProject();
  p.title = "Okulumuzda Güneş Enerjisi";
  p.main_area = "Fizik";
  p.theme = "Yenilenebilir Enerji";
  p.abstract = Array(150).fill("araştırma").join(" ");
  p.keywords = "enerji güneş okul çevre elektrik";
  assert.equal(
    rules.projectChecks(p).find((c) => c.key === "abstract").ok,
    true,
  );
  assert.equal(
    rules.projectChecks(p).find((c) => c.key === "keywords").ok,
    true,
  );
  p.keywords += " fazlalık";
  assert.equal(
    rules.projectChecks(p).find((c) => c.key === "keywords").ok,
    false,
  );
  p.purpose = "Ölçümleri <uydurmadan> & kendi verilerimizle değerlendirmek.";
  p.introduction = "Gerçek kaynaklara atıflar buraya yazılır.";
  p.method = "Gözlemler planlanacak.";
  p.timeline = [
    { task: "Ön araştırma", start: "2027-01-01", end: "2027-02-01" },
  ];
  p.appendices = "Ek 1. Araştırma aracı";
  const { buildProjectDocument } = await import("../project-document.js");
  const bytes = await buildProjectDocument(p);
  const zip = await JSZip.loadAsync(bytes);
  const xml = await zip.file("word/document.xml").async("string");
  for (const heading of [
    "Özet",
    "Amaç",
    "Giriş",
    "Yöntem",
    "Proje İş-Zaman Çizelgesi",
    "Bulgular",
    "Sonuç ve Tartışma",
    "Öneriler",
    "Kaynaklar",
    "Ekler",
  ])
    assert.ok(xml.includes(heading), heading);
  assert.match(xml, /Times New Roman/);
  assert.match(xml, /w:sz w:val="24"/);
  assert.match(xml, /w:pgMar[^>]*w:top="1417"/);
  assert.match(xml, /w:line="240"/);
  assert.match(xml, /w:tbl/);
  assert.match(xml, /2027-01-01/);
  assert.match(xml, /&lt;uydurmadan&gt; &amp;/);
  assert.ok(!xml.includes("<uydurmadan>"));
  assert.ok(!xml.includes("Kırmızı ile yazılı"));
  assert.match(xml, /ÇALIŞMA TASLAĞI/);
  mkdirSync("test-results", { recursive: true });
  writeFileSync("test-results/tubitak-project.docx", Buffer.from(bytes));
});

test("project RLS, version conflicts and per-user Gemini quotas", async () => {
  const pg = new PGlite({ extensions: { pgcrypto } });
  try {
    await pg.exec(`create role anon;create role authenticated;create schema auth;
 create table auth.users(instance_id uuid,id uuid primary key,aud text,role text,email text unique,encrypted_password text,email_confirmed_at timestamptz,raw_app_meta_data jsonb,raw_user_meta_data jsonb,created_at timestamptz,updated_at timestamptz,confirmation_token text,recovery_token text,email_change_token_new text,email_change text,email_change_token_current text,reauthentication_token text);
 create table auth.identities(id uuid primary key,user_id uuid,provider_id text,identity_data jsonb,provider text,created_at timestamptz,updated_at timestamptz);
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 grant usage on schema auth,public to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;`);
    await pg.exec(
      readFileSync("supabase/schema.sql", "utf8").replace(
        "__TEACHER_PASSWORD__",
        "test-only-password",
      ),
    );
    await pg.exec(readFileSync("supabase/projects.sql", "utf8"));
    await pg.exec(readFileSync("supabase/projects.sql", "utf8"));
    const teacher = (
        await pg.query("select id from od_profiles where role='teacher'")
      ).rows[0].id,
      a = randomUUID(),
      b = randomUUID(),
      id = randomUUID();
    for (const [uid, name] of [
      [a, "deniz"],
      [b, "eren"],
    ])
      await pg.query("insert into auth.users(id,email) values($1,$2)", [
        uid,
        name + "@login.ogretmendefteri.invalid",
      ]);
    const acting = (uid, fn) =>
      pg.transaction(async (tx) => {
        await tx.query("select set_config('request.jwt.claim.sub',$1,true)", [
          uid,
        ]);
        await tx.exec(`set local role ${uid ? "authenticated" : "anon"}`);
        return fn(tx);
      });
    await acting(a, (tx) =>
      tx.query(
        "insert into od_projects(id,owner_id,title,report) values($1,$2,'Araştırma',$3)",
        [id, a, { title: "Araştırma", problem: "Gerçek bir soru" }],
      ),
    );
    assert.equal(
      (await acting(b, (tx) => tx.query("select * from od_projects"))).rows
        .length,
      0,
    );
    assert.equal(
      (await acting(teacher, (tx) => tx.query("select * from od_projects")))
        .rows.length,
      1,
    );
    assert.equal(
      (
        await acting(teacher, (tx) =>
          tx.query(
            "update od_projects set title='Başkasının metni' where id=$1 returning id",
            [id],
          ),
        )
      ).rows.length,
      0,
    );
    await assert.rejects(
      acting(b, (tx) =>
        tx.query("insert into od_projects(owner_id,title) values($1,'Sahte')", [
          a,
        ]),
      ),
      /row-level security/,
    );
    await assert.rejects(
      acting(a, (tx) =>
        tx.query("update od_projects set owner_id=$1 where id=$2", [b, id]),
      ),
      /permission denied/,
    );
    await assert.rejects(
      acting(a, (tx) =>
        tx.query("update od_projects set revision=99 where id=$1", [id]),
      ),
      /permission denied/,
    );
    const saved = await acting(a, (tx) =>
      tx.query(
        "update od_projects set title='Yeni başlık' where id=$1 and revision=1 returning revision",
        [id],
      ),
    );
    assert.equal(saved.rows[0].revision, 2);
    assert.equal(
      (
        await acting(a, (tx) =>
          tx.query(
            "update od_projects set title='Eski oturum' where id=$1 and revision=1 returning revision",
            [id],
          ),
        )
      ).rows.length,
      0,
    );
    await assert.rejects(
      acting("", (tx) => tx.query("select * from od_projects")),
      /permission denied/,
    );
    for (let i = 0; i < 3; i++)
      assert.equal(
        (
          await acting(a, (tx) =>
            tx.query("select od_reserve_project_ai_request() ok"),
          )
        ).rows[0].ok,
        true,
      );
    assert.equal(
      (
        await acting(a, (tx) =>
          tx.query("select od_reserve_project_ai_request() ok"),
        )
      ).rows[0].ok,
      false,
    );
    assert.equal(
      (
        await acting(b, (tx) =>
          tx.query("select od_reserve_project_ai_request() ok"),
        )
      ).rows[0].ok,
      true,
    );
    await assert.rejects(
      acting(a, (tx) => tx.query("delete from od_private.project_ai_usage")),
      /permission denied/,
    );
    await pg.query("delete from od_private.project_ai_usage where user_id=$1", [
      a,
    ]);
    await pg.query(
      "insert into od_private.project_ai_usage(user_id,created_at) select $1,now()-interval '2 hours' from generate_series(1,20)",
      [a],
    );
    assert.equal(
      (
        await acting(a, (tx) =>
          tx.query("select od_reserve_project_ai_request() ok"),
        )
      ).rows[0].ok,
      false,
    );
  } finally {
    await pg.close();
  }
});

test("Gemini server handler authentication, key isolation, limits and output validation", async () => {
  const { createHandler } = await import(
    "../supabase/functions/project-assistant/handler.js"
  );
  const fakeKey = "test-provider-secret",
    values = {
      SUPABASE_URL: "https://project.supabase.co",
      SUPABASE_ANON_KEY: "public-test",
      GEMINI_API_KEY: fakeKey,
    };
  let providerCalls = 0,
    allowQuota = true,
    providerStatus = 200;
  const fetcher = async (url, options) => {
    if (url.endsWith("/auth/v1/user")) return Response.json({ id: "student" });
    if (url.endsWith("/od_reserve_project_ai_request"))
      return Response.json(allowQuota);
    assert.match(
      url,
      /^https:\/\/generativelanguage.googleapis.com\/v1beta\/models\/gemini-2.5-flash:generateContent$/,
    );
    providerCalls++;
    assert.equal(options.headers["x-goog-api-key"], fakeKey);
    assert.ok(!options.body.includes(fakeKey));
    assert.match(options.body, /2027/);
    assert.match(options.body, /uydurma/);
    if (providerStatus !== 200)
      return new Response("private upstream message " + fakeKey, {
        status: providerStatus,
      });
    return Response.json({
      candidates: [
        {
          content: {
            parts: [
              {
                text: JSON.stringify({
                  sections: {
                    purpose: "Öğrenci tarafından düzenlenecek taslak",
                    role: "teacher",
                    references: "Uydurma yazar (2099). Olmayan çalışma.",
                    findings: "Henüz veri toplanmamıştır.",
                  },
                  warnings: ["Gerçek kaynak ekle."],
                }),
              },
            ],
          },
        },
      ],
    });
  };
  const handler = createHandler({ env: (k) => values[k], fetcher });
  const req = (body) =>
    new Request("https://edge.example", {
      method: "POST",
      headers: {
        authorization: "Bearer test-session",
        origin: "https://gencbeyinlernet.github.io",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
  assert.equal(
    (
      await handler(
        new Request("https://edge.example", { method: "POST", body: "{}" }),
      )
    ).status,
    401,
  );
  assert.equal(
    (
      await handler(
        new Request("https://edge.example", {
          method: "POST",
          headers: { origin: "https://untrusted.example" },
          body: "{}",
        }),
      )
    ).status,
    403,
  );
  const status = await handler(req({ mode: "status" }));
  assert.deepEqual(await status.json(), {
    configured: true,
    model: "gemini-2.5-flash",
  });
  assert.equal(providerCalls, 0);
  const body = {
    project: {
      problem: "Okuldaki enerji kullanımı",
      question: "Enerji tüketimini nasıl ölçebilirim?",
      main_area: "Fizik",
    },
  };
  const response = await handler(req(body));
  const json = await response.json();
  assert.equal(response.status, 200);
  assert.ok(json.sections.purpose);
  assert.equal(json.sections.role, undefined);
  assert.equal(json.sections.references, undefined);
  assert.match(json.sections.findings, /Henüz gerçek bulgu girilmemiştir/);
  assert.match(
    json.sections.conclusion,
    /gerçek bulgular elde edildikten sonra/,
  );
  assert.ok(!JSON.stringify(json).includes(fakeKey));
  allowQuota = false;
  assert.equal((await handler(req(body))).status, 429);
  assert.equal(providerCalls, 1);
  allowQuota = true;
  providerStatus = 403;
  const rejected = await handler(req(body));
  assert.equal(rejected.status, 502);
  assert.ok(!(await rejected.text()).includes(fakeKey));
  delete values.GEMINI_API_KEY;
  assert.equal((await handler(req(body))).status, 503);
  assert.equal((await handler(req({ project: {} }))).status, 503);
});
