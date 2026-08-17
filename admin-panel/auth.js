const CONFIG = window.APP_CONFIG;
const sb = window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);

const isLoginPage = !!document.getElementById("login-btn");
const isDashboard = !!document.getElementById("dashboard");

const el = (id) => document.getElementById(id);

async function guard() {
  const { data, error } = await sb.auth.getSession();
  if (error) {
    console.error("Session error:", error.message);
  }

  const session = data.session;

  if (isLoginPage) {
    if (session) window.location.href = "dashboard.html";
    return;
  }

  if (!session) {
    window.location.href = "index.html";
    return;
  }

  el("user-email").textContent = session.user.email;

  const { data: profile, error: profileError } = await sb.rpc("sync_profile_for_current_user");

  if (profileError) {
    console.error("Profile sync error:", profileError.message);
    showDenied();
    await sb.auth.signOut({ scope: "local" });
    return;
  }

  if (!profile) {
    // Email tidak ada di allowlist: session dibuat tapi tidak diizinkan.
    showDenied();
    await sb.auth.signOut({ scope: "local" });
    return;
  }

  window.APP_USER = profile;
  el("user-role").textContent = profile.role;
  el("user-role").classList.add(profile.role === "admin" ? "badge-admin" : "badge-user");
  el("dashboard").classList.remove("hidden");

  if (profile.role === "admin") {
    el("admin-panel").classList.remove("hidden");
  }

  if (typeof window.onAuthReady === "function") {
    window.onAuthReady();
  }
}

function showDenied() {
  el("denied-box").classList.remove("hidden");
  el("dashboard").classList.add("hidden");
}

function bindGlobalActions() {
  if (isLoginPage) {
    el("login-btn").addEventListener("click", async () => {
      const msg = el("login-msg");
      msg.classList.add("hidden");
      const { error } = await sb.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: window.location.origin + "/dashboard.html" },
      });
      if (error) {
        msg.textContent = "Gagal memulai login: " + error.message;
        msg.classList.remove("hidden");
      }
    });
  }

  if (isDashboard) {
    const logoutBtn = el("logout-btn");
    if (logoutBtn) {
      logoutBtn.addEventListener("click", async () => {
        await sb.auth.signOut({ scope: "local" });
        window.location.href = "index.html";
      });
    }
    const deniedLogout = el("denied-logout");
    if (deniedLogout) {
      deniedLogout.addEventListener("click", async () => {
        await sb.auth.signOut({ scope: "local" });
        window.location.href = "index.html";
      });
    }
  }
}

sb.auth.onAuthStateChange((event, session) => {
  if (event === "SIGNED_IN" && session && isLoginPage) {
    window.location.href = "dashboard.html";
  }
});

bindGlobalActions();
guard();