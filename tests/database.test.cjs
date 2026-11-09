const { test } = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { PGlite } = require("@electric-sql/pglite");
const { pgcrypto } = require("@electric-sql/pglite/contrib/pgcrypto");
const { randomUUID } = require("node:crypto");

test("Schema installation, repeatability and teacher/student authorization", async (t) => {
  const db = new PGlite({ extensions: { pgcrypto } });
  await db.exec(`create role anon;create role authenticated;create schema auth;
 create table auth.users(instance_id uuid,id uuid primary key,aud text,role text,email text unique,encrypted_password text,email_confirmed_at timestamptz,raw_app_meta_data jsonb,raw_user_meta_data jsonb,created_at timestamptz,updated_at timestamptz,confirmation_token text,recovery_token text,email_change_token_new text,email_change text,email_change_token_current text,reauthentication_token text);
 create table auth.identities(id uuid primary key,user_id uuid,provider_id text,identity_data jsonb,provider text,created_at timestamptz,updated_at timestamptz);
 create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 grant usage on schema auth,public to authenticated,anon;grant execute on function auth.uid() to authenticated,anon;`);
  const template = readFileSync("supabase/schema.sql", "utf8");
  const sql = template.replace(
    "__TEACHER_PASSWORD__",
    "temporary-test-password",
  );
  await db.exec(sql);
  await db.exec(sql);
  const admin = (
    await db.query(`select id from public.od_profiles where role='teacher'`)
  ).rows[0].id;
  const a = randomUUID(),
    b = randomUUID(),
    c = randomUUID();
  for (const [id, username] of [
    [a, "ogrenci_a"],
    [b, "ogrenci_b"],
    [c, "ogrenci_c"],
  ])
    await db.query(
      `insert into auth.users(id,email,raw_user_meta_data) values($1,$2,'{"role":"teacher"}')`,
      [id, username + "@login.ogretmendefteri.invalid"],
    );
  const act = async (id, fn) => {
    await db.query(`select set_config('request.jwt.claim.sub',$1,false)`, [
      id || "",
    ]);
    await db.exec(`set role ${id ? "authenticated" : "anon"}`);
    try {
      return await fn();
    } finally {
      await db.exec("reset role");
    }
  };
  const scalar = async (sql, params = []) =>
    Object.values((await db.query(sql, params)).rows[0])[0];
  await t.test("only one teacher, signup metadata cannot elevate", async () => {
    assert.equal(
      await scalar(
        `select count(*)::int from od_profiles where role='teacher'`,
      ),
      1,
    );
    assert.equal(
      await scalar(`select role from od_profiles where id=$1`, [a]),
      "student",
    );
    assert.equal(
      await scalar(
        `select encrypted_password=extensions.crypt('temporary-test-password',encrypted_password) from auth.users where id=$1`,
        [admin],
      ),
      true,
    );
  });
  await t.test(
    "anonymous cannot read profiles or messages or call privileged RPCs",
    async () => {
      await act(null, async () => {
        await assert.rejects(
          db.query("select * from od_profiles"),
          /permission denied/,
        );
        await assert.rejects(
          db.query("select * from od_messages"),
          /permission denied/,
        );
        await assert.rejects(
          db.query("select * from od_contacts()"),
          /permission denied/,
        );
      });
    },
  );
  await t.test(
    "students can only read private profile of themselves; directory omits private fields",
    async () => {
      await act(a, async () => {
        assert.equal(await scalar("select count(*)::int from od_profiles"), 1);
        const contacts = (await db.query("select * from od_contacts()")).rows;
        assert.equal(contacts.length, 4);
        assert.deepEqual(
          Object.keys(contacts[0]).sort(),
          ["id", "username", "display_name", "role"].sort(),
        );
        await assert.rejects(
          db.query(`update od_profiles set role='teacher' where id=$1`, [a]),
          /permission denied/,
        );
        await assert.rejects(
          db.query(
            `update od_profiles set username='burakturgut' where id=$1`,
            [a],
          ),
          /permission denied/,
        );
      });
    },
  );
  await t.test(
    "messages visible only to two participants and teacher",
    async () => {
      await act(a, () =>
        db.query(
          `insert into od_messages(sender_id,recipient_id,body) values($1,$2,'merhaba')`,
          [a, b],
        ),
      );
      for (const [id, n] of [
        [a, 1],
        [b, 1],
        [c, 0],
        [admin, 1],
      ])
        await act(id, async () =>
          assert.equal(
            await scalar("select count(*)::int from od_messages"),
            n,
          ),
        );
      await act(c, async () => {
        await assert.rejects(
          db.query(
            `insert into od_messages(sender_id,recipient_id,body) values($1,$2,'sahte')`,
            [a, b],
          ),
          /row-level security/,
        );
        await assert.rejects(
          db.query(`delete from od_messages`),
          /permission denied/,
        );
      });
    },
  );
  let aid;
  await t.test(
    "only teacher assigns; allocation is atomic and selective",
    async () => {
      await act(a, async () => {
        await assert.rejects(
          db.query(
            `select od_create_assignment('X','Y',current_date,array[$1::uuid])`,
            [a],
          ),
          /Öğretmen/,
        );
      });
      aid = await act(admin, () =>
        scalar(
          `select od_create_assignment('Kesirler','Çözünüz',current_date,array[$1::uuid])`,
          [a],
        ),
      );
      await act(b, async () =>
        assert.equal(
          await scalar("select count(*)::int from od_assignments"),
          0,
        ),
      );
      await act(a, async () =>
        assert.equal(
          await scalar("select count(*)::int from od_assignments"),
          1,
        ),
      );
      await act(admin, async () => {
        await assert.rejects(
          db.query(
            `select od_create_assignment('Hatalı','',current_date,array[$1::uuid,$2::uuid])`,
            [a, randomUUID()],
          ),
          /Geçersiz öğrenci/,
        );
        assert.equal(
          await scalar("select count(*)::int from od_assignments"),
          1,
        );
      });
    },
  );
  await t.test(
    "submission grading return and resubmission; students cannot set scores",
    async () => {
      await act(b, async () => {
        await assert.rejects(
          db.query(`select od_submit_assignment($1,'başkasının ödevi')`, [aid]),
          /atanmadı/,
        );
      });
      await act(a, async () => {
        await db.query(`select od_submit_assignment($1,'İlk çözüm')`, [aid]);
        await assert.rejects(
          db.query(`update od_submissions set score=100`),
          /permission denied/,
        );
        await assert.rejects(
          db.query(`select od_review_submission($1,$2,'graded',100,'sahte')`, [
            aid,
            a,
          ]),
          /Öğretmen/,
        );
        await assert.rejects(
          db.query(`select od_submit_assignment($1,'Tekrar')`, [aid]),
          /iade/,
        );
      });
      await act(admin, () =>
        db.query(
          `select od_review_submission($1,$2,'returned',null,'Düzelt')`,
          [aid, a],
        ),
      );
      await act(a, () =>
        db.query(`select od_submit_assignment($1,'Düzelttim')`, [aid]),
      );
      await act(admin, () =>
        db.query(`select od_review_submission($1,$2,'graded',85,'Harika')`, [
          aid,
          a,
        ]),
      );
      await act(a, async () => {
        assert.equal(await scalar("select score from od_submissions"), 85);
      });
      await act(b, async () =>
        assert.equal(
          await scalar("select count(*)::int from od_submissions"),
          0,
        ),
      );
    },
  );
  await t.test(
    "activity history is teacher-only and cannot be forged for another student",
    async () => {
      await act(a, async () => {
        await db.query(
          `insert into od_activity_log(student_id,event_type,label) values($1,'game','Matematik')`,
          [a],
        );
        assert.equal(
          await scalar("select count(*)::int from od_activity_log"),
          0,
        );
        await assert.rejects(
          db.query(
            `insert into od_activity_log(student_id,event_type,label) values($1,'game','Sahte')`,
            [b],
          ),
          /row-level security/,
        );
        await assert.rejects(
          db.query(
            `insert into od_activity_log(student_id,event_type,label,created_at) values($1,'game','Sahte',now())`,
            [a],
          ),
          /permission denied/,
        );
      });
      await act(admin, async () =>
        assert.equal(
          await scalar("select count(*)::int from od_activity_log"),
          1,
        ),
      );
    },
  );
  await t.test(
    "personal plans private to teacher; bonus points teacher-issued and student-scoped",
    async () => {
      await act(admin, async () => {
        await db.query(
          `insert into od_teacher_entries(owner_id,kind,title) values($1,'annual','Yıllık plan')`,
          [admin],
        );
        await db.query(
          `insert into od_point_awards(student_id,awarded_by,points,reason) values($1,$2,10,'Katılım')`,
          [a, admin],
        );
      });
      await act(a, async () => {
        assert.equal(
          await scalar("select count(*)::int from od_teacher_entries"),
          0,
        );
        assert.equal(
          await scalar("select sum(points)::int from od_point_awards"),
          10,
        );
        await assert.rejects(
          db.query(
            `insert into od_point_awards(student_id,awarded_by,points,reason) values($1,$1,100,'Sahte')`,
            [a],
          ),
          /row-level security/,
        );
      });
      await act(b, async () =>
        assert.equal(
          await scalar("select count(*)::int from od_point_awards"),
          0,
        ),
      );
    },
  );
  await t.test(
    "auth repair resets only teacher password and confirms app accounts without deleting data",
    async () => {
      const before = {};
      for (const table of [
        "od_profiles",
        "od_assignments",
        "od_messages",
        "od_submissions",
      ])
        before[table] = await scalar("select count(*)::int from " + table);
      await db.query(
        "update auth.users set email_confirmed_at=null where id=$1",
        [a],
      );
      const repair = readFileSync("supabase/repair-auth.sql", "utf8").replace(
        "__TEACHER_PASSWORD__",
        "repaired-test-password",
      );
      await db.exec(repair);
      await db.exec(repair);
      assert.equal(
        await scalar(
          "select encrypted_password=extensions.crypt('repaired-test-password',encrypted_password) from auth.users where id=$1",
          [admin],
        ),
        true,
      );
      assert.equal(
        await scalar(
          "select email_confirmed_at is not null from auth.users where id=$1",
          [a],
        ),
        true,
      );
      for (const table of Object.keys(before))
        assert.equal(
          await scalar("select count(*)::int from " + table),
          before[table],
        );
    },
  );
  await db.close();
});
