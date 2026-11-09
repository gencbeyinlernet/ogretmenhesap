const { test } = require("node:test");
const assert = require("node:assert/strict");
const { pathToFileURL } = require("node:url");
const { resolve } = require("node:path");

function storage() {
  const values = new Map();
  return {
    getItem: (k) => values.get(k) ?? null,
    setItem: (k, v) => values.set(k, String(v)),
    removeItem: (k) => values.delete(k),
  };
}
test("Auth error responses, Retry-After and duplicate request protection", async (t) => {
  const originalFetch = global.fetch,
    originalNow = Date.now,
    originalLocal = global.localStorage,
    originalSession = global.sessionStorage;
  global.localStorage = storage();
  global.sessionStorage = storage();
  let now = originalNow(),
    calls = 0,
    response;
  Date.now = () => now;
  global.fetch = async () => {
    calls++;
    return response();
  };
  const { db, friendlyError } = await import(
    pathToFileURL(resolve("backend.js")).href + "?auth-test"
  );
  try {
    await t.test(
      "GoTrue error_code is preserved; 400 is not mislabeled as missing schema",
      async () => {
        response = () =>
          new Response(
            JSON.stringify({
              code: 400,
              error_code: "invalid_credentials",
              msg: "Invalid login credentials",
            }),
            { status: 400 },
          );
        await assert.rejects(
          db.signIn("burakturgut", "test-password"),
          (err) => {
            assert.equal(err.code, "invalid_credentials");
            assert.match(friendlyError(err), /Giriş onarımı/);
            return true;
          },
        );
      },
    );
    await t.test(
      "email rate limit honors Retry-After and suppresses duplicate signup calls",
      async () => {
        response = () =>
          new Response(
            JSON.stringify({
              error_code: "over_email_send_rate_limit",
              msg: "email rate limit exceeded",
            }),
            { status: 429, headers: { "Retry-After": "120" } },
          );
        await assert.rejects(db.signUp("deniz", "test-password"), (err) => {
          assert.equal(err.retryAfter, 120);
          assert.match(friendlyError(err), /Confirm email/);
          return true;
        });
        const before = calls;
        await assert.rejects(
          db.signUp("deniz", "test-password"),
          (err) => err.status === 429,
        );
        assert.equal(calls, before);
        assert.equal(db.authWait("register"), 120);
        assert.equal(db.authWait("login"), 0);
        const saved = JSON.parse(
          sessionStorage.getItem("od-auth-cooldowns-v1"),
        );
        assert.equal(saved.register, now + 120000);
        now += 121000;
        response = () =>
          new Response(
            JSON.stringify({
              access_token: "test-token",
              user: { id: "test-user" },
            }),
            { status: 200 },
          );
        await db.signUp("deniz", "test-password");
        assert.equal(db.authWait("register"), 0);
        assert.equal(db.session.user.id, "test-user");
      },
    );
    await t.test(
      "HTTP date Retry-After is honored; missing header gets 60 second fallback",
      async () => {
        response = () =>
          new Response("{}", {
            status: 429,
            headers: { "Retry-After": new Date(now + 90000).toUTCString() },
          });
        await assert.rejects(
          db.signIn("deniz", "test-password"),
          (err) => err.retryAfter >= 89 && err.retryAfter <= 90,
        );
        now += 91000;
        response = () => new Response("{}", { status: 429 });
        await assert.rejects(
          db.signIn("deniz", "test-password"),
          (err) => err.retryAfter === 60,
        );
      },
    );
    await t.test(
      "disabled signup, weak passwords, invalid identities and DB failures have actionable messages",
      () => {
        assert.match(
          friendlyError({ code: "signup_disabled" }),
          /Allow new users/,
        );
        assert.match(
          friendlyError({ code: "weak_password" }),
          /parola kurallarını/,
        );
        assert.match(
          friendlyError({ code: "email_address_invalid" }),
          /email_address_invalid/,
        );
        assert.match(
          friendlyError({
            code: "unexpected_failure",
            message: "Database error saving new user",
          }),
          /Logs/,
        );
      },
    );
  } finally {
    global.fetch = originalFetch;
    Date.now = originalNow;
    global.localStorage = originalLocal;
    global.sessionStorage = originalSession;
  }
});
