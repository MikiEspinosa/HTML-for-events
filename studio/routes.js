// HTTP API of the guided studio, mounted under /api/studio/.

import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { AREAS, areaOf, areaSettings, areasFor, createUsers } from "./access.js";
import { createAi, applyTexts, collectTexts } from "./ai.js";
import { BRAND, COPY, LANGUAGES, MODULES, QUICK_LINKS, TEMPLATES, cleanTweaks, defaultAssets, isSafeTweakHtml, renderEmail, renderParts, sanitizeCustomHtml, validateDraft, withTweakWarnings } from "./brand.js";
import { captureEvent } from "./capture.js";
import { formatDate, formatTime } from "./format.js";
import { GUIDE_VERSIONS } from "./rules.js";
import { createStore, ownerKey } from "./store.js";

class HttpError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

const IMAGE_TYPES = { "image/png": "png", "image/jpeg": "jpg", "image/gif": "gif", "image/webp": "webp" };

export function newModuleId() {
  return `m${randomUUID().replaceAll("-", "").slice(0, 10)}`;
}

export function emptyModule(type, language) {
  const c = COPY[language] || COPY.es;
  const base = { id: newModuleId(), type };
  switch (type) {
    case "hero": return { ...base, imageUrl: "", imageAlt: "", title: "", subtitle: "", ctaLabel: c.ctaLabel, ctaUrl: "" };
    case "greeting": return { ...base, text: c.greeting };
    case "agenda": return { ...base, title: c.agendaTitle, items: [] };
    case "speakers": return { ...base, title: c.speakersTitle, items: [] };
    case "cta": return { ...base, label: c.ctaLabel, url: "" };
    case "signature": return { ...base, closing: c.closing, name: "", role: "" };
    case "events": return { ...base, title: c.eventsTitle, items: [], allLabel: c.eventsAllLabel, allUrl: "https://www.iese.edu/alumni/events/" };
    default: return base;
  }
}

// Only known fields of known modules are kept from the client.
export function cleanModules(modules, language) {
  if (!Array.isArray(modules)) return [];
  return modules.slice(0, 40).filter((m) => m && MODULES[m.type]).map((m) => {
    const out = { id: /^m[a-z0-9]{4,20}$/.test(m.id || "") ? m.id : newModuleId(), type: m.type };
    for (const field of MODULES[m.type].fields) {
      if (field.kind === "list") {
        out[field.key] = (Array.isArray(m[field.key]) ? m[field.key] : []).slice(0, 30).map((item) =>
          Object.fromEntries(field.item.map((sub) => [sub.key, String(item?.[sub.key] ?? "").slice(0, 2000)])),
        );
      } else {
        out[field.key] = String(m[field.key] ?? "").slice(0, field.kind === "longtext" || field.kind === "html" ? 20000 : 1000);
      }
    }
    if (m.type === "custom") {
      out.html = sanitizeCustomHtml(out.html);
      if (typeof m.answer === "string") out.answer = m.answer.slice(0, 10000);
    }
    if (typeof m.question === "string") out.question = m.question.slice(0, 500);
    if (typeof m.purpose === "string") out.purpose = m.purpose.slice(0, 500);
    return out;
  });
}

export function cleanQuickLinks(input) {
  const out = {};
  for (const q of QUICK_LINKS) {
    const value = String(input?.[q.key] ?? "").trim().slice(0, 500);
    if (value) out[q.key] = value;
  }
  return out;
}

function cleanDraftFields(input, current = {}) {
  const language = LANGUAGES.includes(input.language) ? input.language : current.language || "es";
  const fields = {};
  for (const key of ["name", "subject", "preheader", "brief", "step"]) {
    if (input[key] !== undefined) fields[key] = String(input[key] ?? "").slice(0, key === "brief" ? 20000 : 300);
  }
  if (input.hideLogo !== undefined) fields.hideLogo = input.hideLogo === true;
  if (input.quickLinks !== undefined) fields.quickLinks = cleanQuickLinks(input.quickLinks);
  if (input.tweaks !== undefined) fields.tweaks = cleanTweaks(input.tweaks);
  if (input.modules !== undefined) fields.modules = cleanModules(input.modules, language);
  if (input.source !== undefined && input.source && typeof input.source === "object") fields.source = JSON.parse(JSON.stringify(input.source).slice(0, 60000));
  if (input.pardot && typeof input.pardot === "object") {
    fields.pardot = { campaignId: String(input.pardot.campaignId ?? "").replace(/\D/g, ""), folderId: String(input.pardot.folderId ?? "").replace(/\D/g, "") };
  }
  return fields;
}

export function getUser(request, env = process.env) {
  const headers = request.headers;
  const encoded = headers["x-ms-client-principal"];
  let name = "";
  if (encoded) {
    try {
      const principal = JSON.parse(Buffer.from(String(encoded), "base64").toString("utf8"));
      name = principal.claims?.find((c) => c.typ === "name")?.val || "";
    } catch { /* ignore malformed header */ }
  }
  const email = String(headers["x-ms-client-principal-name"] || "");
  const id = String(headers["x-ms-client-principal-id"] || email || "");
  if (id) return { id, email, name: name || email.split("@")[0] };
  if (String(env.STUDIO_REQUIRE_LOGIN).toLowerCase() === "true") throw new HttpError("Inicia sesión con tu cuenta del IESE.", 401);
  return { id: "local-user", email: "", name: "Usuario local" };
}

async function readBody(request, limit) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > limit) throw new HttpError("El contenido es demasiado grande.", 413);
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function readJson(request) {
  const raw = (await readBody(request, 2_000_000)).toString("utf8");
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    throw new HttpError("Petición no válida.");
  }
}

function send(response, status, payload) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  response.end(JSON.stringify(payload));
}

function publicBase(request, env) {
  if (env.PUBLIC_BASE_URL) return env.PUBLIC_BASE_URL.replace(/\/+$/, "");
  const proto = request.headers["x-forwarded-proto"] || "http";
  return `${proto}://${request.headers.host || "localhost"}`;
}

export function assetsFor(request, env = process.env, area = "alumni") {
  const assets = defaultAssets();
  const settings = areaSettings(area, env);
  if (areaOf(area) === "alumni") {
    if (settings.logoUrl || env.BRAND_HEADER_LOGO_URL) assets.logoUrl = settings.logoUrl || env.BRAND_HEADER_LOGO_URL;
  } else {
    // No Alumni logo on another area's emails: no logo until one is set.
    assets.logoUrl = settings.logoUrl;
  }
  assets.logoAlt = AREAS[areaOf(area)].logoAlt;
  if (env.BRAND_FOOTER_LOGO_URL) assets.footerLogoUrl = env.BRAND_FOOTER_LOGO_URL;
  for (const q of QUICK_LINKS) {
    const url = env[`QUICK_LINK_${q.key.toUpperCase()}_URL`];
    if (url) assets.quickLinks[q.key] = url;
  }
  return assets;
}

export function modulesForInvite(language, capture = {}, written = {}) {
  const c = COPY[language];
  const mods = [];
  const hero = emptyModule("hero", language);
  Object.assign(hero, {
    imageUrl: capture.imageUrl || "",
    imageAlt: capture.title || "",
    title: written.heroTitle || capture.title || "",
    subtitle: written.heroSubtitle || [formatDate(capture.date, language, { year: false }), formatTime(capture.startTime, language)].filter(Boolean).join(". "),
    ctaLabel: written.ctaLabel || c.ctaLabel,
    ctaUrl: capture.registrationUrl || "",
  });
  mods.push(hero);
  mods.push({ ...emptyModule("heading", language), text: written.heading || capture.title || "" });
  mods.push(emptyModule("greeting", language));
  mods.push({ ...emptyModule("text", language), body: written.body || capture.body || "" });
  mods.push({ ...emptyModule("event", language), date: capture.date || "", endDate: capture.endDate || "", startTime: capture.startTime || "", endTime: capture.endTime || "", venue: capture.venue || "", address: capture.address || "" });
  if (capture.agenda?.length) mods.push({ ...emptyModule("agenda", language), items: capture.agenda });
  if (capture.speakers?.length) mods.push({ ...emptyModule("speakers", language), items: capture.speakers });
  mods.push({ ...emptyModule("cta", language), label: written.ctaLabel || c.ctaLabel, url: capture.registrationUrl || "" });
  mods.push(emptyModule("signature", language));
  return mods;
}

async function uploadToPardot(deps, { bytes, type, name }) {
  const businessUnitId = process.env.PARDOT_BUSINESS_UNIT_ID;
  if (!businessUnitId) throw new HttpError("Falta PARDOT_BUSINESS_UNIT_ID para subir imágenes a Pardot.", 500);
  const token = await deps.getAccessToken();
  const baseUrl = process.env.PARDOT_API_BASE_URL || "https://pi.pardot.com";
  const endpoint = new URL("/api/v5/objects/files", baseUrl);
  endpoint.searchParams.set("fields", "id,name,url");
  const input = { name };
  if (process.env.PARDOT_IMAGE_FOLDER_ID) input.folderId = Number(process.env.PARDOT_IMAGE_FOLDER_ID);
  const multipart = pardotFileBody(input, { bytes, type, name });
  const headers = { Accept: "application/json", Authorization: `Bearer ${token}`, "Pardot-Business-Unit-Id": businessUnitId };
  const response = await fetch(endpoint, { method: "POST", headers: { ...headers, "Content-Type": multipart.contentType }, body: multipart.body });
  let data = await readPardotJson(response);
  if (!response.ok) {
    console.error(`Pardot file upload failed: HTTP ${response.status}`, JSON.stringify(data).slice(0, 2000));
    const detail = [data.code, data.message].filter(Boolean).join(": ");
    throw new HttpError(`Pardot no aceptó la imagen${detail ? ` (${detail})` : ` (HTTP ${response.status})`}.`, 502);
  }
  // The public URL may not come back with the creation; read the file again.
  if (!data.url && data.id) {
    const read = new URL(`/api/v5/objects/files/${encodeURIComponent(data.id)}`, baseUrl);
    read.searchParams.set("fields", "id,name,url");
    data = await readPardotJson(await fetch(read, { headers }));
  }
  if (!data.url) {
    console.error("Pardot file upload returned no URL", JSON.stringify(data).slice(0, 2000));
    throw new HttpError("Pardot ha guardado la imagen pero no ha devuelto su enlace público. Búscala en Pardot > Archivos y pega aquí su URL.", 502);
  }
  return data.url;
}

// Pardot expects "input" as a plain JSON field and "file" as the file. The
// standard FormData sends a Blob field as a file named "blob", which Pardot
// answers with error 84, so the body is built by hand.
export function pardotFileBody(input, { bytes, type, name }) {
  const boundary = `----aura${randomUUID().replaceAll("-", "")}`;
  const safeName = String(name).replace(/["\r\n]/g, "");
  const head = (disposition, contentType) => `--${boundary}\r\nContent-Disposition: form-data; ${disposition}\r\nContent-Type: ${contentType}\r\n\r\n`;
  const body = Buffer.concat([
    Buffer.from(`${head('name="input"', "application/json")}${JSON.stringify(input)}\r\n`),
    Buffer.from(head(`name="file"; filename="${safeName}"`, type)),
    Buffer.from(bytes),
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  return { body, contentType: `multipart/form-data; boundary=${boundary}` };
}

async function readPardotJson(response) {
  const text = await response.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return { message: text.slice(0, 300) };
  }
}

export function createStudioHandler(deps, env = process.env) {
  const dataDir = env.STUDIO_DATA_DIR || path.join(deps.rootDir, "data");
  const store = deps.store || createStore(dataDir);
  const users = deps.users || createUsers(dataDir, env);
  const ai = deps.ai || createAi({ getClient: deps.getAiClient, buildRequest: deps.buildAiRequest, extractText: deps.extractAiText });
  const dryRun = () => deps.isDryRun();
  const published = new Map();

  async function examplesFor(draft) {
    return store.findExamples({ template: draft.template, language: draft.language });
  }

  // Pardot campaign and folder of an area; the app defaults when not set.
  function pardotDefaults(area) {
    const defaults = deps.runtimeDefaults();
    const settings = areaSettings(area, env);
    return { campaignId: settings.campaignId || defaults.campaignId, folderId: settings.folderId || defaults.folderId };
  }

  async function adminUsers() {
    const [list, stats] = await Promise.all([users.list(), store.stats()]);
    const empty = { drafts: 0, published: 0, alumni: 0, programa: 0, lastActivity: "" };
    const rows = list.map((u) => {
      const s = stats[u.key] || empty;
      return {
        key: u.key, name: u.name || "", email: u.email || "", access: u.access, admin: u.admin, owner: u.owner,
        firstSeen: u.firstSeen || "", lastSeen: u.lastSeen || "",
        created: Math.max(Number(u.created) || 0, s.drafts), drafts: s.drafts,
        published: Math.max(Number(u.published) || 0, s.published),
        alumni: s.alumni, programa: s.programa, lastActivity: s.lastActivity,
      };
    });
    // Authors of drafts from before people were recorded: named on their next visit.
    for (const [key, s] of Object.entries(stats)) {
      if (list.some((u) => u.key === key)) continue;
      rows.push({ key, name: "", email: "", access: null, admin: false, owner: false, firstSeen: "", lastSeen: "", created: s.drafts, ...s, unknown: true });
    }
    return rows.sort((a, b) => (b.lastSeen || b.lastActivity).localeCompare(a.lastSeen || a.lastActivity));
  }

  async function route(request, response, url) {
    const user = getUser(request, env);
    // Without sign-in (local development) the single local user may do everything.
    const access = user.id === "local-user" ? { admin: true, owner: true, access: "ambos", areas: areasFor("ambos") } : await users.visit(user);
    const parts = url.pathname.replace(/^\/api\/studio\/?/, "").split("/").filter(Boolean);
    const method = request.method;

    if (method === "GET" && parts[0] === "config") {
      const defaults = deps.runtimeDefaults();
      return send(response, 200, {
        user: { name: user.name, email: user.email, admin: access.admin, areas: access.areas },
        areas: Object.fromEntries(Object.entries(AREAS).map(([k, a]) => [k, { label: a.label, logo: Boolean(assetsFor(request, env, k).logoUrl) }])),
        ai: ai.available(),
        dryRun: dryRun(),
        brand: BRAND,
        templates: Object.fromEntries(Object.entries(TEMPLATES).map(([k, t]) => [k, { label: t.label, active: t.active, required: t.required, addable: t.addable }])),
        modules: MODULES,
        guides: GUIDE_VERSIONS,
        pardot: { campaignId: defaults.campaignId, folderId: defaults.folderId },
        quickLinks: QUICK_LINKS.map((q) => ({ key: q.key, label: q.label, url: assetsFor(request, env).quickLinks[q.key] || "" })),
      });
    }

    if (parts[0] === "admin") {
      if (!access.admin) throw new HttpError("Solo los administradores pueden ver esto.", 403);
      if (parts[1] === "users" && !parts[2] && method === "GET") return send(response, 200, { users: await adminUsers() });
      if (parts[1] === "users" && /^[a-f0-9]{24}$/.test(parts[2] || "") && method === "PUT") {
        const body = await readJson(request);
        await users.update(parts[2], { access: body.access, admin: body.admin });
        return send(response, 200, { users: await adminUsers() });
      }
      throw new HttpError("Ruta no encontrada.", 404);
    }

    if (parts[0] === "drafts") {
      const id = parts[1];
      if (!id && method === "GET") return send(response, 200, { drafts: await store.listDrafts(user.id) });
      if (!id && method === "POST") {
        const body = await readJson(request);
        if (!TEMPLATES[body.template]?.active) throw new HttpError("Esta plantilla todavía no está disponible.");
        const language = LANGUAGES.includes(body.language) ? body.language : "es";
        const area = body.area === undefined ? access.areas[0] : String(body.area);
        if (!AREAS[area] || !access.areas.includes(area)) throw new HttpError("No tienes acceso a esta área. Pídeselo a un administrador.", 403);
        const draft = await store.createDraft(user.id, {
          template: body.template,
          area,
          language,
          name: String(body.name || TEMPLATES[body.template].label[language]).slice(0, 300),
          subject: "",
          preheader: "",
          brief: "",
          step: "start",
          modules: body.template === "invite" ? modulesForInvite(language) : [],
          pardot: pardotDefaults(area),
        });
        await users.count(user.id, "created");
        return send(response, 201, { draft });
      }
      if (id && !parts[2] && method === "GET") return send(response, 200, { draft: await store.getDraft(user.id, id) });
      if (id && !parts[2] && method === "PUT") {
        const body = await readJson(request);
        const current = await store.getDraft(user.id, id);
        const draft = await store.saveDraft(user.id, id, cleanDraftFields(body, current), body.version);
        return send(response, 200, { draft });
      }
      if (id && !parts[2] && method === "DELETE") {
        await store.deleteDraft(user.id, id);
        return send(response, 200, { ok: true });
      }
      if (id && parts[2] === "duplicate" && method === "POST") {
        const source = await store.getDraft(user.id, id);
        const copy = { ...source, name: `${source.name} (copia)`, publishedAt: null, pardotResult: null, modules: cleanModules(source.modules, source.language).map((m) => ({ ...m, id: newModuleId() })) };
        delete copy.id;
        await users.count(user.id, "created");
        return send(response, 201, { draft: await store.createDraft(user.id, copy) });
      }
      if (id && parts[2] === "translate" && method === "POST") {
        const source = await store.getDraft(user.id, id);
        const target = source.language === "es" ? "en" : "es";
        const texts = await ai.translate({ draft: source, target });
        const translated = applyTexts(source, texts);
        // Standard greeting and closing use the target language's fixed copy.
        translated.modules.forEach((m, i) => {
          const original = source.modules[i] || {};
          if (m.type === "greeting" && original.text === COPY[source.language].greeting) m.text = COPY[target].greeting;
          if (m.type === "signature" && original.closing === COPY[source.language].closing) m.closing = COPY[target].closing;
        });
        const fields = { ...translated, language: target, name: `${source.name} (${target.toUpperCase()})`, publishedAt: null, pardotResult: null, translatedFrom: source.id };
        delete fields.id;
        await users.count(user.id, "created");
        return send(response, 201, { draft: await store.createDraft(user.id, fields) });
      }
      if (id && parts[2] === "export" && method === "POST") {
        const draft = await store.getDraft(user.id, id);
        const rendered = renderEmail(draft, { assets: assetsFor(request, env, draft.area) });
        return send(response, 200, { ...rendered, validation: withTweakWarnings(validateDraft(draft), rendered.tweaks, draft.language) });
      }
      if (id && parts[2] === "publish" && method === "POST") {
        const body = await readJson(request);
        const draft = await store.getDraft(user.id, id);
        if (Number(body.version) !== draft.version) throw new HttpError("Hay cambios sin guardar en otra ventana. Recarga el borrador.", 409);
        const validation = validateDraft(draft);
        if (validation.errors.length) return send(response, 422, { error: "Revisa los puntos marcados antes de crear la plantilla.", validation });
        const key = `${draft.id}:${draft.version}`;
        if (published.has(key)) return send(response, 200, published.get(key));
        const rendered = renderEmail(draft, { assets: assetsFor(request, env, draft.area) });
        const input = deps.mergeDefaultInput({
          listEmailName: draft.name,
          subject: draft.subject,
          campaignId: draft.pardot?.campaignId,
          folderId: draft.pardot?.folderId,
        });
        const payload = deps.buildEmailTemplatePayload(input, rendered);
        let result;
        if (dryRun()) {
          result = { dryRun: true, message: "Modo simulación: no se ha creado nada en Pardot.", payload };
        } else {
          const created = await deps.createEmailTemplate(payload);
          result = { dryRun: false, message: "Plantilla creada en Pardot.", url: deps.templateUrl(created) };
        }
        let saved = await store.saveDraft(user.id, id, { publishedAt: new Date().toISOString(), pardotResult: { url: result.url || "", dryRun: result.dryRun } }, draft.version);
        if (body.learn === true) {
          await store.addExample(saved);
          result.learned = true;
        }
        await users.count(user.id, "published");
        result.draft = saved;
        published.set(key, result);
        return send(response, 200, result);
      }
    }

    if (method === "POST" && parts[0] === "preview") {
      const body = await readJson(request);
      const draft = {
        template: TEMPLATES[body.template] ? body.template : "invite",
        language: LANGUAGES.includes(body.language) ? body.language : "es",
        subject: String(body.subject || ""),
        preheader: String(body.preheader || ""),
        hideLogo: body.hideLogo === true,
        quickLinks: cleanQuickLinks(body.quickLinks),
        modules: cleanModules(body.modules, body.language),
        tweaks: cleanTweaks(body.tweaks),
      };
      const rendered = renderEmail(draft, { assets: assetsFor(request, env, areaOf(body.area)), preview: true });
      return send(response, 200, { ...rendered, validation: withTweakWarnings(validateDraft(draft), rendered.tweaks, draft.language) });
    }

    if (method === "POST" && parts[0] === "capture") {
      const body = await readJson(request);
      const language = LANGUAGES.includes(body.language) ? body.language : "es";
      const result = await captureEvent(body.url, { parseStructured: deps.parseLanding, ai: body.quick ? null : ai, language, fetchImpl: deps.fetchImpl });
      result.meta = [result.venue, formatDate(result.date, language, { weekday: true, year: false }), formatTime(result.startTime, language)].filter(Boolean).join(" · ");
      return send(response, 200, { capture: result, modules: body.modules === false ? undefined : modulesForInvite(language, result) });
    }

    if (method === "POST" && parts[0] === "images") {
      const type = String(request.headers["content-type"] || "").split(";")[0].trim().toLowerCase();
      if (!IMAGE_TYPES[type]) throw new HttpError("Sube una imagen PNG, JPG, GIF o WebP.");
      const bytes = await readBody(request, 5 * 1024 * 1024);
      if (!bytes.length) throw new HttpError("La imagen está vacía.");
      const rawName = decodeURIComponent(String(request.headers["x-file-name"] || "imagen")).replace(/[^\w.-]+/g, "-").slice(0, 80);
      const name = `${rawName.replace(/\.[a-z0-9]+$/i, "")}-${Date.now()}.${IMAGE_TYPES[type]}`;
      if (!dryRun()) {
        return send(response, 201, { url: await uploadToPardot(deps, { bytes, type, name }), stored: "pardot" });
      }
      const file = `${randomUUID()}.${IMAGE_TYPES[type]}`;
      await mkdir(path.join(dataDir, "uploads"), { recursive: true });
      await writeFile(path.join(dataDir, "uploads", file), bytes);
      return send(response, 201, { url: `${publicBase(request, env)}/studio-uploads/${file}`, stored: "local", notice: "Modo simulación: la imagen se guarda en esta app. En modo real se sube a Pardot." });
    }

    if (method === "POST" && parts[0] === "ai") {
      const body = await readJson(request);
      const language = LANGUAGES.includes(body.language) ? body.language : "es";
      const draftLike = { template: body.template || "invite", language };
      switch (parts[1]) {
        case "compose":
          return send(response, 200, await ai.writeInvitation({ language, facts: body.facts || {}, notes: String(body.notes || "").slice(0, 20000), examples: await examplesFor(draftLike) }));
        case "rewrite":
          return send(response, 200, { text: await ai.rewrite({ language, action: body.action, text: String(body.text || "").slice(0, 20000), context: body.context || "", examples: await examplesFor(draftLike) }) });
        case "chat": {
          const messages = (Array.isArray(body.messages) ? body.messages : []).slice(-12)
            .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim())
            .map((m) => ({ role: m.role, content: m.content.slice(0, 4000) }));
          if (messages.at(-1)?.role !== "user") throw new HttpError("Escribe primero qué quieres que haga la IA.");
          const draft = { subject: String(body.subject || "").slice(0, 300), modules: cleanModules(body.modules, language) };
          const facts = body.facts && typeof body.facts === "object" && JSON.stringify(body.facts).length <= 4000 ? body.facts : {};
          const context = { facts, texts: collectTexts(draft) };
          return send(response, 200, await ai.chatField({
            language,
            field: String(body.field || "Texto").slice(0, 200),
            multiline: body.multiline === true,
            text: String(body.text || "").slice(0, 20000),
            messages,
            context,
            examples: await examplesFor(draftLike),
          }));
        }
        case "tweak": {
          const instruction = String(body.instruction || "").trim().slice(0, 1000);
          if (!instruction) throw new HttpError("Escribe o dicta primero el ajuste que quieres.");
          const draft = { template: draftLike.template, language, hideLogo: body.hideLogo === true, quickLinks: cleanQuickLinks(body.quickLinks), modules: cleanModules(body.modules, language), tweaks: cleanTweaks(body.tweaks) };
          const { parts } = renderParts(draft, { assets: assetsFor(request, env, areaOf(body.area)) });
          const { reply, ops } = await ai.tweakHtml({ language, instruction, parts });
          const byScope = new Map(parts.map((p) => [p.scope, p.html]));
          // Keep only edits that match the current HTML exactly and stay safe;
          // they are applied in order, so each one sees the previous ones.
          const valid = [];
          for (const op of Array.isArray(ops) ? ops.slice(0, 20) : []) {
            const html = byScope.get(op?.scope);
            if (typeof html !== "string" || typeof op.find !== "string" || !op.find || typeof op.replace !== "string") continue;
            if (!html.includes(op.find) || !isSafeTweakHtml(op.replace)) continue;
            byScope.set(op.scope, html.replace(op.find, () => op.replace));
            valid.push({ scope: op.scope, find: op.find, replace: op.replace });
          }
          if (!valid.length) return send(response, 200, { reply: reply || "No he sabido aplicar ese ajuste. Prueba a decir en qué parte del email está.", tweak: null });
          const [tweak] = cleanTweaks([{ instruction, ops: valid }]);
          return send(response, 200, { reply: reply || "Ajuste aplicado.", tweak });
        }
        case "agenda":
          return send(response, 200, { items: await ai.structureAgenda({ language, text: String(body.text || "").slice(0, 10000) }) });
        case "subjects":
          return send(response, 200, await ai.suggestSubjects({ language, draft: { ...draftLike, modules: cleanModules(body.modules, language) }, examples: await examplesFor(draftLike) }));
        case "review": {
          const draft = { ...draftLike, subject: String(body.subject || ""), preheader: String(body.preheader || ""), modules: cleanModules(body.modules, language) };
          return send(response, 200, { issues: await ai.reviewStyle({ draft }), texts: collectTexts(draft) });
        }
        case "plan":
          return send(response, 200, { modules: await ai.planLayout({ language, description: String(body.description || "").slice(0, 10000), examples: await examplesFor({ template: "paint", language }) }) });
        case "custom": {
          const raw = await ai.buildCustomModule({ language, purpose: String(body.purpose || ""), answer: String(body.answer || "").slice(0, 10000) });
          const checked = sanitizeCustomHtml(raw, { report: true });
          return send(response, 200, { html: checked.html, problems: checked.problems });
        }
        default:
          throw new HttpError("Acción no disponible.", 404);
      }
    }

    throw new HttpError("Ruta no encontrada.", 404);
  }

  return {
    store,
    async handle(request, response) {
      const url = new URL(request.url, "http://localhost");
      try {
        await route(request, response, url);
      } catch (error) {
        const status = Number.isInteger(error.status) && error.status >= 400 && error.status < 600 ? error.status : 500;
        if (status >= 500 && !(error.status)) console.error(error);
        send(response, status, { error: status === 500 && !error.status ? "Error interno." : error.message, current: error.current ? { version: error.current.version } : undefined });
      }
    },
    async serveUpload(request, response, url) {
      const file = url.pathname.replace(/^\/studio-uploads\//, "");
      if (!/^[a-f0-9-]{36}\.(png|jpg|gif|webp)$/.test(file)) {
        response.writeHead(404);
        return response.end();
      }
      try {
        const bytes = await readFile(path.join(dataDir, "uploads", file));
        const ext = file.split(".").pop();
        response.writeHead(200, { "Content-Type": ext === "jpg" ? "image/jpeg" : `image/${ext}`, "Cache-Control": "public, max-age=31536000" });
        response.end(bytes);
      } catch {
        response.writeHead(404);
        response.end();
      }
    },
  };
}

export { ownerKey };
