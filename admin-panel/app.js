const CODE_CHARS = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
const CODE_LENGTH = 6;

function randomCode(length = CODE_LENGTH) {
  let out = "";
  const rand = new Uint32Array(length);
  crypto.getRandomValues(rand);
  for (let i = 0; i < length; i++) {
    out += CODE_CHARS[rand[i] % CODE_CHARS.length];
  }
  return out;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function shortPreview(url) {
  try {
    const u = new URL(url);
    return u.hostname + (u.pathname === "/" ? "" : u.pathname);
  } catch {
    return url;
  }
}

function getShortUrl(code) {
  const cfg = window.APP_CONFIG || {};
  let base = String(cfg.PUBLIC_BASE_URL || "").replace(/\/+$/, "");
  if (!base) {
    base = window.location.origin.replace("admin.", "");
  }
  return base + "/#" + code;
}

async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    document.body.removeChild(ta);
  }
}

function formatDate(iso) {
  if (!iso) return "-";
  return new Date(iso).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" });
}

async function createLink(targetUrl, code) {
  // Coba insert; kalau unique violation (kode sudah dipakai), retry dengan kode baru.
  for (let attempt = 0; attempt < 5; attempt++) {
    const candidate = code || randomCode();
    const { data, error } = await sb
      .from("links")
      .insert({ code: candidate, target_url: targetUrl, owner_id: window.APP_USER.id })
      .select("code")
      .single();

    if (!error) return { ok: true, code: candidate };
    if (error.code === "23505") {
      code = null; // retry dengan kode acak baru
      continue;
    }
    return { ok: false, error };
  }
  return { ok: false, error: { message: "Gagal mendapat kode unik, coba lagi." } };
}

async function loadLinks() {
  const tbody = el("links-tbody");
  tbody.innerHTML = "";

  let query = sb.from("links").select("id, code, target_url, click_count, created_at, owner_id");
  if (window.APP_USER.role !== "admin") {
    query = query.eq("owner_id", window.APP_USER.id);
  }
  const { data, error } = await query.order("created_at", { ascending: false });

  if (error) {
    console.error("loadLinks error:", error.message);
    return;
  }

  if (!data.length) {
    el("links-empty").classList.remove("hidden");
    return;
  }
  el("links-empty").classList.add("hidden");

  for (const link of data) {
    const tr = document.createElement("tr");
    const owner = window.APP_USER.role === "admin" && link.owner_id !== window.APP_USER.id ? link.owner_id.slice(0, 8) : "Anda";
    tr.innerHTML = `
      <td><code>${escapeHtml(link.code)}</code></td>
      <td><div class="url-cell"><a href="${escapeHtml(link.target_url)}" target="_blank" rel="noopener" title="${escapeHtml(link.target_url)}">${escapeHtml(shortPreview(link.target_url))}</a></div></td>
      <td>${link.click_count}</td>
      <td>${formatDate(link.created_at)}</td>
      <td>${escapeHtml(owner)}</td>
      <td>
        <button class="btn btn-sm btn-copy" data-code="${escapeHtml(link.code)}" title="Salin tautan pendek"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg></button>
        <button class="btn btn-sm btn-edit" data-id="${link.id}" data-code="${escapeHtml(link.code)}" data-url="${escapeHtml(link.target_url)}">Edit</button>
        <button class="btn btn-sm btn-danger btn-delete" data-id="${link.id}">Hapus</button>
      </td>`;
    tbody.appendChild(tr);
  }
}

async function loadProfiles() {
  const tbody = el("profiles-tbody");
  tbody.innerHTML = "";
  const { data, error } = await sb.from("profiles").select("id, email, role").order("email");

  if (error) {
    console.error("loadProfiles error:", error.message);
    return;
  }

  for (const profile of data) {
    const tr = document.createElement("tr");
    const isSelf = profile.id === window.APP_USER.id;
    tr.innerHTML = `
      <td>${escapeHtml(profile.email)} ${isSelf ? "(Anda)" : ""}</td>
      <td>${escapeHtml(profile.role)}</td>
      <td>
        <button class="btn btn-sm" data-action="role" data-id="${profile.id}" data-role="${profile.role === "admin" ? "user" : "admin"}" ${isSelf ? "disabled" : ""}>
          ${profile.role === "admin" ? "Turunkan ke user" : "Naikkan ke admin"}
        </button>
      </td>`;
    tbody.appendChild(tr);
  }
}

async function loadAllowlist() {
  const tbody = el("allowlist-tbody");
  tbody.innerHTML = "";
  const { data, error } = await sb.from("allowed_emails").select("email, role, added_at").order("added_at", { ascending: false });

  if (error) {
    console.error("loadAllowlist error:", error.message);
    return;
  }

  for (const entry of data) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(entry.email)}</td>
      <td>${escapeHtml(entry.role)}</td>
      <td><button class="btn btn-sm btn-danger" data-action="allow-delete" data-email="${escapeHtml(entry.email)}">Hapus</button></td>`;
    tbody.appendChild(tr);
  }
}

async function initDashboard() {
  if (!window.APP_USER) return;

  el("create-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const url = el("target-url").value.trim();
    const custom = el("custom-code").value.trim().toLowerCase();
    const msg = el("create-msg");
    msg.classList.add("hidden");

    const result = await createLink(url, custom);
    if (result.ok) {
      el("target-url").value = "";
      el("custom-code").value = "";
      msg.textContent = `Link dibuat: ${getShortUrl(result.code)}`;
      msg.classList.add("text-success");
      msg.classList.remove("hidden");
      await loadLinks();
    } else {
      msg.textContent = "Gagal membuat link: " + result.error.message;
      msg.classList.add("text-danger");
      msg.classList.remove("hidden");
    }
  });

  el("generate-btn").addEventListener("click", () => {
    el("custom-code").value = randomCode();
  });

  el("links-tbody").addEventListener("click", async (e) => {
    const copyBtn = e.target.closest(".btn-copy");
    const editBtn = e.target.closest(".btn-edit");
    const deleteBtn = e.target.closest(".btn-delete");
    if (copyBtn) {
      const shortUrl = getShortUrl(copyBtn.dataset.code);
      await copyToClipboard(shortUrl);
      const original = copyBtn.innerHTML;
      copyBtn.innerHTML = "OK";
      setTimeout(() => { copyBtn.innerHTML = original; }, 1500);
      return;
    }
    if (editBtn) {
      const url = prompt("URL tujuan baru:", editBtn.dataset.url);
      if (url === null) return;
      const { error } = await sb
        .from("links")
        .update({ target_url: url.trim() })
        .eq("id", editBtn.dataset.id);
      if (error) alert("Gagal update: " + error.message);
      await loadLinks();
    }
    if (deleteBtn) {
      if (!confirm("Hapus link ini?")) return;
      const { error } = await sb.from("links").delete().eq("id", deleteBtn.dataset.id);
      if (error) alert("Gagal hapus: " + error.message);
      await loadLinks();
    }
  });

  if (window.APP_USER.role === "admin") {
    el("profiles-tbody").addEventListener("click", async (e) => {
      const btn = e.target.closest("[data-action='role']");
      if (!btn) return;
      const { error } = await sb
        .from("profiles")
        .update({ role: btn.dataset.role })
        .eq("id", btn.dataset.id);
      if (error) alert("Gagal ubah role: " + error.message);
      await loadProfiles();
    });

    el("allowlist-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const email = el("allow-email").value.trim().toLowerCase();
      const role = el("allow-role").value;
      const msg = el("allowlist-msg");
      msg.classList.add("hidden");

      const { error } = await sb.from("allowed_emails").insert({ email, role });
      if (error) {
        msg.textContent = "Gagal menambah: " + error.message;
        msg.classList.add("text-danger");
      } else {
        el("allow-email").value = "";
        msg.textContent = "Email ditambahkan ke allowlist.";
        msg.classList.add("text-success");
        await loadAllowlist();
      }
      msg.classList.remove("hidden");
    });

    el("allowlist-tbody").addEventListener("click", async (e) => {
      const btn = e.target.closest("[data-action='allow-delete']");
      if (!btn) return;
      if (!confirm(`Hapus ${btn.dataset.email} dari allowlist?`)) return;
      const { error } = await sb.from("allowed_emails").delete().eq("email", btn.dataset.email);
      if (error) alert("Gagal hapus: " + error.message);
      await loadAllowlist();
    });

    await loadProfiles();
    await loadAllowlist();
  }

  await loadLinks();
}

window.onAuthReady = initDashboard;