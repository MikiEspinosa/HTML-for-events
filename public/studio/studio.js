// Guided email studio: one question per screen, live preview, autosaved drafts.

const app = document.getElementById("app");
const stepper = document.getElementById("stepper");
const banner = document.getElementById("banner");
const dialog = document.getElementById("dialog");

const S = {
  config: null,
  draft: null,
  dirty: false,
  saving: null,
  saveTimer: null,
  previewTimer: null,
  preview: null,
  selected: null,
  mobile: false,
  subjectOptions: [],
  plan: null,
  area: null,
};

// ---------- helpers ----------

const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const t = (obj) => (obj ? obj[S.draft?.language === "en" ? "en" : "es"] || obj.es : "");
const uid = () => `m${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-4)}`;
const $ = (sel, root = app) => root.querySelector(sel);
const $$ = (sel, root = app) => [...root.querySelectorAll(sel)];

async function api(path, { method = "GET", body, raw, headers = {} } = {}) {
  const response = await fetch(`/api/studio/${path}`, {
    method,
    headers: raw ? headers : { "Content-Type": "application/json", ...headers },
    body: raw ?? (body === undefined ? undefined : JSON.stringify(body)),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || "Algo no ha ido bien. Inténtalo de nuevo.");
    error.status = response.status;
    error.data = data;
    throw error;
  }
  return data;
}

function notify(message, { error = false, action, actionLabel, timeout = 5000 } = {}) {
  banner.hidden = false;
  banner.className = `banner${error ? " error" : ""}`;
  banner.innerHTML = `<span>${esc(message)}</span>`;
  if (action) {
    const b = document.createElement("button");
    b.textContent = actionLabel;
    b.onclick = () => { banner.hidden = true; action(); };
    banner.append(b);
  }
  clearTimeout(notify.timer);
  if (timeout && !action) notify.timer = setTimeout(() => { banner.hidden = true; }, timeout);
}

async function busy(button, task) {
  button?.classList.add("busy");
  try {
    return await task();
  } catch (error) {
    notify(error.message, { error: true });
    return undefined;
  } finally {
    button?.classList.remove("busy");
  }
}

const AREA_KEY = "aura-area";
function setArea(area) {
  S.area = area;
  try { sessionStorage.setItem(AREA_KEY, area); } catch { /* storage may be blocked */ }
}
function currentArea() {
  if (S.area) return S.area;
  try { return sessionStorage.getItem(AREA_KEY); } catch { return null; }
}
const areaLabel = (area) => S.config.areas[area || "alumni"]?.label || "IESE Alumni";
const homeHash = () => (currentArea() ? `#/a/${currentArea()}` : "#/");

function go(hash) {
  if (location.hash === hash) render();
  else location.hash = hash;
}

function confirmDialog({ title, text, yes = "Sí", no = "No", cancel = false }) {
  return new Promise((resolve) => {
    const body = document.getElementById("dialog-body");
    body.innerHTML = `<h2>${esc(title)}</h2><p>${esc(text)}</p><div class="row" style="justify-content:flex-end">${cancel ? '<button class="btn ghost" value="cancel">Cancelar</button>' : ""}<button class="btn" value="no">${esc(no)}</button><button class="btn primary" value="yes">${esc(yes)}</button></div>`;
    dialog.onclose = () => resolve(dialog.returnValue || "cancel");
    dialog.showModal();
  });
}

// ---------- dictation ----------

const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;

// Appends what is dictated to the end of a textarea's value.
function micButton(textarea) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "mic";
  button.title = "Dictar";
  button.setAttribute("aria-label", "Dictar");
  button.textContent = "🎙";
  let rec = null;
  button.onclick = () => {
    if (rec) { rec.stop(); return; }
    rec = new Recognition();
    rec.lang = S.draft?.language === "en" ? "en-US" : "es-ES";
    rec.continuous = true;
    rec.interimResults = false;
    rec.onresult = (event) => {
      const said = [...event.results].slice(event.resultIndex).map((r) => r[0].transcript).join(" ").trim();
      if (!said) return;
      textarea.value = `${textarea.value}${textarea.value && !/\s$/.test(textarea.value) ? " " : ""}${said}`;
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
    };
    rec.onend = () => { rec = null; button.classList.remove("on"); };
    rec.onerror = () => notify("No he podido usar el micrófono. Revisa el permiso del navegador.", { error: true });
    rec.start();
    button.classList.add("on");
  };
  return button;
}

function attachMic(textarea) {
  if (!Recognition) return;
  const wrap = textarea.parentElement;
  wrap.classList.add("with-mic");
  wrap.append(micButton(textarea));
}

// ---------- rich text ----------
// Long texts are stored as light markup (**bold**, *italic*, [label](url),
// "- " lists, blank line between paragraphs), which the renderer, the AI and
// the translation already understand. The editor shows it formatted.

function mdInline(text) {
  return esc(text)
    .replace(/\[([^\]\n]+)\]\(([^)\s]+)\)/g, (m, label, href) => `<a href="${href}">${label}</a>`)
    .replace(/\*\*([^*\n]+)\*\*/g, "<b>$1</b>")
    .replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<i>$2</i>");
}

function mdToHtml(md) {
  const blocks = String(md ?? "").replace(/\r\n/g, "\n").trim().split(/\n{2,}/).filter((b) => b.trim());
  if (!blocks.length) return "<p><br></p>";
  return blocks.map((block) => {
    const lines = block.split("\n").map((l) => l.trim()).filter(Boolean);
    if (lines.every((l) => /^[-•]\s+/.test(l))) return `<ul>${lines.map((l) => `<li>${mdInline(l.replace(/^[-•]\s+/, ""))}</li>`).join("")}</ul>`;
    return `<p>${lines.map(mdInline).join("<br>")}</p>`;
  }).join("");
}

function htmlToMd(root) {
  const blocks = [];
  let current = "";
  const flush = () => {
    const text = current.split("\n").map((l) => l.trim()).join("\n").replace(/^\n+|\n+$/g, "");
    if (text.trim()) blocks.push(text);
    current = "";
  };
  const inline = (node) => {
    if (node.nodeType === 3) return node.nodeValue.replace(/ /g, " ").replace(/\n/g, " ");
    if (node.nodeType !== 1) return "";
    const tag = node.tagName;
    if (tag === "BR") return "\n";
    const inner = [...node.childNodes].map(inline).join("");
    const wrap = (mark) => inner.split("\n").map((part) => {
      const m = part.match(/^(\s*)([\s\S]*?)(\s*)$/);
      return m[2] ? `${m[1]}${mark}${m[2]}${mark}${m[3]}` : part;
    }).join("\n");
    const weight = node.style?.fontWeight || "";
    if (tag === "B" || tag === "STRONG" || /bold|[6-9]00/.test(weight)) return wrap("**");
    if (tag === "I" || tag === "EM" || node.style?.fontStyle === "italic") return wrap("*");
    if (tag === "A") {
      const href = node.getAttribute("href") || "";
      return inner.trim() && href ? `[${inner.replace(/\n/g, " ").trim()}](${href})` : inner;
    }
    if (/^(P|DIV|LI|H[1-6])$/.test(tag)) return `\n${inner}\n`;
    return inner;
  };
  const walk = (parent) => {
    for (const node of parent.childNodes) {
      const tag = node.nodeType === 1 ? node.tagName : "";
      if (tag === "UL" || tag === "OL") {
        flush();
        const items = [...node.children].filter((li) => li.tagName === "LI").map((li) => inline(li).replace(/\s*\n+\s*/g, " ").trim()).filter(Boolean);
        if (items.length) blocks.push(items.map((x) => `- ${x}`).join("\n"));
      } else if (/^(P|DIV|H[1-6]|BLOCKQUOTE)$/.test(tag)) {
        flush();
        if ([...node.children].some((c) => /^(P|DIV|UL|OL)$/.test(c.tagName))) walk(node);
        else { current = inline(node); flush(); }
      } else {
        current += inline(node);
      }
    }
  };
  walk(root);
  flush();
  return blocks.join("\n\n");
}

function richToolbar(tools = "", { list = true } = {}) {
  return `<div class="rich-bar" role="toolbar" aria-label="Formato">
          <button type="button" class="tb" data-cmd="bold" title="Negrita (Ctrl+B)" aria-label="Negrita"><b>B</b></button>
          <button type="button" class="tb" data-cmd="italic" title="Cursiva (Ctrl+I)" aria-label="Cursiva"><i>I</i></button>
          <button type="button" class="tb" data-cmd="link" title="Enlace (Ctrl+K)" aria-label="Enlace">🔗</button>
          ${list ? '<button type="button" class="tb" data-cmd="insertUnorderedList" title="Lista" aria-label="Lista">•≡</button>' : ""}
          <span class="rich-tools">${tools}</span>
        </div>
        <div class="rich-link" hidden><input type="url" placeholder="https://…" aria-label="Enlace"><button type="button" class="btn small primary" data-link="ok">Aplicar</button><button type="button" class="btn small ghost" data-link="remove">Quitar enlace</button></div>`;
}

// Wires the toolbar of a .rich box to its editable area. onChange runs after
// every edit made from the toolbar or by typing.
function bindToolbar(box, area, onChange) {
  const bar = box.querySelector(".rich-bar");
  const linkBox = box.querySelector(".rich-link");
  const linkInput = linkBox.querySelector("input");
  let savedRange = null;
  area.addEventListener("input", onChange);
  area.addEventListener("paste", (e) => {
    e.preventDefault();
    document.execCommand("insertText", false, e.clipboardData.getData("text/plain"));
  });

  const paintState = () => {
    if (!area.isConnected) return document.removeEventListener("selectionchange", paintState);
    if (!area.contains(document.getSelection()?.anchorNode)) return;
    bar.querySelector('[data-cmd="bold"]').classList.toggle("on", document.queryCommandState("bold"));
    bar.querySelector('[data-cmd="italic"]').classList.toggle("on", document.queryCommandState("italic"));
  };
  document.addEventListener("selectionchange", paintState);

  const openLink = () => {
    const sel = document.getSelection();
    if (!sel.rangeCount || !area.contains(sel.anchorNode) || sel.isCollapsed) {
      notify("Selecciona primero el texto que quieres convertir en enlace.", { error: true });
      return;
    }
    savedRange = sel.getRangeAt(0).cloneRange();
    const current = sel.anchorNode.parentElement?.closest("a");
    linkInput.value = current?.getAttribute("href") || "https://";
    linkBox.hidden = false;
    linkInput.focus();
    linkInput.select();
  };
  const restore = () => {
    area.focus();
    const sel = document.getSelection();
    sel.removeAllRanges();
    if (savedRange) sel.addRange(savedRange);
  };
  const applyLink = () => {
    const url = linkInput.value.trim();
    if (!/^https:\/\/[^\s]+\.[^\s]+/.test(url)) return notify("El enlace debe empezar por https://", { error: true });
    restore();
    document.execCommand("createLink", false, url);
    linkBox.hidden = true;
    onChange();
  };
  linkInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); applyLink(); }
    if (e.key === "Escape") { linkBox.hidden = true; restore(); }
  });
  linkBox.querySelector('[data-link="ok"]').onclick = applyLink;
  linkBox.querySelector('[data-link="remove"]').onclick = () => { restore(); document.execCommand("unlink"); linkBox.hidden = true; onChange(); };

  bar.querySelectorAll("[data-cmd]").forEach((b) => {
    b.addEventListener("mousedown", (e) => e.preventDefault()); // keep the selection
    b.onclick = () => {
      if (b.dataset.cmd === "link") return openLink();
      area.focus();
      document.execCommand(b.dataset.cmd);
      onChange();
      paintState();
    };
  });
  area.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); openLink(); }
  });
}

// Turns a hidden textarea into a formatted editor with a toolbar.
function setupRich(textarea) {
  const box = textarea.parentElement.querySelector(`[data-rich="${textarea.id}"]`);
  if (!box || box.dataset.ready) return;
  box.dataset.ready = "1";
  const area = box.querySelector(".rich-area");
  let last = textarea.value;
  area.innerHTML = mdToHtml(textarea.value);

  const sync = () => {
    const md = htmlToMd(area);
    if (md === textarea.value) return;
    last = md;
    textarea.value = md;
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
  };
  // Changes made from outside (AI, dictation, undo) redraw the editor.
  textarea.addEventListener("input", () => {
    if (textarea.value === last) return;
    last = textarea.value;
    area.innerHTML = mdToHtml(textarea.value);
  });
  area.addEventListener("focus", () => document.execCommand("defaultParagraphSeparator", false, "p"));
  bindToolbar(box, area, sync);
  if (Recognition) box.querySelector(".rich-tools").prepend(micButton(textarea));
}

// ---------- AI chat ----------

const chat = { el: null, targetId: null, history: {} };

function aiButton(targetId, label, multiline) {
  return `<button type="button" class="ai-btn" data-chat="${targetId}" data-chat-label="${esc(label)}" data-chat-multi="${multiline ? 1 : 0}" title="Pedir a la IA" aria-label="Pedir a la IA">AI</button>`;
}

function chatEl() {
  if (chat.el) return chat.el;
  const el = document.createElement("aside");
  el.className = "chat";
  el.hidden = true;
  el.setAttribute("aria-label", "Asistente de IA");
  el.innerHTML = `<header><div><strong>Asistente de IA</strong><small class="chat-field"></small></div><button type="button" class="icon-btn" data-chat-close aria-label="Cerrar">✕</button></header>
    <div class="chat-log" aria-live="polite"></div>
    <div class="chat-chips"></div>
    <form class="chat-form"><textarea rows="2" placeholder="Por ejemplo: escribe un texto para celebrar el 25.º aniversario que anime a asistir"></textarea><button class="btn primary small" type="submit">Enviar</button></form>`;
  document.body.append(el);
  el.querySelector("[data-chat-close]").onclick = () => { el.hidden = true; };
  const input = el.querySelector("textarea");
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); el.querySelector("form").requestSubmit(); }
  });
  el.querySelector("form").onsubmit = (e) => { e.preventDefault(); sendChat(input.value); };
  chat.el = el;
  return el;
}

function drawChat() {
  const el = chatEl();
  const log = el.querySelector(".chat-log");
  const items = chat.history[chat.targetId] || [];
  log.innerHTML = items.length
    ? items.map((m, i) => `<div class="msg ${m.role}">${esc(m.content)}${m.applied ? `<div class="applied">Texto insertado en el campo. <button type="button" data-undo="${i}">Deshacer</button></div>` : ""}</div>`).join("")
    : `<div class="msg assistant">Pídeme un texto nuevo para este campo o cambios sobre el que ya tiene. Lo insertaré directamente en el campo.</div>`;
  if (!S.config.ai) log.innerHTML += `<div class="msg note">La IA no está activa en este entorno (faltan las variables de Azure OpenAI), así que todavía no puedo responder.</div>`;
  log.querySelectorAll("[data-undo]").forEach((b) => b.onclick = () => {
    const m = items[Number(b.dataset.undo)];
    const target = document.getElementById(chat.targetId);
    if (!target) return;
    target.value = m.before;
    target.dispatchEvent(new Event("input", { bubbles: true }));
    m.applied = false;
    drawChat();
  });
  log.scrollTop = log.scrollHeight;
  el.querySelector("form button").disabled = !S.config.ai;
}

function openChat(button) {
  const el = chatEl();
  chat.targetId = button.dataset.chat;
  chat.label = button.dataset.chatLabel;
  chat.multiline = button.dataset.chatMulti === "1";
  el.querySelector(".chat-field").textContent = `Campo: ${chat.label}`;
  const chips = chat.multiline
    ? ["Escribe un texto que anime a asistir", "Hazlo más corto", "Pásalo a tercera persona del plural", "Tono más cercano"]
    : ["Propón una alternativa", "Más corto", "Más llamativo"];
  el.querySelector(".chat-chips").innerHTML = chips.map((c) => `<button type="button" class="btn small">${esc(c)}</button>`).join("");
  el.querySelectorAll(".chat-chips button").forEach((b) => b.onclick = () => { el.querySelector("textarea").value = b.textContent; el.querySelector("textarea").focus(); });
  el.hidden = false;
  drawChat();
  el.querySelector("textarea").focus();
}

async function sendChat(value) {
  const el = chatEl();
  const text = String(value || "").trim();
  const target = document.getElementById(chat.targetId);
  if (!text || !S.config.ai) return;
  if (!target) return notify("Ese campo ya no está en pantalla. Vuelve a abrir el asistente desde el campo.", { error: true });
  const id = chat.targetId;
  const history = (chat.history[id] ||= []);
  history.push({ role: "user", content: text });
  el.querySelector("textarea").value = "";
  drawChat();
  const send = el.querySelector("form button");
  await busy(send, async () => {
    try {
      const d = S.draft;
      const ev = moduleOf("event") || {};
      const facts = { ...(d.source || {}), date: ev.date, endDate: ev.endDate, startTime: ev.startTime, endTime: ev.endTime, venue: ev.venue, address: ev.address };
      const result = await api("ai/chat", { method: "POST", body: {
        language: d.language, template: d.template, field: chat.label, multiline: chat.multiline,
        text: target.value, messages: history.filter((m) => !m.error).map(({ role, content }) => ({ role, content })),
        subject: d.subject, modules: d.modules, facts,
      } });
      const entry = { role: "assistant", content: result.reply || (result.text ? "Hecho." : "No he cambiado el texto.") };
      const live = document.getElementById(id);
      if (result.text && live) {
        entry.before = live.value;
        entry.applied = true;
        live.value = result.text;
        live.dispatchEvent(new Event("input", { bubbles: true }));
      }
      history.push(entry);
    } catch (error) {
      history.push({ role: "assistant", content: error.message, error: true });
    }
    if (chat.targetId === id) drawChat();
  });
}

// ---------- draft state ----------

function touch({ preview = true } = {}) {
  S.dirty = true;
  clearTimeout(S.saveTimer);
  S.saveTimer = setTimeout(save, 800);
  if (preview) schedulePreview();
  setSaving("Guardando…");
}

function setSaving(text) {
  const el = document.querySelector(".saving");
  if (el) el.textContent = text;
}

async function save() {
  if (!S.draft || !S.dirty) return S.saving;
  if (S.saving) {
    await S.saving;
    return save();
  }
  S.dirty = false;
  const d = S.draft;
  S.saving = api(`drafts/${d.id}`, {
    method: "PUT",
    body: { version: d.version, name: d.name, subject: d.subject, preheader: d.preheader, brief: d.brief, step: d.step, hideLogo: Boolean(d.hideLogo), quickLinks: d.quickLinks || {}, tweaks: d.tweaks || [], modules: d.modules, source: d.source, pardot: d.pardot },
  })
    .then(({ draft }) => {
      S.draft.version = draft.version;
      S.draft.updatedAt = draft.updatedAt;
      setSaving("Guardado");
    })
    .catch((error) => {
      if (error.status === 409) {
        notify(error.message, { error: true, actionLabel: "Recargar", action: () => location.reload() });
      } else {
        S.dirty = true;
        setSaving("Sin guardar");
        notify("No se ha podido guardar. Lo reintento en unos segundos.", { error: true });
        clearTimeout(S.saveTimer);
        S.saveTimer = setTimeout(save, 5000);
      }
    })
    .finally(() => { S.saving = null; });
  return S.saving;
}

async function flush() {
  clearTimeout(S.saveTimer);
  await save();
  if (S.saving) await S.saving;
}

window.addEventListener("beforeunload", (event) => {
  if (S.dirty || S.saving) event.preventDefault();
});

function moduleOf(type) {
  return S.draft.modules.find((m) => m.type === type);
}

const INVITE_ORDER = ["hero", "heading", "greeting", "text", "event", "agenda", "speakers", "cta", "signature", "events"];

function blankModule(type) {
  const es = S.draft.language !== "en";
  const base = { id: uid(), type };
  const defaults = {
    agenda: { title: "Agenda", items: [] },
    speakers: { title: es ? "Ponentes" : "Speakers", items: [] },
    cta: { label: es ? "Inscríbete" : "Register", url: "" },
    signature: { closing: es ? "Un saludo," : "Best regards,", name: localStorage.getItem("studio.signature.name") || "", role: localStorage.getItem("studio.signature.role") || "" },
    events: { title: es ? "Otros eventos para ti" : "Other events for you", items: [], allLabel: es ? "Ver todos los eventos" : "View all events on the website", allUrl: "https://www.iese.edu/alumni/events/" },
    greeting: { text: es ? "Hola, {{Recipient.FirstName}}:" : "Dear {{Recipient.FirstName}}," },
    hero: { ctaLabel: es ? "Inscríbete" : "Register" },
  };
  const def = S.config.modules[type];
  for (const f of def.fields) base[f.key] = f.kind === "list" ? [] : "";
  return { ...base, ...(defaults[type] || {}) };
}

function ensureModule(type) {
  let m = moduleOf(type);
  if (m) return m;
  m = blankModule(type);
  const rank = (x) => { const i = INVITE_ORDER.indexOf(x.type); return i < 0 ? 99 : i; };
  const at = S.draft.modules.findIndex((x) => rank(x) > rank(m));
  if (at < 0) S.draft.modules.push(m);
  else S.draft.modules.splice(at, 0, m);
  return m;
}

function removeModule(type) {
  S.draft.modules = S.draft.modules.filter((m) => m.type !== type);
}

// ---------- preview ----------

function schedulePreview() {
  clearTimeout(S.previewTimer);
  S.previewTimer = setTimeout(refreshPreview, 300);
}

// The sandboxed preview frame has no origin, so browsers refuse to load images
// served by this app (uploads in simulation mode, logo, icons). They are
// embedded as data URLs in the preview only; the exported email keeps the URLs.
const ownImages = new Map();
async function inlineOwnImages(html) {
  const urls = [...new Set(html.match(new RegExp(`${location.origin.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/[^"'()\\s]+\\.(?:png|jpe?g|gif|webp)`, "g")) || [])];
  await Promise.all(urls.filter((u) => !ownImages.has(u)).map(async (u) => {
    try {
      const blob = await (await fetch(u)).blob();
      ownImages.set(u, await new Promise((resolve) => { const r = new FileReader(); r.onload = () => resolve(r.result); r.readAsDataURL(blob); }));
    } catch { /* leave the URL as it is */ }
  }));
  return urls.reduce((out, u) => (ownImages.has(u) ? out.replaceAll(u, ownImages.get(u)) : out), html);
}

async function refreshPreview() {
  const frame = document.getElementById("preview");
  if (!frame || !S.draft) return;
  try {
    const d = S.draft;
    S.preview = await api("preview", { method: "POST", body: { template: d.template, language: d.language, subject: d.subject, preheader: d.preheader, hideLogo: Boolean(d.hideLogo), quickLinks: d.quickLinks || {}, tweaks: d.tweaks || [], modules: d.modules, area: d.area } });
    const selectedCss = S.selected && document.body.dataset.step !== "review" ? `[data-module-id="${S.selected}"]>td{outline:3px solid #FF2800;outline-offset:-3px}` : "";
    const clickable = document.body.dataset.step === "editor";
    const script = clickable
      ? `<style>[data-module-id]{cursor:pointer}[data-module-id]:hover>td{outline:2px dashed #FF2800;outline-offset:-2px}${selectedCss}</style><script>document.addEventListener('click',function(e){var r=e.target.closest('[data-module-id]');e.preventDefault();if(r)parent.postMessage({studioModule:r.getAttribute('data-module-id')},'*');});<\/script>`
      : `<style>a{pointer-events:none}${selectedCss}</style>`;
    // The frame is sandboxed without same-origin access, so it reports its own
    // scroll position and restores it after each redraw.
    const keep = `<script>scrollTo(0,${Number(S.previewScroll) || 0});addEventListener('scroll',function(){parent.postMessage({studioScroll:scrollY},'*');});<\/script>`;
    frame.srcdoc = (await inlineOwnImages(S.preview.html)).replace("</body>", `${script}${keep}</body>`);
    if (document.body.dataset.step === "review") S.onPreview?.();
  } catch (error) {
    notify(error.message, { error: true });
  }
}

window.addEventListener("message", (event) => {
  if (typeof event.data?.studioScroll === "number") S.previewScroll = event.data.studioScroll;
  if (event.data?.studioModule && document.body.dataset.step === "editor") {
    S.selected = event.data.studioModule;
    renderEditor();
  }
});

function previewPane() {
  return `<div class="preview-wrap">
    <div class="preview-head"><span>Vista previa · ${S.draft.language === "en" ? "inglés" : "español"}</span>
      <span class="row"><span class="saving">Guardado</span><button class="btn small" data-act="mobile">${S.mobile ? "Ver escritorio" : "Ver móvil"}</button></span></div>
    <iframe id="preview" class="preview${S.mobile ? " mobile" : ""}" title="Vista previa del email" sandbox="allow-scripts"></iframe>
  </div>`;
}

function bindPreviewPane() {
  const toggle = $('[data-act="mobile"]');
  if (toggle) toggle.onclick = () => {
    S.mobile = !S.mobile;
    $("#preview").classList.toggle("mobile", S.mobile);
    toggle.textContent = S.mobile ? "Ver escritorio" : "Ver móvil";
  };
  refreshPreview();
}

// ---------- fields ----------

function fieldHtml(module, field, path = field.key, value = module[field.key]) {
  const id = `f-${module.id}-${path.replaceAll(".", "-")}`;
  const label = `<span>${esc(t(field.label))}</span>`;
  const attrs = `id="${id}" data-mod="${module.id}" data-path="${esc(path)}"`;
  switch (field.kind) {
    case "longtext":
      return `<div class="field">${label}<div class="rich" data-rich="${id}">
        ${richToolbar(field.ai ? aiButton(id, t(field.label), true) : "")}
        <div class="rich-area" contenteditable="true" role="textbox" aria-multiline="true" aria-label="${esc(t(field.label))}"></div>
      </div><textarea ${attrs} hidden>${esc(value)}</textarea>${S.config.ai && field.ai ? `<div class="ai-row">
        <button type="button" class="btn small" data-ai="improve" data-target="${id}">Mejorar</button>
        <button type="button" class="btn small" data-ai="shorten" data-target="${id}">Acortar</button>
        <button type="button" class="btn small" data-ai="fix" data-target="${id}">Corregir estilo</button></div>` : ""}</div>`;
    case "image":
      return `<div class="field image-pick"><span>${esc(t(field.label))}</span>
        ${value ? `<img class="thumb" src="${esc(value)}" alt="">` : ""}
        <input type="url" ${attrs} value="${esc(value)}" placeholder="https://…">
        <label class="drop" data-drop="${id}">Arrastra una imagen o <u>súbela desde tu ordenador</u><input type="file" accept="image/png,image/jpeg,image/gif,image/webp" hidden data-upload="${id}"></label>
        <small>Puedes pegar la URL pública de la biblioteca de apply.iese.edu o de los archivos de Pardot.</small></div>`;
    case "date":
    case "time": {
      const input = `<input type="${field.kind}" ${attrs} value="${esc(value)}">`;
      if (!field.optional) return `<label class="field">${label}${input}</label>`;
      return `<div class="field"><label for="${id}">${label}</label><div class="with-clear">${input}<button type="button" class="btn small" data-clear="${id}" ${value ? "" : "disabled"}>Quitar</button></div></div>`;
    }
    case "url":
      return `<label class="field">${label}<input type="url" ${attrs} value="${esc(value)}" placeholder="https://…"></label>`;
    case "list": {
      const items = Array.isArray(value) ? value : [];
      const rows = items.map((item, i) => `<div class="list-item"><div class="head"><span>${i + 1}</span><span>
          <button type="button" class="icon-btn" data-list-move="${module.id}|${field.key}|${i}|-1" ${i === 0 ? "disabled" : ""} aria-label="Subir">↑</button>
          <button type="button" class="icon-btn" data-list-move="${module.id}|${field.key}|${i}|1" ${i === items.length - 1 ? "disabled" : ""} aria-label="Bajar">↓</button>
          <button type="button" class="icon-btn" data-list-del="${module.id}|${field.key}|${i}" aria-label="Quitar">✕</button></span></div>
          ${field.item.length <= 2 ? `<div class="grid2" style="grid-template-columns:${field.item[0].kind === "time" ? "110px 1fr" : "1fr 1fr"}">` : "<div>"}
          ${field.item.map((sub) => fieldHtml(module, sub, `${field.key}.${i}.${sub.key}`, item[sub.key])).join("")}</div></div>`).join("");
      return `<div class="field"><span>${esc(t(field.label))}</span>${rows || '<small>Todavía no hay elementos.</small>'}
        <div><button type="button" class="btn small" data-list-add="${module.id}|${field.key}">+ Añadir</button></div></div>`;
    }
    case "html":
      return `<div class="field"><span>${esc(t(field.label))}</span><small>Este módulo lo crea la IA dentro del marco de marca. Cambia las indicaciones y vuelve a generarlo.</small></div>`;
    default:
      if (field.ai) return `<label class="field">${label}<div class="with-ai"><input type="text" ${attrs} value="${esc(value)}">${aiButton(id, t(field.label), false)}</div></label>`;
      return `<label class="field">${label}<input type="text" ${attrs} value="${esc(value)}"></label>`;
  }
}

function setPath(module, path, value) {
  const keys = path.split(".");
  let target = module;
  while (keys.length > 1) {
    const k = keys.shift();
    target = target[/^\d+$/.test(k) ? Number(k) : k];
  }
  target[keys[0]] = value;
}

function getModule(id) {
  return S.draft.modules.find((m) => m.id === id);
}

// Binds every field inside root. onStructure re-renders after list changes.
function bindFields(root, onStructure) {
  $$("[data-mod][data-path]", root).forEach((input) => {
    input.addEventListener("input", () => {
      const m = getModule(input.dataset.mod);
      if (!m) return;
      setPath(m, input.dataset.path, input.value);
      if (m.type === "signature" && ["name", "role"].includes(input.dataset.path)) localStorage.setItem(`studio.signature.${input.dataset.path}`, input.value);
      touch();
    });
    if (input.tagName === "TEXTAREA") {
      if (input.parentElement.querySelector(`[data-rich="${input.id}"]`)) setupRich(input);
      else attachMic(input);
    }
  });
  $$("[data-chat]", root).forEach((b) => b.onclick = (e) => { e.preventDefault(); openChat(b); });
  $$("[data-clear]", root).forEach((b) => {
    const input = document.getElementById(b.dataset.clear);
    input.addEventListener("input", () => { b.disabled = !input.value; });
    b.onclick = () => { input.value = ""; input.dispatchEvent(new Event("input", { bubbles: true })); };
  });
  $$("[data-list-add]", root).forEach((b) => b.onclick = () => {
    const [id, key] = b.dataset.listAdd.split("|");
    const m = getModule(id);
    const def = S.config.modules[m.type].fields.find((f) => f.key === key);
    m[key] = [...(m[key] || []), Object.fromEntries(def.item.map((s) => [s.key, ""]))];
    touch();
    onStructure();
  });
  $$("[data-list-del]", root).forEach((b) => b.onclick = () => {
    const [id, key, i] = b.dataset.listDel.split("|");
    getModule(id)[key].splice(Number(i), 1);
    touch();
    onStructure();
  });
  $$("[data-list-move]", root).forEach((b) => b.onclick = () => {
    const [id, key, i, dir] = b.dataset.listMove.split("|");
    const list = getModule(id)[key];
    const a = Number(i), c = a + Number(dir);
    [list[a], list[c]] = [list[c], list[a]];
    touch();
    onStructure();
  });
  $$("[data-upload]", root).forEach((input) => {
    const target = document.getElementById(input.dataset.upload);
    const drop = input.closest(".drop");
    const handle = (file) => file && busy(drop, async () => {
      if (file.size > 5 * 1024 * 1024) throw new Error("La imagen supera los 5 MB.");
      const result = await api("images", { method: "POST", raw: file, headers: { "Content-Type": file.type, "X-File-Name": encodeURIComponent(file.name) } });
      target.value = result.url;
      target.dispatchEvent(new Event("input", { bubbles: true }));
      if (result.notice) notify(result.notice);
      onStructure();
    });
    input.onchange = () => handle(input.files[0]);
    drop.addEventListener("dragover", (e) => { e.preventDefault(); drop.classList.add("over"); });
    drop.addEventListener("dragleave", () => drop.classList.remove("over"));
    drop.addEventListener("drop", (e) => { e.preventDefault(); drop.classList.remove("over"); handle(e.dataTransfer.files[0]); });
  });
  $$("[data-ai]", root).forEach((b) => b.onclick = () => busy(b, async () => {
    const input = document.getElementById(b.dataset.target);
    if (!input.value.trim()) throw new Error("Escribe primero algo de texto.");
    const { text } = await api("ai/rewrite", { method: "POST", body: { language: S.draft.language, template: S.draft.template, action: b.dataset.ai, text: input.value } });
    const before = input.value;
    input.value = text;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    notify("Texto actualizado con la guía de estilo.", { actionLabel: "Deshacer", action: () => { input.value = before; input.dispatchEvent(new Event("input", { bubbles: true })); } });
  }));
}

// ---------- steps ----------

const FLOW = {
  invite: [["start", "Punto de partida"], ["questions", "Preguntas"], ["editor", "Editor"], ["review", "Revisión"]],
  paint: [["describe", "Describe tu email"], ["questions", "Preguntas"], ["editor", "Editor"], ["review", "Revisión"]],
};

function renderStepper(step) {
  if (!S.draft) { stepper.hidden = true; return; }
  const flow = FLOW[S.draft.template];
  const current = flow.findIndex(([k]) => k === step);
  const reached = Math.max(current, flow.findIndex(([k]) => k === S.draft.step));
  stepper.hidden = false;
  stepper.innerHTML = `<button class="done" disabled><span class="n">✓</span>${esc(S.config.templates[S.draft.template].label.es)}</button>` +
    flow.map(([key, label], i) => `<button data-step="${key}" class="${i === current ? "current" : i < reached || i < current ? "done" : ""}" ${i > reached && i > current ? "disabled" : ""}><span class="n">${i < current ? "✓" : i + 1}</span>${esc(label)}</button>`).join("");
  stepper.querySelectorAll("[data-step]").forEach((b) => b.onclick = () => go(`#/d/${S.draft.id}/${b.dataset.step}`));
}

function setStep(step) {
  document.body.dataset.step = step;
  const flow = FLOW[S.draft.template].map(([k]) => k);
  if (flow.indexOf(step) > flow.indexOf(S.draft.step)) {
    S.draft.step = step;
    touch({ preview: false });
  }
  renderStepper(step);
}

// Home: new email and my drafts.
// Entry page: the areas the person may work in, and the admin panel.
function renderAreas() {
  S.draft = null;
  stepper.hidden = true;
  document.body.dataset.step = "areas";
  const allowed = S.config.user.areas || [];
  const blurbs = {
    alumni: "Emails para la comunidad de antiguos alumnos, con la marca de IESE Alumni.",
    programa: "Emails de los programas, con su propio logo, campaña y carpeta de Pardot.",
  };
  const icons = { alumni: "🎓", programa: "📘" };
  app.innerHTML = `<p class="eyebrow">A.U.R.A.</p><h1>Hola${S.config.user.name ? `, ${esc(S.config.user.name.split(" ")[0])}` : ""}</h1>
    <p class="lead">¿Para quién es el email que vas a crear?</p>
    <div class="cards">${Object.entries(S.config.areas).map(([key, a]) => {
      const ok = allowed.includes(key);
      return `<button class="card area-card" data-area="${key}" ${ok ? "" : "disabled"}>${ok ? "" : '<span class="tag">Sin acceso</span>'}
        <span class="icon">${icons[key] || "✉️"}</span><strong>${esc(a.label)}</strong><span>${esc(ok ? blurbs[key] || "" : "Pide acceso a un administrador si lo necesitas.")}</span></button>`;
    }).join("")}</div>
    ${S.config.user.admin ? '<div class="actions" style="justify-content:flex-start"><a class="btn" href="#/admin">⚙ Panel de administración</a></div>' : ""}`;
  $$("[data-area]").forEach((b) => b.onclick = () => { setArea(b.dataset.area); go(`#/a/${b.dataset.area}`); });
}

// Admin panel: everyone who has used the app, their access and their activity.
async function renderAdmin() {
  S.draft = null;
  stepper.hidden = true;
  document.body.dataset.step = "admin";
  if (!S.config.user.admin) return go("#/");
  app.innerHTML = `<p class="empty">Cargando…</p>`;
  let [{ users }, { months, prices }] = await Promise.all([api("admin/users"), api("admin/usage")]);
  const tokens = (n) => (n >= 1e6 ? `${(n / 1e6).toLocaleString("es-ES", { maximumFractionDigits: 1 })} M` : n >= 1e3 ? `${Math.round(n / 1e3).toLocaleString("es-ES")} k` : String(n || 0));
  const usd = (n) => `${(n || 0).toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} $`;
  const monthName = (m) => new Date(`${m}-01T12:00:00`).toLocaleDateString("es-ES", { month: "long", year: "numeric" });
  const day = (iso) => (iso ? new Date(iso).toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" }) : "—");
  const accessOptions = [["programa", "Programa"], ["alumni", "Alumni"], ["ambos", "Ambos"]];
  const draw = () => {
    const known = users.filter((u) => !u.unknown && !u.pending);
    const total = (k) => users.reduce((n, u) => n + (Number(u[k]) || 0), 0);
    app.innerHTML = `<p class="eyebrow">Administración</p><h1>Usuarios de A.U.R.A.</h1>
      <p class="lead">Elige a qué área puede entrar cada persona. Quien entra por primera vez empieza en Programa.</p>
      <div class="stats">
        <div><strong>${known.length}</strong><span>usuarios</span></div>
        <div><strong>${total("created")}</strong><span>borradores creados</span></div>
        <div><strong>${total("published")}</strong><span>enviados a Pardot</span></div>
        <div><strong>${tokens(months[0]?.month === new Date().toISOString().slice(0, 7) ? months[0].tokens : 0)}</strong><span>tokens de IA este mes</span></div>
        <div><strong>${usd(months[0]?.month === new Date().toISOString().slice(0, 7) ? months[0].cost : 0)}</strong><span>coste de IA estimado este mes</span></div>
      </div>
      <div class="table-wrap"><table class="users">
        <thead><tr><th>Persona</th><th>Acceso</th><th>Admin</th><th class="num">Borradores creados</th><th class="num">Guardados ahora</th><th class="num">Enviados a Pardot</th><th class="num">IA este mes</th><th>Última visita</th></tr></thead>
        <tbody>${users.map((u) => u.pending ? `<tr class="unknown"><td><strong>${esc(u.email)}</strong><div class="meta">Todavía no ha entrado</div></td>
          <td>${u.access === "alumni" ? "Alumni" : "Programa"}<div class="meta">Asignado de antemano</div></td><td>—</td><td class="num">0</td><td class="num">0</td><td class="num">0</td><td class="num">—</td><td>—</td></tr>` : `<tr${u.unknown ? ' class="unknown"' : ""}>
          <td>${u.unknown ? '<span class="muted">Usuario anterior</span><div class="meta">Aparecerá con su nombre cuando vuelva a entrar</div>' : `<strong>${esc(u.name || u.email)}</strong><div class="meta">${esc(u.email)}</div>`}</td>
          <td>${u.unknown ? "—" : `<select data-access="${u.key}" ${u.owner ? "disabled" : ""} aria-label="Acceso de ${esc(u.name || u.email)}">${accessOptions.map(([v, l]) => `<option value="${v}" ${u.access === v ? "selected" : ""}>${l}</option>`).join("")}</select>`}</td>
          <td>${u.unknown ? "—" : `<input type="checkbox" data-admin="${u.key}" ${u.admin ? "checked" : ""} ${u.owner ? 'disabled title="Administrador fijo"' : ""} aria-label="Administrador">`}</td>
          <td class="num">${u.created}</td>
          <td class="num">${u.drafts}${u.drafts ? `<div class="meta">${u.alumni} Alumni · ${u.programa} Programa</div>` : ""}</td>
          <td class="num">${u.published}</td>
          <td class="num">${u.ai.month.calls ? `${tokens(u.ai.month.tokens)}<div class="meta">${usd(u.ai.month.cost)} · ${u.ai.month.calls} usos</div>` : "0"}${u.ai.total.calls > u.ai.month.calls ? `<div class="meta">Total: ${usd(u.ai.total.cost)}</div>` : ""}</td>
          <td>${day(u.lastSeen || u.lastActivity)}</td></tr>`).join("") || '<tr><td colspan="8" class="empty">Todavía no ha entrado nadie.</td></tr>'}</tbody>
      </table></div>
      <h2 style="margin-top:32px">Consumo de IA por mes</h2>
      <p class="lead">Estimado con el precio de lista del modelo (${prices.input} $ por millón de tokens de entrada y ${prices.output} $ por millón de salida). La factura real está en la consola de OpenAI o de Azure.</p>
      <div class="table-wrap"><table class="users">
        <thead><tr><th>Mes</th><th class="num">Usos de IA</th><th class="num">Personas</th><th class="num">Tokens entrada</th><th class="num">Tokens salida</th><th class="num">Coste estimado</th></tr></thead>
        <tbody>${months.map((m) => `<tr><td>${esc(monthName(m.month))}</td><td class="num">${m.calls}</td><td class="num">${m.people}</td><td class="num">${tokens(m.input)}</td><td class="num">${tokens(m.output)}</td><td class="num">${usd(m.cost)}</td></tr>`).join("") || '<tr><td colspan="6" class="empty">Todavía no se ha usado la IA desde que se mide el consumo.</td></tr>'}</tbody>
      </table></div>
      <div class="actions" style="justify-content:flex-start"><a class="btn ghost" href="#/">Volver</a></div>`;
    const save = (key, change, el) => {
      el.disabled = true;
      return busy(null, async () => {
        try {
          ({ users } = await api(`admin/users/${key}`, { method: "PUT", body: change }));
          notify("Guardado.");
        } finally {
          draw();
        }
      });
    };
    $$("[data-access]").forEach((el) => el.onchange = () => save(el.dataset.access, { access: el.value }, el));
    $$("[data-admin]").forEach((el) => el.onchange = () => save(el.dataset.admin, { admin: el.checked }, el));
  };
  draw();
}

async function renderHome(area) {
  if (!S.config.user.areas.includes(area)) return go("#/");
  setArea(area);
  S.draft = null;
  stepper.hidden = true;
  document.body.dataset.step = "home";
  app.innerHTML = `<p class="empty">Cargando…</p>`;
  const { drafts } = await api("drafts");
  const label = (k) => t(S.config.templates[k]?.label) || k;
  const when = (iso) => new Date(iso).toLocaleString("es-ES", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  app.innerHTML = `<section class="home-hero"><div><p class="eyebrow">${esc(areaLabel(area))} · <a href="#/">Cambiar</a></p><h1>Hola${S.config.user.name ? `, ${esc(S.config.user.name.split(" ")[0])}` : ""}</h1>
      <p class="lead">Crea un email con la marca del IESE en unos pocos pasos y llévalo a Pardot como plantilla.</p></div>
      <a class="btn primary" href="#/new">+ Crear un email</a></section>
    <h2>Mis borradores</h2>
    <div class="drafts">${drafts.length ? drafts.map((d) => `<div class="draft"><div class="grow"><div class="title">${esc(d.name || "Sin nombre")}</div>
      <div class="meta">${esc(areaLabel(d.area))} · ${esc(label(d.template))} · ${d.language === "en" ? "Inglés" : "Español"} · ${esc(when(d.updatedAt))}</div></div>
      ${d.publishedAt ? '<span class="pill ok">En Pardot</span>' : '<span class="pill">Borrador</span>'}
      <a class="btn small" href="#/d/${d.id}">Abrir</a>
      <button class="btn small ghost" data-dup="${d.id}">Duplicar</button>
      <button class="btn small ghost" data-del="${d.id}" aria-label="Eliminar">Eliminar</button></div>`).join("") : '<p class="empty">Todavía no tienes borradores. Empieza con «Crear un email».</p>'}</div>`;
  $$("[data-dup]").forEach((b) => b.onclick = () => busy(b, async () => {
    const { draft } = await api(`drafts/${b.dataset.dup}/duplicate`, { method: "POST" });
    go(`#/d/${draft.id}`);
  }));
  $$("[data-del]").forEach((b) => b.onclick = async () => {
    if (await confirmDialog({ title: "¿Eliminar este borrador?", text: "No se puede deshacer. Si ya está en Pardot, la plantilla de Pardot no se toca.", yes: "Eliminar", no: "Cancelar" }) !== "yes") return;
    await busy(b, () => api(`drafts/${b.dataset.del}`, { method: "DELETE" }));
    renderHome(area);
  });
}

// Template choice.
function renderNew() {
  const area = currentArea();
  if (!area || !S.config.user.areas.includes(area)) return go("#/");
  S.draft = null;
  S.plan = null;
  stepper.hidden = true;
  document.body.dataset.step = "new";
  const icons = { invite: "✉️", paint: "🎨", calendar: "📅", newsletter: "📰" };
  const blurbs = {
    invite: "Para un evento concreto. Pega el enlace de apply.iese.edu y te preparo casi todo.",
    paint: "Describe cómo quieres el email y lo monto contigo, módulo a módulo.",
    calendar: "Las próximas citas de un vistazo.",
    newsletter: "Actualidad y conocimiento para la comunidad.",
  };
  let chosen = "invite";
  let language = "es";
  app.innerHTML = `<p class="eyebrow">Nuevo email · ${esc(areaLabel(area))}</p><h1>¿Qué quieres crear?</h1><p class="lead">Cada plantilla mantiene siempre el estilo, los colores y la marca del IESE.</p>
    <div class="cards">${Object.entries(S.config.templates).map(([key, tpl]) => `<button class="card${key === chosen ? " selected" : ""}" data-tpl="${key}" ${tpl.active ? "" : "disabled"}>
      ${tpl.active ? "" : '<span class="tag">Próximamente</span>'}<span class="icon">${icons[key]}</span><strong>${esc(tpl.label.es)}</strong><span>${esc(blurbs[key])}</span></button>`).join("")}</div>
    <h2 style="margin-top:28px">¿En qué idioma?</h2>
    <div class="row" role="radiogroup"><button class="btn selected-lang" data-lang="es" aria-pressed="true">Español</button><button class="btn" data-lang="en" aria-pressed="false">English</button></div>
    <p class="hint">Un email tiene un solo idioma. Al final podrás crear la versión en el otro idioma con un clic.</p>
    <div class="actions"><a class="btn ghost" href="${homeHash()}">Cancelar</a><button class="btn primary" data-act="create">Continuar</button></div>`;
  const paintLang = () => $$("[data-lang]").forEach((b) => {
    const on = b.dataset.lang === language;
    b.setAttribute("aria-pressed", on);
    b.classList.toggle("primary", on);
  });
  paintLang();
  $$("[data-tpl]").forEach((b) => b.onclick = () => {
    chosen = b.dataset.tpl;
    $$("[data-tpl]").forEach((c) => c.classList.toggle("selected", c === b));
  });
  $$("[data-lang]").forEach((b) => b.onclick = () => { language = b.dataset.lang; paintLang(); });
  $('[data-act="create"]').onclick = (e) => busy(e.currentTarget, async () => {
    const { draft } = await api("drafts", { method: "POST", body: { template: chosen, language, area } });
    go(`#/d/${draft.id}/${FLOW[chosen][0][0]}`);
  });
}

// Invitation: where the content comes from.
function renderStart() {
  setStep("start");
  const d = S.draft;
  app.innerHTML = `<p class="eyebrow">Invitación a evento</p><h1>¿Desde dónde empezamos?</h1><p class="lead">Elige una opción. Todo se puede cambiar después.</p>
    <div class="choice">
      <div class="panel"><h2>🔗 Tengo el enlace del evento</h2><p class="hint">Leo la página de apply.iese.edu completa: título, fechas, lugar, imagen, texto, agenda y ponentes.</p>
        <div class="row"><div class="field" style="flex:1;margin:0"><input type="url" id="event-url" placeholder="https://apply.iese.edu/…" value="${esc(d.source?.url || "")}"></div><button class="btn primary" data-act="capture">Leer evento</button></div>
        <div id="capture-result"></div></div>
      <div class="panel"><h2>💬 Te cuento las ideas</h2><p class="hint">Pega o dicta lo que quieras contar. La IA lo usará como base, sin copiarlo.</p>
        <label class="field"><div><textarea id="notes" rows="6" placeholder="Por ejemplo: encuentro de antiguos alumnos del MBA en Madrid, el 8 de octubre a las 19:30 h, con cóctel…">${esc(d.brief)}</textarea></div></label>
        <button class="btn" data-act="notes">Seguir con estas ideas</button></div>
      <div class="panel"><h2>✍️ Empiezo en blanco</h2><p class="hint">Te pregunto cada parte del email.</p><button class="btn" data-act="blank">Empezar</button></div>
    </div>`;
  const notes = $("#notes");
  attachMic(notes);
  notes.oninput = () => { d.brief = notes.value; touch({ preview: false }); };
  $('[data-act="notes"]').onclick = () => {
    if (!d.brief.trim()) return notify("Escribe o dicta primero algunas ideas.", { error: true });
    go(`#/d/${d.id}/questions/0`);
  };
  $('[data-act="blank"]').onclick = () => go(`#/d/${d.id}/questions/0`);
  $('[data-act="capture"]').onclick = (e) => busy(e.currentTarget, async () => {
    const url = $("#event-url").value.trim();
    if (!url) throw new Error("Pega primero el enlace del evento.");
    const { capture, modules } = await api("capture", { method: "POST", body: { url, language: d.language } });
    const list = (items, cls = "") => items.map((x) => `<li class="${cls}">${esc(x)}</li>`).join("");
    $("#capture-result").innerHTML = `<h2 style="margin-top:18px">He encontrado</h2>
      <p><strong>${esc(capture.title || "Evento sin título")}</strong>${capture.meta ? ` · ${esc(capture.meta)}` : ""}</p>
      <ul class="found">${list(capture.found.map((x) => `✓ ${x}`))}${list(capture.missing.map((x) => `Falta: ${x}`), "missing")}</ul>
      ${capture.notice ? `<p class="hint">${esc(capture.notice)}</p>` : ""}
      ${!capture.usedAi ? '<p class="hint">Sin IA solo he podido leer los datos básicos de la página.</p>' : ""}
      <button class="btn primary" data-act="use">Usar esta información</button>`;
    $('[data-act="use"]').onclick = () => {
      d.modules = modules;
      d.brief = [capture.summary, capture.body, capture.price && `Precio: ${capture.price}`, capture.dressCode && `Código de vestimenta: ${capture.dressCode}`, capture.registrationInfo && `Inscripción: ${capture.registrationInfo}`, capture.contact && `Contacto: ${capture.contact}`].filter(Boolean).join("\n\n");
      d.source = { url: capture.sourceUrl, title: capture.title, date: capture.date, startTime: capture.startTime, endTime: capture.endTime, venue: capture.venue, address: capture.address, format: capture.format, price: capture.price };
      if (!d.name || d.name === t(S.config.templates.invite.label)) d.name = capture.title || d.name;
      const sig = moduleOf("signature");
      if (sig && !sig.name) Object.assign(sig, { name: localStorage.getItem("studio.signature.name") || "", role: localStorage.getItem("studio.signature.role") || "" });
      touch();
      go(`#/d/${d.id}/questions/0`);
    };
  });
}

// Questions of the invitation, one per screen.
function inviteQuestions() {
  const es = S.draft.language !== "en";
  const mod = (type) => S.config.modules[type].fields;
  const pick = (type, keys) => mod(type).filter((f) => keys.includes(f.key));
  return [
    { key: "image", type: "hero", title: "¿Qué imagen va en la cabecera?", hint: "Si la has importado del evento ya aparece aquí. Puedes cambiarla por una URL pública o subir otra.", fields: pick("hero", ["imageUrl", "imageAlt", "imageLink"]) },
    { key: "overlay", type: "hero", title: "¿Qué texto y qué botón van encima de la imagen?", hint: "Es lo primero que se ve. Aparece como texto real, así se lee aunque el correo bloquee las imágenes.", fields: pick("hero", ["title", "subtitle", "ctaLabel", "ctaUrl"]) },
    { key: "event", type: "event", title: "Confirma los datos del evento", hint: "Las fechas y horas se escriben solas según la guía de estilo.", fields: mod("event") },
    { key: "message", custom: renderMessageQuestion },
    { key: "agenda", type: "agenda", optional: true, title: "¿Quieres incluir la agenda?", hint: "Escríbela o pégala tal cual y la ordeno.", custom: renderAgendaQuestion },
    { key: "speakers", type: "speakers", optional: true, title: "¿Hay ponentes?", fields: pick("speakers", ["items"]) },
    { key: "cta", type: "cta", title: "¿A dónde lleva el botón del final del email?", hint: "Suele ser el mismo enlace de inscripción que el de la cabecera.", fields: mod("cta") },
    { key: "signature", type: "signature", optional: true, title: "¿Quién firma el email?", hint: "Recordaré tu firma para la próxima vez.", fields: mod("signature") },
    { key: "events", type: "events", optional: true, title: es ? "¿Quieres recomendar otros eventos?" : "Do you want to suggest other events?", hint: "Pega los enlaces de apply.iese.edu, uno por línea.", custom: renderEventsQuestion },
    { key: "subject", custom: renderSubjectQuestion },
  ];
}

function paintQuestions() {
  const qs = S.draft.modules.map((m) => ({
    key: m.id,
    moduleId: m.id,
    type: m.type,
    title: m.question || `${t(S.config.modules[m.type].label)}`,
    hint: m.purpose || "",
    fields: m.type === "custom" ? [] : S.config.modules[m.type].fields,
    custom: m.type === "custom" ? renderCustomQuestion : null,
    paint: true,
  }));
  qs.push({ key: "subject", custom: renderSubjectQuestion });
  return qs;
}

function renderQuestions(index) {
  setStep("questions");
  const questions = S.draft.template === "paint" ? paintQuestions() : inviteQuestions();
  const i = Math.min(Math.max(0, index), questions.length - 1);
  const q = questions[i];
  app.innerHTML = `<div class="split"><div class="panel question">
      <div class="count">Pregunta ${i + 1} de ${questions.length}</div>
      <div id="q-body"></div>
      <div class="actions"><button class="btn ghost" data-act="back">← Atrás</button>
        <span class="row">${q.optional ? '<button class="btn" data-act="skip">No, omitir</button>' : ""}<button class="btn primary" data-act="next">${i === questions.length - 1 ? "Ir al editor" : "Siguiente →"}</button></span></div>
    </div>${previewPane()}</div>`;
  const body = $("#q-body");
  const redraw = () => renderQuestions(i);
  if (q.custom) {
    q.custom(body, q, redraw);
  } else {
    const m = q.moduleId ? getModule(q.moduleId) : ensureModule(q.type);
    body.innerHTML = `<h2>${esc(q.title)}</h2>${q.hint ? `<p class="hint">${esc(q.hint)}</p>` : ""}${q.fields.map((f) => fieldHtml(m, f)).join("")}`;
    if (q.paint) addPaintWriter(body, m);
    bindFields(body, redraw);
  }
  S.selected = q.moduleId || (q.type && moduleOf(q.type)?.id) || null;
  bindPreviewPane();
  $('[data-act="back"]').onclick = () => (i === 0 ? go(`#/d/${S.draft.id}/${FLOW[S.draft.template][0][0]}`) : go(`#/d/${S.draft.id}/questions/${i - 1}`));
  const skip = $('[data-act="skip"]');
  if (skip) skip.onclick = () => { removeModule(q.type); touch(); go(`#/d/${S.draft.id}/questions/${i + 1}`); };
  $('[data-act="next"]').onclick = () => {
    if (q.type === "speakers") { const m = moduleOf("speakers"); if (m && !m.items.some((x) => x.name)) removeModule("speakers"); touch(); }
    go(i === questions.length - 1 ? `#/d/${S.draft.id}/editor` : `#/d/${S.draft.id}/questions/${i + 1}`);
  };
  app.focus();
}

function renderMessageQuestion(body, q, redraw) {
  const d = S.draft;
  const heading = ensureModule("heading");
  const text = ensureModule("text");
  body.innerHTML = `<h2>¿Qué quieres contar?</h2><p class="hint">Pega, escribe o dicta las ideas. La IA redacta el título y el cuerpo con la guía de estilo; no copia tus notas.</p>
    <label class="field"><span>Tus ideas</span><div><textarea id="brief" rows="7">${esc(d.brief)}</textarea></div></label>
    ${S.config.ai ? '<button class="btn primary" data-act="compose">✨ Redactar con IA</button>' : '<p class="hint">La IA no está activa en este entorno: escribe el texto directamente.</p>'}
    <hr style="border:0;border-top:1px solid var(--line);margin:20px 0">
    ${fieldHtml(heading, S.config.modules.heading.fields[0])}
    ${fieldHtml(text, S.config.modules.text.fields[0])}`;
  const brief = $("#brief", body);
  attachMic(brief);
  brief.oninput = () => { d.brief = brief.value; touch({ preview: false }); };
  bindFields(body, redraw);
  const compose = $('[data-act="compose"]', body);
  if (compose) compose.onclick = () => busy(compose, async () => {
    if (!d.brief.trim()) throw new Error("Escribe o dicta primero algunas ideas.");
    const ev = moduleOf("event") || {};
    const hero = moduleOf("hero") || {};
    const facts = { title: d.source?.title || hero.title, date: ev.date, endDate: ev.endDate, startTime: ev.startTime, endTime: ev.endTime, venue: ev.venue, address: ev.address, format: d.source?.format, price: d.source?.price };
    const w = await api("ai/compose", { method: "POST", body: { language: d.language, template: d.template, facts, notes: d.brief } });
    heading.text = w.heading || heading.text;
    text.body = w.body || text.body;
    if (hero.id) {
      if (!hero.title) hero.title = w.heroTitle || "";
      if (!hero.subtitle) hero.subtitle = w.heroSubtitle || "";
    }
    S.subjectOptions = w.subjects || [];
    if (!d.subject && S.subjectOptions[0]) d.subject = S.subjectOptions[0];
    if (!d.preheader && w.preheader) d.preheader = w.preheader;
    touch();
    redraw();
    notify("Listo. Revisa el texto y cámbialo si quieres.");
  });
}

function renderAgendaQuestion(body, q, redraw) {
  const m = moduleOf("agenda");
  body.innerHTML = `<h2>${esc(q.title)}</h2><p class="hint">${esc(q.hint)}</p>
    <label class="field"><span>Agenda en texto libre</span><div><textarea id="agenda-free" rows="6" placeholder="19:00 h Bienvenida&#10;19:15 h Mesa redonda con…&#10;20:30 h Cóctel"></textarea></div></label>
    <button class="btn" data-act="structure">${S.config.ai ? "✨ Ordenar agenda" : "Convertir en lista"}</button>
    <div id="agenda-list" style="margin-top:16px">${m ? fieldHtml(m, S.config.modules.agenda.fields[1]) : ""}</div>`;
  bindFields(body, redraw);
  $('[data-act="structure"]', body).onclick = (e) => busy(e.currentTarget, async () => {
    const free = $("#agenda-free", body).value.trim();
    if (!free) throw new Error("Escribe o pega primero la agenda.");
    let items;
    if (S.config.ai) items = (await api("ai/agenda", { method: "POST", body: { language: S.draft.language, text: free } })).items;
    else items = free.split("\n").filter(Boolean).map((line) => {
      const match = line.match(/^\s*(\d{1,2})[:.](\d{2})\s*h?\s*[-–:]?\s*(.+)$/i);
      return match ? { time: `${match[1].padStart(2, "0")}:${match[2]}`, text: match[3] } : { time: "", text: line.trim() };
    });
    ensureModule("agenda").items = items;
    touch();
    redraw();
  });
}

function renderEventsQuestion(body, q, redraw) {
  const m = moduleOf("events");
  body.innerHTML = `<h2>${esc(q.title)}</h2><p class="hint">${esc(q.hint)}</p>
    <label class="field"><span>Enlaces</span><textarea id="event-links" rows="4" placeholder="https://apply.iese.edu/…"></textarea></label>
    <button class="btn" data-act="fetch">Traer eventos</button>
    <div style="margin-top:16px">${m ? S.config.modules.events.fields.map((f) => fieldHtml(m, f)).join("") : ""}</div>`;
  bindFields(body, redraw);
  $('[data-act="fetch"]', body).onclick = (e) => busy(e.currentTarget, async () => {
    const links = $("#event-links", body).value.split(/\s+/).map((x) => x.trim()).filter(Boolean).slice(0, 6);
    if (!links.length) throw new Error("Pega al menos un enlace.");
    const target = ensureModule("events");
    for (const url of links) {
      try {
        const { capture } = await api("capture", { method: "POST", body: { url, language: S.draft.language, quick: true, modules: false } });
        const summary = (capture.body || "").split(/\n+/).find((p) => p.trim().length > 30) || "";
        target.items.push({ title: capture.title, summary: summary.length > 160 ? `${summary.slice(0, 157).trim()}…` : summary, meta: capture.meta, url: capture.sourceUrl });
      } catch (error) {
        notify(`${url}: ${error.message}`, { error: true });
      }
    }
    touch();
    redraw();
  });
}

function renderSubjectQuestion(body, q, redraw) {
  const d = S.draft;
  body.innerHTML = `<h2>Último paso: asunto y texto de vista previa</h2><p class="hint">El asunto es lo que decide si se abre el email. Menos de 60 caracteres funciona mejor.</p>
    <label class="field"><span>Asunto</span><input id="subject" value="${esc(d.subject)}" maxlength="150"></label>
    <div id="subject-options" class="row" style="margin:-6px 0 16px">${S.subjectOptions.map((s) => `<button class="btn small" data-subject="${esc(s)}">${esc(s)}</button>`).join("")}</div>
    <label class="field"><span>Texto de vista previa (preheader)</span><input id="preheader" value="${esc(d.preheader)}" maxlength="200"><small>Aparece junto al asunto en la bandeja de entrada.</small></label>
    <label class="field"><span>Nombre interno del borrador</span><input id="name" value="${esc(d.name)}"></label>
    ${S.config.ai ? '<button class="btn" data-act="suggest">✨ Proponer asuntos</button>' : ""}`;
  const bind = (id, key) => { const el = $(`#${id}`, body); el.oninput = () => { d[key] = el.value; touch(); }; };
  bind("subject", "subject"); bind("preheader", "preheader"); bind("name", "name");
  $$("[data-subject]", body).forEach((b) => b.onclick = () => { d.subject = b.dataset.subject; $("#subject", body).value = d.subject; touch(); });
  const suggest = $('[data-act="suggest"]', body);
  if (suggest) suggest.onclick = () => busy(suggest, async () => {
    const r = await api("ai/subjects", { method: "POST", body: { language: d.language, template: d.template, modules: d.modules } });
    S.subjectOptions = r.subjects || [];
    if (!d.preheader && r.preheader) d.preheader = r.preheader;
    touch();
    redraw();
  });
}

// Pinta y Colorea: lets the AI write a text field from the user's ideas.
function addPaintWriter(body, m) {
  const field = S.config.modules[m.type].fields.find((f) => f.kind === "longtext" || (f.ai && f.kind === "text"));
  if (!field || !S.config.ai || field.kind !== "longtext") return;
  const wrap = document.createElement("div");
  wrap.innerHTML = `<label class="field"><span>Tus ideas para este texto</span><div><textarea id="paint-ideas" rows="4" placeholder="Pega o dicta los conceptos; la IA redacta el texto."></textarea></div></label><button class="btn" data-act="write">✨ Redactar con IA</button><hr style="border:0;border-top:1px solid var(--line);margin:18px 0">`;
  (body.querySelector(".hint") || body.querySelector("h2")).after(wrap);
  attachMic($("#paint-ideas", wrap));
  $('[data-act="write"]', wrap).onclick = (e) => busy(e.currentTarget, async () => {
    const ideas = $("#paint-ideas", wrap).value.trim();
    if (!ideas) throw new Error("Escribe o dicta primero las ideas.");
    const { text } = await api("ai/rewrite", { method: "POST", body: { language: S.draft.language, template: "paint", action: "write", text: ideas, context: m.purpose || "" } });
    m[field.key] = text;
    touch();
    renderQuestions(Number(location.hash.split("/").pop()) || 0);
  });
}

// The module is designed for the 556 px email column; the editor shows it at
// that width, scaled down to fit the panel.
const MODULE_WIDTH = 556;
function fitCustomArea(area) {
  const viewport = area.parentElement;
  const fit = () => {
    if (!area.isConnected) return observer.disconnect();
    const zoom = Math.min(1, viewport.clientWidth / MODULE_WIDTH);
    area.style.zoom = zoom;
    area.dataset.zoom = zoom;
  };
  const observer = new ResizeObserver(fit);
  observer.observe(viewport);
  fit();
}

const IMAGE_SLOT = /^\s*\[?\s*(imagen|image|foto|photo)\s*\]?\s*$/i;

// Cells or blocks whose only content is a placeholder word like [IMAGEN].
function imageSlotAt(node, area) {
  for (let el = node?.nodeType === 1 ? node : node?.parentElement; el && el !== area; el = el.parentElement) {
    if (el.tagName === "IMG") return el;
    if (/^(TD|TH|DIV|P|SPAN)$/.test(el.tagName) && IMAGE_SLOT.test(el.textContent) && !el.querySelector("table,img")) {
      return el.tagName === "SPAN" || el.tagName === "P" ? (el.closest("td,th,div") || el) : el;
    }
  }
  return null;
}

async function uploadImageFile(file) {
  if (!file) return "";
  if (!/^image\/(png|jpeg|gif|webp)$/.test(file.type)) throw new Error("Sube una imagen PNG, JPG, GIF o WebP.");
  if (file.size > 5 * 1024 * 1024) throw new Error("La imagen supera los 5 MB.");
  const result = await api("images", { method: "POST", raw: file, headers: { "Content-Type": file.type, "X-File-Name": encodeURIComponent(file.name) } });
  if (result.notice) notify(result.notice);
  return result.url;
}

// Click an image or an [IMAGEN] slot to replace it, or insert a new one at
// the cursor with the toolbar button.
function bindImagePicker(box, area, onChange) {
  const pick = box.querySelector(".img-pick");
  const urlInput = pick.querySelector(".img-url");
  const altInput = pick.querySelector(".img-alt");
  const linkInput = pick.querySelector(".img-link");
  const drop = pick.querySelector(".drop");
  const fileInput = drop.querySelector("input");
  let target = null;
  let savedRange = null;

  const open = (slot) => {
    target = slot;
    urlInput.value = slot?.tagName === "IMG" ? slot.getAttribute("src") || "" : "";
    altInput.value = slot?.tagName === "IMG" ? slot.getAttribute("alt") || "" : "";
    linkInput.value = slot?.tagName === "IMG" ? slot.parentElement.closest("a")?.getAttribute("href") || "" : "";
    pick.querySelector(".img-pick-title").textContent = slot ? (slot.tagName === "IMG" ? "Cambiar imagen" : "Poner imagen en el hueco") : "Insertar imagen";
    pick.hidden = false;
    pick.scrollIntoView({ block: "nearest" });
  };
  const close = () => { pick.hidden = true; target = null; };

  area.addEventListener("click", (e) => {
    const slot = imageSlotAt(e.target, area);
    if (!slot) return;
    e.preventDefault();
    open(slot);
  });
  area.addEventListener("mouseover", (e) => {
    const slot = imageSlotAt(e.target, area);
    area.classList.toggle("over-slot", Boolean(slot));
    area.title = slot ? "Haz clic para poner una imagen" : "";
  });
  const insert = box.querySelector("[data-img-insert]");
  insert.addEventListener("mousedown", (e) => e.preventDefault());
  insert.onclick = () => {
    const sel = document.getSelection();
    savedRange = sel.rangeCount && area.contains(sel.anchorNode) ? sel.getRangeAt(0).cloneRange() : null;
    open(null);
  };

  const place = (url) => {
    const zoom = Number(area.dataset.zoom) || 1;
    const alt = altInput.value.trim();
    const link = linkInput.value.trim();
    if (target?.tagName === "IMG") {
      target.setAttribute("src", url);
      target.setAttribute("alt", alt);
      const anchor = target.parentElement.closest("a");
      if (anchor && area.contains(anchor)) {
        if (link) anchor.setAttribute("href", link);
        else anchor.replaceWith(...anchor.childNodes);
      } else if (link) {
        const a = document.createElement("a");
        a.setAttribute("href", link);
        target.replaceWith(a);
        a.append(target);
      }
    } else {
      const holder = target || null;
      const rect = (holder || area).getBoundingClientRect();
      const width = Math.max(40, Math.min(MODULE_WIDTH, Math.round(Number(holder?.getAttribute("width")) || rect.width / zoom)));
      const tag = `<img src="${esc(url)}" alt="${esc(alt)}" width="${width}" style="display:block;width:100%;max-width:${width}px;height:auto;border:0;">`;
      const img = link ? `<a href="${esc(link)}">${tag}</a>` : tag;
      if (holder) {
        holder.innerHTML = img;
        // The grey placeholder box, and the cells around it that only held
        // the placeholder, lose their background and fixed height.
        for (let el = holder; el && el !== area && !el.textContent.trim(); el = el.parentElement) {
          if (!/^(TD|TH|DIV|TABLE)$/.test(el.tagName)) continue;
          for (const prop of ["background", "background-color", "height"]) el.style.removeProperty(prop);
          el.removeAttribute("bgcolor");
          el.removeAttribute("height");
        }
      } else {
        area.focus();
        const sel = document.getSelection();
        sel.removeAllRanges();
        if (savedRange) sel.addRange(savedRange);
        else { const r = document.createRange(); r.selectNodeContents(area); r.collapse(false); sel.addRange(r); }
        document.execCommand("insertHTML", false, img);
      }
    }
    close();
    onChange();
  };

  pick.querySelector("[data-img-ok]").onclick = () => {
    const url = urlInput.value.trim();
    if (!/^https:\/\/\S+$/.test(url) && !/\/studio-uploads\//.test(url)) return notify("Sube una imagen o pega una URL que empiece por https://", { error: true });
    if (linkInput.value.trim() && !/^https:\/\/\S+$/.test(linkInput.value.trim())) return notify("El enlace de la imagen debe empezar por https://", { error: true });
    place(url);
  };
  pick.querySelector("[data-img-cancel]").onclick = close;
  const upload = (file) => busy(drop, async () => {
    const url = await uploadImageFile(file);
    if (url) place(url);
  });
  fileInput.onchange = () => upload(fileInput.files[0]);
  drop.addEventListener("dragover", (e) => { e.preventDefault(); drop.classList.add("over"); });
  drop.addEventListener("dragleave", () => drop.classList.remove("over"));
  drop.addEventListener("drop", (e) => { e.preventDefault(); drop.classList.remove("over"); upload(e.dataTransfer.files[0]); });
}

function renderCustomQuestion(body, q) {
  const m = getModule(q.moduleId);
  const rebuild = `<label class="field"><span>Contenido para este módulo</span><div><textarea id="custom-answer" rows="6" placeholder="Escribe o dicta lo que debe contener.">${esc(m.answer || "")}</textarea></div></label>
    <button class="btn ${m.html ? "" : "primary"}" data-act="build">${m.html ? "✨ Volver a crear el módulo" : "✨ Crear el módulo"}</button>
    <p class="hint">La IA lo diseña dentro del marco de marca: colores, tipografía y estilos del IESE. Lo que no cumpla el marco se elimina.</p>`;
  body.innerHTML = `<h2>${esc(q.title)}</h2>${q.hint ? `<p class="hint">${esc(q.hint)}</p>` : ""}
    ${m.html ? `<div class="field"><span>Edita el módulo</span><small>Haz clic en cualquier texto para cambiarlo. Selecciona texto para ponerlo en negrita, cursiva o convertirlo en enlace. Haz clic en una imagen o en el hueco «[IMAGEN]» para poner la tuya, o usa 🖼 para añadir una donde esté el cursor. Para cambios de diseño usa «Ajustes finos».</small>
      <div class="rich custom-rich" data-custom-editor>${richToolbar('<button type="button" class="tb" data-img-insert title="Insertar imagen" aria-label="Insertar imagen">🖼</button>', { list: false })}
        <div class="img-pick" hidden>
          <strong class="img-pick-title">Imagen</strong>
          <label class="drop">Arrastra una imagen o <u>súbela desde tu ordenador</u><input type="file" accept="image/png,image/jpeg,image/gif,image/webp" hidden></label>
          <input type="url" class="img-url" placeholder="…o pega la URL pública (https://…)" aria-label="URL de la imagen">
          <input type="text" class="img-alt" placeholder="Descripción de la imagen (para quien no pueda verla)" aria-label="Descripción de la imagen">
          <input type="url" class="img-link" placeholder="Enlace al hacer clic en la imagen (opcional, https://…)" aria-label="Enlace al hacer clic en la imagen">
          <div class="row"><button type="button" class="btn small primary" data-img-ok>Poner imagen</button><button type="button" class="btn small ghost" data-img-cancel>Cancelar</button></div>
        </div>
        <div class="custom-viewport"><div class="rich-area custom-area" contenteditable="true" role="textbox" aria-multiline="true" aria-label="Contenido del módulo"></div></div></div></div>
      <details class="rebuild"><summary>Volver a crear el módulo con la IA</summary>${rebuild}</details>` : rebuild}`;
  const editor = $("[data-custom-editor]", body);
  if (editor) {
    const area = editor.querySelector(".custom-area");
    area.innerHTML = m.html;
    const save = () => { m.html = area.innerHTML; touch(); };
    bindToolbar(editor, area, save);
    fitCustomArea(area);
    bindImagePicker(editor, area, save);
  }
  const answer = $("#custom-answer", body);
  attachMic(answer);
  answer.oninput = () => { m.answer = answer.value; };
  $('[data-act="build"]', body).onclick = (e) => busy(e.currentTarget, async () => {
    if (!answer.value.trim()) throw new Error("Escribe o dicta primero el contenido.");
    const r = await api("ai/custom", { method: "POST", body: { language: S.draft.language, purpose: m.purpose || m.question || "", answer: answer.value } });
    m.html = r.html;
    touch();
    renderCustomQuestion(body, q);
    if (r.problems?.length) notify("He ajustado el módulo para que cumpla el marco de marca.");
  });
}

// Pinta y Colorea: describe, then confirm the plan.
function renderDescribe() {
  setStep("describe");
  const d = S.draft;
  const plan = S.plan || (d.modules.length ? d.modules.map((m) => ({ type: m.type, purpose: m.purpose || "", question: m.question || "", id: m.id })) : null);
  app.innerHTML = `<p class="eyebrow">Pinta y Colorea</p><h1>Describe cómo quieres el email</h1>
    <p class="lead">Cuéntalo con tus palabras, escrito o dictado. Por ejemplo: «una cabecera con imagen y un texto encima que diga… y un botón a la inscripción; debajo un título, un texto, la agenda, otro botón y los accesos rápidos».</p>
    <div class="split"><div class="panel">
      <label class="field"><span>Tu descripción</span><div><textarea id="describe" rows="9">${esc(d.brief)}</textarea></div></label>
      ${S.config.ai ? '<button class="btn primary" data-act="plan">✨ Diseñar la estructura</button>' : '<p class="hint">La IA no está activa en este entorno.</p>'}
      <div id="plan" style="margin-top:20px"></div>
    </div>
    <div class="panel"><h2>Se añade solo</h2><p class="hint">El logo de tu área arriba, los accesos rápidos, el pie de marca y el texto legal se añaden solos. El logo de arriba lo puedes quitar después en el editor. Los colores, la tipografía y los botones siguen la marca.</p></div></div>`;
  const ta = $("#describe");
  attachMic(ta);
  ta.oninput = () => { d.brief = ta.value; touch({ preview: false }); };
  const drawPlan = (items) => {
    S.plan = items;
    const options = Object.entries(S.config.modules).map(([k, v]) => `<option value="${k}">${esc(v.label.es)}</option>`).join("");
    $("#plan").innerHTML = items.length ? `<h2>Esta es la estructura</h2><p class="hint">Quita, mueve o añade módulos. Después te pregunto por cada uno.</p>
      <ul class="modules">${items.map((p, i) => `<li><span class="name">${i + 1}. <strong>${esc(t(S.config.modules[p.type].label))}</strong>${p.purpose ? `<br><small class="hint">${esc(p.purpose)}</small>` : ""}</span>
        <button class="icon-btn" data-pm="${i}|-1" ${i === 0 ? "disabled" : ""} aria-label="Subir">↑</button><button class="icon-btn" data-pm="${i}|1" ${i === items.length - 1 ? "disabled" : ""} aria-label="Bajar">↓</button><button class="icon-btn" data-pd="${i}" aria-label="Quitar">✕</button></li>`).join("")}
        <li><span class="fixed">Accesos rápidos y pie de marca (fijos)</span></li></ul>
      <div class="row"><select id="add-type" class="btn">${options}</select><button class="btn small" data-act="add">+ Añadir módulo</button></div>
      <div class="actions"><span></span><button class="btn primary" data-act="start">Empezar las preguntas →</button></div>` : "";
    $$("[data-pm]").forEach((b) => b.onclick = () => { const [i, dir] = b.dataset.pm.split("|").map(Number); [items[i], items[i + dir]] = [items[i + dir], items[i]]; drawPlan(items); });
    $$("[data-pd]").forEach((b) => b.onclick = () => { items.splice(Number(b.dataset.pd), 1); drawPlan(items); });
    const add = $('[data-act="add"]');
    if (add) add.onclick = () => { items.push({ type: $("#add-type").value, purpose: "", question: "" }); drawPlan(items); };
    const start = $('[data-act="start"]');
    if (start) start.onclick = () => {
      const existing = new Map(d.modules.map((m) => [m.id, m]));
      d.modules = items.map((p) => {
        if (p.id && existing.has(p.id)) return existing.get(p.id);
        const m = blankModule(p.type);
        const known = new Set(S.config.modules[p.type].fields.map((f) => f.key));
        for (const [k, v] of Object.entries(p.prefill || {})) if (known.has(k) && typeof v === "string") m[k] = v;
        m.question = p.question || "";
        m.purpose = p.purpose || "";
        p.id = m.id;
        return m;
      });
      touch();
      go(`#/d/${d.id}/questions/0`);
    };
  };
  if (plan) drawPlan(plan);
  const planBtn = $('[data-act="plan"]');
  if (planBtn) planBtn.onclick = () => busy(planBtn, async () => {
    if (!d.brief.trim()) throw new Error("Describe primero el email.");
    const { modules } = await api("ai/plan", { method: "POST", body: { language: d.language, description: d.brief } });
    if (!modules.length) throw new Error("No he sabido montar una estructura. Prueba a describirlo con más detalle.");
    drawPlan(modules);
  });
}

// The four icons above the footer: each draft can point them elsewhere.
function quickLinksForm() {
  const d = S.draft;
  return `<h2>Accesos rápidos</h2><p class="hint">Los 4 iconos que van encima del pie. Cambia a dónde lleva cada uno en este email. Si dejas un campo vacío se usa el enlace por defecto de la app.</p>
    ${S.config.quickLinks.map((q) => `<label class="field"><span>${esc(t(q.label))}</span>
      <input type="text" inputmode="url" id="f-quicklinks-${q.key}" data-quick="${q.key}" value="${esc(d.quickLinks?.[q.key] || "")}" placeholder="${esc(q.url || "https://… o mailto:…")}">
      <small>${q.url ? `Por defecto: ${esc(q.url)}` : "Sin enlace por defecto: si lo dejas vacío, el icono no lleva a ningún sitio."}</small></label>`).join("")}`;
}

function bindQuickLinks(form) {
  const d = S.draft;
  $$("[data-quick]", form).forEach((input) => input.addEventListener("input", () => {
    d.quickLinks = { ...(d.quickLinks || {}), [input.dataset.quick]: input.value.trim() };
    if (!d.quickLinks[input.dataset.quick]) delete d.quickLinks[input.dataset.quick];
    touch();
  }));
}

// Visual editor.
function renderEditor() {
  setStep("editor");
  const d = S.draft;
  if (S.selected !== "quicklinks" && (!S.selected || !getModule(S.selected))) S.selected = d.modules[0]?.id || null;
  const tpl = S.config.templates[d.template];
  const required = new Set(tpl.required);
  const sel = getModule(S.selected);
  const options = (tpl.addable || []).map((k) => `<option value="${k}">${esc(t(S.config.modules[k].label))}</option>`).join("");
  app.innerHTML = `<div class="split"><div class="panel">
      <h2>Editor</h2><p class="hint">Pulsa sobre cualquier parte del email para cambiarla.</p>
      <section class="tweaks" id="tweaks">
        <h3>✨ Ajustes finos</h3>
        <p class="hint">Pide los últimos retoques que no salen en los campos. Por ejemplo: «quita un par de píxeles de espacio entre el título y la imagen» o «pon en negro el botón de Inscríbete».</p>
        <label class="field"><div><textarea id="tweak-text" rows="3" placeholder="Escribe o dicta el ajuste…"></textarea></div></label>
        <div class="row"><button type="button" class="btn primary small" data-act="tweak" ${S.config.ai ? "" : "disabled"}>Aplicar ajuste</button>
          ${S.config.ai ? "" : '<small class="hint">Necesita la IA, que no está activa en este entorno.</small>'}</div>
        ${(d.tweaks || []).length ? `<ul class="tweak-list">${d.tweaks.map((tw) => `<li data-tweak="${tw.id}"><span>${esc(tw.instruction)}</span><button type="button" class="icon-btn" data-untweak="${tw.id}" aria-label="Quitar este ajuste" title="Quitar este ajuste">✕</button></li>`).join("")}</ul>` : ""}
      </section>
      <ul class="modules"><li class="${d.hideLogo ? "off" : ""}"><span class="name fixed-name">Logo ${esc(areaLabel(d.area))}${S.config.areas[d.area || "alumni"]?.logo ? "" : " (pendiente)"}${d.hideLogo ? " (quitado)" : ""}</span>
          <button class="${d.hideLogo ? "btn small" : "icon-btn"}" data-act="logo" aria-label="${d.hideLogo ? "Volver a poner el logo" : "Quitar el logo"}" title="${d.hideLogo ? "Volver a poner el logo" : "Quitar el logo"}">${d.hideLogo ? "Volver a poner" : "✕"}</button></li>
        ${d.modules.map((m, i) => `<li class="${m.id === S.selected ? "selected" : ""}"><button class="name" data-sel="${m.id}">${esc(t(S.config.modules[m.type].label))}</button>
          <button class="icon-btn" data-mv="${i}|-1" ${i === 0 ? "disabled" : ""} aria-label="Subir">↑</button>
          <button class="icon-btn" data-mv="${i}|1" ${i === d.modules.length - 1 ? "disabled" : ""} aria-label="Bajar">↓</button>
          <button class="icon-btn" data-rm="${m.id}" ${required.has(m.type) && d.modules.filter((x) => x.type === m.type).length === 1 ? "disabled title=\"Obligatorio en esta plantilla\"" : ""} aria-label="Quitar">✕</button></li>`).join("")}
        <li class="${S.selected === "quicklinks" ? "selected" : ""}"><button class="name" data-sel="quicklinks">Accesos rápidos (enlaces de los 4 iconos)</button></li>
        <li><span class="fixed">Pie de marca y texto legal (fijos)</span></li></ul>
      ${options ? `<div class="row"><select id="add-type" class="btn">${options}</select><button class="btn small" data-act="add">+ Añadir módulo</button></div>` : ""}
      <hr style="border:0;border-top:1px solid var(--line);margin:20px 0">
      <div id="module-form">${S.selected === "quicklinks" ? quickLinksForm() : sel ? `<h2>${esc(t(S.config.modules[sel.type].label))}</h2>${sel.type === "custom" ? "" : S.config.modules[sel.type].fields.map((f) => fieldHtml(sel, f)).join("")}` : ""}</div>
      <div class="actions"><button class="btn ghost" data-act="back">← Preguntas</button><button class="btn primary" data-act="review">Revisar →</button></div>
    </div>${previewPane()}</div>`;
  const form = $("#module-form");
  if (S.selected === "quicklinks") bindQuickLinks(form);
  else if (sel?.type === "custom") renderCustomQuestion(form, { moduleId: sel.id, title: t(S.config.modules.custom.label), hint: sel.purpose || "" });
  else bindFields(form, renderEditor);
  $$("[data-sel]").forEach((b) => b.onclick = () => { S.selected = b.dataset.sel; renderEditor(); });
  $$("[data-mv]").forEach((b) => b.onclick = () => { const [i, dir] = b.dataset.mv.split("|").map(Number); [d.modules[i], d.modules[i + dir]] = [d.modules[i + dir], d.modules[i]]; touch(); renderEditor(); });
  $$("[data-rm]").forEach((b) => b.onclick = () => { d.modules = d.modules.filter((m) => m.id !== b.dataset.rm); touch(); renderEditor(); });
  const add = $('[data-act="add"]');
  if (add) add.onclick = () => {
    const m = blankModule($("#add-type").value);
    const at = d.modules.findIndex((x) => x.id === S.selected);
    d.modules.splice(at < 0 ? d.modules.length : at + 1, 0, m);
    S.selected = m.id;
    touch();
    renderEditor();
  };
  $('[data-act="logo"]').onclick = () => { d.hideLogo = !d.hideLogo; touch(); renderEditor(); };
  const tweakText = $("#tweak-text");
  attachMic(tweakText);
  tweakText.addEventListener("keydown", (e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) $('[data-act="tweak"]').click(); });
  $('[data-act="tweak"]').onclick = (e) => busy(e.currentTarget, async () => {
    const instruction = tweakText.value.trim();
    if (!instruction) throw new Error("Escribe o dicta primero el ajuste.");
    const { reply, tweak } = await api("ai/tweak", { method: "POST", body: { language: d.language, template: d.template, area: d.area, instruction, hideLogo: Boolean(d.hideLogo), quickLinks: d.quickLinks || {}, modules: d.modules, tweaks: d.tweaks || [] } });
    if (!tweak) throw new Error(reply);
    d.tweaks = [...(d.tweaks || []), tweak];
    touch();
    renderEditor();
    notify(reply, { actionLabel: "Deshacer", action: () => { d.tweaks = d.tweaks.filter((x) => x.id !== tweak.id); touch(); renderEditor(); } });
  });
  $$("[data-untweak]").forEach((b) => b.onclick = () => { d.tweaks = d.tweaks.filter((x) => x.id !== b.dataset.untweak); touch(); renderEditor(); });
  if (S.focus) {
    const { id, addType, tweak } = S.focus;
    if (tweak) flash($(`[data-tweak="${tweak}"]`) || $("#tweaks"));
    S.focus = null;
    if (addType && $("#add-type")) { $("#add-type").value = addType; flash($("#add-type").closest(".row")); $("#add-type").focus(); }
    const el = id && document.getElementById(id);
    if (el) {
      const rich = el.parentElement.querySelector(`[data-rich="${id}"]`);
      const shown = rich ? rich.querySelector(".rich-area") : el;
      flash(shown.closest(".field") || shown);
      shown.focus({ preventScroll: true });
    }
  }
  $('[data-act="back"]').onclick = () => go(`#/d/${d.id}/questions/0`);
  $('[data-act="review"]').onclick = () => go(`#/d/${d.id}/review`);
  bindPreviewPane();
}

function flash(el) {
  if (!el) return;
  el.scrollIntoView({ behavior: "smooth", block: "center" });
  el.classList.remove("flash");
  void el.offsetWidth;
  el.classList.add("flash");
}

// Takes the user from a review message to the place where it is fixed.
async function goToFix(target) {
  const d = S.draft;
  if (!target) return;
  if (target.field === "subject" || target.field === "preheader") {
    const el = $(`#${target.field}`);
    flash(el.closest(".field"));
    return el.focus({ preventScroll: true });
  }
  if (target.moduleId === "quicklinks") {
    S.selected = "quicklinks";
    S.focus = { id: `f-quicklinks-${target.field}` };
    await flush();
    return go(`#/d/${d.id}/editor`);
  }
  if (target.moduleId && getModule(target.moduleId)) {
    S.selected = target.moduleId;
    S.focus = { id: target.field ? `f-${target.moduleId}-${target.field.replaceAll(".", "-")}` : null };
    await flush();
    return go(`#/d/${d.id}/editor`);
  }
  if (target.tweak) {
    S.focus = { tweak: target.tweak };
    return go(`#/d/${d.id}/editor`);
  }
  if (target.addModule) {
    const addable = S.config.templates[d.template].addable || [];
    if (!addable.includes(target.addModule) && d.template === "invite") {
      const index = inviteQuestions().findIndex((q) => q.type === target.addModule || (q.key === "message" && ["heading", "text"].includes(target.addModule)));
      if (index >= 0) return go(`#/d/${d.id}/questions/${index}`);
    }
    S.focus = { addType: target.addModule };
    return go(`#/d/${d.id}/editor`);
  }
}

// Review and Pardot.
function renderReview() {
  setStep("review");
  const d = S.draft;
  d.pardot ||= { campaignId: S.config.pardot.campaignId || "", folderId: S.config.pardot.folderId || "" };
  const other = d.language === "es" ? "inglés" : "español";
  app.innerHTML = `<div class="split"><div class="panel">
      <h2>Revisión</h2>
      <ul class="checklist" id="checks"><li>Comprobando…</li></ul>
      ${S.config.ai ? '<button class="btn" data-act="style">✨ Revisar estilo con IA</button><div id="issues" style="margin-top:12px"></div>' : ""}
      <hr style="border:0;border-top:1px solid var(--line);margin:20px 0">
      <label class="field"><span>Asunto</span><input id="subject" value="${esc(d.subject)}"></label>
      <label class="field"><span>Texto de vista previa</span><input id="preheader" value="${esc(d.preheader)}"></label>
      <label class="field"><span>Nombre de la plantilla en Pardot</span><input id="name" value="${esc(d.name)}"></label>
      <div class="grid2"><label class="field"><span>ID de campaña (opcional)</span><input id="campaign" inputmode="numeric" value="${esc(d.pardot.campaignId)}"></label>
        <label class="field"><span>ID de carpeta (opcional)</span><input id="folder" inputmode="numeric" value="${esc(d.pardot.folderId)}"></label></div>
      <small class="hint">Si los dejas vacíos se usan la campaña y la carpeta fijas de Alumni configuradas en la app.</small>
      <div class="actions"><span class="row"><button class="btn ghost" data-act="back">← Editor</button><button class="btn" data-act="download">Descargar HTML</button>
        ${S.config.ai ? `<button class="btn" data-act="translate">Crear versión en ${other}</button>` : ""}</span>
        <button class="btn primary" data-act="publish">Crear plantilla en Pardot</button></div>
      ${S.config.dryRun ? '<p class="hint">Modo simulación: no se creará nada en Pardot.</p>' : ""}
    </div>${previewPane()}</div>`;
  const bind = (id, set) => { const el = $(`#${id}`); el.oninput = () => { set(el.value); touch(); }; };
  bind("subject", (v) => { d.subject = v; });
  bind("preheader", (v) => { d.preheader = v; });
  bind("name", (v) => { d.name = v; });
  bind("campaign", (v) => { d.pardot.campaignId = v.replace(/\D/g, ""); });
  bind("folder", (v) => { d.pardot.folderId = v.replace(/\D/g, ""); });
  const drawChecks = () => {
    const v = S.preview?.validation;
    if (!v) return;
    const item = (kind, text, target, i) => target
      ? `<li class="${kind}"><button type="button" class="check-link" data-check="${kind}|${i}" title="Ir a corregirlo">${kind === "err" ? "✕" : "!"} ${esc(text)}<span class="go">Corregir →</span></button></li>`
      : `<li class="${kind}">${kind === "err" ? "✕" : "!"} ${esc(text)}</li>`;
    $("#checks").innerHTML = [
      ...v.errors.map((x, i) => item("err", x, v.targets?.errors?.[i], i)),
      ...v.warnings.map((x, i) => item("warn", x, v.targets?.warnings?.[i], i)),
    ].join("") || '<li class="ok">✓ Todo listo para Pardot.</li>';
    $$("[data-check]").forEach((b) => b.onclick = () => {
      const [kind, i] = b.dataset.check.split("|");
      goToFix(v.targets[kind === "err" ? "errors" : "warnings"][Number(i)]);
    });
  };
  S.onPreview = drawChecks;
  $('[data-act="back"]').onclick = () => go(`#/d/${d.id}/editor`);
  const style = $('[data-act="style"]');
  if (style) style.onclick = () => busy(style, async () => {
    const { issues } = await api("ai/review", { method: "POST", body: { language: d.language, template: d.template, subject: d.subject, preheader: d.preheader, modules: d.modules } });
    $("#issues").innerHTML = issues.length ? `<ul class="checklist">${issues.map((x, i) => `<li class="warn issue"><span><q>${esc(x.quote)}</q> → <strong>${esc(x.suggestion)}</strong></span><small>${esc(x.rule)}</small><span><button class="btn small" data-fix="${i}">Aplicar</button></span></li>`).join("")}</ul>` : '<ul class="checklist"><li class="ok">✓ El texto cumple la guía de estilo.</li></ul>';
    $$("[data-fix]").forEach((b) => b.onclick = () => {
      const issue = issues[Number(b.dataset.fix)];
      if (applyIssue(issue)) { b.disabled = true; b.textContent = "Aplicado"; touch(); }
      else notify("No he encontrado ese texto; quizá ya lo has cambiado.", { error: true });
    });
  });
  $('[data-act="download"]').onclick = (e) => busy(e.currentTarget, async () => {
    await flush();
    const { html } = await api(`drafts/${d.id}/export`, { method: "POST" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([html], { type: "text/html" }));
    a.download = `${(d.name || "email").replace(/[^\w-]+/g, "_")}.html`;
    a.click();
  });
  const translate = $('[data-act="translate"]');
  if (translate) translate.onclick = () => busy(translate, async () => {
    await flush();
    const { draft } = await api(`drafts/${d.id}/translate`, { method: "POST" });
    notify(`He creado un borrador nuevo en ${other}. El original no cambia.`);
    S.draft = null;
    go(`#/d/${draft.id}/review`);
  });
  $('[data-act="publish"]').onclick = async (e) => {
    const button = e.currentTarget;
    await flush();
    if (S.preview?.validation?.errors?.length) return notify("Corrige primero los puntos marcados en rojo.", { error: true });
    const answer = await confirmDialog({
      title: "Antes de crear la plantilla",
      text: "¿Quieres que la IA aprenda el tono de voz y el tipo de comunicación de este email para futuros envíos?",
      yes: "Sí, que aprenda",
      no: "No",
      cancel: true,
    });
    if (answer === "cancel") return;
    await busy(button, async () => {
      const result = await api(`drafts/${d.id}/publish`, { method: "POST", body: { version: d.version, learn: answer === "yes" } });
      S.draft.version = result.draft.version;
      S.draft.publishedAt = result.draft.publishedAt;
      renderDone(result);
    });
  };
  bindPreviewPane();
}

function applyIssue(issue) {
  const d = S.draft;
  const replaceIn = (obj, key) => {
    if (typeof obj[key] === "string" && obj[key].includes(issue.quote)) { obj[key] = obj[key].replace(issue.quote, issue.suggestion); return true; }
    return false;
  };
  if (issue.key === "subject" || issue.key === "preheader") return replaceIn(d, issue.key);
  const [id, field, index, sub] = String(issue.key || "").split(".");
  const m = getModule(id);
  if (m) return index !== undefined ? replaceIn(m[field]?.[Number(index)] || {}, sub) : replaceIn(m, field);
  for (const mod of d.modules) for (const k of Object.keys(mod)) if (replaceIn(mod, k)) return true;
  return false;
}

function renderDone(result) {
  stepper.hidden = true;
  const other = S.draft.language === "es" ? "inglés" : "español";
  app.innerHTML = `<div class="panel success"><div class="big">✓</div><h1>${result.dryRun ? "Simulación completada" : "Plantilla creada en Pardot"}</h1>
    <p class="lead">${esc(result.message)}${result.learned ? " La IA tendrá en cuenta este email en próximas peticiones." : ""}</p>
    <div class="row" style="justify-content:center">${result.url ? `<a class="btn primary" href="${esc(result.url)}" target="_blank" rel="noopener">Abrir en Pardot</a>` : ""}
      ${S.config.ai ? `<button class="btn" data-act="translate">Crear versión en ${other}</button>` : ""}<a class="btn" href="${homeHash()}">Volver al inicio</a></div>
    <p class="hint" style="margin-top:20px">La audiencia y el envío se configuran en Pardot.</p></div>`;
  const translate = $('[data-act="translate"]');
  if (translate) translate.onclick = () => busy(translate, async () => {
    const { draft } = await api(`drafts/${S.draft.id}/translate`, { method: "POST" });
    S.draft = null;
    go(`#/d/${draft.id}/review`);
  });
}

// ---------- router ----------

async function loadDraft(id) {
  if (S.draft?.id === id) return S.draft;
  await flush();
  const { draft } = await api(`drafts/${id}`);
  S.draft = draft;
  S.area = draft.area || "alumni";
  S.plan = null;
  S.subjectOptions = [];
  S.selected = null;
  return draft;
}

async function render() {
  banner.hidden = true;
  const [, page, id, step, n] = location.hash.split("/");
  try {
    if (!page) return renderAreas();
    if (page === "a" && id) return await renderHome(id);
    if (page === "admin") return await renderAdmin();
    if (page === "new") return renderNew();
    if (page === "d" && id) {
      await loadDraft(id);
      const target = step || S.draft.step || FLOW[S.draft.template][0][0];
      if (target === "start") return renderStart();
      if (target === "describe") return renderDescribe();
      if (target === "questions") return renderQuestions(Number(n) || 0);
      if (target === "editor") return renderEditor();
      if (target === "review") return renderReview();
    }
    go("#/");
  } catch (error) {
    app.innerHTML = `<div class="empty">${esc(error.message)}<br><br><a class="btn" href="#/">Volver al inicio</a></div>`;
  }
}

async function boot() {
  try {
    S.config = await api("config");
  } catch (error) {
    app.innerHTML = `<div class="empty">${esc(error.message)}</div>`;
    return;
  }
  document.getElementById("user").textContent = S.config.user.name || "";
  const mode = document.getElementById("mode");
  if (S.config.dryRun) { mode.hidden = false; mode.textContent = "Modo simulación"; }
  window.addEventListener("hashchange", render);
  render();
}

boot();
