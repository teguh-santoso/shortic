const CONFIG = window.APP_CONFIG;

const el = (id) => document.getElementById(id);
const show = (id) => {
  el("state-loading").classList.add("hidden");
  el("state-error").classList.add("hidden");
  el("state-landing").classList.add("hidden");
  el(id).classList.remove("hidden");
};

const sb = window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);

function getCodeFromHash() {
  const hash = window.location.hash.replace(/^#/, "");
  return hash.trim().toLowerCase();
}

async function resolveCode(code) {
  const { data, error } = await sb.rpc("get_link_by_code", { p_code: code });
  if (error) {
    console.error("Lookup error:", error.message);
    return null;
  }
  return data && data.length > 0 ? data[0] : null;
}

function redirectTo(url) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      throw new Error("Invalid protocol");
    }
  } catch {
    show("state-error");
    return;
  }
  const code = getCodeFromHash();
  sb.rpc("increment_click_count", { p_code: code }).catch(() => {});
  window.location.replace(url);
}

async function init() {
  const code = getCodeFromHash();
  if (!code) {
    show("state-landing");
    return;
  }

  show("state-loading");
  const link = await resolveCode(code);
  if (link) {
    redirectTo(link.target_url);
  } else {
    show("state-error");
  }
}

init();