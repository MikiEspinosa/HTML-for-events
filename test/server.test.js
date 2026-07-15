import assert from "node:assert/strict";
import test from "node:test";
import {
  buildPardotHtmlUrl,
  buildPardotTemplateUrl,
  buildEmailTemplatePayload,
  buildListEmailPayload,
  escapeHtml,
  parseCsvIds,
  renderTemplate,
  resolveAiConfiguration,
} from "../server.js";

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
