// Public anon key: access to application data is controlled by PostgreSQL RLS.
const BASE = "https://rfmelsdtasxoddtolqpb.supabase.co";
const ANON =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJmbWVsc2R0YXN4b2RkdG9scXBiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQyMzY0MzAsImV4cCI6MjEwOTgxMjQzMH0.9iQpUGGfrEKeJaVAdorWN_vef9jIL59L_x48rCEu_Dg";
const SESSION_KEY = "od-supabase-session-v1";
const COOLDOWN_KEY = "od-auth-cooldowns-v1";
let cooldowns = {};
try {
  cooldowns = JSON.parse(sessionStorage.getItem(COOLDOWN_KEY)) || {};
} catch {
  /* in-memory cooldown */
}
function authWait(mode) {
  return Math.max(
    0,
    Math.ceil(((Number(cooldowns[mode]) || 0) - Date.now()) / 1000),
  );
}
function rateLimitError(seconds, code = "over_request_rate_limit") {
  const error = new Error("Çok fazla istek gönderildi.");
  error.status = 429;
  error.code = code;
  error.retryAfter = seconds;
  return error;
}
async function authRequest(mode, path, options) {
  const remaining = authWait(mode);
  if (remaining) throw rateLimitError(remaining);
  try {
    return await request(path, options);
  } catch (error) {
    if (error.status === 429) {
      cooldowns[mode] = Date.now() + error.retryAfter * 1000;
      try {
        sessionStorage.setItem(COOLDOWN_KEY, JSON.stringify(cooldowns));
      } catch {
        /* in-memory cooldown */
      }
    }
    throw error;
  }
}
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
  { method = "GET", body, auth = true, headers = {}, timeoutMs = 20000 } = {},
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
    signal: AbortSignal.timeout(timeoutMs),
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
    error.code = data?.error_code || data?.code;
    if (response.status === 429) {
      const retry = response.headers.get("Retry-After");
      const seconds =
        retry && /^\d+(?:\.\d+)?$/.test(retry.trim())
          ? Number(retry)
          : retry
            ? (Date.parse(retry) - Date.now()) / 1000
            : NaN;
      error.retryAfter =
        Number.isFinite(seconds) && seconds > 0 ? Math.ceil(seconds) : 60;
    }
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
async function authenticatedRequest(path, options = {}) {
  if (session?.expires_at && session.expires_at * 1000 < Date.now() + 60000)
    await refresh();
  try {
    return await request(path, options);
  } catch (error) {
    if (error.status === 401 && session?.refresh_token) {
      await refresh();
      return request(path, options);
    }
    throw error;
  }
}
function api(path, options = {}) {
  return authenticatedRequest("/rest/v1/" + path, options);
}
export const db = {
  get session() {
    return session;
  },
  authWait,
  async signIn(username, password) {
    const data = await authRequest(
      "login",
      "/auth/v1/token?grant_type=password",
      {
        method: "POST",
        auth: false,
        body: { email: username + "@login.ogretmendefteri.invalid", password },
      },
    );
    storeSession(data);
    return data;
  },
  async signUp(username, password) {
    const data = await authRequest("register", "/auth/v1/signup", {
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
  async edge(name, body = {}) {
    return authenticatedRequest("/functions/v1/" + name, {
      method: "POST",
      body,
      timeoutMs: 95000,
    });
  },
  async insertReturning(table, body) {
    return api(table, {
      method: "POST",
      body,
      headers: { Prefer: "return=representation" },
    });
  },
  async updateReturning(table, query, body) {
    return api(table + "?" + query, {
      method: "PATCH",
      body,
      headers: { Prefer: "return=representation" },
    });
  },
  async rpc(name, body = {}) {
    return api("rpc/" + name, { method: "POST", body });
  },
};
export function friendlyError(error) {
  if (error.status === 429) {
    const seconds = error.retryAfter || 60;
    if (error.code === "over_email_send_rate_limit")
      return `Supabase e-posta gönderim sınırına ulaşıldı. Authentication → Sign In / Providers → Email bölümünde Confirm email seçeneğini kapatın. En az ${seconds} saniye bekleyin; sonra mevcut hesapla Giriş yap seçeneğini deneyin. Yeni hesap için bekleme sonunda Öğrenci kaydı kullanın.`;
    return `Supabase istek sınırına ulaşıldı. En az ${seconds} saniye bekleyip tekrar deneyin. Art arda kayıt/giriş isteği göndermeyin.`;
  }
  if (error.code === "signup_disabled")
    return "Supabase yeni kullanıcı kaydı kapalı. Authentication ayarlarında Allow new users to sign up seçeneğini açın.";
  if (error.code === "email_provider_disabled")
    return "Supabase Email sağlayıcısı kapalı. Authentication → Sign In / Providers → Email bölümünde etkinleştirin.";
  if (
    error.code === "email_address_invalid" ||
    error.code === "email_address_not_authorized"
  )
    return (
      "Supabase kullanıcı adı için üretilen e-posta kimliğini kabul etmedi. Authentication ayarlarını ve hata kodunu kontrol edin. (" +
      error.code +
      ")"
    );
  if (error.code === "weak_password")
    return "Şifre Supabase parola kurallarını karşılamıyor. Projede ayarlanan uzunluk ve karakter koşullarını karşılayan bir şifre seçin.";
  if (
    error.code === "unexpected_failure" ||
    /Database error saving new user/i.test(error.message)
  )
    return "Supabase kullanıcı kaydı sırasında veritabanı hatası oluştu. Authentication Logs içindeki SQL/trigger hatasını kontrol edin; mevcut kayıtları silmeyin.";
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
  if (
    error.code === "invalid_credentials" ||
    error.message === "Invalid login credentials"
  )
    return "Kullanıcı adı veya şifre eşleşmiyor. Öğretmen için SQL'e yazdığınız parolayı kullanın. Parolayı değiştirmek için soldaki SQL kurulumu → Giriş onarımı seçeneğini kullanın; kurulum SQL'ini tekrar çalıştırmak mevcut parolayı değiştirmez.";
  if (
    /already registered|already been registered|duplicate key/i.test(
      error.message,
    )
  )
    return "Bu kullanıcı adı kullanılıyor. Başka bir ad seçin.";
  if (
    error.code === "email_not_confirmed" ||
    /Email not confirmed/i.test(error.message)
  )
    return "Supabase Authentication → Sign In / Providers → Email bölümünde Confirm email seçeneğini kapatın. E-posta olmadan kayıt için bu ayar gerekir.";
  return error.message;
}
