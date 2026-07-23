import assert from "node:assert/strict";
import test from "node:test";
import {
  buildPardotHtmlUrl,
  buildPardotTemplateUrl,
  buildEmailTemplatePayload,
  buildAiResponseRequest,
  buildListEmailPayload,
  collectTranslatableEventFields,
  escapeHtml,
  parseCsvIds,
  parseIeseLandingHtml,
  parseTranslatedEventFields,
  renderTemplate,
  resolveAiConfiguration,
  validateIeseLandingUrl,
} from "../server.js";

test("collectTranslatableEventFields includes editorial copy and excludes technical values", () => {
  assert.deepEqual(
    collectTranslatableEventFields({
      eventName: "Desayuno ejecutivo",
      eventDescription: "Una sesión práctica.",
      speakerName1: "Laura Martínez",
      speakerTitle1: "Directora general",
      registrationUrl: "https://example.com",
      senderEmail: "events@example.com",
    }),
    {
      eventName: "Desayuno ejecutivo",
      eventDescription: "Una sesión práctica.",
      speakerTitle1: "Directora general",
    },
  );
});

test("parseTranslatedEventFields accepts fenced JSON and requires every source field", () => {
  const source = { eventName: "Desayuno", ctaLabel: "Registrarse" };
  assert.deepEqual(
    parseTranslatedEventFields('```json\n{"eventName":"Breakfast","ctaLabel":"Register"}\n```', source),
    { eventName: "Breakfast", ctaLabel: "Register" },
  );
  assert.throws(
    () => parseTranslatedEventFields('{"eventName":"Breakfast"}', source),
    /incompleta/,
  );
});

test("parseIeseLandingHtml maps a standard IESE event landing", () => {
  const html = `<!doctype html><html><head>
    <meta name="language" content="en"><meta property="og:image" content="https://example.com/social.jpg">
    </head><body>
    <div id="event-header-container" style="background-image:url('https://example.com/hero.jpg')">
      <div id="event_header_name_name">IESE Alumni Breakfast</div>
      <div id="event_header_name_type">Guest Speaker: Alex Smith</div>
      <div id="event_header_name_place">London</div>
    </div>
    <div class="iese_event_info_section_subsection"><span class="iese_event_info_section_subtitle">DATE AND TIME</span>Tuesday<br><span>7:45 a.m. - 9:00 a.m.</span></div>
    <div class="iese_event_info_section_subsection"><span class="iese_event_info_section_subtitle">LOCATION</span>Oriental Club, London</div>
    <div class="event_templateblock_form_full"><div style="padding:20px">
      <p>Join IESE alumni for a practical breakfast session.</p><p><u>Agenda</u></p>
      <p>07:45 am Arrival<br>08:00 am Session<br>09:00 am End</p>
    </div><form id="payment_form"></form></div>
    <script>var calendar_date = "2026-10-13";</script></body></html>`;
  const result = parseIeseLandingHtml(html, "https://apply.iese.edu/example/");
  assert.equal(result.fields.eventName, "IESE Alumni Breakfast");
  assert.equal(result.fields.heroImageUrl, "https://example.com/hero.jpg");
  assert.equal(result.fields.eventDate, "2026-10-13");
  assert.equal(result.fields.startTime, "07:45");
  assert.equal(result.fields.endTime, "09:00");
  assert.equal(result.fields.timezone, "Europe/London");
  assert.equal(result.fields.venue, "Oriental Club, London");
  assert.equal(result.fields.speakerName1, "Alex Smith");
  assert.match(result.fields.agendaItems, /08:00 \| Session/);
});

test("parseIeseLandingHtml maps the login-gated IESE event format without importing the login message", () => {
  const html = `<!doctype html><html><head><meta property="og:title" content="Madrid Alumni Day 2026. | IESE Business School"></head>
    <body><div id="event-header-container" style="background-image:url(https://example.com/madrid.jpg)">
      <div id="event_header_name_responsive_name">Madrid Alumni Day 2026.</div>
      <div id="event_header_name_responsive_type">Madrid Alumni Day 2026</div>
      <div id="event_header_name_responsive_place">Madrid</div>
    </div><div id="contentblock"><h2>Esta pagina es exclusiva para empleados. Introduce tu usuario.</h2>
      <form action="/oauth2/login"><input name="next"></form></div><script>var lang = "es";</script></body></html>`;
  const result = parseIeseLandingHtml(html, "https://apply.iese.edu/madrid_alumni_day_2026_dm/");
  assert.equal(result.fields.eventName, "Madrid Alumni Day 2026");
  assert.equal(result.fields.eventType, "Madrid Alumni Day 2026");
  assert.equal(result.fields.city, "Madrid");
  assert.equal(result.fields.timezone, "Europe/Madrid");
  assert.equal(result.fields.emailLanguage, "es");
  assert.equal(result.fields.heroImageUrl, "https://example.com/madrid.jpg");
  assert.equal(result.fields.eventBrief, undefined);
  assert.equal(result.partial, true);
  assert.match(result.notice, /Landing privada/);
});

test("validateIeseLandingUrl only accepts the IESE landing host over HTTPS", () => {
  assert.equal(validateIeseLandingUrl("https://apply.iese.edu/event/").hostname, "apply.iese.edu");
  assert.throws(() => validateIeseLandingUrl("https://example.com/event/"), /apply\.iese\.edu/);
  assert.throws(() => validateIeseLandingUrl("http://apply.iese.edu/event/"), /HTTPS/);
});

test("buildAiResponseRequest uses Azure's minimal Responses payload", () => {
  assert.deepEqual(
    buildAiResponseRequest(
      { provider: "azure", model: "gpt-5.2-chat" },
      "Redacta una invitacion.",
      "Evento en Barcelona.",
    ),
    {
      model: "gpt-5.2-chat",
      input: "Redacta una invitacion.\n\nEvento en Barcelona.",
    },
  );
});

test("resolveAiConfiguration prioritizes Azure OpenAI with an API key", () => {
  assert.deepEqual(
    resolveAiConfiguration({
      AZURE_OPENAI_ENDPOINT: "https://example.openai.azure.com/",
      AZURE_OPENAI_DEPLOYMENT: "event-copy",
      AZURE_OPENAI_API_KEY: "secret",
      OPENAI_API_KEY: "public-secret",
    }),
    {
      provider: "azure",
      authentication: "api-key",
      baseURL: "https://example.openai.azure.com/openai/v1",
      model: "event-copy",
    },
  );
});

test("resolveAiConfiguration uses managed identity when Azure has no API key", () => {
  assert.deepEqual(
    resolveAiConfiguration({
      AZURE_OPENAI_ENDPOINT: "https://example.openai.azure.com",
      AZURE_OPENAI_DEPLOYMENT: "event-copy",
    }),
    {
      provider: "azure",
      authentication: "managed-identity",
      baseURL: "https://example.openai.azure.com/openai/v1",
      model: "event-copy",
    },
  );
});

test("resolveAiConfiguration falls back to public OpenAI or local demo", () => {
  assert.deepEqual(
    resolveAiConfiguration({ OPENAI_API_KEY: "secret", OPENAI_MODEL: "gpt-test" }),
    {
      provider: "openai",
      authentication: "api-key",
      model: "gpt-test",
    },
  );
  assert.equal(resolveAiConfiguration({}), null);
});

test("parseCsvIds converts comma-separated ids", () => {
  assert.deepEqual(parseCsvIds("123, 456,789", "List IDs"), [123, 456, 789]);
});

test("renderTemplate supports optional blocks", () => {
  const template = "Hola {{name}}{{#title}} - {{title}}{{/title}}{{#missing}} nope {{/missing}}";
  assert.equal(renderTemplate(template, { name: "Ada", title: "CMO" }), "Hola Ada - CMO");
});

test("escapeHtml neutralizes template values", () => {
  assert.equal(escapeHtml("<script>alert('x')</script>"), "&lt;script&gt;alert(&#39;x&#39;)&lt;/script&gt;");
});

test("buildListEmailPayload creates a v5 list email payload", () => {
  const payload = buildListEmailPayload(
    {
      eventName: "AI Breakfast Madrid",
      eventDate: "2026-06-24",
      campaignId: "12345",
      recipientListIds: "111,222",
      suppressionListIds: "333",
      subject: "Invitacion",
      senderName: "Marketing",
      senderEmail: "marketing@example.com",
      replyToEmail: "events@example.com",
      scheduledTime: "2026-06-23T09:00:00+02:00",
      trackerDomainId: "444",
    },
    {
      html: "<html>%%unsubscribe%%</html>",
      text: "%%unsubscribe%%",
    },
  );

  assert.equal(payload.campaignId, 12345);
  assert.equal(payload.trackerDomainId, 444);
  assert.deepEqual(payload.recipientListIds, [111, 222]);
  assert.deepEqual(payload.suppressionListIds, [333]);
  assert.equal(payload.scheduledTime, undefined);
  assert.equal(payload.type, "htmlAndText");
  assert.deepEqual(payload.senderOptions, [
    { type: "general_user", name: "Marketing", address: "marketing@example.com" },
  ]);
  assert.deepEqual(payload.replyToOptions, [
    { type: "general_address", address: "events@example.com" },
  ]);
});

test("buildEmailTemplatePayload creates a safe template payload", () => {
  const payload = buildEmailTemplatePayload(
    {
      eventName: "AI Breakfast Madrid",
      eventDate: "2026-06-24",
      campaignId: "12345",
      recipientListIds: "111,222",
      suppressionListIds: "333",
      subject: "Invitacion",
      senderName: "Marketing",
      senderEmail: "marketing@example.com",
      replyToEmail: "events@example.com",
      folderId: "11644",
      trackerDomainId: "444",
    },
    {
      html: "<html>{{EmailPreferenceCenter}}</html>",
      text: "{{EmailPreferenceCenter}}",
    },
  );

  assert.equal(payload.campaignId, 12345);
  assert.equal(payload.folderId, 11644);
  assert.equal(payload.trackerDomainId, 444);
  assert.equal(payload.type, "htmlAndText");
  assert.equal(payload.isAutoResponderEmail, false);
  assert.equal(payload.isDripEmail, false);
  assert.equal(payload.isListEmail, true);
  assert.equal(payload.isOneToOneEmail, false);
  assert.equal(payload.recipientListIds, undefined);
  assert.equal(payload.suppressionListIds, undefined);
  assert.deepEqual(payload.senderOptions, [
    { type: "general_user", name: "Marketing", address: "marketing@example.com" },
  ]);
  assert.equal(payload.replyToOptions, undefined);
  assert.equal(payload.htmlMessage, "<html>{{EmailPreferenceCenter}}</html>");
});

test("buildListEmailPayload can rely on a Pardot template sender", () => {
  const payload = buildListEmailPayload(
    {
      eventName: "AI Breakfast Madrid",
      eventDate: "2026-06-24",
      campaignId: "12345",
      recipientListIds: "111",
      emailTemplateId: "6789",
      trackerDomainId: "444",
    },
    {
      html: "<html>%%unsubscribe%%</html>",
      text: "%%unsubscribe%%",
    },
  );

  assert.equal(payload.emailTemplateId, 6789);
  assert.equal(payload.senderOptions, undefined);
});

test("buildPardotHtmlUrl returns the configured Pardot editor link", () => {
  const originalTemplate = process.env.PARDOT_LIST_EMAIL_HTML_URL_TEMPLATE;
  process.env.PARDOT_LIST_EMAIL_HTML_URL_TEMPLATE =
    "https://pi.pardot.com/email/draft/edit/id/{id}";

  assert.equal(
    buildPardotHtmlUrl({ data: { id: 98765 } }),
    "https://pi.pardot.com/email/draft/edit/id/98765",
  );

  if (originalTemplate === undefined) {
    delete process.env.PARDOT_LIST_EMAIL_HTML_URL_TEMPLATE;
  } else {
    process.env.PARDOT_LIST_EMAIL_HTML_URL_TEMPLATE = originalTemplate;
  }
});

test("buildPardotTemplateUrl returns the configured template link", () => {
  const originalTemplate = process.env.PARDOT_EMAIL_TEMPLATE_URL_TEMPLATE;
  process.env.PARDOT_EMAIL_TEMPLATE_URL_TEMPLATE =
    "https://pi.pardot.com/emailTemplate/read/id/{id}";

  assert.equal(
    buildPardotTemplateUrl({ data: { id: 98765 } }),
    "https://pi.pardot.com/emailTemplate/read/id/98765",
  );

  if (originalTemplate === undefined) {
    delete process.env.PARDOT_EMAIL_TEMPLATE_URL_TEMPLATE;
  } else {
    process.env.PARDOT_EMAIL_TEMPLATE_URL_TEMPLATE = originalTemplate;
  }
});
