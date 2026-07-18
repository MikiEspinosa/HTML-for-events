const form = document.querySelector("#eventForm");
const modeBadge = document.querySelector("#modeBadge");
const configBadge = document.querySelector("#configBadge");
const connectSalesforceButton = document.querySelector("#connectSalesforceButton");
const resultBox = document.querySelector("#resultBox");
const htmlPreview = document.querySelector("#htmlPreview");
const payloadPreview = document.querySelector("#payloadPreview");
const sampleButton = document.querySelector("#sampleButton");
const generateCopyButton = document.querySelector("#generateCopyButton");
const aiStatus = document.querySelector("#aiStatus");
const speakerCount = document.querySelector("#speakerCount");
const otherEventsCount = document.querySelector("#otherEventsCount");
const emailLanguage = document.querySelector("#emailLanguage");
const landingUrl = document.querySelector("#landingUrl");
const importLandingButton = document.querySelector("#importLandingButton");
const landingImportStatus = document.querySelector("#landingImportStatus");
const buttons = [...document.querySelectorAll("button")];

let previewTimer;
let config = null;

const defaultHeroImageUrl =
  "https://prdt.iese.edu/l/501101/2026-06-03/5s7bkf/501101/1780498447BcWEOZY0/1_coaching.png";
const defaultFullWidthImageUrl =
  "https://prdt.iese.edu/l/501101/2026-07-17/5sb92f/501101/1784336531UBju9cOe/full_width_example__1_.png";

const sample = {
  eventName: "AI Breakfast Madrid",
  showEventName: true,
  emailLanguage: "es",
  templateVariant: "generic",
  eventType: "Desayuno ejecutivo",
  showEventType: true,
  emailHeadline: "Some moments are too good to miss",
  showEmailHeadline: true,
  ctaLabel: "REGISTRARSE",
  eventBrief:
    "Desayuno ejecutivo para equipos de marketing y ventas. Queremos invitar a alumni y directivos a una sesion practica sobre como preparar datos, automatizaciones y reporting antes de lanzar nuevos casos de uso con IA. Tono cercano, profesional e IESE.",
  eventDescription: "",
  heroImageUrl: defaultHeroImageUrl,
  heroImageFocus: "50",
  heroTitleText: "Navegando la explosion de la",
  showHeroTitle: true,
  heroSubtitleText: "Inteligencia Artificial",
  showHeroSubtitle: true,
  showHeroTextShadow: true,
  showHeroSubtitleHighlight: true,
  eventDate: "2026-06-24",
  startTime: "09:30",
  endTime: "11:00",
  timezone: "Europe/Madrid",
  showTimezone: true,
  registrationUrl: "https://example.com/eventos/ai-breakfast-madrid",
  venue: "Impact Hub Alameda",
  showVenue: true,
  city: "Madrid",
  showCity: true,
  speakerCount: "2",
  speakerName1: "Laura Martinez",
  speakerTitle1: "Directora de Marketing",
  speakerPhotoUrl1: "",
  speakerPhotoFocus1: "50",
  showSpeakerDescription1: true,
  speakerDescription1:
    "Especialista en marketing B2B y adopción de inteligencia artificial en equipos comerciales.",
  speakerName2: "Javier Gomez",
  speakerTitle2: "Profesor de Direccion Comercial",
  speakerPhotoUrl2: "",
  speakerPhotoFocus2: "50",
  showSpeakerDescription2: true,
  speakerDescription2:
    "Ha acompañado a equipos directivos en procesos de transformación comercial y crecimiento.",
  agendaItems:
    "09:30 | Welcome remarks | IESE Business School\n09:45 | Keynote session | Laura Martinez\n10:30 | Networking coffee\n11:00 | Closing remarks | Equipo IESE",
  showAgenda: true,
  showOtherEvents: true,
  otherEventsTitle: "Otros eventos para ti",
  otherEventsCount: "2",
  otherEventTitle1: "Data-driven pricing: from strategy to tactics and analytics",
  otherEventDescription1:
    "Una sesion para transformar estrategia, analitica y pricing en decisiones comerciales accionables.",
  otherEventVenue1: "IESE Madrid",
  otherEventDate1: "Thursday, June 11",
  otherEventTime1: "3:00 pm",
  otherEventUrl1: "https://www.iese.edu/events/",
  otherEventTitle2: "IA en la cadena de suministro",
  otherEventDescription2:
    "Claves para aplicar inteligencia artificial a operaciones, prevision y eficiencia en supply chain.",
  otherEventVenue2: "IESE Barcelona",
  otherEventDate2: "Lunes, 11 de junio",
  otherEventTime2: "3:00 pm",
  otherEventUrl2: "https://www.iese.edu/events/",
  hostName: "Equipo de marketing",
  agendaUrl: "https://example.com/eventos/ai-breakfast-madrid/agenda",
  closingTitle: "Construyendo futuro juntos",
  closingText:
    "Nos encantara compartir una sesion con ideas practicas, networking y perspectiva IESE.",
  showResources: true,
  resourceTitle1: "Mis Recursos y Servicios",
  resourceUrl1: "https://www.iese.edu/alumni/",
  resourceImageUrl1:
    "https://prdt.iese.edu/l/501101/2026-06-12/5s844g/501101/1781279154M2o9AKlP/83aad42c35c5229cc7381cce991290c7.png",
  resourceTitle2: "Ver las e-Conferences",
  resourceUrl2: "https://www.iese.edu/",
  resourceImageUrl2:
    "https://prdt.iese.edu/l/501101/2026-06-12/5s844k/501101/17812791544YzhOyL9/e5e5fbd5157dc7e81053039cbcc75b2b.png",
  resourceTitle3: "Ir a Lifelong Learning",
  resourceUrl3: "https://www.iese.edu/lifelong-learning/",
  resourceImageUrl3:
    "https://prdt.iese.edu/l/501101/2026-06-12/5s844c/501101/1781279154BaE9OsAs/f7afb8211e6ed511c4f674ad5cde78b1.png",
  showEventsCta: true,
  eventsCtaLabel: "Ver todos los eventos en la web",
  eventsCtaUrl: "https://www.iese.edu/events/",
  showFullWidthImage: true,
  fullWidthImageUrl: defaultFullWidthImageUrl,
  fullWidthImageLinkUrl: "https://www.iese.edu/events/",
  senderName: "Marketing Team",
  senderEmail: "iese@iese.edu",
  replyToEmail: "events@example.com",
};

const languageDefaults = {
  es: {
    eventType: "Desayuno ejecutivo",
    emailHeadline: "Some moments are too good to miss",
    heroTitleText: "Navegando la explosion de la",
    heroSubtitleText: "Inteligencia Artificial",
    ctaLabel: "REGISTRARSE",
    otherEventsTitle: "Otros eventos para ti",
    eventsCtaLabel: "Ver todos los eventos en la web",
    closingTitle: "Construyendo futuro juntos",
    closingText:
      "Nos encantara compartir una sesion con ideas practicas, networking y perspectiva IESE.",
  },
  en: {
    eventType: "Executive breakfast",
    emailHeadline: "Some moments are too good to miss",
    heroTitleText: "Navigating the AI",
    heroSubtitleText: "explosion",
    ctaLabel: "REGISTER",
    otherEventsTitle: "Other events for you",
    eventsCtaLabel: "See all events on the website",
    closingTitle: "Building the future together",
    closingText:
      "We look forward to sharing a session with practical ideas, networking, and an IESE perspective.",
  },
};

function setResult(message, type = "neutral") {
  resultBox.textContent = message;
  resultBox.className = `result show ${type}`;
}

function setResultHtml(html, type = "neutral") {
  resultBox.innerHTML = html;
  resultBox.className = `result show ${type}`;
}

function clearResult() {
  resultBox.textContent = "";
  resultBox.className = "result";
}

function setAiStatus(message, type = "neutral") {
  aiStatus.textContent = message;
  aiStatus.className = `inline-status ${type}`;
}

function setLandingImportStatus(message, type = "neutral") {
  landingImportStatus.textContent = message;
  landingImportStatus.className = `inline-status ${type}`;
}

function setLoading(loading) {
  buttons.forEach((button) => {
    button.disabled = loading;
  });
}

function formData() {
  return Object.fromEntries(new FormData(form).entries());
}

function updateSpeakerFields() {
  const count = Number(speakerCount.value || 0);
  document.querySelectorAll(".speaker-editor").forEach((section) => {
    const index = Number(section.dataset.speakerIndex);
    section.hidden = index > count;
  });
}

function updateOtherEventFields() {
  const count = Number(otherEventsCount?.value || 0);
  document.querySelectorAll(".other-event-editor").forEach((section) => {
    const index = Number(section.dataset.otherEventIndex);
    section.hidden = index > count;
  });
}

function updateSpeakerPhotoPreview(index) {
  const input = form.elements[`speakerPhotoUrl${index}`];
  const preview = document.querySelector(`[data-photo-preview="${index}"]`);
  if (!input || !preview) return;

  const url = input.value.trim();
  if (url) {
    preview.classList.add("has-image");
    preview.style.backgroundImage = `url("${url.replaceAll('"', "%22")}")`;
    const horizontalFocus = form.elements[`speakerPhotoFocus${index}`]?.value || "50";
    preview.style.backgroundPosition = `${horizontalFocus}% center`;
  } else {
    preview.classList.remove("has-image");
    preview.style.backgroundImage = "";
    preview.style.backgroundPosition = "50% center";
  }
}

function updateAllSpeakerPhotoPreviews() {
  for (let index = 1; index <= 5; index += 1) updateSpeakerPhotoPreview(index);
}

function applyLanguageDefaults() {
  const currentLanguage = emailLanguage.value || "es";
  const previousLanguage = currentLanguage === "en" ? "es" : "en";
  const nextDefaults = languageDefaults[currentLanguage];
  const previousDefaults = languageDefaults[previousLanguage];

  for (const [fieldName, nextValue] of Object.entries(nextDefaults)) {
    const field = form.elements[fieldName];
    if (!field) continue;
    const currentValue = field.value.trim();
    if (!currentValue || currentValue === previousDefaults[fieldName]) {
      field.value = nextValue;
    }
  }
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  });
  const payload = await response.json();
  if (!response.ok) {
    const message = payload.details
      ? `${payload.error} ${JSON.stringify(payload.details)}`
      : payload.error;
    throw new Error(message || "La solicitud no se pudo completar.");
  }
  return payload;
}

function renderPreview(data) {
  htmlPreview.srcdoc = data.html;
  payloadPreview.textContent = JSON.stringify(data.payload, null, 2);
}

function requiredBasicsAreReady() {
  const data = formData();
  return Boolean(
      data.eventName &&
      (data.eventDescription || data.eventBrief) &&
      data.eventDate &&
      data.startTime &&
      data.timezone &&
      data.registrationUrl &&
      data.senderName &&
      data.senderEmail,
  );
}

async function updatePreview({ quiet = true } = {}) {
  if (!requiredBasicsAreReady()) return;

  try {
    const data = await fetchJson("/api/preview", {
      method: "POST",
      body: JSON.stringify(formData()),
    });
    renderPreview(data);
    if (!quiet) setResult("Previsualizacion actualizada.", "success");
  } catch (error) {
    if (!quiet) setResult(error.message, "error");
  }
}

function debouncePreview() {
  clearTimeout(previewTimer);
  previewTimer = setTimeout(() => updatePreview({ quiet: true }), 300);
}

function setFieldValue(field, value) {
  if (field.length && !field.tagName) {
    [...field].forEach((item) => {
      if (item.type === "checkbox") item.checked = Boolean(value);
    });
    return;
  }

  if (field.type === "checkbox") {
    field.checked = Boolean(value);
  } else {
    field.value = value ?? "";
  }
}

function applyValues(values) {
  for (const [name, value] of Object.entries(values)) {
    const field = form.elements[name];
    if (!field) continue;
    setFieldValue(field, value);
  }
}

function applyDefaults(defaults) {
  for (const [name, value] of Object.entries(defaults || {})) {
    const field = form.elements[name];
    if (!field || field.value) continue;
    field.value = value ?? "";
  }
}

async function loadConfig() {
  config = await fetchJson("/api/config");

  const configured =
    config.status.hasBusinessUnitId &&
    (config.status.hasStaticAccessToken || config.status.hasRefreshTokenFlow);
  if (modeBadge) {
    modeBadge.textContent = config.dryRun ? "Simulacion" : "Modo real";
    modeBadge.classList.toggle("real", !config.dryRun);
  }
  if (configBadge) {
    configBadge.textContent = configured ? "Credenciales listas" : "Credenciales pendientes";
  }
  if (connectSalesforceButton) {
    connectSalesforceButton.hidden =
      config.status.hasStaticAccessToken || config.status.hasRefreshTokenFlow;
  }

  applyDefaults(config.defaults);
}

document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((item) => item.classList.remove("active"));
    document.querySelectorAll(".tab-panel").forEach((item) => item.classList.remove("active"));
    tab.classList.add("active");
    document.querySelector(`#${tab.dataset.tab}Tab`).classList.add("active");
  });
});

sampleButton.addEventListener("click", () => {
  clearResult();
  setAiStatus("Ejemplo cargado. Puedes generar el cuerpo con IA.", "success");
  applyValues(sample);
  updateSpeakerFields();
  updateOtherEventFields();
  updateAllSpeakerPhotoPreviews();
  updatePreview({ quiet: false });
});

importLandingButton.addEventListener("click", async () => {
  const url = landingUrl.value.trim();
  if (!url) {
    setLandingImportStatus("Introduce la URL de una landing de apply.iese.edu.", "error");
    landingUrl.focus();
    return;
  }

  clearResult();
  setLoading(true);
  setLandingImportStatus("Analizando la landing...", "neutral");
  try {
    const imported = await fetchJson("/api/import-event-url", {
      method: "POST",
      body: JSON.stringify({ url }),
    });
    applyValues(imported.fields || {});
    updateSpeakerFields();
    updateOtherEventFields();
    updateAllSpeakerPhotoPreviews();
    await updatePreview({ quiet: true });
    const count = imported.importedFields?.length || Object.keys(imported.fields || {}).length;
    setLandingImportStatus(`${count} campos importados. Revisa los datos antes de generar el email.`, "success");
  } catch (error) {
    setLandingImportStatus(error.message, "error");
  } finally {
    setLoading(false);
  }
});

emailLanguage.addEventListener("change", () => {
  applyLanguageDefaults();
  if (form.elements.eventDescription.value.trim()) {
    setAiStatus("Idioma actualizado. Vuelve a generar el cuerpo para reescribirlo en el idioma elegido.", "neutral");
  }
  updatePreview({ quiet: true });
});

generateCopyButton.addEventListener("click", async () => {
  clearResult();
  const data = formData();

  if (!data.eventName || !data.eventBrief) {
    setAiStatus("Completa el nombre del evento y la descripcion aproximada.", "error");
    return;
  }

  setLoading(true);
  setAiStatus("Generando cuerpo del mail...", "neutral");

  try {
    const generated = await fetchJson("/api/generate-copy", {
      method: "POST",
      body: JSON.stringify(data),
    });
    form.elements.eventDescription.value = generated.body;
    setAiStatus(
      generated.source === "openai"
        ? "Cuerpo generado con IA."
        : "Cuerpo generado en modo demo local.",
      generated.source === "openai" ? "success" : "neutral",
    );
    await updatePreview({ quiet: false });
  } catch (error) {
    setAiStatus(error.message, "error");
  } finally {
    setLoading(false);
  }
});

form.addEventListener("input", () => {
  clearResult();
  updateAllSpeakerPhotoPreviews();
  debouncePreview();
});

speakerCount.addEventListener("change", () => {
  updateSpeakerFields();
  updatePreview({ quiet: true });
});

otherEventsCount?.addEventListener("change", () => {
  updateOtherEventFields();
  updatePreview({ quiet: true });
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const action = event.submitter?.dataset.action || "preview";

  setLoading(true);
  clearResult();

  try {
    const data = await fetchJson(action === "create" ? "/api/list-email" : "/api/preview", {
      method: "POST",
      body: JSON.stringify(formData()),
    });

    if (data.html) renderPreview(data);

    if (action === "create") {
      if (data.dryRun) {
        setResult(
          "HTML y payload generados en modo seguro. No se ha llamado a Pardot.",
          "success",
        );
      } else {
        const id = data.result?.data?.id ?? data.result?.data?.data?.id ?? "sin ID en respuesta";
        const link = data.pardotHtmlUrl
          ? `<a href="${data.pardotHtmlUrl}" target="_blank" rel="noreferrer">Abrir template en Pardot</a>`
          : "";
        setResultHtml(`<div>Email template creado en Pardot. ID: ${id}</div>${link}`, "success");
      }
    } else {
      setResult("Previsualizacion actualizada.", "success");
    }
  } catch (error) {
    setResult(error.message, "error");
  } finally {
    setLoading(false);
  }
});

loadConfig()
  .then(() => {
    updateSpeakerFields();
    updateOtherEventFields();
    updateAllSpeakerPhotoPreviews();
    htmlPreview.srcdoc =
      "<!doctype html><body style='font-family:Arial,sans-serif;padding:24px;color:#657386'>Completa los campos obligatorios para ver el email.</body>";
  })
  .catch((error) => {
    setResult(error.message, "error");
  });
