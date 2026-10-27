// Captures everything public about an event from its apply.iese.edu page:
// first the structured data the page always publishes, then the whole page
// text read by the AI so the body, agenda and speakers are not lost.

import * as cheerio from "cheerio";
import { isClock, isIsoDate } from "./format.js";

export class CaptureError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

export function allowedHosts(env = process.env) {
  return String(env.CAPTURE_ALLOWED_HOSTS || "apply.iese.edu").split(",").map((h) => h.trim().toLowerCase()).filter(Boolean);
}

export function checkCaptureUrl(value, hosts = allowedHosts()) {
  let url;
  try {
    url = new URL(String(value || "").trim());
  } catch {
    throw new CaptureError("El enlace no es válido.");
  }
  if (url.protocol !== "https:" || !hosts.includes(url.hostname.toLowerCase())) {
    throw new CaptureError(`Por ahora solo se pueden leer páginas de ${hosts.join(", ")}.`);
  }
  return url;
}

export async function fetchPage(value, { fetchImpl = fetch, hosts = allowedHosts() } = {}) {
  let url = checkCaptureUrl(value, hosts);
  for (let redirects = 0; redirects <= 3; redirects += 1) {
    const response = await fetchImpl(url, {
      redirect: "manual",
      signal: AbortSignal.timeout(15000),
      headers: { Accept: "text/html,application/xhtml+xml", "User-Agent": "IESE-Email-Studio/1.0" },
    });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location || redirects === 3) throw new CaptureError("La página tiene demasiadas redirecciones.", 502);
      url = checkCaptureUrl(new URL(location, url).toString(), hosts);
      continue;
    }
    if (!response.ok) throw new CaptureError(`No se pudo abrir la página (HTTP ${response.status}).`, 502);
    if (!(response.headers.get("content-type") || "").includes("text/html")) throw new CaptureError("El enlace no es una página web.");
    const raw = await response.text();
    if (raw.length > 40 * 1024 * 1024) throw new CaptureError("La página es demasiado grande.");
    const html = slimPage(raw);
    if (html.length > 5 * 1024 * 1024) throw new CaptureError("La página es demasiado grande.");
    return { html, url: url.toString() };
  }
  throw new CaptureError("No se pudo abrir la página.", 502);
}

// Event pages can embed images and fonts as base64 and carry large style and
// SVG blocks. None of that is read, so drop it before checking the size.
export function slimPage(html) {
  return dropBase64(html
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<svg\b[^>]*>[\s\S]*?<\/svg>/gi, ""));
}

// A scan instead of a regex: a regex over megabytes of base64 overflows the stack.
function dropBase64(html) {
  const isBase64 = (code) => (code >= 65 && code <= 90) || (code >= 97 && code <= 122) || (code >= 47 && code <= 57) || code === 43 || code === 61 || code === 10 || code === 13 || code === 32;
  let out = "";
  let from = 0;
  for (let at = html.indexOf(";base64,"); at !== -1; at = html.indexOf(";base64,", from)) {
    let end = at + 8;
    while (end < html.length && isBase64(html.charCodeAt(end))) end += 1;
    if (end - at > 200) {
      out += `${html.slice(from, at)};base64,`;
    } else {
      out += html.slice(from, end);
    }
    from = end;
  }
  return out + html.slice(from);
}

// Visible text of the page, without navigation, scripts or forms.
export function pageText(html) {
  const $ = cheerio.load(html);
  $("script, style, noscript, iframe, svg, form, nav, header nav, footer, #payment_form, .cookie, [aria-hidden='true']").remove();
  $("br").replaceWith("\n");
  $("p, div, li, h1, h2, h3, h4, h5, tr, section, article").each((_, el) => {
    $(el).prepend("\n").append("\n");
  });
  const root = $("main").length ? $("main") : $("body");
  return root.text().replace(/ /g, " ").replace(/[ \t]+/g, " ").replace(/ *\n */g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

// Without AI: the descriptive text sits between the event header and the
// "date and time" box on apply.iese.edu pages.
export function fallbackBody(text, fields = {}) {
  const skip = new Set([fields.eventName, fields.eventType, fields.city].filter(Boolean).map((v) => v.trim()));
  const lines = text.split("\n").map((l) => l.trim());
  const start = lines.findIndex((l) => l === (fields.eventName || "").trim());
  const out = [];
  for (const line of lines.slice(start + 1)) {
    if (/^(date and time|fecha y hora|location|ubicaci[oó]n|lugar)$/i.test(line)) break;
    if (skip.has(line)) continue;
    if (line && line === line.toUpperCase() && /[A-Z]/.test(line)) continue;
    out.push(line);
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim().slice(0, 12000);
}

function fromStructured(fields = {}) {
  const agenda = String(fields.agendaItems || "").split("\n").filter(Boolean).map((line) => {
    const [time, ...rest] = line.split("|");
    return rest.length ? { time: time.trim(), text: rest.join("|").trim() } : { time: "", text: line.trim() };
  });
  return {
    title: fields.eventName || "",
    eventType: fields.eventType || "",
    body: fields.eventBrief || "",
    date: fields.eventDate || "",
    startTime: fields.startTime || "",
    endTime: fields.endTime || "",
    venue: fields.venue || "",
    city: fields.city || "",
    imageUrl: fields.heroImageUrl || "",
    registrationUrl: fields.registrationUrl || "",
    language: fields.emailLanguage || "",
    agenda,
    speakers: fields.speakerName1 ? [{ name: fields.speakerName1, role: fields.speakerTitle1 || "" }] : [],
  };
}

const LABELS = {
  title: "título", date: "fecha", startTime: "hora de inicio", endTime: "hora de fin", venue: "lugar", address: "dirección",
  imageUrl: "imagen", body: "texto del evento", agenda: "agenda", speakers: "ponentes", price: "precio", dressCode: "código de vestimenta",
  registrationInfo: "instrucciones de inscripción", contact: "contacto",
};

export function mergeCapture(structured, extracted = {}) {
  const pick = (key) => {
    const a = extracted[key];
    const b = structured[key];
    if (Array.isArray(a) && a.length) return a;
    if (typeof a === "string" && a.trim()) return a.trim();
    return b ?? (Array.isArray(a) ? [] : "");
  };
  const result = {};
  for (const key of ["title", "eventType", "summary", "body", "date", "endDate", "startTime", "endTime", "venue", "address", "format", "price", "dressCode", "registrationInfo", "contact", "agenda", "speakers"]) {
    result[key] = pick(key);
  }
  // Structured data is more reliable for facts the page publishes as data.
  for (const key of ["date", "startTime", "endTime", "title"]) if (structured[key]) result[key] = structured[key];
  if (!result.address && structured.city && result.venue && !result.venue.includes(structured.city)) result.address = structured.city;
  result.imageUrl = structured.imageUrl || "";
  result.registrationUrl = structured.registrationUrl || extracted.registrationUrl || "";
  result.language = structured.language || "";
  if (result.date && !isIsoDate(result.date)) result.date = "";
  if (result.endDate && !isIsoDate(result.endDate)) result.endDate = "";
  for (const key of ["startTime", "endTime"]) if (result[key] && !isClock(result[key])) result[key] = "";
  result.agenda = (result.agenda || []).map((i) => ({ time: isClock(i.time) ? i.time : "", text: String(i.text || "").trim() })).filter((i) => i.text);
  result.speakers = (result.speakers || []).map((s) => ({ name: String(s.name || "").trim(), role: String(s.role || "").trim(), imageUrl: "" })).filter((s) => s.name);
  result.found = Object.keys(LABELS).filter((k) => (Array.isArray(result[k]) ? result[k].length : result[k])).map((k) => LABELS[k]);
  result.missing = ["date", "startTime", "venue", "body", "imageUrl"].filter((k) => !result[k]).map((k) => LABELS[k]);
  return result;
}

export async function captureEvent(link, { parseStructured, ai, language, fetchImpl } = {}) {
  const { html, url } = await fetchPage(link, { fetchImpl });
  const parsed = parseStructured(html, url);
  const structured = fromStructured(parsed.fields);
  if (!structured.body && !parsed.partial) structured.body = fallbackBody(pageText(html), parsed.fields);
  let extracted = {};
  let usedAi = false;
  if (ai?.available()) {
    try {
      extracted = await ai.extractEvent({ pageText: pageText(html), known: structured, language });
      usedAi = true;
    } catch {
      extracted = {};
    }
  }
  const result = mergeCapture(structured, extracted);
  result.sourceUrl = url;
  result.usedAi = usedAi;
  result.notice = parsed.partial ? parsed.notice : "";
  return result;
}
