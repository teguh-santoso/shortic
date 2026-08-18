const CONFIG = window.APP_CONFIG;

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

function isValidTarget(url) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

async function init() {
  const code = getCodeFromHash();
  if (!code) return;

  const link = await resolveCode(code);
  if (!link) return;

  if (!isValidTarget(link.target_url)) {
    console.error("Invalid target URL:", link.target_url);
    return;
  }

  try {
    await sb.rpc("increment_click_count", { p_code: code });
  } catch (err) {
    console.error("Failed to increment click count:", err.message);
  }
  window.location.replace(link.target_url);
}

init();