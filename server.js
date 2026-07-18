import http from "node:http";
import { createHash, randomBytes } from "node:crypto";
import { createReadStream, existsSync, readFileSync } from "node:fs";
import { readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DefaultAzureCredential, getBearerTokenProvider } from "@azure/identity";
import * as cheerio from "cheerio";
import OpenAI from "openai";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const envFilePath = path.join(__dirname, ".env");
const publicDir = path.join(__dirname, "public");
const templatesDir = path.join(__dirname, "templates");
const defaultHeroImageUrl =
  "https://prdt.iese.edu/l/501101/2026-06-03/5s7bkf/501101/1780498447BcWEOZY0/1_coaching.png";
const resourceImageUrls = [
  "https://prdt.iese.edu/l/501101/2026-06-12/5s844g/501101/1781279154M2o9AKlP/83aad42c35c5229cc7381cce991290c7.png",
  "https://prdt.iese.edu/l/501101/2026-06-12/5s844k/501101/17812791544YzhOyL9/e5e5fbd5157dc7e81053039cbcc75b2b.png",
  "https://prdt.iese.edu/l/501101/2026-06-12/5s844c/501101/1781279154BaE9OsAs/f7afb8211e6ed511c4f674ad5cde78b1.png",
];
const htmlTemplateFiles = {
  generic: "event-invite-generic.html",
  membership: "event-invite-membership.html",
  weeklyCalendar: "event-invite-weekly-calendar.html",
};

class AppError extends Error {
  constructor(message, status = 400, details = undefined) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export function loadEnvFile(filePath = path.join(__dirname, ".env")) {
  if (!existsSync(filePath)) return;

  const source = readFileSync(filePath, "utf8");
  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const equalsIndex = line.indexOf("=");
    if (equalsIndex === -1) continue;

    const key = line.slice(0, equalsIndex).trim();
    let value = line.slice(equalsIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

function boolFromEnv(value, fallback = false) {
  if (value === undefined || value === "") return fallback;
  return ["1", "true", "yes", "on"].includes(String(value).toLowerCase());
}

function visibleSwitch(input, key, fallback = true) {
  if (input[key] === undefined || input[key] === null || input[key] === "") return fallback;
  return ["1", "true", "yes", "on"].includes(String(input[key]).toLowerCase());
}

function cleanString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function optionalString(value) {
  const cleaned = cleanString(value);
  return cleaned || undefined;
}

function requireString(value, label) {
  const cleaned = cleanString(value);
  if (!cleaned) throw new AppError(`Falta ${label}.`);
  return cleaned;
}

function firstNonEmpty(...values) {
  for (const value of values) {
    const cleaned = cleanString(value);
    if (cleaned) return cleaned;
  }
  return "";
}

function compactText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function textWithBreaks($, element) {
  const clone = $(element).clone();
  clone.find("br").replaceWith("\n");
  return clone.text().replace(/\u00a0/g, " ").replace(/[ \t]+/g, " ").replace(/ *\n */g, "\n").trim();
}

function parseClock(value) {
  const match = compactText(value).match(/(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)?/i);
  if (!match) return "";
  let hour = Number(match[1]);
  const minute = match[2] || "00";
  const meridiem = (match[3] || "").toLowerCase();
  if (meridiem.startsWith("p") && hour < 12) hour += 12;
  if (meridiem.startsWith("a") && hour === 12) hour = 0;
  return `${String(hour).padStart(2, "0")}:${minute}`;
}

export function validateIeseLandingUrl(value) {
  let url;
  try {
    url = new URL(cleanString(value));
  } catch {
    throw new AppError("La URL de la landing no es valida.");
  }
  if (url.protocol !== "https:" || url.hostname.toLowerCase() !== "apply.iese.edu") {
    throw new AppError("Solo se pueden importar landings HTTPS de apply.iese.edu.");
  }
  return url;
}

export function parseIeseLandingHtml(html, sourceUrl) {
  const $ = cheerio.load(html);
  const fields = {};
  const set = (name, value) => {
    const cleaned = typeof value === "string" ? value.trim() : value;
    if (cleaned !== "" && cleaned !== undefined && cleaned !== null) fields[name] = cleaned;
  };

  const eventName = compactText($("#event_header_name_name").first().text()) ||
    compactText($("meta[property='og:title']").attr("content")?.split("|")[0]);
  const eventType = compactText($("#event_header_name_type").first().text());
  const city = compactText($("#event_header_name_place").first().text());
  const language = compactText($("meta[name='language']").attr("content")).toLowerCase();
  const heroStyle = $("#event-header-container").attr("style") || "";
  const heroImage = heroStyle.match(/background-image\s*:\s*url\((['\"]?)(.*?)\1\)/i)?.[2] ||
    $("meta[property='og:image']").attr("content");

  const infoSections = $(".iese_event_info_section_subsection").toArray();
  const sectionText = (label) => {
    const section = infoSections.find((item) =>
      compactText($(item).find(".iese_event_info_section_subtitle").text()).toLowerCase().includes(label),
    );
    if (!section) return "";
    const clone = $(section).clone();
    clone.find(".iese_event_info_section_subtitle").remove();
    return textWithBreaks($, clone);
  };
  const dateTimeText = sectionText("date and time") || sectionText("fecha y hora");
  const location = compactText(sectionText("location") || sectionText("ubicaci"));
  const timeMatches = [...dateTimeText.matchAll(/\d{1,2}:\d{2}\s*(?:a\.?m\.?|p\.?m\.?)?/gi)];
  const scriptText = $("script").map((_, item) => $(item).html() || "").get().join("\n");
  const eventDate = scriptText.match(/calendar_date\s*=\s*["'](\d{4}-\d{2}-\d{2})["']/)?.[1] ||
    scriptText.match(/["']date["']\s*:\s*["'](\d{4}-\d{2}-\d{2})["']/)?.[1];

  const contentRoot = $(".event_templateblock_form_full").filter((_, item) => $(item).find("#payment_form").length > 0).last();
  const contentBlock = contentRoot.find("#payment_form").first().prevAll("div").first();
  const paragraphs = contentBlock.find("p").toArray();
  let agendaIndex = paragraphs.findIndex((item) => /^agenda:?$/i.test(compactText($(item).text())));
  if (agendaIndex < 0) agendaIndex = paragraphs.findIndex((item) => /agenda/i.test(compactText($(item).text())));
  const descriptionParts = paragraphs
    .slice(0, agendaIndex >= 0 ? agendaIndex : undefined)
    .map((item) => textWithBreaks($, item))
    .filter(Boolean);
  const agendaText = agendaIndex >= 0 && paragraphs[agendaIndex + 1]
    ? textWithBreaks($, paragraphs[agendaIndex + 1])
    : "";
  const agendaItems = agendaText.split(/\n+/).map((line) => {
    const match = line.match(/^\s*(\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?)?)\s+(.+)$/i);
    return match ? `${parseClock(match[1])} | ${compactText(match[2])}` : compactText(line);
  }).filter(Boolean).join("\n");

  set("eventName", eventName);
  set("emailHeadline", eventName);
  set("heroTitleText", eventName);
  set("eventType", eventType);
  set("heroSubtitleText", eventType);
  set("city", city);
  const timezoneByCity = { london: "Europe/London", madrid: "Europe/Madrid", barcelona: "Europe/Madrid" };
  set("timezone", timezoneByCity[city.toLowerCase()]);
  set("heroImageUrl", heroImage);
  set("emailLanguage", language.startsWith("es") ? "es" : language ? "en" : "");
  set("eventDate", eventDate);
  set("startTime", timeMatches[0] ? parseClock(timeMatches[0][0]) : "");
  set("endTime", timeMatches[1] ? parseClock(timeMatches[1][0]) : "");
  set("venue", location);
  set("registrationUrl", sourceUrl);
  set("eventBrief", descriptionParts.join("\n\n"));
  set("agendaItems", agendaItems);
  set("ctaLabel", language.startsWith("es") ? "REGISTRARSE" : "REGISTER");
  if (eventType) {
    const speaker = eventType.match(/(?:guest speaker|ponente)\s*:\s*(.+)/i)?.[1];
    if (speaker) {
      set("speakerCount", "1");
      set("speakerName1", speaker);
      set("speakerTitle1", language.startsWith("es") ? "Ponente" : "Guest speaker");
    }
  }
  for (const [field, toggle] of [["eventName", "showEventName"], ["eventType", "showEventType"], ["emailHeadline", "showEmailHeadline"], ["city", "showCity"], ["venue", "showVenue"], ["timezone", "showTimezone"], ["agendaItems", "showAgenda"]]) {
    if (fields[field]) fields[toggle] = true;
  }
  return { fields, importedFields: Object.keys(fields), sourceUrl };
}

async function importIeseLanding(value) {
  let url = validateIeseLandingUrl(value);
  for (let redirects = 0; redirects <= 3; redirects += 1) {
    const response = await fetch(url, {
      redirect: "manual",
      signal: AbortSignal.timeout(12000),
      headers: { Accept: "text/html,application/xhtml+xml", "User-Agent": "AURA-HTML-Generator/1.0" },
    });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location || redirects === 3) throw new AppError("La landing tiene demasiadas redirecciones.", 502);
      url = validateIeseLandingUrl(new URL(location, url).toString());
      continue;
    }
    if (!response.ok) throw new AppError(`No se pudo descargar la landing (HTTP ${response.status}).`, 502);
    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("text/html")) throw new AppError("La URL no devuelve una pagina HTML.");
    const html = await response.text();
    if (Buffer.byteLength(html, "utf8") > 5 * 1024 * 1024) throw new AppError("La landing es demasiado grande.");
    return parseIeseLandingHtml(html, url.toString());
  }
  throw new AppError("No se pudo importar la landing.", 502);
}

function toInteger(value, label, { required = false } = {}) {
  const cleaned = cleanString(String(value ?? ""));
  if (!cleaned) {
    if (required) throw new AppError(`Falta ${label}.`);
    return undefined;
  }

  const parsed = Number(cleaned);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new AppError(`${label} debe ser un ID numerico positivo.`);
  }
  return parsed;
}

export function parseCsvIds(value, label = "IDs") {
  const cleaned = cleanString(value);
  if (!cleaned) return [];

  return cleaned.split(",").map((item) => {
    const parsed = Number(item.trim());
    if (!Number.isInteger(parsed) || parsed <= 0) {
      throw new AppError(`${label} debe contener IDs numericos separados por coma.`);
    }
    return parsed;
  });
}

export function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatInlineMarkdown(value) {
  return escapeHtml(value).replace(
    /\*\*([^*\n][\s\S]*?[^*\n])\*\*/g,
    "<strong>$1</strong>",
  );
}

function formatEmailBodyHtml(value) {
  const normalized = cleanString(value).replace(/\r\n/g, "\n");
  if (!normalized) return "";

  return normalized
    .split(/\n{2,}/)
    .map((paragraph) => {
      const lines = paragraph
        .split("\n")
        .map((line) => formatInlineMarkdown(line.trim()))
        .filter(Boolean);
      if (lines.length === 0) return "";
      return `<p style="margin:0 0 14px;color:#000000;font-size:13px;line-height:1.58;">${lines.join("<br>")}</p>`;
    })
    .filter(Boolean)
    .join("");
}

function formatEmailBodyText(value) {
  return cleanString(value).replace(/\*\*([^*]+)\*\*/g, "$1");
}

export function renderTemplate(template, data) {
  const rawTokens = [];
  const protectedTemplate = template
    .replace(/{{{([^}]+)}}}/g, (match) => {
      const token = `__RAW_TOKEN_${rawTokens.length}__`;
      rawTokens.push(match);
      return token;
    })
    .replace(/{{(?:Unsubscribe|EmailPreferenceCenter)}}/g, (match) => {
    const token = `__RAW_TOKEN_${rawTokens.length}__`;
    rawTokens.push(match);
    return token;
  });

  return protectedTemplate
    .replace(/{{#([a-zA-Z0-9_]+)}}([\s\S]*?){{\/\1}}/g, (_, key, block) =>
      data[key] ? block : "",
    )
    .replace(/{{([a-zA-Z0-9_]+)}}/g, (_, key) => data[key] ?? "")
    .replace(/__RAW_TOKEN_(\d+)__/g, (_, index) => rawTokens[Number(index)] ?? "");
}

function normalizeUrl(value, label) {
  const cleaned = requireString(value, label);
  try {
    const url = new URL(cleaned);
    if (!["http:", "https:"].includes(url.protocol)) {
      throw new Error("unsupported protocol");
    }
    return url.toString();
  } catch {
    throw new AppError(`${label} debe ser una URL http o https valida.`);
  }
}

function normalizeOptionalUrl(value, label) {
  const cleaned = optionalString(value);
  if (!cleaned) return "";
  return normalizeUrl(cleaned, label);
}

function normalizeEmailLanguage(value) {
  return cleanString(value).toLowerCase() === "en" ? "en" : "es";
}

function normalizeTemplateVariant(value) {
  const cleaned = cleanString(value);
  return htmlTemplateFiles[cleaned] ? cleaned : "generic";
}

function emailCopy(language) {
  const lang = normalizeEmailLanguage(language);
  if (lang === "en") {
    return {
      eventFallbackType: "Event",
      headline: "Some moments are too good to miss",
      heroTitle: "IESE invites you",
      ctaLabel: "REGISTER",
      speakersLabel: "Speakers",
      agendaLabel: "Agenda",
      agendaFullLabel: "Full agenda",
      resourcesLabel: "Extra resources",
      otherEventsTitle: "Other events for you",
      eventsCtaLabel: "See all events on the website",
      moreInfoLabel: "More information",
      dateLabel: "Date",
      timeLabel: "Time",
      locationLabel: "Location",
      photoPlaceholder: "Photo",
      eventItemFallback: "Event",
      closingTitle: "Building the future together",
      closingText:
        "We look forward to sharing a session with practical ideas, networking, and an IESE perspective.",
      hostName: "Marketing team",
      preheaderPrefix: "Reserve your place for",
      unsubscribeLabel: "Unsubscribe",
      preferencesLabel: "Preferences",
      salutation: "Best regards,",
      personalizeTitle: "Personalize your experience",
      personalizeText:
        "We care about sending you only the information that is relevant to you. Click the button below to access your preferences page and customize the content you want to receive from us.",
      preferencesDynamicContent: "{{{dynamic_content_864}}}",
      legalText:
        "This email was sent by IESE Business School. You are receiving it because you registered for, attended, or requested information about IESE activities. Please do not reply to this automated email.",
      legalModuleHtml:
        '<table align="center" border="0" cellpadding="0" cellspacing="0" role="presentation" style="background:#E6E6E6;background-color:#E6E6E6;width:100%;"><tbody><tr><td style="direction:ltr;font-size:0px;padding:10px;text-align:center;vertical-align:top;"><div class="mj-column-per-100 outlook-group-fix" style="font-size:13px;text-align:left;direction:ltr;display:inline-block;vertical-align:top;width:100%;"><table border="0" cellpadding="0" cellspacing="0" role="presentation" style="vertical-align:top;" width="100%"><tbody><tr><td align="left" style="font-size:0px;padding:0px 0px 0px 0px;word-break:break-word;"><div style="font-family:Arial, Helvetica, sans-serif;font-size:11px;line-height:13px;text-align:left;text-decoration:none;color:#888;"><p>Your email address is included in our data base because you registered as a subscriber, participated in a IESE event, or accepted sharing your data with third parties. If you would like to unsubscribe and no longer receive these notifications, you can do so <a href="{{{EmailPreferenceCenter_654}}}" rel="nofollow,noreferrer" style="text-decoration:underline;color:black;"><strong>here</strong></a>. If you would like to exercise your rights or obtain additional information related to data protection, you can send an email to <a href="mailto:gdpr@iese.edu" style="color:black;text-decoration:underline;"><u><strong>gdpr@iese.edu</strong></u></a>. You can also consult our <span style="color:#000000;">data privacy policy</span> <a href="https://www.iese.edu/privacy-policy/" style="color:black;text-decoration:underline;"><strong>here</strong></a>.</p></div></td></tr></tbody></table></div></td></tr></tbody></table>',
      localIntro:
        "We invite you to **{eventName}**, an **IESE Business School** session designed to share practical ideas, connect with other professionals, and explore the key topics shaping the moment.",
      localDatePrefix: "on",
      localTimePrefix: "from",
      localLocationPrefix: "at",
      localSpeakerPrefix: " We will be joined by",
      localDetailsPrefix: "The session will take place",
      localReserve:
        "Reserve your place to join us and make the most of an agenda designed to spark conversation, learning, and new opportunities.",
      aiRole:
        "You are a senior copywriter for IESE Business School. Write a polished event invitation email body in professional, direct, elegant English. Return only the email body, with no subject, no greeting, no sign-off, and no final CTA. Use 2 or 3 short paragraphs separated by a blank line. Highlight key details with **bold** using this exact format: **text**. Do not use other markdown. Use the event brief only as guidance for angle, audience, tone, and priorities: do not copy it literally, do not quote it, and do not preserve rough prompt wording. Use the structured event information as the source of truth. Do not invent details that are not present.",
    };
  }

  return {
    eventFallbackType: "Evento",
    headline: "Some moments are too good to miss",
    heroTitle: "IESE te invita",
    ctaLabel: "REGISTRARSE",
    speakersLabel: "Ponentes",
    agendaLabel: "Agenda",
    agendaFullLabel: "Agenda completa",
    resourcesLabel: "Recursos extra",
    otherEventsTitle: "Otros eventos para ti",
    eventsCtaLabel: "Ver todos los eventos en la web",
    moreInfoLabel: "Mas informacion",
    dateLabel: "Fecha",
    timeLabel: "Hora",
    locationLabel: "Lugar",
    photoPlaceholder: "Foto",
    eventItemFallback: "Evento",
    closingTitle: "Construyendo futuro juntos",
    closingText:
      "Nos encantara compartir una sesion con ideas practicas, networking y perspectiva IESE.",
    hostName: "Equipo de marketing",
    preheaderPrefix: "Reserva tu plaza para",
    unsubscribeLabel: "Baja",
    preferencesLabel: "Preferencias",
    salutation: "Un saludo,",
    personalizeTitle: "Personaliza tu experiencia",
    personalizeText:
      "Nos importa que recibas solo la informacion que es relevante para ti. Haz clic en el boton a continuacion para acceder a tu pagina de preferencias y personalizar los contenidos que quieres recibir de nosotros.",
    preferencesDynamicContent: "{{{dynamic_content_867}}}",
    legalText:
      "Este email ha sido enviado por IESE Business School. Lo recibes porque te has registrado, has asistido o has solicitado informacion sobre actividades de IESE. Por favor, no respondas a este email automatico.",
    legalModuleHtml:
      '<table align="center" border="0" cellpadding="0" cellspacing="0" role="presentation" style="background:#E6E6E6;background-color:#E6E6E6;width:100%;"><tbody><tr><td style="direction:ltr;font-size:0px;padding:10px;text-align:center;vertical-align:top;"><div class="mj-column-per-100 outlook-group-fix" style="font-size:13px;text-align:left;direction:ltr;display:inline-block;vertical-align:top;width:100%;"><table border="0" cellpadding="0" cellspacing="0" role="presentation" style="vertical-align:top;" width="100%"><tbody><tr><td align="left" style="font-size:0px;padding:0px 0px 0px 0px;word-break:break-word;"><div style="font-family:Arial, Helvetica, sans-serif;font-size:11px;line-height:13px;text-align:left;text-decoration:none;color:#888;"><p>Tu direcci&oacute;n de Email se encuentra registrada en nuestra base de datos porque te inscribiste como suscriptor, participaste en un evento de IESE o aceptaste compartir tus datos con terceros. Si deseas darte de baja de la suscripci&oacute;n y no recibir estas notificaciones puedes actualizarlo <a href="{{{EmailPreferenceCenter_654}}}" rel="nofollow,noreferrer" style="text-decoration:underline;color:black;"><strong><u>aqu&iacute;</u></strong></a>. Si quisieras ejercer alguno de tus derechos u obtener m&aacute;s informaci&oacute;n relacionada con Protecci&oacute;n de Datos puedes escribir un mail a <a href="mailto:gdpr@iese.edu" style="text-decoration:underline;color:black;">gdpr@iese.edu</a>. Tambi&eacute;n puedes consultar nuestra <span style="color:#000000;">Pol&iacute;tica de Privacidad</span> haciendo clic <a href="https://www.iese.edu/privacy-policy/"><strong>aqu&iacute;</strong></a>.</p><!--#COLETILLA_FIN#--></div></td></tr></tbody></table></div></td></tr></tbody></table>',
    localIntro:
      "Te invitamos a **{eventName}**, una sesion de **IESE Business School** pensada para compartir ideas practicas, conectar con otros profesionales y profundizar en los temas clave del momento.",
    localDatePrefix: "el",
    localTimePrefix: "de",
    localLocationPrefix: "en",
    localSpeakerPrefix: " Contaremos con",
    localDetailsPrefix: "La sesion tendra lugar",
    localReserve:
      "Reserva tu plaza para acompanarnos y aprovechar una agenda disenada para generar conversacion, aprendizaje y nuevas oportunidades.",
    aiRole:
      "Eres un copywriter senior de IESE Business School. Escribe el cuerpo de una invitacion a un evento en espanol profesional, directo y elegante. Devuelve solo el cuerpo del email, sin asunto, sin saludo inicial, sin despedida y sin CTA final. Usa 2 o 3 parrafos breves separados por una linea en blanco. Resalta datos clave con **negrita** usando este formato exacto: **texto**. No uses otros formatos markdown. Usa la descripcion aproximada solo como guia de enfoque, audiencia, tono y prioridades: no la copies literalmente, no la cites y no conserves frases de prompt o notas internas. Usa la informacion estructurada del evento como fuente principal. No inventes datos que no aparezcan.",
  };
}

function formatEventDate(yyyyMmDd, language = "es") {
  if (!yyyyMmDd) return "";
  const [year, month, day] = yyyyMmDd.split("-").map(Number);
  if (!year || !month || !day) return yyyyMmDd;

  const date = new Date(year, month - 1, day, 12, 0, 0);
  return new Intl.DateTimeFormat(normalizeEmailLanguage(language) === "en" ? "en-US" : "es-ES", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(date);
}

function buildTimeRange(startTime, endTime, timezone, { showTimezone = true } = {}) {
  const start = cleanString(startTime);
  const end = cleanString(endTime);
  const zone = showTimezone ? cleanString(timezone) : "";

  if (start && end) return `${start} - ${end}${zone ? ` (${zone})` : ""}`;
  if (start) return `${start}${zone ? ` (${zone})` : ""}`;
  return zone || "";
}

function parseAgendaItems(value) {
  const cleaned = cleanString(value);
  if (!cleaned) return [];

  return cleaned
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [time = "", title = "", detail = ""] = line.split("|").map((part) => part.trim());
      return {
        time,
        title: title || line,
        detail,
      };
    });
}

function buildAgendaHtml(items) {
  return items
    .map(
      (item) => `
        <tr>
          <td style="padding:10px 0;border-top:2px solid #e30613;width:92px;color:#000000;font-size:13px;font-weight:700;vertical-align:top;">
            ${escapeHtml(item.time)}
          </td>
          <td style="padding:10px 0;border-top:2px solid #e30613;color:#000000;font-size:13px;line-height:1.35;vertical-align:top;">
            <strong>${escapeHtml(item.title)}</strong>${item.detail ? `<br><span style="font-size:12px;color:#555555;">${escapeHtml(item.detail)}</span>` : ""}
          </td>
        </tr>`,
    )
    .join("");
}

function buildAgendaText(items) {
  return items
    .map((item) => {
      const detail = item.detail ? ` - ${item.detail}` : "";
      return `${item.time} ${item.title}${detail}`.trim();
    })
    .join("\n");
}

function parseSpeakerCount(value) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) return 1;
  return Math.min(parsed, 5);
}

function collectSpeakers(input) {
  const count = parseSpeakerCount(input.speakerCount);
  const speakers = [];

  for (let index = 1; index <= count; index += 1) {
    const name = optionalString(input[`speakerName${index}`]);
    const title = optionalString(input[`speakerTitle${index}`]);
    const photoUrl = optionalString(input[`speakerPhotoUrl${index}`]);
    const photoFocus = normalizeImageFocus(input[`speakerPhotoFocus${index}`]);
    const description = visibleSwitch(input, `showSpeakerDescription${index}`)
      ? optionalString(input[`speakerDescription${index}`])
      : "";
    if (!name && !title && !photoUrl && !description) continue;
    speakers.push({ name, title, photoUrl, photoFocus, description });
  }

  if (speakers.length === 0) {
    if (input.speakerCount !== undefined && parseSpeakerCount(input.speakerCount) === 0) {
      return speakers;
    }
    const name = optionalString(input.speakerName);
    const title = optionalString(input.speakerTitle);
    const photoUrl = optionalString(input.speakerPhotoUrl);
    const photoFocus = normalizeImageFocus(input.speakerPhotoFocus);
    const description = optionalString(input.speakerDescription);
    if (name || title || photoUrl || description) {
      speakers.push({ name, title, photoUrl, photoFocus, description });
    }
  }

  return speakers;
}

function formatSpeakerLine(speaker) {
  const line = [speaker.name, speaker.title].filter(Boolean).join(" - ");
  return [line, speaker.description].filter(Boolean).join("\n");
}

function buildSpeakersHtml(speakers, copy) {
  return speakers
    .map((speaker) => {
      const name = escapeHtml(speaker.name || "Ponente por confirmar");
      const title = speaker.title ? escapeHtml(speaker.title) : "";
      const description = speaker.description ? formatEmailBodyHtml(speaker.description) : "";
      const photoPlaceholder = escapeHtml(copy.photoPlaceholder);
      const image = speaker.photoUrl
        ? `<img src="${escapeHtml(speaker.photoUrl)}" width="200" height="200" alt="${name}" style="display:block;width:200px;height:200px;object-fit:cover;object-position:${escapeHtml(speaker.photoFocus)};border:0;background:#f3f6f8;">`
        : `<table role="presentation" width="200" height="200" cellpadding="0" cellspacing="0" style="width:200px;height:200px;background:#f3f6f8;border:1px solid #d9d9d9;border-collapse:collapse;"><tr><td align="center" valign="middle" style="color:#777777;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.04em;">${photoPlaceholder}<br>200 x 200</td></tr></table>`;

      return `
        <tr>
          <td style="padding:0 0 18px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
              <tr>
                <td width="200" style="width:200px;vertical-align:top;">
                  ${image}
                </td>
                <td style="padding:0 0 0 18px;vertical-align:middle;">
                  <p style="margin:0;color:#000000;font-size:16px;line-height:1.25;font-weight:800;">${name}</p>
                  ${title ? `<p style="margin:6px 0 0;color:#555555;font-size:13px;line-height:1.4;">${title}</p>` : ""}
                  ${description ? `<div style="margin:10px 0 0;">${description}</div>` : ""}
                </td>
              </tr>
            </table>
          </td>
        </tr>`;
    })
    .join("");
}

function buildSpeakersText(speakers) {
  return speakers.map(formatSpeakerLine).filter(Boolean).join("\n");
}

function collectResources(input) {
  const resources = [];
  for (let index = 1; index <= 3; index += 1) {
    const title = optionalString(input[`resourceTitle${index}`]);
    const url = optionalString(input[`resourceUrl${index}`]);
    const imageUrl = optionalString(input[`resourceImageUrl${index}`]) || resourceImageUrls[index - 1];
    if (!title && !url && !imageUrl) continue;
    resources.push({
      title: title || `Recurso ${index}`,
      url,
      imageUrl,
    });
  }
  return resources;
}

function buildResourcesHtml(resources) {
  if (resources.length === 0) return "";
  const cells = resources
    .slice(0, 3)
    .map((resource) => {
      const title = escapeHtml(resource.title).replaceAll("e-Conferences", "e&#8209;Conferences");
      const titleLength = resource.title.length;
      const titleFontSize = titleLength > 38 ? 15 : titleLength > 26 ? 17 : 18;
      const titleLineHeight = titleLength > 38 ? 1.12 : 1.14;
      const url = resource.url ? escapeHtml(resource.url) : "#";
      const image = resource.imageUrl
        ? `<img src="${escapeHtml(resource.imageUrl)}" width="170" height="130" alt="${title}" style="display:block;width:100%;max-width:170px;height:130px;object-fit:contain;border:0;border-radius:6px 6px 0 0;background:#eeeeee;">`
        : `<div style="width:100%;height:130px;line-height:130px;background:#eeeeee;border-radius:6px 6px 0 0;">&nbsp;</div>`;
      return `
        <td width="33.333%" valign="top" style="width:33.333%;padding:0 8px;">
          <a href="${url}" style="display:block;text-decoration:none;color:#000000;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:separate;background:#eeeeee;border-radius:6px;overflow:hidden;">
              <tr>
                <td align="center" style="padding:0;">
                  ${image}
                </td>
              </tr>
              <tr>
                <td align="center" valign="middle" style="height:112px;padding:12px 9px 16px;color:#000000;font-family:Arial,Helvetica,sans-serif;font-size:${titleFontSize}px;line-height:${titleLineHeight};font-weight:700;word-break:normal;overflow-wrap:normal;hyphens:none;mso-line-height-rule:exactly;">
                  ${title}
                </td>
              </tr>
            </table>
          </a>
        </td>`;
    })
    .join("");
  return `
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
                  <tr>${cells}</tr>
                </table>`;
}

function buildResourcesText(resources) {
  return resources
    .map((resource) => [resource.title, resource.url].filter(Boolean).join(": "))
    .join("\n");
}

function parseOtherEvents(value) {
  const cleaned = cleanString(value);
  if (!cleaned) return [];

  return cleaned
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [title = "", date = "", time = "", url = ""] = line.split("|").map((part) => part.trim());
      return {
        title: title || line,
        date,
        time,
        url,
      };
    })
    .filter((item) => item.title);
}

function parseOtherEventsCount(value) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) return 0;
  return Math.min(parsed, 10);
}

function collectOtherEvents(input, copy = emailCopy(input.emailLanguage)) {
  const count = parseOtherEventsCount(input.otherEventsCount);
  const events = [];

  for (let index = 1; index <= count; index += 1) {
    const title = optionalString(input[`otherEventTitle${index}`]);
    const description = optionalString(input[`otherEventDescription${index}`]);
    const venue = optionalString(input[`otherEventVenue${index}`]);
    const date = optionalString(input[`otherEventDate${index}`]);
    const time = optionalString(input[`otherEventTime${index}`]);
    const url = optionalString(input[`otherEventUrl${index}`]);
    if (!title && !description && !venue && !date && !time && !url) continue;
    events.push({ title: title || `${copy.eventItemFallback} ${index}`, description, venue, date, time, url });
  }

  if (events.length === 0 && input.otherEventsItems !== undefined) {
    return parseOtherEvents(input.otherEventsItems);
  }

  return events;
}

function buildOtherEventsHtml(items, copy) {
  if (items.length === 0) return "";

  return items
    .map((item) => {
      const dateTime = [item.date, item.time].filter(Boolean).join(" | ");
      const meta = [item.venue, dateTime].filter(Boolean).join(" · ");
      const link = item.url
        ? `<a href="${escapeHtml(item.url)}" style="color:#e30613;text-decoration:none;font-size:12px;line-height:1.3;font-weight:800;letter-spacing:0.03em;text-transform:uppercase;">${escapeHtml(copy.moreInfoLabel)} &rarr;</a>`
        : "";
      return `
                  <tr>
                    <td style="padding:0 0 12px;">
                      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border-top:2px solid #e30613;background:#ffffff;">
                        <tr>
                          <td style="padding:12px 0 4px;color:#000000;font-size:17px;line-height:1.25;font-weight:800;">
                            ${escapeHtml(item.title)}
                          </td>
                        </tr>
                        ${item.description ? `<tr><td style="padding:0 0 7px;color:#000000;font-size:13px;line-height:1.45;">${escapeHtml(item.description)}</td></tr>` : ""}
                        ${meta ? `<tr><td style="padding:0 0 8px;color:#555555;font-size:12px;line-height:1.4;font-weight:700;">${escapeHtml(meta)}</td></tr>` : ""}
                        ${link ? `<tr><td style="padding:0;">${link}</td></tr>` : ""}
                      </table>
                    </td>
                  </tr>`;
    })
    .join("");
}

function buildOtherEventsText(items) {
  return items
    .map((item) => {
      const dateTime = [item.date, item.time].filter(Boolean).join(" | ");
      const meta = [item.venue, dateTime].filter(Boolean).join(" - ");
      return [item.title, item.description, meta, item.url].filter(Boolean).join(" - ");
    })
    .join("\n");
}

function buildHeroOverlayHtml({
  heroImageUrl,
  heroImageFocus,
  heroTitleText,
  heroSubtitleText,
  registrationUrl,
  ctaLabel,
  showHeroTitle,
  showHeroSubtitle,
  showHeroTextShadow,
  showHeroSubtitleHighlight,
}) {
  if (!heroImageUrl) return "";

  const imageShade = showHeroTextShadow ? "background:rgba(0,0,0,0.12);" : "";
  const textShade = showHeroTextShadow
    ? "background:rgba(0,0,0,0.34);"
    : "background:transparent;";
  const titleHtml = showHeroTitle && heroTitleText
    ? `<div style="margin:0 0 4px;color:#ffffff;font-size:24px;line-height:1.08;font-weight:800;text-shadow:0 1px 4px rgba(0,0,0,0.35);">${escapeHtml(heroTitleText)}</div>`
    : "";
  const subtitleStyle = showHeroSubtitleHighlight
    ? "display:inline-block;margin:0 0 16px;background:#e30613;color:#ffffff;font-size:23px;line-height:1.05;font-weight:800;padding:3px 6px;text-shadow:none;"
    : "display:inline-block;margin:0 0 16px;background:transparent;color:#ffffff;font-size:23px;line-height:1.05;font-weight:800;padding:0;text-shadow:0 1px 4px rgba(0,0,0,0.35);";
  const subtitleHtml = showHeroSubtitle && heroSubtitleText
    ? `<div style="${subtitleStyle}">${escapeHtml(heroSubtitleText)}</div>`
    : "";

  return `
                <table role="presentation" width="100%" height="250" cellpadding="0" cellspacing="0" background="${escapeHtml(heroImageUrl)}" style="width:100%;max-width:620px;height:250px;max-height:250px;border-collapse:collapse;background-image:url('${escapeHtml(heroImageUrl)}');background-size:auto 100%;background-repeat:no-repeat;background-position:${escapeHtml(heroImageFocus)};background-color:#333333;">
                  <tr>
                    <td valign="top" style="height:250px;max-height:250px;padding:28px 28px 20px;${imageShade}">
                      <div style="display:inline-block;max-width:430px;padding:10px 12px 12px;${textShade}">
                        ${titleHtml}
                        ${subtitleHtml}
                        <div>
                          <a href="${escapeHtml(registrationUrl)}" style="display:inline-block;background:#e30613;color:#ffffff;text-decoration:none;font-weight:800;font-size:12px;letter-spacing:0.02em;padding:11px 28px;border-radius:4px;">
                            ${escapeHtml(ctaLabel)} &rarr;
                          </a>
                        </div>
                      </div>
                    </td>
                  </tr>
                </table>`;
}

function normalizeImageFocus(value) {
  const raw = (optionalString(value) || "50").toLowerCase();
  const legacyPositions = {
    "left top": 0,
    "left center": 0,
    "left bottom": 0,
    "center top": 50,
    "center center": 50,
    "center bottom": 50,
    "right top": 100,
    "right center": 100,
    "right bottom": 100,
  };
  const numeric = Object.hasOwn(legacyPositions, raw)
    ? legacyPositions[raw]
    : Number(raw.replace("%", ""));
  const horizontal = Number.isFinite(numeric)
    ? Math.min(100, Math.max(0, Math.round(numeric)))
    : 50;
  return `${horizontal}% center`;
}

function deriveListEmailName(input) {
  const explicit = optionalString(input.listEmailName);
  if (explicit) return explicit;

  const eventDate = cleanString(input.eventDate);
  const eventName = requireString(input.eventName, "el nombre del evento");
  return `[Evento] ${eventDate || "sin fecha"} - ${eventName}`;
}

function deriveSubject(input) {
  return (
    optionalString(input.subject) ||
    `Invitacion: ${requireString(input.eventName, "el nombre del evento")}`
  );
}

function buildTemplateData(input, { html = false } = {}) {
  const language = normalizeEmailLanguage(input.emailLanguage);
  const copy = emailCopy(language);
  const showEventName = visibleSwitch(input, "showEventName");
  const showEventType = visibleSwitch(input, "showEventType");
  const showEmailHeadline = visibleSwitch(input, "showEmailHeadline");
  const showHeroTitle = visibleSwitch(input, "showHeroTitle");
  const showHeroSubtitle = visibleSwitch(input, "showHeroSubtitle");
  const showHeroTextShadow = visibleSwitch(input, "showHeroTextShadow");
  const showHeroSubtitleHighlight = visibleSwitch(input, "showHeroSubtitleHighlight");
  const showTimezone = visibleSwitch(input, "showTimezone");
  const showVenue = visibleSwitch(input, "showVenue");
  const showCity = visibleSwitch(input, "showCity");
  const showAgenda = visibleSwitch(input, "showAgenda");
  const showOtherEvents = visibleSwitch(input, "showOtherEvents");
  const showResources = visibleSwitch(input, "showResources");
  const showEventsCta = visibleSwitch(input, "showEventsCta");
  const showFullWidthImage = visibleSwitch(input, "showFullWidthImage");
  const venue = optionalString(input.venue);
  const city = optionalString(input.city);
  const visibleLocationBits = [
    showVenue ? venue : "",
    showCity ? city : "",
  ].filter(Boolean);
  const visibleLocationLine = visibleLocationBits.join(", ");
  const locationPrimary = showVenue && venue ? venue : showCity && city ? city : showVenue ? "Online" : "";
  const locationSecondary = showVenue && venue && showCity && city ? visibleLocationLine : "";
  const agendaItems = showAgenda ? parseAgendaItems(input.agendaItems) : [];
  const otherEvents = showOtherEvents ? collectOtherEvents(input, copy) : [];
  const resources = showResources ? collectResources(input) : [];
  const speakers = collectSpeakers(input);
  const speakerLine = buildSpeakersText(speakers);
  const eventName = requireString(input.eventName, "el nombre del evento");
  const eventType = optionalString(input.eventType) || copy.eventFallbackType;
  const emailHeadline = optionalString(input.emailHeadline) || copy.headline;
  const registrationUrl = normalizeUrl(input.registrationUrl, "la URL de registro");
  const ctaLabel = optionalString(input.ctaLabel) || copy.ctaLabel;
  const heroImageUrl = optionalString(input.heroImageUrl);
  const heroImageFocus = normalizeImageFocus(input.heroImageFocus);
  const heroTitleText = optionalString(input.heroTitleText);
  const heroSubtitleText = optionalString(input.heroSubtitleText);
  const eventsCtaUrl = showEventsCta
    ? normalizeOptionalUrl(input.eventsCtaUrl, "la URL del CTA de eventos")
    : "";
  const fullWidthImageUrl = showFullWidthImage
    ? normalizeOptionalUrl(input.fullWidthImageUrl, "la imagen a anchura completa")
    : "";
  const fullWidthImageLinkUrl = fullWidthImageUrl
    ? normalizeOptionalUrl(input.fullWidthImageLinkUrl, "el enlace de la imagen a anchura completa") ||
      eventsCtaUrl ||
      registrationUrl
    : "";
  const eventsCtaLabel = optionalString(input.eventsCtaLabel) || copy.eventsCtaLabel;

  const data = {
    emailLanguage: language,
    eventName,
    eventType,
    emailHeadline,
    showEventName: showEventName ? "1" : "",
    showEventType: showEventType ? "1" : "",
    showEmailHeadline: showEmailHeadline ? "1" : "",
    showHeroTitle: showHeroTitle ? "1" : "",
    showHeroSubtitle: showHeroSubtitle ? "1" : "",
    showHeroTextShadow: showHeroTextShadow ? "1" : "",
    showHeroSubtitleHighlight: showHeroSubtitleHighlight ? "1" : "",
    showResources: resources.length > 0 ? "1" : "",
    showEventsCta: eventsCtaUrl ? "1" : "",
    showEventsCtaSpacer: !eventsCtaUrl && fullWidthImageUrl ? "1" : "",
    showFullWidthImage: fullWidthImageUrl ? "1" : "",
    showLocationLine: visibleLocationLine ? "1" : "",
    showLocationBlock: locationPrimary ? "1" : "",
    showLocationSecondary: locationSecondary ? "1" : "",
    heroTitle: copy.heroTitle,
    eventDescription: formatEmailBodyText(
      requireString(
        firstNonEmpty(input.eventDescription, input.eventBrief),
        "el cuerpo del email o el brief del evento",
      ),
    ),
    eventDescriptionHtml: formatEmailBodyHtml(
      firstNonEmpty(input.eventDescription, input.eventBrief),
    ),
    eventDate: requireString(input.eventDate, "la fecha del evento"),
    eventDateHuman: formatEventDate(input.eventDate, language),
    eventTimeRange: buildTimeRange(
      requireString(input.startTime, "la hora de inicio"),
      input.endTime,
      input.timezone,
      { showTimezone },
    ),
    locationLine: visibleLocationLine,
    locationPrimary,
    locationSecondary,
    locationBlockLinesHtml: [
      locationPrimary ? escapeHtml(locationPrimary) : "",
      locationSecondary ? escapeHtml(locationSecondary) : "",
    ].filter(Boolean).join("<br>"),
    venue: showVenue ? venue || "Online" : "",
    city: showCity ? city : "",
    cityHeading: showCity && city ? `${city}.` : showVenue && venue ? `${venue}.` : "",
    registrationUrl,
    ctaLabel,
    agendaUrl: showAgenda ? optionalString(input.agendaUrl) : "",
    agendaRowsHtml: buildAgendaHtml(agendaItems),
    agendaRowsText: buildAgendaText(agendaItems),
    otherEventsTitle: optionalString(input.otherEventsTitle) || copy.otherEventsTitle,
    otherEventsRowsHtml: buildOtherEventsHtml(otherEvents, copy),
    otherEventsRowsText: buildOtherEventsText(otherEvents),
    resourcesHtml: buildResourcesHtml(resources),
    resourcesText: buildResourcesText(resources),
    resourcesLabel: copy.resourcesLabel,
    dateLabel: copy.dateLabel,
    timeLabel: copy.timeLabel,
    locationLabel: copy.locationLabel,
    eventsCtaLabel,
    eventsCtaUrl,
    fullWidthImageUrl,
    fullWidthImageLinkUrl,
    speakerRowsHtml: buildSpeakersHtml(speakers, copy),
    speakerRowsText: speakerLine,
    speakersLabel: copy.speakersLabel,
    agendaLabel: copy.agendaLabel,
    agendaFullLabel: copy.agendaFullLabel,
    heroImageUrl,
    heroTitleText,
    heroSubtitleText,
    heroOverlayHtml: buildHeroOverlayHtml({
      heroImageUrl,
      heroImageFocus,
      heroTitleText,
      heroSubtitleText,
      registrationUrl,
      ctaLabel,
      showHeroTitle,
      showHeroSubtitle,
      showHeroTextShadow,
      showHeroSubtitleHighlight,
    }),
    closingTitle: optionalString(input.closingTitle) || copy.closingTitle,
    closingText: optionalString(input.closingText) || copy.closingText,
    speakerLine,
    speakerName: speakers.length > 0 ? speakers[0].name : undefined,
    speakerTitle: speakers.length > 0 ? speakers[0].title : undefined,
    hostName: optionalString(input.hostName) || copy.hostName,
    salutation: copy.salutation,
    unsubscribeLabel: copy.unsubscribeLabel,
    preferencesLabel: copy.preferencesLabel,
    personalizeTitle: copy.personalizeTitle,
    personalizeText: copy.personalizeText,
    preferencesDynamicContent: copy.preferencesDynamicContent,
    legalText: copy.legalText,
    legalModuleHtml: copy.legalModuleHtml,
    preheader:
      optionalString(input.preheader) ||
      `${copy.preheaderPrefix} ${eventName}.`,
  };

  if (!data.locationLine && showVenue) {
    data.locationLine = "Online";
    data.showLocationLine = "1";
    data.showLocationBlock = "1";
    data.locationPrimary = "Online";
    data.locationBlockLinesHtml = "Online";
  }
  if (!data.cityHeading && data.locationPrimary) data.cityHeading = `${data.locationPrimary}.`;

  if (!html) return data;
  const escaped = Object.fromEntries(
    Object.entries(data).map(([key, value]) => [key, escapeHtml(value)]),
  );
  escaped.agendaRowsHtml = data.agendaRowsHtml;
  escaped.otherEventsRowsHtml = data.otherEventsRowsHtml;
  escaped.eventDescriptionHtml = data.eventDescriptionHtml;
  escaped.speakerRowsHtml = data.speakerRowsHtml;
  escaped.legalModuleHtml = data.legalModuleHtml;
  escaped.locationBlockLinesHtml = data.locationBlockLinesHtml;
  escaped.heroOverlayHtml = data.heroOverlayHtml;
  escaped.resourcesHtml = data.resourcesHtml;
  return escaped;
}

function buildGenerationContext(input) {
  const language = normalizeEmailLanguage(input.emailLanguage);
  const showAgenda = visibleSwitch(input, "showAgenda");
  const showVenue = visibleSwitch(input, "showVenue");
  const showCity = visibleSwitch(input, "showCity");
  const agendaItems = showAgenda ? parseAgendaItems(input.agendaItems) : [];
  const speakers = collectSpeakers(input);
  const otherEvents = visibleSwitch(input, "showOtherEvents") ? collectOtherEvents(input, emailCopy(language)) : [];
  const venue = showVenue ? cleanString(input.venue) : "";
  const city = showCity ? cleanString(input.city) : "";
  return {
    emailLanguage: language,
    outputLanguage: language === "en" ? "English" : "Spanish",
    templateVariant: normalizeTemplateVariant(input.templateVariant),
    eventName: requireString(input.eventName, "el nombre del evento"),
    eventType: optionalString(input.eventType) || emailCopy(language).eventFallbackType,
    eventBriefGuidance: requireString(input.eventBrief, "la descripcion aproximada del evento"),
    emailHeadline: optionalString(input.emailHeadline),
    heroTitleText: optionalString(input.heroTitleText),
    heroSubtitleText: optionalString(input.heroSubtitleText),
    eventDate: optionalString(input.eventDate),
    eventDateHuman: input.eventDate ? formatEventDate(input.eventDate, language) : undefined,
    startTime: optionalString(input.startTime),
    endTime: optionalString(input.endTime),
    timezone: visibleSwitch(input, "showTimezone") ? optionalString(input.timezone) : "",
    eventTimeRange: buildTimeRange(input.startTime, input.endTime, input.timezone, {
      showTimezone: visibleSwitch(input, "showTimezone"),
    }),
    venue,
    city,
    locationLine: [venue, city].filter(Boolean).join(", "),
    speakerLine: buildSpeakersText(speakers),
    speakers: speakers.map((speaker) => ({
      name: speaker.name,
      title: speaker.title,
      description: speaker.description,
    })),
    agendaRowsText: buildAgendaText(agendaItems),
    agenda: agendaItems,
    otherEvents,
    registrationUrl: optionalString(input.registrationUrl),
  };
}

function generateLocalEmailBody(input) {
  const context = buildGenerationContext(input);
  const copy = emailCopy(context.emailLanguage);
  const details = [
    context.eventDateHuman ? `${copy.localDatePrefix} ${context.eventDateHuman}` : "",
    context.eventTimeRange ? `${copy.localTimePrefix} ${context.eventTimeRange}` : "",
    context.locationLine ? `${copy.localLocationPrefix} ${context.locationLine}` : "",
  ]
    .filter(Boolean)
    .join(" ");
  const speakerNames = context.speakers
    .map((speaker) => [speaker.name, speaker.title].filter(Boolean).join(", "))
    .filter(Boolean)
    .join("; ");
  const speaker = speakerNames ? `${copy.localSpeakerPrefix} ${speakerNames}.` : "";
  const agendaHint = context.agenda.length > 0
    ? ` La agenda incluye ${context.agenda.slice(0, 3).map((item) => item.title).filter(Boolean).join(", ")}.`
    : "";
  const briefTopic = context.eventBriefGuidance
    .replace(/\b(notas?\s+internas?|internas?|tono|estilo|prompt|sugerencias?|notas?|queremos|quiero|debe|deberia|hablar de)\b[:\s]*/gi, "")
    .split(/[.。!\n]/)
    .map((part) => part.trim())
    .filter(Boolean)[0];
  const valueSentence = briefTopic
    ? `La sesion abordara ${briefTopic.charAt(0).toLowerCase()}${briefTopic.slice(1)}, con una perspectiva practica orientada a directivos y alumni.`
    : copy.localIntro.replace("{eventName}", context.eventName);

  return [
    copy.localIntro.replace("{eventName}", context.eventName),
    `${valueSentence}${speaker}${agendaHint}`,
    details
      ? `${copy.localDetailsPrefix} **${details}**.\n${copy.localReserve}`
      : copy.localReserve,
  ].join("\n\n");
}

function buildGenerationPrompt(context) {
  return [
    "Redacta el cuerpo del email de invitacion a partir de estos datos estructurados.",
    "La propiedad eventBriefGuidance contiene notas aproximadas del usuario: interpretalas como intencion, enfoque, publico, tono y temas; no las copies literalmente.",
    "Prioriza nombre del evento, sobretitulo/tipo, fecha, hora, ubicacion, ponentes y agenda cuando existan.",
    "No incluyas CTA final porque el template ya anade botones de registro.",
    "Datos:",
    JSON.stringify(context, null, 2),
  ].join("\n\n");
}

function extractOpenAiText(payload) {
  if (typeof payload?.output_text === "string" && payload.output_text.trim()) {
    return payload.output_text.trim();
  }

  const text = [];
  for (const item of payload?.output || []) {
    for (const content of item.content || []) {
      if (content.type === "output_text" && content.text) text.push(content.text);
    }
  }

  return text.join("\n").trim();
}

async function generateEmailBodyWithAi(input) {
  const context = buildGenerationContext(input);
  const copy = emailCopy(context.emailLanguage);
  const ai = createAiClient();

  if (!ai) {
    return {
      body: generateLocalEmailBody(input),
      source: "local",
    };
  }

  let payload;

  try {
    payload = await ai.client.responses.create(
      buildAiResponseRequest(ai, copy.aiRole, buildGenerationPrompt(context)),
    );
  } catch (error) {
    throw new AppError(
      "OpenAI no pudo generar el cuerpo del email.",
      error.status || error.code || 502,
      {
        status: error.status,
        code: error.code,
        type: error.type,
        parameter: error.param,
      },
    );
  }

  const body = extractOpenAiText(payload);
  if (!body) {
    throw new AppError("OpenAI no devolvio texto para el cuerpo del email.", 502, payload);
  }

  return {
    body,
    source: "openai",
  };
}

export function buildAiResponseRequest(ai, instructions, prompt) {
  if (ai.provider === "azure") {
    return {
      model: ai.model,
      input: `${instructions}\n\n${prompt}`,
    };
  }

  return {
    model: ai.model,
    instructions,
    input: prompt,
  };
}

function azureOpenAiBaseUrl(endpoint) {
  return `${endpoint.trim().replace(/\/+$/, "")}/openai/v1`;
}

export function resolveAiConfiguration(env = process.env) {
  const azureEndpoint = env.AZURE_OPENAI_ENDPOINT?.trim();
  const azureDeployment = env.AZURE_OPENAI_DEPLOYMENT?.trim();

  if (azureEndpoint && azureDeployment) {
    return {
      provider: "azure",
      authentication: env.AZURE_OPENAI_API_KEY ? "api-key" : "managed-identity",
      baseURL: azureOpenAiBaseUrl(azureEndpoint),
      model: azureDeployment,
    };
  }

  if (env.OPENAI_API_KEY) {
    return {
      provider: "openai",
      authentication: "api-key",
      model: env.OPENAI_MODEL || "gpt-5.4-mini",
    };
  }

  return null;
}

function createAiClient(env = process.env) {
  const config = resolveAiConfiguration(env);
  if (!config) return null;

  if (config.provider === "azure") {
    const apiKey =
      config.authentication === "api-key"
        ? env.AZURE_OPENAI_API_KEY
        : getBearerTokenProvider(
            new DefaultAzureCredential(),
            "https://ai.azure.com/.default",
          );

    return {
      client: new OpenAI({ apiKey, baseURL: config.baseURL }),
      model: config.model,
      provider: config.provider,
    };
  }

  return {
    client: new OpenAI({ apiKey: env.OPENAI_API_KEY }),
    model: config.model,
    provider: config.provider,
  };
}

function buildSenderOptions(input) {
  const senderUserId = toInteger(input.senderUserId, "Sender user ID");
  if (senderUserId) {
    return [{ type: "specific_user", userId: senderUserId }];
  }

  const senderName = optionalString(input.senderName);
  const senderEmail = optionalString(input.senderEmail);
  if (!senderName && !senderEmail && optionalString(input.emailTemplateId)) {
    return undefined;
  }
  if (!senderName || !senderEmail) {
    throw new AppError(
      "Configura nombre y email del remitente, o indica un Email template ID que ya los defina.",
    );
  }

  return [{ type: "general_user", name: senderName, address: senderEmail }];
}

function buildReplyToOptions(input) {
  const replyToUserId = toInteger(input.replyToUserId, "Reply-to user ID");
  if (replyToUserId) return [{ type: "specific_user", userId: replyToUserId }];

  const replyToEmail = optionalString(input.replyToEmail);
  if (!replyToEmail) return undefined;
  return [{ type: "general_address", address: replyToEmail }];
}

export function buildEmailTemplatePayload(input, rendered) {
  const campaignId = toInteger(input.campaignId, "Campaign ID", { required: true });
  const trackerDomainId = toInteger(input.trackerDomainId, "Tracker domain ID", { required: true });

  const payload = {
    name: deriveListEmailName(input),
    campaignId,
    trackerDomainId,
    type: "htmlAndText",
    isAutoResponderEmail: false,
    isDripEmail: false,
    isListEmail: true,
    isOneToOneEmail: false,
    senderOptions: buildSenderOptions(input),
    subject: deriveSubject(input),
    htmlMessage: rendered.html,
    textMessage: rendered.text,
  };

  const optionalIntegerFields = {
    folderId: "Folder ID",
  };

  for (const [field, label] of Object.entries(optionalIntegerFields)) {
    const parsed = toInteger(input[field], label);
    if (parsed) payload[field] = parsed;
  }

  return payload;
}

export function buildListEmailPayload(input, rendered) {
  const recipientListIds = parseCsvIds(input.recipientListIds, "Recipient list IDs");
  if (recipientListIds.length === 0) {
    throw new AppError("Falta al menos un recipient list ID.");
  }

  const payload = {
    ...buildEmailTemplatePayload(input, rendered),
    recipientListIds,
  };

  const replyToOptions = buildReplyToOptions(input);
  if (replyToOptions) payload.replyToOptions = replyToOptions;

  const emailTemplateId = toInteger(input.emailTemplateId, "Email template ID");
  if (emailTemplateId) payload.emailTemplateId = emailTemplateId;

  const suppressionListIds = parseCsvIds(input.suppressionListIds, "Suppression list IDs");
  if (suppressionListIds.length > 0) payload.suppressionListIds = suppressionListIds;

  return payload;
}

function mergeDefaultInput(input) {
  const dryRun = boolFromEnv(process.env.PARDOT_DRY_RUN, true);
  const dryRunDefaults = dryRun
    ? {
        campaignId: "12345",
        recipientListIds: "111",
        trackerDomainId: "222",
      }
    : {};
  const configuredDefaults = Object.fromEntries(
    Object.entries(runtimeDefaults()).filter(([, value]) => value !== ""),
  );
  const defaults = { ...dryRunDefaults, ...configuredDefaults };
  const merged = { ...input };

  for (const [key, value] of Object.entries(defaults)) {
    const hasInputValue =
      merged[key] !== undefined && merged[key] !== null && String(merged[key]).trim() !== "";
    if (hasInputValue || value === "") continue;
    merged[key] = value;
  }

  return merged;
}

export async function buildPardotDraft(input) {
  const defaultedInput = mergeDefaultInput(input);
  const templateVariant = normalizeTemplateVariant(defaultedInput.templateVariant);
  const htmlTemplateFile = htmlTemplateFiles[templateVariant];
  const [htmlTemplate, textTemplate] = await Promise.all([
    readFile(path.join(templatesDir, htmlTemplateFile), "utf8"),
    readFile(path.join(templatesDir, "event-invite.txt"), "utf8"),
  ]);

  const html = renderTemplate(htmlTemplate, buildTemplateData(defaultedInput, { html: true }));
  const text = renderTemplate(textTemplate, buildTemplateData(defaultedInput, { html: false }));
  const payload = buildEmailTemplatePayload(defaultedInput, { html, text });

  return { payload, html, text };
}

function runtimeDefaults() {
  return {
    campaignId: process.env.PARDOT_DEFAULT_CAMPAIGN_ID || "",
    recipientListIds: process.env.PARDOT_DEFAULT_RECIPIENT_LIST_IDS || "",
    suppressionListIds: process.env.PARDOT_DEFAULT_SUPPRESSION_LIST_IDS || "",
    emailTemplateId: process.env.PARDOT_DEFAULT_EMAIL_TEMPLATE_ID || "",
    trackerDomainId: process.env.PARDOT_DEFAULT_TRACKER_DOMAIN_ID || "",
    folderId: process.env.PARDOT_DEFAULT_FOLDER_ID || "",
    senderName: process.env.PARDOT_DEFAULT_SENDER_NAME || "",
    senderEmail: process.env.PARDOT_DEFAULT_SENDER_EMAIL || "",
    senderUserId: process.env.PARDOT_DEFAULT_SENDER_USER_ID || "",
    replyToEmail: process.env.PARDOT_DEFAULT_REPLY_TO_EMAIL || "",
    replyToUserId: process.env.PARDOT_DEFAULT_REPLY_TO_USER_ID || "",
    timezone: process.env.DEFAULT_EVENT_TIMEZONE || "Europe/Madrid",
    heroImageUrl: process.env.DEFAULT_HERO_IMAGE_URL || defaultHeroImageUrl,
  };
}

function publicConfig() {
  const defaults = runtimeDefaults();
  return {
    dryRun: boolFromEnv(process.env.PARDOT_DRY_RUN, true),
    apiBaseUrl: process.env.PARDOT_API_BASE_URL || "https://pi.pardot.com",
    defaults: {
      emailTemplateId: defaults.emailTemplateId,
      senderName: defaults.senderName,
      senderEmail: defaults.senderEmail,
      replyToEmail: defaults.replyToEmail,
      timezone: defaults.timezone,
      heroImageUrl: defaults.heroImageUrl,
    },
    status: {
      hasBusinessUnitId: Boolean(process.env.PARDOT_BUSINESS_UNIT_ID),
      hasDefaultCampaign: Boolean(defaults.campaignId),
      hasDefaultRecipientLists: Boolean(defaults.recipientListIds),
      hasStaticAccessToken: Boolean(process.env.PARDOT_ACCESS_TOKEN),
      hasRefreshTokenFlow: Boolean(
        process.env.SALESFORCE_CLIENT_ID &&
          process.env.SALESFORCE_CLIENT_SECRET &&
          process.env.SALESFORCE_REFRESH_TOKEN,
      ),
    },
  };
}

function publicBaseUrl(request) {
  const host = request.headers.host || `localhost:${process.env.PORT || 4173}`;
  const proto = request.headers["x-forwarded-proto"] || "http";
  return `${proto}://${host}`;
}

function oauthCallbackUrl(request) {
  return `${publicBaseUrl(request)}/oauth/callback`;
}

function createPkceVerifier() {
  return randomBytes(48).toString("base64url");
}

function createPkceChallenge(verifier) {
  return createHash("sha256").update(verifier).digest("base64url");
}

function parseCookies(request) {
  const header = request.headers.cookie || "";
  return Object.fromEntries(
    header
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const [key, ...valueParts] = part.split("=");
        return [key, decodeURIComponent(valueParts.join("="))];
      }),
  );
}

function requireOAuthBaseConfig() {
  const loginUrl = process.env.SALESFORCE_LOGIN_URL || "https://login.salesforce.com";
  const clientId = process.env.SALESFORCE_CLIENT_ID;
  const clientSecret = process.env.SALESFORCE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new AppError("Faltan SALESFORCE_CLIENT_ID o SALESFORCE_CLIENT_SECRET en .env.", 500);
  }
  return { loginUrl, clientId, clientSecret };
}

function buildSalesforceAuthorizeUrl(request, codeVerifier) {
  const { loginUrl, clientId } = requireOAuthBaseConfig();
  const authorizeUrl = new URL("/services/oauth2/authorize", loginUrl);
  authorizeUrl.searchParams.set("response_type", "code");
  authorizeUrl.searchParams.set("client_id", clientId);
  authorizeUrl.searchParams.set("redirect_uri", oauthCallbackUrl(request));
  authorizeUrl.searchParams.set("scope", "api pardot_api refresh_token");
  authorizeUrl.searchParams.set("prompt", "consent");
  authorizeUrl.searchParams.set("code_challenge", createPkceChallenge(codeVerifier));
  authorizeUrl.searchParams.set("code_challenge_method", "S256");
  return authorizeUrl.toString();
}

async function updateEnvValue(key, value) {
  const source = existsSync(envFilePath) ? await readFile(envFilePath, "utf8") : "";
  const lines = source ? source.split(/\r?\n/) : [];
  let found = false;
  const nextLines = lines.map((line) => {
    if (line.startsWith(`${key}=`)) {
      found = true;
      return `${key}=${value}`;
    }
    return line;
  });
  if (!found) nextLines.push(`${key}=${value}`);
  await writeFile(envFilePath, nextLines.join("\n").replace(/\n{3,}/g, "\n\n"), "utf8");
  process.env[key] = value;
}

async function exchangeAuthorizationCodeForTokens(request, code, codeVerifier) {
  const { loginUrl, clientId, clientSecret } = requireOAuthBaseConfig();
  const tokenUrl = new URL("/services/oauth2/token", loginUrl);
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: oauthCallbackUrl(request),
    code_verifier: codeVerifier,
  });

  const response = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  const responseText = await response.text();
  let parsed;
  try {
    parsed = JSON.parse(responseText);
  } catch {
    parsed = { raw: responseText };
  }

  if (!response.ok || !parsed.refresh_token) {
    throw new AppError("Salesforce no devolvio refresh_token.", 502, parsed);
  }

  await updateEnvValue("SALESFORCE_REFRESH_TOKEN", parsed.refresh_token);
  return parsed;
}

function extractPardotId(result) {
  return (
    result?.data?.id ??
    result?.data?.data?.id ??
    result?.id ??
    result?.data?.attributes?.id ??
    null
  );
}

export function buildPardotHtmlUrl(result) {
  const id = extractPardotId(result);
  if (!id) return result?.location || "";

  const template = optionalString(process.env.PARDOT_LIST_EMAIL_HTML_URL_TEMPLATE);
  if (template) {
    return template
      .replaceAll("{id}", encodeURIComponent(String(id)))
      .replaceAll("{{id}}", encodeURIComponent(String(id)));
  }

  const appBaseUrl =
    optionalString(process.env.PARDOT_APP_BASE_URL) ||
    optionalString(process.env.PARDOT_API_BASE_URL) ||
    "https://pi.pardot.com";
  return `${appBaseUrl.replace(/\/+$/, "")}/email/draft/edit/id/${encodeURIComponent(String(id))}`;
}

export function buildPardotTemplateUrl(result) {
  const id = extractPardotId(result);
  if (!id) return result?.location || "";

  const template = optionalString(process.env.PARDOT_EMAIL_TEMPLATE_URL_TEMPLATE);
  if (template) {
    return template
      .replaceAll("{id}", encodeURIComponent(String(id)))
      .replaceAll("{{id}}", encodeURIComponent(String(id)));
  }

  const appBaseUrl =
    optionalString(process.env.PARDOT_APP_BASE_URL) ||
    optionalString(process.env.PARDOT_API_BASE_URL) ||
    "https://pi.pardot.com";
  return `${appBaseUrl.replace(/\/+$/, "")}/emailTemplate/read/id/${encodeURIComponent(String(id))}`;
}

async function getSalesforceAccessToken() {
  if (process.env.PARDOT_ACCESS_TOKEN) return process.env.PARDOT_ACCESS_TOKEN;

  const loginUrl = process.env.SALESFORCE_LOGIN_URL || "https://login.salesforce.com";
  const clientId = process.env.SALESFORCE_CLIENT_ID;
  const clientSecret = process.env.SALESFORCE_CLIENT_SECRET;
  const refreshToken = process.env.SALESFORCE_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
    throw new AppError(
      "Faltan credenciales OAuth. Configura PARDOT_ACCESS_TOKEN o SALESFORCE_CLIENT_ID, SALESFORCE_CLIENT_SECRET y SALESFORCE_REFRESH_TOKEN.",
      500,
    );
  }

  const tokenUrl = new URL("/services/oauth2/token", loginUrl);
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
  });

  const response = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  const responseText = await response.text();
  let parsed;
  try {
    parsed = JSON.parse(responseText);
  } catch {
    parsed = { raw: responseText };
  }

  if (!response.ok || !parsed.access_token) {
    throw new AppError("Salesforce no devolvio un access token valido.", 502, parsed);
  }

  return parsed.access_token;
}

async function createPardotListEmail(payload) {
  const businessUnitId = process.env.PARDOT_BUSINESS_UNIT_ID;
  if (!businessUnitId) {
    throw new AppError("Falta PARDOT_BUSINESS_UNIT_ID en .env.", 500);
  }

  const accessToken = await getSalesforceAccessToken();
  const baseUrl = process.env.PARDOT_API_BASE_URL || "https://pi.pardot.com";
  const fields = [
    "id",
    "name",
    "subject",
    "createdAt",
  ].join(",");
  const endpoint = new URL("/api/v5/objects/list-emails", baseUrl);
  endpoint.searchParams.set("fields", fields);

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      "Pardot-Business-Unit-Id": businessUnitId,
      "X-Return-Api-Usage": "true",
    },
    body: JSON.stringify(payload),
  });

  const responseText = await response.text();
  let parsed;
  try {
    parsed = responseText ? JSON.parse(responseText) : {};
  } catch {
    parsed = { raw: responseText };
  }

  if (!response.ok) {
    throw new AppError("Pardot rechazo la creacion del list email.", response.status, parsed);
  }

  return {
    data: parsed,
    apiUsage: response.headers.get("x-api-usage"),
    location: response.headers.get("location"),
  };
}

async function createPardotEmailTemplate(payload) {
  const businessUnitId = process.env.PARDOT_BUSINESS_UNIT_ID;
  if (!businessUnitId) {
    throw new AppError("Falta PARDOT_BUSINESS_UNIT_ID en .env.", 500);
  }

  const accessToken = await getSalesforceAccessToken();
  const baseUrl = process.env.PARDOT_API_BASE_URL || "https://pi.pardot.com";
  const endpointPath = process.env.PARDOT_EMAIL_TEMPLATE_ENDPOINT || "/api/v5/objects/email-templates";
  const fields = ["id", "name", "subject", "createdAt"].join(",");
  const endpoint = new URL(endpointPath, baseUrl);
  endpoint.searchParams.set("fields", fields);

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      "Pardot-Business-Unit-Id": businessUnitId,
      "X-Return-Api-Usage": "true",
    },
    body: JSON.stringify(payload),
  });

  const responseText = await response.text();
  let parsed;
  try {
    parsed = responseText ? JSON.parse(responseText) : {};
  } catch {
    parsed = { raw: responseText };
  }

  if (!response.ok) {
    throw new AppError("Pardot rechazo la creacion del email template.", response.status, parsed);
  }

  return {
    data: parsed,
    apiUsage: response.headers.get("x-api-usage"),
    location: response.headers.get("location"),
  };
}

async function readJsonBody(request) {
  const chunks = [];
  let size = 0;

  for await (const chunk of request) {
    size += chunk.length;
    if (size > 1_000_000) throw new AppError("El cuerpo de la peticion es demasiado grande.", 413);
    chunks.push(chunk);
  }

  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw) return {};

  try {
    return JSON.parse(raw);
  } catch {
    throw new AppError("JSON invalido.");
  }
}

function sendJson(response, status, payload) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(JSON.stringify(payload, null, 2));
}

function sendError(response, error) {
  const status = error.status || 500;
  sendJson(response, status, {
    error: error.message || "Error interno.",
    details: error.details,
  });
}

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".json": "application/json; charset=utf-8",
};

async function serveStatic(request, response) {
  const url = new URL(request.url, "http://localhost");
  const requestedPath = url.pathname === "/" ? "/index.html" : url.pathname;
  const filePath = path.resolve(publicDir, `.${decodeURIComponent(requestedPath)}`);

  if (!filePath.startsWith(publicDir)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  try {
    const info = await stat(filePath);
    if (!info.isFile()) throw new Error("not a file");

    const ext = path.extname(filePath);
    response.writeHead(200, {
      "Content-Type": mimeTypes[ext] || "application/octet-stream",
      "Cache-Control": "no-store",
    });
    createReadStream(filePath).pipe(response);
  } catch {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
  }
}

async function handleApi(request, response) {
  const url = new URL(request.url, "http://localhost");

  if (request.method === "GET" && url.pathname === "/api/config") {
    sendJson(response, 200, publicConfig());
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/preview") {
    const input = await readJsonBody(request);
    const draft = await buildPardotDraft(input);
    sendJson(response, 200, { ...draft, dryRun: true });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/generate-copy") {
    const input = await readJsonBody(request);
    const generated = await generateEmailBodyWithAi(input);
    sendJson(response, 200, generated);
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/import-event-url") {
    const input = await readJsonBody(request);
    const imported = await importIeseLanding(requireString(input.url, "la URL de la landing"));
    sendJson(response, 200, imported);
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/list-email") {
    const input = await readJsonBody(request);
    const draft = await buildPardotDraft(input);
    const dryRun = boolFromEnv(process.env.PARDOT_DRY_RUN, true);

    if (dryRun) {
      sendJson(response, 200, {
        dryRun: true,
        message: "Modo simulacion activo. No se ha llamado a Pardot.",
        ...draft,
      });
      return;
    }

    const result = await createPardotEmailTemplate(draft.payload);
    const pardotHtmlUrl = buildPardotTemplateUrl(result);
    sendJson(response, 201, {
      dryRun: false,
      message: "Email template creado en Pardot.",
      result,
      pardotHtmlUrl,
      payload: draft.payload,
    });
    return;
  }

  sendJson(response, 404, { error: "Ruta API no encontrada." });
}

async function handleOAuth(request, response) {
  const url = new URL(request.url, "http://localhost");

  if (request.method === "GET" && url.pathname === "/oauth/start") {
    const codeVerifier = createPkceVerifier();
    response.writeHead(302, {
      Location: buildSalesforceAuthorizeUrl(request, codeVerifier),
      "Set-Cookie": `sf_pkce_verifier=${encodeURIComponent(codeVerifier)}; HttpOnly; SameSite=Lax; Path=/oauth; Max-Age=600`,
    });
    response.end();
    return;
  }

  if (request.method === "GET" && url.pathname === "/oauth/callback") {
    const error = url.searchParams.get("error");
    if (error) {
      throw new AppError(`Salesforce devolvio error OAuth: ${error}`, 400, {
        description: url.searchParams.get("error_description"),
      });
    }

    const code = url.searchParams.get("code");
    if (!code) throw new AppError("Falta el parametro code en la callback OAuth.", 400);

    const codeVerifier = parseCookies(request).sf_pkce_verifier;
    if (!codeVerifier) {
      throw new AppError("Falta la cookie PKCE. Vuelve a iniciar la conexion con Salesforce.", 400);
    }

    await exchangeAuthorizationCodeForTokens(request, code, codeVerifier);
    response.writeHead(200, {
      "Content-Type": "text/html; charset=utf-8",
      "Set-Cookie": "sf_pkce_verifier=; HttpOnly; SameSite=Lax; Path=/oauth; Max-Age=0",
    });
    response.end(`<!doctype html>
<html lang="es">
  <head><meta charset="utf-8"><title>Salesforce conectado</title></head>
  <body style="font-family:Arial,sans-serif;padding:32px;color:#111">
    <h1>Salesforce conectado</h1>
    <p>Refresh token guardado correctamente. Ya puedes volver a la app.</p>
    <p><a href="/">Volver al generador</a></p>
  </body>
</html>`);
    return;
  }

  sendJson(response, 404, { error: "Ruta OAuth no encontrada." });
}

export function createServer() {
  return http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url, "http://localhost");
      if (url.pathname.startsWith("/api/")) {
        await handleApi(request, response);
        return;
      }
      if (url.pathname.startsWith("/oauth/")) {
        await handleOAuth(request, response);
        return;
      }

      if (request.method !== "GET" && request.method !== "HEAD") {
        sendJson(response, 405, { error: "Metodo no permitido." });
        return;
      }

      await serveStatic(request, response);
    } catch (error) {
      sendError(response, error);
    }
  });
}

loadEnvFile();

if (process.argv[1] === __filename) {
  const port = Number(process.env.PORT || 4173);
  createServer().listen(port, () => {
    console.log(`HTML generator: http://localhost:${port}`);
    console.log(
      boolFromEnv(process.env.PARDOT_DRY_RUN, true)
        ? "Modo simulacion activo."
        : "Modo real activo: las solicitudes crearan email templates en Pardot.",
    );
  });
}
