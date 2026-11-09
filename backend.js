// Public anon key: access to application data is controlled by PostgreSQL RLS.
const BASE = "https://rfmelsdtasxoddtolqpb.supabase.co";
const ANON =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJmbWVsc2R0YXN4b2RkdG9scXBiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQyMzY0MzAsImV4cCI6MjEwOTgxMjQzMH0.9iQpUGGfrEKeJaVAdorWN_vef9jIL59L_x48rCEu_Dg";
const SESSION_KEY = "od-supabase-session-v1";
let session = null,
  refreshPending = null;
try {
  session = JSON.parse(localStorage.getItem(SESSION_KEY));
} catch {
  /* blocked storage or invalid session */
}
function storeSession(value) {
  session = value;
  try {
    if (value) localStorage.setItem(SESSION_KEY, JSON.stringify(value));
    else localStorage.removeItem(SESSION_KEY);
  } catch {
    /* in-memory session remains usable */
  }
}
async function request(
  path,
  { method = "GET", body, auth = true, headers = {} } = {},
) {
  if (auth && !session?.access_token)
    throw new Error("Kullanıcı girişi gerekiyor.");
  const response = await fetch(BASE + path, {
    method,
    headers: {
      apikey: ANON,
      Authorization: `Bearer ${auth ? session.access_token : ANON}`,
      "Content-Type": "application/json",
      ...headers,
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(20000),
  });
  const raw = await response.text();
  let data;
  try {
    data = raw ? JSON.parse(raw) : null;
  } catch {
    data = null;
  }
  if (!response.ok) {
    const error = new Error(
      data?.msg ||
        data?.message ||
        data?.error_description ||
        data?.error ||
        `Sunucu hatası (${response.status})`,
    );
    error.status = response.status;
    error.code = data?.code;
    throw error;
  }
  return data;
}
async function refresh() {
  if (!session?.refresh_token) return;
  if (!refreshPending)
    refreshPending = (async () => {
      try {
        const result = await request(
          "/auth/v1/token?grant_type=refresh_token",
          {
            method: "POST",
            auth: false,
            body: { refresh_token: session.refresh_token },
          },
        );
        storeSession(result);
      } catch (error) {
        if (error.status === 400 || error.status === 401) {
          storeSession(null);
          window.dispatchEvent(new Event("od-signed-out"));
        }
        throw error;
      } finally {
        refreshPending = null;
      }
    })();
  return refreshPending;
}
async function api(path, options = {}) {
  if (session?.expires_at && session.expires_at * 1000 < Date.now() + 60000)
    await refresh();
  try {
    return await request("/rest/v1/" + path, options);
  } catch (error) {
    if (error.status === 401 && session?.refresh_token) {
      await refresh();
      return request("/rest/v1/" + path, options);
    }
    throw error;
  }
}
export const db = {
  get session() {
    return session;
  },
  async signIn(username, password) {
    const data = await request("/auth/v1/token?grant_type=password", {
      method: "POST",
      auth: false,
      body: { email: username + "@login.ogretmendefteri.invalid", password },
    });
    storeSession(data);
    return data;
  },
  async signUp(username, password) {
    const data = await request("/auth/v1/signup", {
      method: "POST",
      auth: false,
      body: {
        email: username + "@login.ogretmendefteri.invalid",
        password,
        data: { username },
      },
    });
    if (data.access_token) storeSession(data);
    return data;
  },
  async signOut() {
    try {
      if (session) await request("/auth/v1/logout", { method: "POST" });
    } finally {
      storeSession(null);
    }
  },
  async changePassword(password) {
    if (session?.expires_at * 1000 < Date.now() + 60000) await refresh();
    return request("/auth/v1/user", { method: "PUT", body: { password } });
  },
  async get(table, query = "") {
    return api(table + "?select=*&" + query);
  },
  async insert(table, body) {
    return api(table, {
      method: "POST",
      body,
      headers: { Prefer: "return=minimal" },
    });
  },
  async update(table, query, body) {
    return api(table + "?" + query, {
      method: "PATCH",
      body,
      headers: { Prefer: "return=minimal" },
    });
  },
  async remove(table, query) {
    return api(table + "?" + query, { method: "DELETE" });
  },
  async rpc(name, body = {}) {
    return api("rpc/" + name, { method: "POST", body });
  },
};
export function friendlyError(error) {
  if (error.name === "TimeoutError")
    return "Sunucu yanıtı gecikti. Biraz sonra tekrar deneyin.";
  if (error instanceof TypeError)
    return "Supabase bağlantısı kurulamadı. İnternet bağlantınızı ve proje adresini kontrol edin.";
  if (
    error.code === "PGRST205" ||
    error.code === "42P01" ||
    error.code === "PGRST202"
  )
    return "Veritabanı kurulumu eksik. Soldaki SQL kurulumu düğmesinden kodu alıp Supabase SQL Editor içinde çalıştırın.";
  if (error.message === "Invalid login credentials")
    return "Kullanıcı adı veya şifre yanlış. İlk girişten önce SQL kurulumunu tamamlayın.";
  if (
    /already registered|already been registered|duplicate key/i.test(
      error.message,
    )
  )
    return "Bu kullanıcı adı kullanılıyor. Başka bir ad seçin.";
  if (/Email not confirmed/i.test(error.message))
    return "Supabase Authentication → Sign In / Providers → Email bölümünde Confirm email seçeneğini kapatın. E-posta olmadan kayıt için bu ayar gerekir.";
  return error.message;
}
