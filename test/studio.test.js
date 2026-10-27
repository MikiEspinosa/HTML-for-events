import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { parseIeseLandingHtml } from "../server.js";
import { applyTexts, collectTexts, parseJsonReply } from "../studio/ai.js";
import { BRAND, cleanTweaks, renderEmail, sanitizeCustomHtml, validateDraft, withTweakWarnings } from "../studio/brand.js";
import { captureEvent, checkCaptureUrl, fetchPage } from "../studio/capture.js";
import { formatDate, formatDateRange, formatTime, formatTimeRange } from "../studio/format.js";
import { createStudioHandler, getUser, modulesForInvite, pardotFileBody } from "../studio/routes.js";
import { createStore } from "../studio/store.js";

const fixture = await readFile(new URL("./fixtures/reunion.html", import.meta.url), "utf8");

test("dates and times follow the IESE style guides", () => {
  assert.equal(formatDate("2026-10-08", "es"), "8 de octubre del 2026");
  assert.equal(formatDate("2026-10-08", "es", { weekday: true, year: false }), "jueves, 8 de octubre");
  assert.equal(formatDate("2026-10-08", "en"), "Oct. 8, 2026");
  assert.equal(formatDate("2026-06-07", "en", { year: false }), "June 7");
  assert.equal(formatTime("17:30", "es"), "17:30 h");
  assert.equal(formatTime("17:30", "en"), "5:30 pm");
  assert.equal(formatTime("20:00", "en"), "8 pm");
  assert.equal(formatTimeRange("19:00", "21:30", "es"), "De 19:00 a 21:30 h");
  assert.equal(formatDateRange("2027-05-28", "2027-05-29", "es"), "Del 28 al 29 de mayo del 2027");
  assert.equal(formatDateRange("2027-05-28", "2027-05-29", "en"), "May 28–29, 2027");
});

function sampleDraft(language = "es") {
  return {
    template: "invite",
    language,
    subject: "Vuelve al campus",
    preheader: "Te esperamos",
    modules: [
      { id: "mhero00001", type: "hero", imageUrl: "https://example.com/a.jpg", imageAlt: "Campus", title: "MBA Networking <Madrid>", subtitle: "8 de octubre", ctaLabel: "Inscríbete", ctaUrl: "https://apply.iese.edu/x/" },
      { id: "mhead00001", type: "heading", text: "Un reencuentro" },
      { id: "mtext00001", type: "text", body: "Hola **a todos**.\n\n- Uno\n- Dos" },
      { id: "mevent0001", type: "event", date: "2026-10-08", startTime: "19:30", endTime: "", venue: "Campus de Madrid", address: "" },
      { id: "mcta000001", type: "cta", label: "Inscríbete", url: "https://apply.iese.edu/x/" },
    ],
  };
}

test("rendered emails use the brand red, the Alumni logo and the fixed parts", () => {
  const { html, text } = renderEmail(sampleDraft(), { assets: { logoUrl: "https://app.example/brand/iese-alumni.png", footerLogoUrl: "https://x/iese.png", icons: { app: "https://x/1.png", email: "https://x/2.png", search: "https://x/3.png", web: "https://x/4.png" }, quickLinks: {} } });
  assert.match(html, /#FF2800/);
  assert.doesNotMatch(html, /#ff0000|#e30613/i);
  assert.match(html, /iese-alumni\.png/);
  assert.match(html, /v:fill type="frame"/);
  assert.match(html, /MBA Networking &lt;Madrid&gt;/);
  assert.match(html, /<strong>a todos<\/strong>/);
  assert.match(html, /<ul/);
  assert.match(html, /gdpr@iese.edu/);
  assert.doesNotMatch(html, /A Way to|A Mark|A World/, "the footer keeps only the logo on the red band");
  assert.match(html, /background:rgba\(0,0,0,0\.45\)/, "the text over the image sits on a translucent box");
  assert.match(html, /<td bgcolor="#000000" style="background:#000000;padding:6px 12px;[^>]*>8 de octubre</, "the highlighted text over the header sits on black");
  assert.equal((html.match(/x\/[1-4]\.png/g) || []).length, 4);
  assert.doesNotMatch(html, /data-module-id/);
  assert.match(html, /8 de octubre del 2026/);
  assert.match(text, /Fecha: jueves, 8 de octubre del 2026/);
  assert.match(renderEmail(sampleDraft(), { preview: true }).html, /data-module-id="mhero00001"/);
  const noLogo = renderEmail({ ...sampleDraft(), hideLogo: true }, { assets: { logoUrl: "https://app.example/brand/iese-alumni.png", footerLogoUrl: "https://x/iese.png", icons: {}, quickLinks: {} } }).html;
  assert.doesNotMatch(noLogo, /iese-alumni\.png/, "the Alumni logo at the top can be removed");
});

test("images uploaded in simulation mode show in the preview and only warn", () => {
  const draft = sampleDraft();
  const local = "http://localhost:4174/studio-uploads/0f8b6c2e-1d2a-4c3b-9e8f-123456789abc.png";
  draft.modules[0].imageUrl = local;
  assert.match(renderEmail(draft, { preview: true }).html, /studio-uploads\/0f8b6c2e/);
  const { errors, warnings } = validateDraft(draft);
  assert.deepEqual(errors, []);
  assert.ok(warnings.some((w) => /simulación/.test(w)));
  draft.modules[0].imageUrl = "http://localhost:4174/otra/foto.png";
  assert.doesNotMatch(renderEmail(draft, { preview: true }).html, /otra\/foto/);
  assert.ok(validateDraft(draft).errors.some((e) => /https/.test(e)));
});

test("custom modules are kept inside the brand framework", () => {
  const { html, problems } = sanitizeCustomHtml('<div onclick="x()" style="color:#123456;font-size:15px;font-family:Comic Sans"><script>alert(1)</script><p style="color:#FF2800">Hola</p><a href="javascript:alert(1)">mal</a><img src="https://example.com/x.png" alt="x"><iframe src="https://x"></iframe></div>', { report: true });
  assert.doesNotMatch(html, /script|onclick|iframe|#123456|Comic|javascript/i);
  assert.match(html, /color:#FF2800/);
  assert.match(html, /font-family:Arial/);
  assert.match(html, /<img src="https:\/\/example.com\/x.png"/);
  assert.ok(problems.length >= 3);
});

test("validation blocks missing required data and bad links", () => {
  const draft = sampleDraft();
  draft.subject = "";
  draft.modules[4].url = "http://inseguro.com";
  draft.modules = draft.modules.filter((m) => m.type !== "heading");
  const { errors } = validateDraft(draft);
  assert.ok(errors.some((e) => /asunto/.test(e)));
  assert.ok(errors.some((e) => /https/.test(e)));
  assert.ok(errors.some((e) => /Título/.test(e)));
  const { targets } = validateDraft(draft);
  assert.equal(targets.errors.length, errors.length, "every message says where to fix it");
  assert.deepEqual(targets.errors[errors.findIndex((e) => /asunto/.test(e))], { field: "subject" });
  assert.deepEqual(targets.errors[errors.findIndex((e) => /https/.test(e))], { moduleId: "mcta000001", field: "url" });
  assert.deepEqual(targets.errors[errors.findIndex((e) => /Título/.test(e))], { addModule: "heading" });
  assert.deepEqual(validateDraft(sampleDraft()).errors, []);
  const early = sampleDraft();
  early.modules[3].endDate = "2026-10-01";
  assert.deepEqual(validateDraft(early).errors, [], "a wrong end date only warns");
  assert.ok(validateDraft(early).warnings.some((w) => /fecha de fin/.test(w)));
  assert.match(renderEmail(early).html, /jueves, 8 de octubre del 2026/, "an end date before the start is ignored");
});

test("collectTexts and applyTexts round-trip editorial text", () => {
  const draft = sampleDraft();
  draft.modules.push({ id: "magenda001", type: "agenda", title: "Agenda", items: [{ time: "19:30", text: "Bienvenida" }] });
  const texts = collectTexts(draft);
  assert.equal(texts["mhead00001.text"], "Un reencuentro");
  assert.equal(texts["magenda001.items.0.text"], "Bienvenida");
  assert.equal(texts["mhero00001.ctaUrl"], undefined);
  const next = applyTexts(draft, { ...texts, "mhead00001.text": "A reunion", "magenda001.items.0.text": "Welcome" });
  assert.equal(next.modules[1].text, "A reunion");
  assert.equal(next.modules.at(-1).items[0].text, "Welcome");
  assert.equal(draft.modules[1].text, "Un reencuentro");
  assert.deepEqual(parseJsonReply('```json\n{"a":1}\n```'), { a: 1 });
});

test("capture reads the whole public page and only from allowed hosts", async () => {
  assert.throws(() => checkCaptureUrl("https://evil.example.com/x"), /apply.iese.edu/);
  const fetchImpl = async () => new Response(fixture, { headers: { "content-type": "text/html" } });
  const plain = await captureEvent("https://apply.iese.edu/reunion/", { parseStructured: parseIeseLandingHtml, ai: null, language: "en", fetchImpl });
  assert.equal(plain.title, "MBA Reunion Barcelona 2027");
  assert.equal(plain.date, "2027-05-28");
  assert.equal(plain.startTime, "17:00");
  assert.match(plain.body, /honoring the MBA classes/);
  assert.match(plain.imageUrl, /^https:\/\/storage.googleapis.com/);

  let seen;
  const ai = { available: () => true, extractEvent: async (input) => { seen = input; return { endDate: "2027-05-29", price: "60 €", agenda: [{ time: "17:00", text: "Welcome" }], speakers: [{ name: "Ana Pérez", role: "Speaker" }], date: "2099-01-01" }; } };
  const rich = await captureEvent("https://apply.iese.edu/reunion/", { parseStructured: parseIeseLandingHtml, ai, language: "en", fetchImpl });
  assert.match(seen.pageText, /Partners are warmly invited/);
  assert.equal(rich.date, "2027-05-28", "structured date wins");
  assert.equal(rich.endDate, "2027-05-29");
  assert.equal(rich.agenda[0].text, "Welcome");
  assert.ok(rich.found.includes("precio"));
  const modules = modulesForInvite("en", rich);
  assert.deepEqual(modules.map((m) => m.type), ["hero", "heading", "greeting", "text", "event", "agenda", "speakers", "cta", "signature"]);
  assert.equal(modules[0].ctaUrl, "https://apply.iese.edu/reunion/");
});

test("drafts belong to their author and stale saves are rejected", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "studio-"));
  try {
    const store = createStore(dir);
    const draft = await store.createDraft("ana@iese.edu", { name: "A", modules: [] });
    await assert.rejects(store.getDraft("luis@iese.edu", draft.id), { status: 404 });
    const saved = await store.saveDraft("ana@iese.edu", draft.id, { name: "B" }, 1);
    assert.equal(saved.version, 2);
    await assert.rejects(store.saveDraft("ana@iese.edu", draft.id, { name: "C" }, 1), { status: 409 });
    await store.createDraft("ana@iese.edu", { name: "Otro", modules: [] });
    assert.equal((await store.listDrafts("ana@iese.edu")).length, 2);
    assert.equal((await store.listDrafts("luis@iese.edu")).length, 0);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("users come from Azure sign-in headers and login can be required", () => {
  const principal = Buffer.from(JSON.stringify({ claims: [{ typ: "name", val: "Ana Pérez" }] })).toString("base64");
  const user = getUser({ headers: { "x-ms-client-principal": principal, "x-ms-client-principal-name": "ana@iese.edu", "x-ms-client-principal-id": "123" } }, {});
  assert.deepEqual(user, { id: "123", email: "ana@iese.edu", name: "Ana Pérez" });
  assert.throws(() => getUser({ headers: {} }, { STUDIO_REQUIRE_LOGIN: "true" }), { status: 401 });
  assert.equal(getUser({ headers: {} }, {}).id, "local-user");
});

async function startStudio(t, overrides = {}) {
  const dir = await mkdtemp(path.join(os.tmpdir(), "studio-api-"));
  const calls = [];
  const ai = {
    available: () => true,
    translate: async ({ draft }) => Object.fromEntries(Object.entries(collectTexts(draft)).map(([k, v]) => [k, `EN ${v}`])),
    ...overrides.ai,
  };
  const studio = createStudioHandler({
    rootDir: dir,
    ai,
    isDryRun: () => true,
    runtimeDefaults: () => ({ campaignId: "11", folderId: "22" }),
    mergeDefaultInput: (input) => ({ trackerDomainId: "1", senderName: "IESE", senderEmail: "a@iese.edu", ...input }),
    buildEmailTemplatePayload: (input, rendered) => { calls.push(input); return { name: input.listEmailName, subject: input.subject, htmlMessage: rendered.html }; },
    parseLanding: parseIeseLandingHtml,
  }, { STUDIO_DATA_DIR: dir, PUBLIC_BASE_URL: "https://studio.example", ...overrides.env });
  const server = http.createServer((req, res) => studio.handle(req, res));
  await new Promise((resolve) => server.listen(0, resolve));
  t.after(async () => { server.close(); await rm(dir, { recursive: true, force: true }); });
  const base = `http://127.0.0.1:${server.address().port}/api/studio/`;
  const call = async (p, method = "GET", body, headers = {}) => {
    const r = await fetch(base + p, { method, headers: { "content-type": "application/json", ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: r.status, body: await r.json() };
  };
  return { call, dir, calls };
}

test("the API creates, saves, translates and publishes a draft", async (t) => {
  const { call, dir, calls } = await startStudio(t);
  const config = await call("config");
  assert.equal(config.body.templates.calendar.active, false);
  assert.ok(config.body.templates.invite.addable.includes("custom"), "custom modules can be added to an invitation");
  assert.equal(config.body.brand.red, BRAND.red);

  assert.equal((await call("drafts", "POST", { template: "newsletter" })).status, 400);
  const created = await call("drafts", "POST", { template: "invite", language: "es" });
  assert.equal(created.status, 201);
  const draft = created.body.draft;
  assert.equal(draft.pardot.campaignId, "11");
  assert.deepEqual(draft.modules.map((m) => m.type), ["hero", "heading", "greeting", "text", "event", "cta", "signature"]);

  const filled = [...sampleDraft().modules, { id: "g1", type: "greeting", text: "Hola, {{Recipient.FirstName}}:" }];
  const saved = await call(`drafts/${draft.id}`, "PUT", { version: draft.version, subject: "Vuelve", preheader: "Te esperamos", modules: [...filled, { id: "x", type: "evil", html: "<script>" }] });
  assert.equal(saved.status, 200);
  assert.equal(saved.body.draft.modules.length, filled.length, "unknown modules are dropped");
  const hidden = await call(`drafts/${draft.id}`, "PUT", { version: saved.body.draft.version, hideLogo: true });
  assert.equal(hidden.body.draft.hideLogo, true);
  saved.body.draft.version = hidden.body.draft.version;
  assert.equal((await call(`drafts/${draft.id}`, "PUT", { version: 1, subject: "viejo" })).status, 409);

  const other = await call(`drafts/${draft.id}`, "GET", undefined, { "x-ms-client-principal-name": "otra@iese.edu" });
  assert.equal(other.status, 404);

  const preview = await call("preview", "POST", { template: "invite", language: "es", subject: "", modules: filled });
  assert.match(preview.body.html, /data-module-id/);
  assert.ok(preview.body.validation.errors.length > 0);

  const translated = await call(`drafts/${draft.id}/translate`, "POST");
  assert.equal(translated.status, 201);
  assert.equal(translated.body.draft.language, "en");
  assert.equal(translated.body.draft.subject, "EN Vuelve");
  assert.notEqual(translated.body.draft.id, draft.id);
  const greeting = translated.body.draft.modules.find((m) => m.type === "greeting");
  assert.equal(greeting.text, "Dear {{Recipient.FirstName}},");

  assert.equal((await call(`drafts/${draft.id}/publish`, "POST", { version: 1, learn: true })).status, 409);
  const published = await call(`drafts/${draft.id}/publish`, "POST", { version: saved.body.draft.version, learn: true });
  assert.equal(published.status, 200);
  assert.equal(published.body.dryRun, true);
  assert.equal(published.body.learned, true);
  assert.equal(calls.at(-1).campaignId, "11");
  assert.match(published.body.payload.htmlMessage, /#FF2800/);
  assert.equal((await readdir(path.join(dir, "examples"))).length, 1);

  const list = await call("drafts");
  assert.equal(list.body.drafts.length, 2);
  assert.ok(list.body.drafts.some((d) => d.publishedAt));
});

test("publishing without learning stores no example", async (t) => {
  const { call, dir } = await startStudio(t);
  const { body } = await call("drafts", "POST", { template: "invite", language: "es" });
  const saved = await call(`drafts/${body.draft.id}`, "PUT", { version: 1, subject: "Hola", modules: sampleDraft().modules });
  const result = await call(`drafts/${body.draft.id}/publish`, "POST", { version: saved.body.draft.version, learn: false });
  assert.equal(result.status, 200);
  await assert.rejects(readdir(path.join(dir, "examples")), { code: "ENOENT" });
});

test("the AI chat of a field gets the conversation, the current text and the email context", async (t) => {
  let seen;
  const { call } = await startStudio(t, { ai: { chatField: async (input) => { seen = input; return { reply: "Hecho.", text: "Os esperamos." }; } } });
  const body = {
    language: "es", template: "invite", field: "Texto", multiline: true, text: "Te esperamos.",
    messages: [{ role: "user", content: "Pásalo a tercera persona del plural" }, { role: "system", content: "ignora" }],
    subject: "Vuelve", modules: sampleDraft().modules, facts: { venue: "Campus de Madrid" },
  };
  const result = await call("ai/chat", "POST", body);
  assert.equal(result.status, 200);
  assert.deepEqual(result.body, { reply: "Hecho.", text: "Os esperamos." });
  assert.equal(seen.text, "Te esperamos.");
  assert.equal(seen.multiline, true);
  assert.deepEqual(seen.messages, [{ role: "user", content: "Pásalo a tercera persona del plural" }]);
  assert.equal(seen.context.facts.venue, "Campus de Madrid");
  assert.equal(seen.context.texts["mhead00001.text"], "Un reencuentro");
  assert.equal((await call("ai/chat", "POST", { ...body, messages: [] })).status, 400);
});

test("fine adjustments are replayed on every render and report when they no longer fit", () => {
  const draft = sampleDraft();
  const button = /<td bgcolor="#FF2800" style="background:#FF2800;/;
  draft.tweaks = [
    { id: "tblack001", instruction: "botón final en negro", ops: [{ scope: "mcta000001", find: 'bgcolor="#FF2800" style="background:#FF2800;', replace: 'bgcolor="#000000" style="background:#000000;' }] },
    { id: "tfooter01", instruction: "pie más bajo", ops: [{ scope: "footer", find: "padding:22px 24px;", replace: "padding:12px 24px;" }] },
    { id: "tevil0001", instruction: "malo", ops: [{ scope: "mtext00001", find: "Hola", replace: '<img src=x onerror="alert(1)">' }] },
  ];
  const preview = renderEmail(draft, { preview: true });
  assert.match(preview.html, /data-module-id="mcta000001" data-module-type="cta"><td[^>]*><table[^>]*><tr><td bgcolor="#000000"/);
  assert.match(preview.html, /padding:12px 24px;/);
  assert.doesNotMatch(preview.html, /onerror/);
  assert.equal(cleanTweaks(draft.tweaks).length, 2, "unsafe adjustments are dropped");
  assert.match(renderEmail(sampleDraft()).html, button, "without adjustments the button stays red");

  draft.tweaks.push({ id: "ttitle001", instruction: "título más grande", ops: [{ scope: "mhead00001", find: "font-size:26px", replace: "font-size:30px" }] });
  assert.match(renderEmail(draft).html, /font-size:30px;line-height:1.25/);
  draft.tweaks[3].ops[0].find = "font-size:99px";
  const missed = renderEmail(draft);
  const validation = withTweakWarnings(validateDraft(draft), missed.tweaks);
  assert.ok(validation.warnings.some((w) => /título más grande/.test(w)));
  assert.deepEqual(validation.targets.warnings.at(-1), { tweak: "ttitle001" });
});

test("the fine adjustment API keeps only exact and safe edits", async (t) => {
  let parts;
  const { call } = await startStudio(t, { ai: { tweakHtml: async (input) => {
    parts = input.parts;
    return { reply: "Botón en negro.", ops: [
      { scope: "mcta000001", find: 'bgcolor="#FF2800" style="background:#FF2800;', replace: 'bgcolor="#000000" style="background:#000000;' },
      { scope: "mcta000001", find: "no existe", replace: "x" },
      { scope: "footer", find: "padding:22px 24px;", replace: '<script>alert(1)</script>' },
    ] };
  } } });
  const result = await call("ai/tweak", "POST", { language: "es", template: "invite", instruction: "botón en negro", modules: sampleDraft().modules });
  assert.equal(result.status, 200);
  assert.ok(parts.some((p) => p.scope === "footer") && parts.some((p) => p.scope === "mcta000001"));
  assert.ok(parts.every((p) => !/data-module-id/.test(p.html)));
  assert.equal(result.body.tweak.ops.length, 1);
  assert.equal(result.body.tweak.instruction, "botón en negro");
  assert.equal((await call("ai/tweak", "POST", { language: "es", instruction: "" })).status, 400);
});

test("image uploads to Pardot explain rejections and recover a missing URL", async (t) => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "studio-upload-"));
  const realFetch = globalThis.fetch;
  const previousUnit = process.env.PARDOT_BUSINESS_UNIT_ID;
  process.env.PARDOT_BUSINESS_UNIT_ID = "0Uv000000000001";
  const pardot = [];
  let mode = "reject";
  globalThis.fetch = async (url, init = {}) => {
    const u = String(url);
    if (!u.startsWith("https://pi.pardot.com/")) return realFetch(url, init);
    pardot.push({ url: u, method: init.method || "GET" });
    if (mode === "reject") return new Response(JSON.stringify({ code: 66, message: "Invalid value for folderId" }), { status: 400 });
    if (init.method === "POST") return new Response(JSON.stringify({ id: 42, name: "foto.png" }), { status: 201 });
    return new Response(JSON.stringify({ id: 42, name: "foto.png", url: "https://go.iese.edu/l/1/foto.png" }), { status: 200 });
  };
  const studio = createStudioHandler({ rootDir: dir, ai: { available: () => false }, isDryRun: () => false, runtimeDefaults: () => ({}), getAccessToken: async () => "token" }, { STUDIO_DATA_DIR: dir });
  const server = http.createServer((req, res) => studio.handle(req, res));
  await new Promise((resolve) => server.listen(0, resolve));
  t.after(async () => {
    globalThis.fetch = realFetch;
    if (previousUnit === undefined) delete process.env.PARDOT_BUSINESS_UNIT_ID; else process.env.PARDOT_BUSINESS_UNIT_ID = previousUnit;
    server.close();
    await rm(dir, { recursive: true, force: true });
  });
  const upload = () => realFetch(`http://127.0.0.1:${server.address().port}/api/studio/images`, { method: "POST", headers: { "content-type": "image/png", "x-file-name": "foto.png" }, body: new Uint8Array([137, 80, 78, 71]) }).then(async (r) => ({ status: r.status, body: await r.json() }));

  const rejected = await upload();
  assert.equal(rejected.status, 502);
  assert.match(rejected.body.error, /Invalid value for folderId/, "Pardot's own reason reaches the user");

  mode = "accept";
  const accepted = await upload();
  assert.equal(accepted.status, 201);
  assert.equal(accepted.body.url, "https://go.iese.edu/l/1/foto.png");
  assert.match(pardot.at(-1).url, /\/api\/v5\/objects\/files\/42\?fields=id%2Cname%2Curl/);
});

test("the Pardot file body sends input as a JSON field and the image as the file", async () => {
  const { body, contentType } = pardotFileBody({ name: "foto.png" }, { bytes: new Uint8Array([137, 80, 78, 71]), type: "image/png", name: "foto.png" });
  const boundary = contentType.match(/boundary=(.+)$/)[1];
  const form = await new Response(body, { headers: { "content-type": contentType } }).formData();
  assert.equal(typeof form.get("input"), "string", "input is a plain field, not a file");
  assert.deepEqual(JSON.parse(form.get("input")), { name: "foto.png" });
  assert.equal(form.get("file").name, "foto.png");
  assert.equal(form.get("file").type, "image/png");
  assert.deepEqual([...new Uint8Array(await form.get("file").arrayBuffer())], [137, 80, 78, 71]);
  const text = body.toString("latin1");
  assert.match(text, new RegExp(`--${boundary}\r\nContent-Disposition: form-data; name="input"\r\nContent-Type: application/json\r\n\r\n`));
  assert.doesNotMatch(text, /filename="blob"/);
});

test("custom modules keep images uploaded in simulation mode and drop other http images", () => {
  const local = "http://localhost:4174/studio-uploads/0f8b6c2e-1d2a-4c3b-9e8f-123456789abc.png";
  const html = sanitizeCustomHtml(`<td><img src="${local}" alt="x"><img src="http://otro.example/x.png" alt="y"></td>`);
  assert.match(html, /studio-uploads\/0f8b6c2e/);
  assert.doesNotMatch(html, /otro\.example/);
});

test("each draft can point the quick link icons elsewhere", async (t) => {
  const assets = { logoUrl: "https://x/logo.png", footerLogoUrl: "https://x/iese.png", icons: { app: "https://x/1.png", email: "https://x/2.png", search: "https://x/3.png", web: "https://x/4.png" }, quickLinks: { app: "https://default.example/app", email: "", search: "", web: "https://default.example/web" } };
  const draft = { ...sampleDraft(), quickLinks: { web: "https://www.iese.edu/alumni/eventos/", email: "mailto:alumni@iese.edu" } };
  const { html } = renderEmail(draft, { assets });
  assert.match(html, /href="https:\/\/default\.example\/app"/, "links not edited keep the default");
  assert.match(html, /href="https:\/\/www\.iese\.edu\/alumni\/eventos\/"/);
  assert.match(html, /href="mailto:alumni@iese\.edu"/);
  assert.doesNotMatch(html, /default\.example\/web/);
  assert.match(renderEmail(draft, { assets, preview: true }).html, /data-module-id="quicklinks"/);

  const bad = validateDraft({ ...sampleDraft(), quickLinks: { app: "http://inseguro.example" } });
  assert.deepEqual(bad.targets.errors[bad.errors.findIndex((e) => /Accesos rápidos/.test(e))], { moduleId: "quicklinks", field: "app" });

  const { call } = await startStudio(t);
  const config = await call("config");
  assert.deepEqual(config.body.quickLinks.map((q) => q.key), ["app", "email", "search", "web"]);
  const created = (await call("drafts", "POST", { template: "invite", language: "es" })).body.draft;
  const saved = await call(`drafts/${created.id}`, "PUT", { version: created.version, quickLinks: { web: " https://www.iese.edu/ ", evil: "x", app: "" } });
  assert.deepEqual(saved.body.draft.quickLinks, { web: "https://www.iese.edu/" });
});

test("the Alumni logo and the quick link icons come from Pardot by default", () => {
  const { html } = renderEmail(sampleDraft());
  for (const icon of ["5shjm1/501101/1793025772RaZgqVTL/app.png", "5shjm7/501101/1793025787KSJ5ZQ5I/email.png", "5shjmb/501101/1793025789No4a54u0/search.png", "5shjmf/501101/1793025791kMZmhEDA/web.png"]) {
    assert.ok(html.includes(`<img src="https://prdt.iese.edu/l/501101/2026-10-26/${icon}" width="48" height="48"`), icon);
  }
  assert.doesNotMatch(html, /\/brand\/icons\//);
  assert.match(html, /<img src="https:\/\/prdt\.iese\.edu\/l\/501101\/2026-10-26\/5shjlt\/501101\/1793025549md7npHks\/iese_alumni\.png" width="220" alt="IESE Alumni"/);
});

test("images the user edits can link somewhere when clicked", () => {
  const draft = sampleDraft();
  draft.modules[0].imageLink = "https://www.iese.edu/alumni/";
  draft.modules.push({ id: "mspeak0001", type: "speakers", title: "Ponentes", items: [{ name: "Ana Pérez", role: "Profesora", imageUrl: "https://example.com/ana.jpg", link: "https://www.iese.edu/faculty/ana/" }] });
  draft.modules.push({ id: "mimage0001", type: "image", imageUrl: "https://example.com/foto.jpg", imageAlt: "Foto", url: "https://www.iese.edu/evento/" });
  const { html } = renderEmail(draft);
  assert.match(html, /<a href="https:\/\/www\.iese\.edu\/alumni\/" style="display:block;[^"]*">[\s\S]*MBA Networking/, "header texts and image area link to the image link");
  assert.equal((html.match(/<a [^>]*>(?:(?!<\/a>)[\s\S])*<a /g) || []).length, 0, "links are never nested");
  assert.match(html, /<a href="https:\/\/apply\.iese\.edu\/x\/" style="display:inline-block/, "the header button keeps its own link");
  assert.match(html, /<a href="https:\/\/www\.iese\.edu\/faculty\/ana\/"><img src="https:\/\/example\.com\/ana\.jpg"/);
  assert.match(html, /<a href="https:\/\/www\.iese\.edu\/evento\/"><img src="https:\/\/example\.com\/foto\.jpg"/);

  const noButton = sampleDraft();
  Object.assign(noButton.modules[0], { imageLink: "https://www.iese.edu/alumni/", ctaLabel: "" });
  assert.match(renderEmail(noButton).html, /min-height:256px;/, "without a button the whole image is clickable");

  draft.modules[0].imageLink = "http://inseguro.example";
  draft.modules.at(-2).items[0].link = "javascript:alert(1)";
  const { errors, targets } = validateDraft(draft);
  assert.deepEqual(targets.errors[errors.findIndex((e) => /enlace de la imagen/.test(e))], { moduleId: "mhero00001", field: "imageLink" });
  assert.deepEqual(targets.errors[errors.findIndex((e) => /enlace de una foto/.test(e))], { moduleId: "mspeak0001", field: "items.0.link" });
});

test("event pages with large embedded images and styles are still read", async () => {
  const image = `data:image/png;base64,${"A".repeat(6 * 1024 * 1024)}`;
  const page = `<html><head><style>${".x{color:red}".repeat(100000)}</style></head><body><img src="${image}"><h1>MBA Reunion</h1><script>var calendar_date = "2027-05-28";</script></body></html>`;
  const fetchImpl = async () => new Response(page, { status: 200, headers: { "content-type": "text/html; charset=utf-8" } });
  const { html } = await fetchPage("https://apply.iese.edu/bcn-2-27/?utm_source=outlook", { fetchImpl });
  assert.ok(html.length < 1024, "embedded images and styles are dropped");
  assert.match(html, /<h1>MBA Reunion<\/h1>/);
  assert.match(html, /calendar_date = "2027-05-28"/, "scripts stay, the date is read from them");
  const huge = async () => new Response(`<p>${"x".repeat(6 * 1024 * 1024)}</p>`, { status: 200, headers: { "content-type": "text/html" } });
  await assert.rejects(fetchPage("https://apply.iese.edu/x/", { fetchImpl: huge }), /demasiado grande/);
});

test("people get Programa by default and admins choose their area", async (t) => {
  const { call } = await startStudio(t, { env: { PROGRAMA_HEADER_LOGO_URL: "https://img.example/programa.png", PROGRAMA_PARDOT_CAMPAIGN_ID: "77", PROGRAMA_PARDOT_FOLDER_ID: "88" } });
  const as = (email, id) => ({ "x-ms-client-principal-name": email, "x-ms-client-principal-id": id });
  const ana = as("ana@iese.edu", "id-ana");
  const miki = as("MAEspinosa@iese.edu", "id-miki");

  const config = await call("config", "GET", undefined, ana);
  assert.deepEqual(config.body.user.areas, ["programa"]);
  assert.equal(config.body.user.admin, false);
  assert.equal((await call("admin/users", "GET", undefined, ana)).status, 403);
  assert.equal((await call("drafts", "POST", { template: "invite", language: "es", area: "alumni" }, ana)).status, 403);
  const draft = (await call("drafts", "POST", { template: "invite", language: "es", area: "programa" }, ana)).body.draft;
  assert.equal(draft.area, "programa");
  assert.deepEqual(draft.pardot, { campaignId: "77", folderId: "88" });
  const exported = await call(`drafts/${draft.id}/export`, "POST", undefined, ana);
  assert.match(exported.body.html, /programa\.png/);
  assert.doesNotMatch(exported.body.html, /iese_alumni\.png/);

  const owner = await call("config", "GET", undefined, miki);
  assert.equal(owner.body.user.admin, true);
  assert.deepEqual(owner.body.user.areas, ["alumni", "programa"]);
  const { users } = (await call("admin/users", "GET", undefined, miki)).body;
  const row = users.find((u) => u.email === "ana@iese.edu");
  assert.equal(row.access, "programa");
  assert.equal(row.created, 1);
  assert.equal(row.programa, 1);

  const updated = await call(`admin/users/${row.key}`, "PUT", { access: "ambos", admin: true }, miki);
  assert.equal(updated.body.users.find((u) => u.key === row.key).access, "ambos");
  const after = await call("config", "GET", undefined, ana);
  assert.deepEqual(after.body.user.areas, ["alumni", "programa"]);
  assert.equal(after.body.user.admin, true, "an admin can make others admin");
  assert.equal((await call("admin/users", "GET", undefined, ana)).status, 200);
  const alumni = await call("drafts", "POST", { template: "invite", language: "es", area: "alumni" }, ana);
  assert.equal(alumni.body.draft.pardot.campaignId, "11", "Alumni keeps the app defaults");
  assert.equal((await call("drafts", "GET", undefined, ana)).body.drafts.length, 2, "one list with both areas");
});
