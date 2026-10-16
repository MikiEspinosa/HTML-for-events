import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { parseIeseLandingHtml } from "../server.js";
import { applyTexts, collectTexts, parseJsonReply } from "../studio/ai.js";
import { BRAND, renderEmail, sanitizeCustomHtml, validateDraft } from "../studio/brand.js";
import { captureEvent, checkCaptureUrl } from "../studio/capture.js";
import { formatDate, formatDateRange, formatTime, formatTimeRange } from "../studio/format.js";
import { createStudioHandler, getUser, modulesForInvite } from "../studio/routes.js";
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
  }, { STUDIO_DATA_DIR: dir, PUBLIC_BASE_URL: "https://studio.example" });
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
