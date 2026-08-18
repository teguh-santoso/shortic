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

function showToast(message) {
  const toast = document.getElementById("toast");
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => toast.classList.remove("show"), 2000);
}

function spinIcon(id) {
  const icon = document.getElementById(id);
  if (!icon) return;
  icon.classList.remove("icon-spin");
  void icon.offsetWidth;
  icon.classList.add("icon-spin");
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

const PAGE_SIZE = 10;
const linksState = { page: 1, search: "", total: 0 };

function buildLinksQuery(select, { withRange = true, count = false } = {}) {
  let query = count
    ? sb.from("links").select("id", { count: "exact", head: true })
    : sb.from("links").select(select);
  if (window.APP_USER.role !== "admin") {
    query = query.eq("owner_id", window.APP_USER.id);
  }
  if (linksState.search) {
    const esc = linksState.search.replace(/[%_*\\]/g, (m) => "\\" + m);
    const filter = `code.ilike.*${esc}*,target_url.ilike.*${esc}*`;
    query = query.or(filter);
  }
  if (withRange) {
    const from = (linksState.page - 1) * PAGE_SIZE;
    query = query.range(from, from + PAGE_SIZE - 1);
  }
  return query;
}

async function fetchLinks() {
  const { count, error: countError } = await buildLinksQuery("id", { withRange: false, count: true })
    .order("created_at", { ascending: false });
  if (countError) console.error("fetchLinks count error:", countError.message);
  linksState.total = count || 0;

  const { data, error } = await buildLinksQuery("id, code, target_url, click_count, created_at, owner_id")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("fetchLinks error:", error.message);
    return;
  }

  if (!data.length) {
    el("links-empty").classList.remove("hidden");
  } else {
    el("links-empty").classList.add("hidden");
  }

  renderLinks(data || []);
  renderPagination();
}

function renderLinks(data) {
  const tbody = el("links-tbody");
  tbody.innerHTML = "";

  for (const link of data) {
    const tr = document.createElement("tr");
    const owner = window.APP_USER.role === "admin" && link.owner_id !== window.APP_USER.id ? link.owner_id.slice(0, 8) : "Anda";
    tr.innerHTML = `
      <td><code>${escapeHtml(link.code)}</code></td>
      <td class="hide-sm"><div class="url-cell"><a href="${escapeHtml(link.target_url)}" target="_blank" rel="noopener" title="${escapeHtml(link.target_url)}">${escapeHtml(shortPreview(link.target_url))}</a></div></td>
      <td>${link.click_count}</td>
      <td class="hide-sm">${formatDate(link.created_at)}</td>
      <td class="hide-sm">${escapeHtml(owner)}</td>
      <td>
        <button class="btn btn-sm btn-copy" data-code="${escapeHtml(link.code)}" title="Salin tautan pendek"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg></button>
        <button class="btn btn-sm btn-detail" data-code="${escapeHtml(link.code)}" data-url="${escapeHtml(link.target_url)}" data-created="${escapeHtml(link.created_at)}" data-owner="${escapeHtml(owner)}" data-clicks="${link.click_count}" title="Lihat detail"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg></button>
        <button class="btn btn-sm btn-qr" data-code="${escapeHtml(link.code)}" title="Lihat QR"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect><path d="M14 14h3v3h-3z"></path><path d="M18 18h3v3h-3z"></path></svg></button>
        <button class="btn btn-sm btn-edit" data-id="${link.id}" data-code="${escapeHtml(link.code)}" data-url="${escapeHtml(link.target_url)}">Edit</button>
        <button class="btn btn-sm btn-danger btn-delete" data-id="${link.id}">Hapus</button>
      </td>`;
    tbody.appendChild(tr);
  }
}

function renderPagination() {
  const totalPages = Math.max(1, Math.ceil(linksState.total / PAGE_SIZE));
  if (linksState.page > totalPages) linksState.page = totalPages;

  const pager = el("pagination");
  if (linksState.total <= PAGE_SIZE) {
    pager.classList.add("hidden");
    return;
  }
  pager.classList.remove("hidden");

  const from = (linksState.page - 1) * PAGE_SIZE + 1;
  const to = Math.min(linksState.page * PAGE_SIZE, linksState.total);
  el("page-info").textContent = `Menampilkan ${from}–${to} dari ${linksState.total} · Hal ${linksState.page}/${totalPages}`;
  el("prev-page").disabled = linksState.page <= 1;
  el("next-page").disabled = linksState.page >= totalPages;
}

/* ---------- Modal helpers ---------- */
function openModal(id) {
  el(id).classList.remove("hidden");
  document.body.style.overflow = "hidden";
}

function closeModal(id) {
  el(id).classList.add("hidden");
  document.body.style.overflow = "";
}

function bindModal(modalId, closeBtnId) {
  const overlay = el(modalId);
  el(closeBtnId).addEventListener("click", () => closeModal(modalId));
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) closeModal(modalId);
  });
}

function openDetailModal(d) {
  el("detail-body").innerHTML = `
    <dt>Kode</dt><dd><code>${escapeHtml(d.code)}</code></dd>
    <dt>URL tujuan</dt>
    <dd class="detail-url">
      <a href="${escapeHtml(d.url)}" target="_blank" rel="noopener">${escapeHtml(d.url)}</a>
      <button class="btn btn-sm btn-copy" data-copy="${escapeHtml(d.url)}" title="Salin URL"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg></button>
    </dd>
    <dt>Pemilik</dt><dd>${escapeHtml(d.owner)}</dd>
    <dt>Dibuat</dt><dd>${escapeHtml(d.created)}</dd>
    <dt>Klik</dt><dd>${escapeHtml(d.clicks)}</dd>`;
  openModal("detail-modal");
}

function renderQR(code) {
  const container = el("qr-code");
  container.innerHTML = "";
  const url = getShortUrl(code);
  el("qr-url").textContent = url;
  el("qr-download").dataset.code = code;
  if (typeof QRCode === "undefined") {
    el("qr-url").textContent = url + " (library QR belum dimuat)";
    return;
  }
  new QRCode(container, { text: url, width: 180, height: 180, correctLevel: QRCode.CorrectLevel.H });
  prepareQrDownload();
}

function prepareQrDownload() {
  const canvas = el("qr-code").querySelector("canvas");
  const img = el("qr-code").querySelector("img");
  const href = canvas ? canvas.toDataURL("image/png") : (img ? img.src : "");
  el("qr-download").href = href || "";
  el("qr-download").download = "shortic-" + (el("qr-download").dataset.code || "qr") + ".png";
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
    const createBtn = el("create-btn");
    msg.classList.add("hidden");

    createBtn.disabled = true;
    createBtn.classList.add("btn-loading");

    try {
      const result = await createLink(url, custom);
      if (result.ok) {
        el("target-url").value = "";
        el("custom-code").value = "";
        msg.textContent = `Link dibuat: ${getShortUrl(result.code)}`;
        msg.classList.add("text-success");
        msg.classList.remove("hidden");
        showToast("Link berhasil dibuat");
        await fetchLinks();
      } else {
        msg.textContent = "Gagal membuat link: " + result.error.message;
        msg.classList.add("text-danger");
        msg.classList.remove("hidden");
      }
    } finally {
      createBtn.disabled = false;
      createBtn.classList.remove("btn-loading");
    }
  });

  el("generate-btn").addEventListener("click", () => {
    el("custom-code").value = randomCode();
    spinIcon("generate-icon");
  });

  let searchTimer = null;
  el("link-search").addEventListener("input", (e) => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      linksState.search = e.target.value.trim();
      linksState.page = 1;
      fetchLinks();
    }, 300);
  });

  el("prev-page").addEventListener("click", () => {
    if (linksState.page > 1) {
      linksState.page -= 1;
      fetchLinks();
    }
  });

  el("next-page").addEventListener("click", () => {
    linksState.page += 1;
    fetchLinks();
  });

  el("links-tbody").addEventListener("click", async (e) => {
    const copyBtn = e.target.closest(".btn-copy");
    const detailBtn = e.target.closest(".btn-detail");
    const qrBtn = e.target.closest(".btn-qr");
    const editBtn = e.target.closest(".btn-edit");
    const deleteBtn = e.target.closest(".btn-delete");
    if (copyBtn) {
      const text = copyBtn.dataset.copy || getShortUrl(copyBtn.dataset.code);
      await copyToClipboard(text);
      showToast("Disalin: " + text);
      return;
    }
    if (detailBtn) {
      openDetailModal(detailBtn.dataset);
      return;
    }
    if (qrBtn) {
      renderQR(qrBtn.dataset.code);
      openModal("qr-modal");
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
      await fetchLinks();
    }
    if (deleteBtn) {
      if (!confirm("Hapus link ini?")) return;
      const { error } = await sb.from("links").delete().eq("id", deleteBtn.dataset.id);
      if (error) alert("Gagal hapus: " + error.message);
      await fetchLinks();
    }
  });

  bindModal("detail-modal", "detail-close");
  bindModal("qr-modal", "qr-close");

  el("detail-body").addEventListener("click", async (e) => {
    const copyBtn = e.target.closest(".btn-copy");
    if (!copyBtn) return;
    await copyToClipboard(copyBtn.dataset.copy);
    showToast("URL disalin");
  });

  el("qr-copy").addEventListener("click", async () => {
    const url = el("qr-url").textContent;
    await copyToClipboard(url);
    showToast("Tautan disalin: " + url);
  });

  el("qr-download").addEventListener("click", () => {
    prepareQrDownload();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      closeModal("detail-modal");
      closeModal("qr-modal");
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

  await fetchLinks();
}

window.onAuthReady = initDashboard;