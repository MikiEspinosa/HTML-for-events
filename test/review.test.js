// Learned examples by area with admin review, area-aware AI prompts, sign-in
// required in production and the old generator kept for administrators.

import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createAi, sharedContext } from "../studio/ai.js";
import { createStudioHandler, getUser, loginRequired } from "../studio/routes.js";
import { createStore } from "../studio/store.js";

async function studioServer(t, client) {
  const dir = await mkdtemp(path.join(os.tmpdir(), "studio-review-"));
  const studio = createStudioHandler({
    rootDir: dir,
    getAiClient: () => (client ? { client, model: "m", provider: "openai" } : null),
    buildAiRequest: (ai, instructions, input) => ({ model: ai.model, instructions, input }),
    extractAiText: (payload) => payload.text,
    isDryRun: () => true,
    runtimeDefaults: () => ({ campaignId: "11", folderId: "22" }),
    mergeDefaultInput: (input) => input,
    buildEmailTemplatePayload: (input, rendered) => ({ name: input.listEmailName, htmlMessage: rendered.html }),
  }, { STUDIO_DATA_DIR: dir, STUDIO_ADMIN_EMAILS: "boss@iese.edu", STUDIO_ALUMNI_EMAILS: "ana@iese.edu" });
  const server = http.createServer((req, res) => studio.handle(req, res));
  await new Promise((resolve) => server.listen(0, resolve));
  t.after(async () => { server.close(); await rm(dir, { recursive: true, force: true }); });
  const base = `http://127.0.0.1:${server.address().port}/api/studio/`;
  const call = async (p, method, body, email) => {
    const r = await fetch(base + p, { method, headers: { "content-type": "application/json", "x-ms-client-principal-name": email, "x-ms-client-principal-id": `id-${email}` }, body: body && JSON.stringify(body) });
    return { status: r.status, body: await r.json() };
  };
  return { studio, call, dir };
}

async function publishLearning(call, email) {
  const { body } = await call("drafts", "POST", { template: "invite", language: "es" }, email);
  const modules = [
    { id: "mhero00001", type: "hero", imageUrl: "https://example.com/a.jpg", imageAlt: "Campus", title: "Encuentro", subtitle: "8 de octubre", ctaLabel: "Inscríbete", ctaUrl: "https://apply.iese.edu/x/" },
    { id: "mhead00001", type: "heading", text: "Un reencuentro" },
    { id: "mtext00001", type: "text", body: "Te esperamos." },
    { id: "mevent0001", type: "event", date: "2026-10-08", startTime: "19:30", endTime: "", venue: "Campus de Madrid", address: "" },
    { id: "mcta000001", type: "cta", label: "Inscríbete", url: "https://apply.iese.edu/x/" },
  ];
  const saved = await call(`drafts/${body.draft.id}`, "PUT", { version: 1, subject: `Asunto de ${email}`, preheader: "Te esperamos", modules }, email);
  return call(`drafts/${body.draft.id}/publish`, "POST", { version: saved.body.draft.version, learn: true }, email);
}

test("an email learned from a non-admin waits for an admin before the AI uses it", async (t) => {
  const { call } = await studioServer(t);
  const published = await publishLearning(call, "ana@iese.edu");
  assert.equal(published.status, 200);
  assert.equal(published.body.learned, "pending");

  assert.equal((await call("admin/examples", "GET", undefined, "ana@iese.edu")).status, 403);
  const { examples } = (await call("admin/examples", "GET", undefined, "boss@iese.edu")).body;
  assert.equal(examples.length, 1);
  assert.equal(examples[0].status, "pending");
  assert.equal(examples[0].area, "alumni");
  assert.equal(examples[0].author, "ana");

  const approved = await call(`admin/examples/${examples[0].id}`, "PUT", { approved: true }, "boss@iese.edu");
  assert.equal(approved.body.examples[0].status, "approved");
  const removed = await call(`admin/examples/${examples[0].id}`, "DELETE", undefined, "boss@iese.edu");
  assert.equal(removed.body.examples.length, 0);
});

test("an admin's learned email is approved at once", async (t) => {
  const { call } = await studioServer(t);
  const published = await publishLearning(call, "boss@iese.edu");
  assert.equal(published.body.learned, true);
});

test("the AI only sees approved examples of the same area and language", async (t) => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "studio-examples-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const store = createStore(dir);
  const draft = (area, subject) => ({ id: "d", owner: "x", template: "invite", area, language: "es", subject, modules: [] });
  await store.addExample(draft("alumni", "A aprobado"), { approved: true });
  await store.addExample(draft("alumni", "A pendiente"));
  await store.addExample(draft("programa", "P aprobado"), { approved: true });
  const legacy = await store.addExample({ ...draft(undefined, "Antiguo"), language: "es" }, { approved: true });
  assert.ok(legacy);

  const alumni = (await store.findExamples({ template: "invite", language: "es", area: "alumni" })).map((e) => e.subject).sort();
  assert.deepEqual(alumni, ["A aprobado", "Antiguo"]);
  const programa = (await store.findExamples({ template: "invite", language: "es", area: "programa" })).map((e) => e.subject);
  assert.deepEqual(programa, ["P aprobado"]);
  assert.deepEqual(await store.findExamples({ template: "invite", language: "en", area: "alumni" }), []);
});

test("Programa prompts speak for IESE Business School, not IESE Alumni", async () => {
  assert.match(sharedContext({ language: "es", area: "alumni" }), /^You work for IESE Alumni/);
  const programa = sharedContext({ language: "es", area: "programa" });
  assert.match(programa, /^You work for IESE Business School/);
  assert.ok(!programa.startsWith("You work for IESE Alumni"));

  const sent = [];
  const ai = createAi({
    getClient: () => ({ client: { responses: { create: async (req) => { sent.push(req.input); return { text: '{"subjects":[],"preheader":""}' }; } } }, model: "m" }),
    buildRequest: (_ai, instructions, input) => ({ input: instructions }),
    extractText: (payload) => payload.text,
  });
  await ai.suggestSubjects({ language: "es", area: "programa", draft: { modules: [] } });
  assert.ok(sent[0].startsWith(programa));
  assert.ok(!sent[0].includes("IESE Alumni email"));
});

test("AI calls use the area the person may work in", async (t) => {
  const prompts = [];
  const client = { responses: { create: async (req) => { prompts.push(req.instructions); return { text: "Hola" }; } } };
  const { call } = await studioServer(t, client);
  // Ana works only in Alumni: asking for Programa falls back to Alumni.
  await call("ai/rewrite", "POST", { action: "improve", text: "Hola", area: "programa" }, "ana@iese.edu");
  assert.match(prompts[0], /^You work for IESE Alumni/);
  // New people start in Programa.
  await call("ai/rewrite", "POST", { action: "improve", text: "Hola", area: "programa" }, "new@iese.edu");
  assert.match(prompts[1], /^You work for IESE Business School/);
});

test("sign-in is required in production even without STUDIO_REQUIRE_LOGIN", () => {
  assert.equal(loginRequired({ NODE_ENV: "production" }), true);
  assert.equal(loginRequired({ NODE_ENV: "production", STUDIO_REQUIRE_LOGIN: "false" }), true);
  assert.equal(loginRequired({}), false);
  assert.throws(() => getUser({ headers: {} }, { NODE_ENV: "production" }), { status: 401 });
});

test("only administrators count as admins for the old generator", async (t) => {
  const { studio } = await studioServer(t);
  const as = (email) => ({ headers: { "x-ms-client-principal-name": email, "x-ms-client-principal-id": `id-${email}` } });
  assert.equal(await studio.isAdmin(as("boss@iese.edu")), true);
  assert.equal(await studio.isAdmin(as("ana@iese.edu")), false);
});

test("the old generator and the Salesforce connection are for administrators only", async (t) => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "studio-legacy-"));
  const saved = { ...process.env };
  Object.assign(process.env, { STUDIO_DATA_DIR: dir, STUDIO_ADMIN_EMAILS: "boss@iese.edu", NODE_ENV: "production" });
  const { createServer, isAdminOnlyPath } = await import("../server.js");
  const server = createServer();
  await new Promise((resolve) => server.listen(0, resolve));
  t.after(async () => {
    server.close();
    process.env = saved;
    await rm(dir, { recursive: true, force: true });
  });
  assert.equal(isAdminOnlyPath("/api/studio/config"), false);
  assert.equal(isAdminOnlyPath("/studio/"), false);
  assert.equal(isAdminOnlyPath("/oauth/start"), true);
  const base = `http://127.0.0.1:${server.address().port}`;
  const as = (email) => (email ? { "x-ms-client-principal-name": email, "x-ms-client-principal-id": `id-${email}` } : {});
  const get = (p, email) => fetch(base + p, { headers: as(email), redirect: "manual" });

  const home = await get("/", "ana@iese.edu");
  assert.equal(home.status, 302);
  assert.equal(home.headers.get("location"), "/studio/");
  assert.equal((await get("/", undefined)).status, 302, "no sign-in: sent to the studio");
  assert.equal((await get("/oauth/start", "ana@iese.edu")).status, 403);
  assert.equal((await get("/api/config", "ana@iese.edu")).status, 403);
  assert.equal((await get("/api/studio/config", undefined)).status, 401, "the studio needs sign-in in production");
  assert.equal((await get("/studio/", "ana@iese.edu")).status, 200);

  assert.equal((await get("/", "boss@iese.edu")).status, 200);
  assert.equal((await get("/api/config", "boss@iese.edu")).status, 200);
});

test("names given as \"Surname, First name\" are shown first name first", async () => {
  const { displayName } = await import("../studio/routes.js");
  assert.equal(displayName("Espinosa, Miki"), "Miki Espinosa");
  assert.equal(displayName("Ana Pérez"), "Ana Pérez");
  assert.equal(displayName(""), "");
  const principal = Buffer.from(JSON.stringify({ claims: [{ typ: "name", val: "Espinosa, Miki" }] })).toString("base64");
  assert.equal(getUser({ headers: { "x-ms-client-principal": principal, "x-ms-client-principal-name": "m@iese.edu", "x-ms-client-principal-id": "1" } }, {}).name, "Miki Espinosa");
});
