import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "../server.js";

const sampleInput = {
  eventName: "AI Breakfast Madrid",
  emailLanguage: "es",
  templateVariant: "generic",
  eventType: "Desayuno ejecutivo",
  eventBrief:
    "Sesion practica para alumni y directivos sobre IA aplicada a marketing y ventas.",
  eventDescription:
    "Sesion practica para preparar una invitacion de evento.\n\nDirigida a **alumni y directivos**.",
  eventDate: "2026-06-24",
  startTime: "09:30",
  endTime: "11:00",
  timezone: "Europe/Madrid",
  registrationUrl: "https://example.com/register",
  venue: "Impact Hub",
  city: "Madrid",
  speakerCount: "2",
  speakerName1: "Laura Martinez",
  speakerTitle1: "Directora de Marketing",
  showSpeakerDescription1: "true",
  speakerDescription1: "Especialista en marketing B2B y crecimiento.",
  speakerName2: "Javier Gomez",
  speakerTitle2: "Profesor de Direccion Comercial",
  showSpeakerDescription2: "true",
  speakerDescription2: "Profesor con experiencia en direccion comercial.",
  showAgenda: "true",
  agendaItems:
    "09:30 | Welcome remarks | IESE Business School\n09:45 | Keynote session | Laura Martinez\n10:30 | Networking coffee",
  hostName: "Equipo de marketing",
  senderName: "Marketing",
  senderEmail: "marketing@example.com",
  replyToEmail: "events@example.com",
  trackerDomainId: "222",
  showOtherEvents: "true",
  otherEventsTitle: "Otros eventos para ti",
  otherEventsCount: "2",
  otherEventTitle1: "Data-driven pricing: from strategy to tactics and analytics",
  otherEventDescription1: "Pricing aplicado a decisiones comerciales con analitica.",
  otherEventVenue1: "IESE Madrid",
  otherEventDate1: "Thursday, June 11",
  otherEventTime1: "3:00 pm",
  otherEventUrl1: "https://example.com/pricing",
  otherEventTitle2: "IA en la cadena de suministro",
  otherEventDescription2: "Aplicaciones de IA para operaciones y prevision.",
  otherEventVenue2: "IESE Barcelona",
  otherEventDate2: "Lunes, 11 de junio",
  otherEventTime2: "3:00 pm",
  otherEventUrl2: "https://example.com/supply-chain",
  showEventsCta: "true",
  eventsCtaLabel: "Ver todos los eventos en la web",
  eventsCtaUrl: "https://www.iese.edu/events/",
  showFullWidthImage: "true",
  fullWidthImageUrl:
    "https://prdt.iese.edu/l/501101/2026-07-17/5sb92f/501101/1784336531UBju9cOe/full_width_example__1_.png",
  fullWidthImageLinkUrl: "https://example.com/full-width-link",
};

test("server serves the app and renders a preview", async (t) => {
  const originalOpenAiKey = process.env.OPENAI_API_KEY;
  const originalAzureEndpoint = process.env.AZURE_OPENAI_ENDPOINT;
  const originalAzureDeployment = process.env.AZURE_OPENAI_DEPLOYMENT;
  const originalAzureApiKey = process.env.AZURE_OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = "";
  process.env.AZURE_OPENAI_ENDPOINT = "";
  process.env.AZURE_OPENAI_DEPLOYMENT = "";
  process.env.AZURE_OPENAI_API_KEY = "";
  const server = createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(async () => {
    if (originalOpenAiKey === undefined) {
      delete process.env.OPENAI_API_KEY;
    } else {
      process.env.OPENAI_API_KEY = originalOpenAiKey;
    }
    for (const [name, value] of [
      ["AZURE_OPENAI_ENDPOINT", originalAzureEndpoint],
      ["AZURE_OPENAI_DEPLOYMENT", originalAzureDeployment],
      ["AZURE_OPENAI_API_KEY", originalAzureApiKey],
    ]) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    await new Promise((resolve) => server.close(resolve));
  });

  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}`;
  const defaultHeroImageUrl =
    "https://prdt.iese.edu/l/501101/2026-06-03/5s7bkf/501101/1780498447BcWEOZY0/1_coaching.png";

  const page = await fetch(`${baseUrl}/`);
  assert.equal(page.status, 200);
  const pageHtml = await page.text();
  assert.match(pageHtml, /A\.U\.R\.A\./);
  assert.match(pageHtml, /A\.U\.R\.A\. Automated UI Rendering Assistant/);
  assert.match(pageHtml, /Generador HTML/);
  assert.match(pageHtml, /class="app-logo" src="\/iese-logo\.png"/);
  assert.doesNotMatch(pageHtml, /id="modeBadge"/);
  assert.doesNotMatch(pageHtml, /id="configBadge"/);
  assert.doesNotMatch(pageHtml, /Credenciales listas/);
  assert.doesNotMatch(pageHtml, /Modo real/);
  assert.match(pageHtml, /<details class="panel collapsible-panel">\s*<summary class="panel-head collapsible-summary">\s*<h2>Datos del evento<\/h2>/);
  assert.match(pageHtml, /<details class="module-accordion">\s*<summary>Configuracion general<\/summary>/);
  assert.match(pageHtml, /<details class="module-accordion">\s*<summary>Cabecera e imagen hero<\/summary>/);
  assert.match(pageHtml, /<details class="module-accordion">\s*<summary>CTA e imagen inferior<\/summary>/);
  assert.doesNotMatch(pageHtml, /<details class="module-accordion" open>/);
  assert.match(pageHtml, /<details class="panel collapsible-panel">\s*<summary class="panel-head collapsible-summary">\s*<h2>Contenido del email<\/h2>/);
  assert.match(pageHtml, /<details class="panel collapsible-panel">\s*<summary class="panel-head collapsible-summary">\s*<h2>Envio en Pardot<\/h2>/);
  assert.doesNotMatch(pageHtml, /<details class="panel collapsible-panel" open>/);
  assert.match(pageHtml, /<\/details>\s*<div class="actions form-actions">\s*<button type="button" id="sampleButton"/);
  assert.doesNotMatch(pageHtml, /Campaign ID/);
  assert.doesNotMatch(pageHtml, /Recipient list IDs/);
  assert.doesNotMatch(pageHtml, /Suppression list IDs/);
  assert.doesNotMatch(pageHtml, /Tracker domain ID/);
  assert.doesNotMatch(pageHtml, /Folder ID/);
  assert.doesNotMatch(pageHtml, /Programar envio/);
  assert.doesNotMatch(pageHtml, /Email operacional/);
  assert.doesNotMatch(pageHtml, /Email template ID/);
  assert.match(pageHtml, /Descripcion aproximada del evento/);
  assert.match(pageHtml, /Generar cuerpo con IA/);
  assert.match(pageHtml, /Idioma del email/);
  assert.match(pageHtml, /English/);
  assert.match(pageHtml, /Plantilla/);
  assert.match(pageHtml, /templateVariant/);
  assert.match(pageHtml, /Gen&eacute;rico/);
  assert.match(pageHtml, /Membres&iacute;a/);
  assert.match(pageHtml, /Recordatorio semanal \/ calendario de eventos/);
  assert.match(pageHtml, /Sobret&iacute;tulo/);
  assert.doesNotMatch(pageHtml, /<label class="field-label" for="eventType">Tipo<\/label>/);
  assert.match(pageHtml, /showEventName/);
  assert.match(pageHtml, /showEventType/);
  assert.match(pageHtml, /showEmailHeadline/);
  assert.match(pageHtml, /heroTitleText/);
  assert.match(pageHtml, /showHeroTitle/);
  assert.match(pageHtml, /heroSubtitleText/);
  assert.match(pageHtml, /showHeroSubtitle/);
  assert.match(pageHtml, /showHeroTextShadow/);
  assert.match(pageHtml, /showHeroSubtitleHighlight/);
  assert.match(pageHtml, /showTimezone/);
  assert.match(pageHtml, /showVenue/);
  assert.match(pageHtml, /showCity/);
  assert.match(pageHtml, /showAgenda/);
  assert.match(pageHtml, /showOtherEvents/);
  assert.match(pageHtml, /otherEventsTitle/);
  assert.match(pageHtml, /otherEventsCount/);
  assert.match(pageHtml, /otherEventTitle10/);
  assert.match(pageHtml, /otherEventDescription10/);
  assert.match(pageHtml, /otherEventVenue10/);
  assert.match(pageHtml, /otherEventDate10/);
  assert.match(pageHtml, /otherEventTime10/);
  assert.match(pageHtml, /otherEventUrl10/);
  assert.match(pageHtml, /showResources/);
  assert.match(pageHtml, /resourceTitle1/);
  assert.match(pageHtml, /resourceUrl3/);
  assert.match(pageHtml, /resourceImageUrl1/);
  assert.match(pageHtml, /showEventsCta/);
  assert.match(pageHtml, /eventsCtaLabel/);
  assert.match(pageHtml, /eventsCtaUrl/);
  assert.match(pageHtml, /showFullWidthImage/);
  assert.match(pageHtml, /fullWidthImageUrl/);
  assert.match(pageHtml, /fullWidthImageLinkUrl/);
  assert.match(pageHtml, /Numero de ponentes/);
  assert.match(pageHtml, /<option value="0">0<\/option>/);
  assert.match(pageHtml, /Ponente 5/);
  assert.match(pageHtml, /Foto del ponente 5/);
  assert.match(pageHtml, /speakerDescription5/);
  assert.match(pageHtml, /showSpeakerDescription5/);

  const config = await fetch(`${baseUrl}/api/config`);
  assert.equal(config.status, 200);
  const configData = await config.json();
  assert.equal(configData.defaults.heroImageUrl, defaultHeroImageUrl);
  assert.doesNotMatch(
    JSON.stringify(configData),
    /AZURE_OPENAI|OPENAI_API_KEY|openAiModel|hasOpenAiKey/i,
  );

  const generated = await fetch(`${baseUrl}/api/generate-copy`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...sampleInput,
      eventDescription: "",
      eventBrief:
        "Notas internas: queremos algo cercano pero premium. Hablar de IA aplicada a marketing y ventas, sin copiar esta frase literal. Publico alumni y directivos.",
    }),
  });
  assert.equal(generated.status, 200);
  const generatedData = await generated.json();
  assert.equal(generatedData.source, "local");
  assert.match(generatedData.body, /AI Breakfast Madrid/);
  assert.match(generatedData.body, /Laura Martinez/);
  assert.match(generatedData.body, /miércoles, 24 de junio de 2026/);
  assert.match(generatedData.body, /Keynote session/);
  assert.doesNotMatch(generatedData.body, /Notas internas/);
  assert.doesNotMatch(generatedData.body, /sin copiar esta frase literal/);

  const preview = await fetch(`${baseUrl}/api/preview`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(sampleInput),
  });

  assert.equal(preview.status, 200);
  const data = await preview.json();
  assert.equal(data.payload.campaignId, Number(process.env.PARDOT_DEFAULT_CAMPAIGN_ID || 12345));
  assert.match(data.html, /IESE_TEMPLATE_VARIANT: generic/);
  assert.equal(data.payload.recipientListIds, undefined);
  assert.equal(data.payload.isListEmail, true);
  assert.equal(data.payload.isAutoResponderEmail, false);
  assert.equal(data.payload.isDripEmail, false);
  assert.equal(data.payload.isOneToOneEmail, false);
  assert.equal(data.payload.type, "htmlAndText");
  assert.deepEqual(data.payload.senderOptions, [
    { type: "general_user", name: "Marketing", address: "marketing@example.com" },
  ]);
  assert.equal(data.payload.replyToOptions, undefined);
  assert.equal(data.payload.scheduledTime, undefined);
  assert.match(data.html, /AI Breakfast Madrid/);
  assert.match(data.html, /iese_logo\.png/);
  assert.doesNotMatch(data.html, /IESE <span style="font-weight:400;">Business School<\/span>/);
  assert.doesNotMatch(data.html, /<h2[^>]*>\s*Madrid\.\s*<\/h2>/);
  assert.doesNotMatch(data.html, /Impact Hub/);
  assert.match(data.html, /Otros eventos para ti/);
  assert.match(data.html, /Data-driven pricing: from strategy to tactics and analytics/);
  assert.match(data.html, /Pricing aplicado a decisiones comerciales con analitica/);
  assert.match(data.html, /IESE Madrid · Thursday, June 11 \| 3:00 pm/);
  assert.match(data.html, /Mas informacion &rarr;/);
  assert.match(data.html, /border-top:2px solid #e30613/);
  assert.match(data.html, /https:\/\/example\.com\/pricing/);
  assert.match(data.text, /Otros eventos para ti:/);
  assert.match(data.html, /Laura Martinez/);
  assert.match(data.html, /Javier Gomez/);
  assert.match(data.html, /Especialista en marketing B2B y crecimiento/);
  assert.match(data.text, /Profesor con experiencia en direccion comercial/);
  assert.match(data.html, /Foto<br>200 x 200/);
  assert.match(data.html, /background:#ffffff;color:#000000/);
  assert.match(data.html, /color:#e30613[^>]+text-transform:uppercase/);
  assert.match(data.html, /<h1 style="margin:0;color:#000000/);
  assert.doesNotMatch(data.html, /Personaliza tu experiencia/);
  assert.match(data.html, /&#128241;/);
  assert.match(data.html, /&#9993;/);
  assert.match(data.html, /aria-label="Ubicaci&oacute;n"/);
  assert.match(data.html, /&#128205;/);
  assert.doesNotMatch(data.html, /<svg\b/i);
  assert.match(data.html, /&#127760;/);
  assert.doesNotMatch(data.html, /{{{dynamic_content_867}}}/);
  assert.doesNotMatch(data.html, /{{{dynamic_content_864}}}/);
  assert.match(data.html, /Ver todos los eventos en la web/);
  assert.match(data.html, /https:\/\/www\.iese\.edu\/events\//);
  assert.doesNotMatch(data.html, /showEventsCtaSpacer/);
  assert.match(data.html, /https:\/\/prdt\.iese\.edu\/l\/501101\/2026-07-17\/5sb92f\/501101\/1784336531UBju9cOe\/full_width_example__1_\.png/);
  assert.match(data.html, /<a href="https:\/\/example\.com\/full-width-link" style="display:block;text-decoration:none;border:0;">/);
  assert.match(data.html, /width="620" alt="" style="display:block;width:100%;max-width:620px/);
  assert.doesNotMatch(data.html, /<td align="center" style="padding:16px 24px;background:#e30613;">/);
  assert.match(data.html, /iese_logo\.png/);
  assert.match(data.html, /footer_taglines_2\.png/);
  assert.match(data.html, /width="32%"/);
  assert.match(data.html, /width="68%"/);
  assert.match(data.html, /Tu direcci&oacute;n de Email se encuentra registrada/);
  assert.match(data.html, /{{{EmailPreferenceCenter_654}}}/);
  assert.match(data.payload.htmlMessage, /{{{EmailPreferenceCenter_654}}}/);
  assert.doesNotMatch(data.payload.htmlMessage, /localhost.*EmailPreferenceCenter_654/);
  assert.doesNotMatch(data.payload.htmlMessage, /%7B%7B%7BEmailPreferenceCenter_654%7D%7D%7D/);
  assert.match(data.html, / {{EmailPreferenceCenter}} /);
  assert.match(data.payload.htmlMessage, / {{EmailPreferenceCenter}} /);
  assert.match(data.payload.textMessage, / {{EmailPreferenceCenter}} /);
  assert.doesNotMatch(data.html, /{{{Unsubscribe}}}/);
  assert.doesNotMatch(data.html, /Tambi&eacute;n puedes darte de baja directamente/);
  assert.match(data.html, /<!--#COLETILLA_FIN#-->/);
  assert.match(data.html, /<strong>alumni y directivos<\/strong>/);
  assert.match(data.html, /<strong>alumni y directivos<\/strong>[\s\S]*<div style="margin:18px 0 0;text-align:center;">[\s\S]*REGISTRARSE &rarr;/);
  assert.doesNotMatch(data.html, /<td align="center" style="padding:18px 24px 8px;background:#ffffff;">/);
  assert.doesNotMatch(data.html, /border-collapse:collapse;background:#f3f6f8/);
  assert.doesNotMatch(data.html, /{{eventDateHuman}}/);
  assert.match(data.html, /<h2 style="margin:0 0 12px;color:#e30613;font-size:22px;line-height:1\.1;font-weight:800;">\s*Ponentes\s*<\/h2>/);
  assert.match(data.html, /background:#e30613/);
  assert.match(data.html, /background:#000000/);
  assert.doesNotMatch(data.text, /%%/);
  assert.doesNotMatch(data.text, /\*\*alumni y directivos\*\*/);

  const englishPreview = await fetch(`${baseUrl}/api/preview`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...sampleInput,
      emailLanguage: "en",
      eventType: "",
      ctaLabel: "",
      otherEventsTitle: "",
      eventsCtaLabel: "",
      closingTitle: "",
      closingText: "",
    }),
  });
  assert.equal(englishPreview.status, 200);
  const englishData = await englishPreview.json();
  assert.match(englishData.html, /IESE invites you/);
  assert.match(englishData.html, /REGISTER/);
  assert.match(englishData.html, /<html lang="en">/);
  assert.match(englishData.html, /Speakers/);
  assert.match(englishData.html, /Other events for you/);
  assert.match(englishData.html, /More information &rarr;/);
  assert.match(englishData.html, /See all events on the website/);
  assert.match(englishData.text, /Date:/);
  assert.match(englishData.text, /Time:/);
  assert.match(englishData.text, /Location:/);
  assert.match(englishData.text, /Extra resources:/);
  assert.doesNotMatch(englishData.html, /Ponentes/);
  assert.doesNotMatch(englishData.html, /Otros eventos para ti/);
  assert.doesNotMatch(englishData.html, /Mas informacion/);
  assert.doesNotMatch(englishData.html, /Ver todos los eventos en la web/);
  assert.doesNotMatch(englishData.html, /Personalize your experience/);
  assert.doesNotMatch(englishData.html, /{{{dynamic_content_864}}}/);
  assert.doesNotMatch(englishData.html, /{{{dynamic_content_867}}}/);
  assert.match(englishData.html, /Your email address is included in our data base/);
  assert.match(englishData.html, /{{{EmailPreferenceCenter_654}}}/);
  assert.match(englishData.html, / {{EmailPreferenceCenter}} /);
  assert.doesNotMatch(englishData.html, /unsubscribe directly/);
  assert.doesNotMatch(englishData.html, /<!--#COLETILLA_FIN#-->/);
  assert.match(englishData.text, /Best regards,/);
  assert.doesNotMatch(englishData.text, /%%/);

  const noSpeakerPreview = await fetch(`${baseUrl}/api/preview`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...sampleInput,
      speakerCount: "0",
      speakerName1: "No debe aparecer",
      speakerTitle1: "No debe aparecer",
    }),
  });
  assert.equal(noSpeakerPreview.status, 200);
  const noSpeakerData = await noSpeakerPreview.json();
  assert.doesNotMatch(noSpeakerData.html, /Ponentes/);
  assert.doesNotMatch(noSpeakerData.html, /No debe aparecer/);

  const hiddenSpeakerDescriptionPreview = await fetch(`${baseUrl}/api/preview`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...sampleInput,
      showSpeakerDescription1: "false",
      speakerDescription1: "No debe verse descripcion",
    }),
  });
  assert.equal(hiddenSpeakerDescriptionPreview.status, 200);
  const hiddenSpeakerDescriptionData = await hiddenSpeakerDescriptionPreview.json();
  assert.doesNotMatch(hiddenSpeakerDescriptionData.html, /No debe verse descripcion/);

  const hiddenFieldsPreview = await fetch(`${baseUrl}/api/preview`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...sampleInput,
      showEventName: "false",
      showEventType: "false",
      showEmailHeadline: "false",
      showTimezone: "false",
      showVenue: "false",
      showCity: "false",
      showAgenda: "false",
    }),
  });
  assert.equal(hiddenFieldsPreview.status, 200);
  const hiddenFieldsData = await hiddenFieldsPreview.json();
  assert.doesNotMatch(hiddenFieldsData.html, /<span style="background:#e30613;color:#ffffff;padding:2px 6px;">AI Breakfast Madrid<\/span>/);
  assert.doesNotMatch(hiddenFieldsData.html, /<h3 style="margin:8px 0 18px;color:#000000;font-size:15px;line-height:1.25;font-weight:800;">\s*AI Breakfast Madrid\s*<\/h3>/);
  assert.doesNotMatch(hiddenFieldsData.html, /Desayuno ejecutivo/);
  assert.doesNotMatch(hiddenFieldsData.html, /Some moments are too good to miss/);
  assert.doesNotMatch(hiddenFieldsData.html, /Europe\/Madrid/);
  assert.doesNotMatch(hiddenFieldsData.html, /Impact Hub/);
  assert.doesNotMatch(hiddenFieldsData.html, /<h2 style="margin:0 0 4px[^>]*>\s*Madrid\.\s*<\/h2>/);
  assert.doesNotMatch(hiddenFieldsData.html, /Welcome remarks/);

  const membershipPreview = await fetch(`${baseUrl}/api/preview`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...sampleInput,
      templateVariant: "membership",
    }),
  });
  assert.equal(membershipPreview.status, 200);
  const membershipData = await membershipPreview.json();
  assert.match(membershipData.html, /IESE_TEMPLATE_VARIANT: membership/);

  const weeklyPreview = await fetch(`${baseUrl}/api/preview`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...sampleInput,
      templateVariant: "weeklyCalendar",
    }),
  });
  assert.equal(weeklyPreview.status, 200);
  const weeklyData = await weeklyPreview.json();
  assert.match(weeklyData.html, /IESE_TEMPLATE_VARIANT: weeklyCalendar/);

  const heroImagePreview = await fetch(`${baseUrl}/api/preview`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...sampleInput,
      heroImageUrl: "https://example.com/header.jpg",
      heroImageFocus: "82",
      heroTitleText: "Titulo propio hero",
      heroSubtitleText: "Subtitulo propio hero",
      speakerPhotoUrl1: "https://example.com/speaker.jpg",
      speakerPhotoFocus1: "18",
    }),
  });
  assert.equal(heroImagePreview.status, 200);
  const heroImageData = await heroImagePreview.json();
  assert.match(heroImageData.html, /background-image:url\('https:\/\/example\.com\/header\.jpg'\)/);
  assert.match(heroImageData.html, /background-size:auto 100%/);
  assert.match(heroImageData.html, /background-position:82% center/);
  assert.match(heroImageData.html, /object-position:18% center/);
  assert.match(heroImageData.html, /height="250"/);
  assert.match(heroImageData.html, /valign="top"/);
  assert.match(heroImageData.html, /background:rgba\(0,0,0,0\.34\)/);
  assert.match(heroImageData.html, /Titulo propio hero/);
  assert.match(heroImageData.html, /Subtitulo propio hero/);
  assert.match(heroImageData.html, /color:#ffffff;font-size:24px/);
  assert.match(heroImageData.html, /background:#e30613;color:#ffffff;font-size:23px/);
  assert.match(heroImageData.html, /href="https:\/\/example\.com\/register"/);

  const noSubtitleHighlightPreview = await fetch(`${baseUrl}/api/preview`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...sampleInput,
      heroImageUrl: "https://example.com/header.jpg",
      heroSubtitleText: "Subtitulo sin fondo rojo",
      showHeroSubtitleHighlight: "false",
    }),
  });
  assert.equal(noSubtitleHighlightPreview.status, 200);
  const noSubtitleHighlightData = await noSubtitleHighlightPreview.json();
  assert.match(noSubtitleHighlightData.html, /Subtitulo sin fondo rojo/);
  assert.match(noSubtitleHighlightData.html, /background:transparent;color:#ffffff;font-size:23px/);
  assert.doesNotMatch(noSubtitleHighlightData.html, /background:#e30613;color:#ffffff;font-size:23px[^>]*Subtitulo sin fondo rojo/);

  const hiddenHeroPreview = await fetch(`${baseUrl}/api/preview`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...sampleInput,
      heroImageUrl: "https://example.com/header.jpg",
      heroTitleText: "Titulo oculto hero",
      heroSubtitleText: "Subtitulo oculto hero",
      showHeroTitle: "false",
      showHeroSubtitle: "false",
    }),
  });
  assert.equal(hiddenHeroPreview.status, 200);
  const hiddenHeroData = await hiddenHeroPreview.json();
  assert.doesNotMatch(hiddenHeroData.html, /Titulo oculto hero/);
  assert.doesNotMatch(hiddenHeroData.html, /Subtitulo oculto hero/);

  const noShadowHeroPreview = await fetch(`${baseUrl}/api/preview`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...sampleInput,
      heroImageUrl: "https://example.com/header.jpg",
      heroTitleText: "Hero sin degradado",
      heroSubtitleText: "Subtitulo sin degradado",
      showHeroTextShadow: "false",
    }),
  });
  assert.equal(noShadowHeroPreview.status, 200);
  const noShadowHeroData = await noShadowHeroPreview.json();
  assert.match(noShadowHeroData.html, /Hero sin degradado/);
  assert.match(noShadowHeroData.html, /background:transparent/);
  assert.doesNotMatch(noShadowHeroData.html, /background:rgba\(0,0,0,0\.34\)/);
  assert.doesNotMatch(noShadowHeroData.html, /background:rgba\(0,0,0,0\.12\)/);

  const resourcesPreview = await fetch(`${baseUrl}/api/preview`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...sampleInput,
      showResources: "true",
      resourceTitle1: "Mis Recursos y Servicios",
      resourceUrl1: "https://example.com/recursos",
      resourceImageUrl1: "https://example.com/recurso1.jpg",
      resourceTitle2: "Ver las e-Conferences",
      resourceUrl2: "https://example.com/conferences",
      resourceTitle3: "Ir a Lifelong Learning",
      resourceUrl3: "https://example.com/lifelong",
    }),
  });
  assert.equal(resourcesPreview.status, 200);
  const resourcesData = await resourcesPreview.json();
  assert.match(resourcesData.html, /Mis Recursos y Servicios/);
  assert.match(resourcesData.html, /Ver las e&#8209;Conferences/);
  assert.match(resourcesData.html, /Ir a Lifelong Learning/);
  assert.match(resourcesData.html, /https:\/\/example\.com\/recursos/);
  assert.match(resourcesData.html, /https:\/\/example\.com\/recurso1\.jpg/);
  assert.match(resourcesData.html, /padding:4px 16px 0;background:#ffffff/);
  assert.match(resourcesData.html, /object-fit:contain/);
  assert.match(resourcesData.html, /font-size:18px/);
  assert.match(resourcesData.html, /font-family:Arial,Helvetica,sans-serif/);
  assert.doesNotMatch(resourcesData.html, /font-family:Georgia/);
  assert.match(resourcesData.html, /word-break:normal;overflow-wrap:normal;hyphens:none/);
  assert.doesNotMatch(resourcesData.html, /font-size:24px;line-height:1\.05;font-weight:400/);
  assert.match(resourcesData.html, /https:\/\/prdt\.iese\.edu\/l\/501101\/2026-06-12\/5s844k\/501101\/17812791544YzhOyL9\/e5e5fbd5157dc7e81053039cbcc75b2b\.png/);
  assert.match(resourcesData.html, /https:\/\/prdt\.iese\.edu\/l\/501101\/2026-06-12\/5s844c\/501101\/1781279154BaE9OsAs\/f7afb8211e6ed511c4f674ad5cde78b1\.png/);
  assert.match(resourcesData.text, /Recursos extra:/);

  const defaultResourceImagesPreview = await fetch(`${baseUrl}/api/preview`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...sampleInput,
      showResources: "true",
      resourceTitle1: "Default recurso 1",
      resourceUrl1: "https://example.com/default-1",
      resourceImageUrl1: "",
    }),
  });
  assert.equal(defaultResourceImagesPreview.status, 200);
  const defaultResourceImagesData = await defaultResourceImagesPreview.json();
  assert.match(defaultResourceImagesData.html, /https:\/\/prdt\.iese\.edu\/l\/501101\/2026-06-12\/5s844g\/501101\/1781279154M2o9AKlP\/83aad42c35c5229cc7381cce991290c7\.png/);

  const hiddenResourcesPreview = await fetch(`${baseUrl}/api/preview`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...sampleInput,
      showResources: "false",
      resourceTitle1: "No debe verse recurso",
      resourceUrl1: "https://example.com/no",
    }),
  });
  assert.equal(hiddenResourcesPreview.status, 200);
  const hiddenResourcesData = await hiddenResourcesPreview.json();
  assert.doesNotMatch(hiddenResourcesData.html, /No debe verse recurso/);

  const hiddenOtherEventsPreview = await fetch(`${baseUrl}/api/preview`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...sampleInput,
      showOtherEvents: "false",
      otherEventsTitle: "No debe verse otros eventos",
      otherEventsItems: "Evento oculto | Fecha | Hora | https://example.com/oculto",
    }),
  });
  assert.equal(hiddenOtherEventsPreview.status, 200);
  const hiddenOtherEventsData = await hiddenOtherEventsPreview.json();
  assert.doesNotMatch(hiddenOtherEventsData.html, /No debe verse otros eventos/);
  assert.doesNotMatch(hiddenOtherEventsData.html, /Evento oculto/);

  const hiddenFullWidthImagePreview = await fetch(`${baseUrl}/api/preview`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...sampleInput,
      showFullWidthImage: "false",
      fullWidthImageUrl: "https://example.com/no-full-width.jpg",
      fullWidthImageLinkUrl: "https://example.com/no-full-width-link",
    }),
  });
  assert.equal(hiddenFullWidthImagePreview.status, 200);
  const hiddenFullWidthImageData = await hiddenFullWidthImagePreview.json();
  assert.doesNotMatch(hiddenFullWidthImageData.html, /no-full-width\.jpg/);
  assert.doesNotMatch(hiddenFullWidthImageData.html, /no-full-width-link/);

  const hiddenEventsCtaPreview = await fetch(`${baseUrl}/api/preview`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...sampleInput,
      showEventsCta: "false",
      eventsCtaLabel: "No debe verse CTA",
      eventsCtaUrl: "https://example.com/no-cta",
    }),
  });
  assert.equal(hiddenEventsCtaPreview.status, 200);
  const hiddenEventsCtaData = await hiddenEventsCtaPreview.json();
  assert.doesNotMatch(hiddenEventsCtaData.html, /No debe verse CTA/);
  assert.doesNotMatch(hiddenEventsCtaData.html, /https:\/\/example\.com\/no-cta/);
  assert.match(hiddenEventsCtaData.html, /height:32px;min-height:32px;line-height:32px/);
  assert.doesNotMatch(hiddenEventsCtaData.html, /showEventsCtaSpacer/);
});
