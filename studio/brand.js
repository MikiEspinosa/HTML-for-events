// The IESE brand framework for emails: tokens, the module catalog and the
// renderer. Every email the studio produces goes through this file, so
// colours, type, buttons and the fixed parts never depend on the user.

import { formatDate, formatDateRange, formatTimeRange, isClock, isIsoDate } from "./format.js";

export const BRAND = Object.freeze({
  red: "#FF2800",
  black: "#000000",
  ink: "#1A1A1A",
  grey: "#666666",
  softGrey: "#F5F5F5",
  rule: "#E6E6E6",
  white: "#FFFFFF",
  font: "Arial, Helvetica, sans-serif",
  width: 620,
});

export const LANGUAGES = ["es", "en"];

// What each module asks the user. The front end builds its questions and the
// editor panel from these definitions, so adding a module here is enough.
export const MODULES = {
  hero: {
    label: { es: "Cabecera con texto y botón", en: "Header with text and button" },
    fields: [
      { key: "imageUrl", kind: "image", label: { es: "Imagen de cabecera", en: "Header image" } },
      { key: "imageAlt", kind: "text", label: { es: "Descripción de la imagen", en: "Image description" } },
      { key: "imageLink", kind: "url", label: { es: "Enlace al hacer clic en la imagen (opcional)", en: "Link when the image is clicked (optional)" } },
      { key: "title", kind: "text", ai: true, label: { es: "Texto sobre la imagen", en: "Text over the image" } },
      { key: "subtitle", kind: "text", ai: true, label: { es: "Texto destacado (por ejemplo, la fecha)", en: "Highlighted text (for example, the date)" } },
      { key: "ctaLabel", kind: "text", label: { es: "Texto del botón", en: "Button text" } },
      { key: "ctaUrl", kind: "url", label: { es: "Enlace del botón", en: "Button link" } },
    ],
  },
  heading: {
    label: { es: "Título", en: "Title" },
    fields: [{ key: "text", kind: "text", ai: true, label: { es: "Título", en: "Title" } }],
  },
  greeting: {
    label: { es: "Saludo", en: "Greeting" },
    fields: [{ key: "text", kind: "text", label: { es: "Saludo", en: "Greeting" } }],
  },
  text: {
    label: { es: "Texto", en: "Text" },
    fields: [{ key: "body", kind: "longtext", ai: true, label: { es: "Texto", en: "Text" } }],
  },
  event: {
    label: { es: "Datos del evento", en: "Event details" },
    fields: [
      { key: "date", kind: "date", label: { es: "Fecha", en: "Date" } },
      { key: "endDate", kind: "date", optional: true, label: { es: "Fecha de fin (opcional)", en: "End date (optional)" } },
      { key: "startTime", kind: "time", label: { es: "Hora de inicio", en: "Start time" } },
      { key: "endTime", kind: "time", optional: true, label: { es: "Hora de fin (opcional)", en: "End time (optional)" } },
      { key: "venue", kind: "text", label: { es: "Lugar", en: "Venue" } },
      { key: "address", kind: "text", label: { es: "Dirección o formato", en: "Address or format" } },
    ],
  },
  agenda: {
    label: { es: "Agenda", en: "Agenda" },
    fields: [
      { key: "title", kind: "text", label: { es: "Título", en: "Title" } },
      { key: "items", kind: "list", label: { es: "Puntos de la agenda", en: "Agenda items" },
        item: [{ key: "time", kind: "time", label: { es: "Hora", en: "Time" } }, { key: "text", kind: "text", label: { es: "Actividad", en: "Activity" } }] },
    ],
  },
  speakers: {
    label: { es: "Ponentes", en: "Speakers" },
    fields: [
      { key: "title", kind: "text", label: { es: "Título", en: "Title" } },
      { key: "items", kind: "list", label: { es: "Ponentes", en: "Speakers" },
        item: [
          { key: "name", kind: "text", label: { es: "Nombre", en: "Name" } },
          { key: "role", kind: "text", label: { es: "Cargo", en: "Position" } },
          { key: "imageUrl", kind: "image", label: { es: "Foto (opcional)", en: "Photo (optional)" } },
          { key: "link", kind: "url", label: { es: "Enlace al hacer clic en la foto (opcional)", en: "Link when the photo is clicked (optional)" } },
        ] },
    ],
  },
  cta: {
    label: { es: "Botón", en: "Button" },
    fields: [
      { key: "label", kind: "text", label: { es: "Texto del botón", en: "Button text" } },
      { key: "url", kind: "url", label: { es: "Enlace", en: "Link" } },
    ],
  },
  signature: {
    label: { es: "Firma", en: "Signature" },
    fields: [
      { key: "closing", kind: "text", label: { es: "Despedida", en: "Sign-off" } },
      { key: "name", kind: "text", label: { es: "Nombre", en: "Name" } },
      { key: "role", kind: "text", label: { es: "Cargo", en: "Position" } },
    ],
  },
  events: {
    label: { es: "Otros eventos", en: "Other events" },
    fields: [
      { key: "title", kind: "text", label: { es: "Título", en: "Title" } },
      { key: "items", kind: "list", label: { es: "Eventos", en: "Events" },
        item: [
          { key: "title", kind: "text", label: { es: "Título", en: "Title" } },
          { key: "summary", kind: "text", label: { es: "Resumen", en: "Summary" } },
          { key: "meta", kind: "text", label: { es: "Lugar y fecha", en: "Place and date" } },
          { key: "url", kind: "url", label: { es: "Enlace", en: "Link" } },
        ] },
      { key: "allLabel", kind: "text", label: { es: "Texto del botón final", en: "Final button text" } },
      { key: "allUrl", kind: "url", label: { es: "Enlace del botón final", en: "Final button link" } },
    ],
  },
  image: {
    label: { es: "Imagen", en: "Image" },
    fields: [
      { key: "imageUrl", kind: "image", label: { es: "Imagen", en: "Image" } },
      { key: "imageAlt", kind: "text", label: { es: "Descripción de la imagen", en: "Image description" } },
      { key: "url", kind: "url", label: { es: "Enlace al hacer clic en la imagen (opcional)", en: "Link when the image is clicked (optional)" } },
    ],
  },
  custom: {
    label: { es: "Módulo a medida", en: "Custom module" },
    fields: [
      { key: "name", kind: "text", label: { es: "Nombre del módulo", en: "Module name" } },
      { key: "html", kind: "html", label: { es: "Contenido", en: "Content" } },
    ],
  },
};

export const TEMPLATES = {
  invite: {
    label: { es: "Invitación a evento", en: "Event invitation" },
    active: true,
    required: ["hero", "heading", "text", "event", "cta"],
    modules: ["hero", "heading", "greeting", "text", "event", "agenda", "speakers", "cta", "signature", "events"],
    addable: ["heading", "text", "agenda", "speakers", "cta", "signature", "events", "image", "custom"],
  },
  paint: {
    label: { es: "Pinta y Colorea", en: "Paint by numbers" },
    active: true,
    required: [],
    modules: [],
    addable: Object.keys(MODULES),
  },
  calendar: { label: { es: "Calendario de eventos", en: "Events calendar" }, active: false, required: [], modules: [], addable: [] },
  newsletter: { label: { es: "Newsletter", en: "Newsletter" }, active: false, required: [], modules: [], addable: [] },
};

// Fixed copy. The legal footer is the one already used in production.
export const COPY = {
  es: {
    greeting: "Hola, {{Recipient.FirstName}}:",
    ctaLabel: "Inscríbete",
    agendaTitle: "Agenda",
    speakersTitle: "Ponentes",
    eventsTitle: "Otros eventos para ti",
    eventsAllLabel: "Ver todos los eventos",
    moreInfo: "Más información",
    closing: "Un saludo,",
    dateLabel: "Fecha",
    timeLabel: "Hora",
    placeLabel: "Lugar",
    legal: 'Tu dirección de email se encuentra registrada en nuestra base de datos porque te inscribiste como suscriptor, participaste en un evento del IESE o aceptaste compartir tus datos con terceros. Si deseas darte de baja de la suscripción y no recibir estas notificaciones, puedes actualizarlo <a href="{{{EmailPreferenceCenter_654}}}" rel="nofollow,noreferrer" style="color:#000000;text-decoration:underline;"><strong>aquí</strong></a>. Si quisieras ejercer alguno de tus derechos u obtener más información relacionada con protección de datos, puedes escribir a <a href="mailto:gdpr@iese.edu" style="color:#000000;text-decoration:underline;">gdpr@iese.edu</a>. También puedes consultar nuestra política de privacidad <a href="https://www.iese.edu/privacy-policy/" style="color:#000000;text-decoration:underline;"><strong>aquí</strong></a>.',
    legalText: "Recibes este email porque estás registrado en la base de datos del IESE. Puedes darte de baja en el centro de preferencias. Protección de datos: gdpr@iese.edu.",
  },
  en: {
    greeting: "Dear {{Recipient.FirstName}},",
    ctaLabel: "Register",
    agendaTitle: "Agenda",
    speakersTitle: "Speakers",
    eventsTitle: "Other events for you",
    eventsAllLabel: "View all events on the website",
    moreInfo: "More information",
    closing: "Best regards,",
    dateLabel: "Date",
    timeLabel: "Time",
    placeLabel: "Venue",
    legal: 'Your email address is included in our database because you registered as a subscriber, participated in an IESE event or accepted sharing your data with third parties. If you would like to unsubscribe and no longer receive these notifications, you can do so <a href="{{{EmailPreferenceCenter_654}}}" rel="nofollow,noreferrer" style="color:#000000;text-decoration:underline;"><strong>here</strong></a>. If you would like to exercise your rights or obtain additional information related to data protection, you can send an email to <a href="mailto:gdpr@iese.edu" style="color:#000000;text-decoration:underline;">gdpr@iese.edu</a>. You can also consult our data privacy policy <a href="https://www.iese.edu/privacy-policy/" style="color:#000000;text-decoration:underline;"><strong>here</strong></a>.',
    legalText: "You are receiving this email because you are registered in the IESE database. You can unsubscribe from the preference center. Data protection: gdpr@iese.edu.",
  },
};

export const QUICK_LINKS = [
  { key: "app", label: { es: "App IESE Alumni", en: "IESE Alumni app" } },
  { key: "email", label: { es: "Escríbenos", en: "Email us" } },
  { key: "search", label: { es: "Buscador de antiguos alumnos", en: "Alumni search" } },
  { key: "web", label: { es: "Web de Alumni", en: "Alumni website" } },
];

export function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function safeUrl(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  if (/^mailto:[^\s@]+@[^\s@]+$/i.test(raw)) return raw;
  if (/^\{\{\{?[\w.]+\}?\}\}$/.test(raw)) return raw;
  try {
    const url = new URL(raw);
    return url.protocol === "https:" && !url.username && !url.password ? url.href : "";
  } catch {
    return "";
  }
}

// Images uploaded in simulation mode live in this app under /studio-uploads/,
// which may be served over plain http (for example on localhost).
export function isLocalUpload(value) {
  try {
    const url = new URL(String(value ?? "").trim());
    return /^https?:$/.test(url.protocol) && !url.username && !url.password && /^\/studio-uploads\/[a-f0-9-]{36}\.(png|jpg|gif|webp)$/.test(url.pathname);
  } catch {
    return false;
  }
}

// Images may also be data: URLs in the preview before they are uploaded.
function imageSrc(value, { preview }) {
  const raw = String(value ?? "").trim();
  if (preview && /^data:image\/(png|jpe?g|gif|webp);base64,/i.test(raw)) return raw;
  if (isLocalUpload(raw)) return new URL(raw).href;
  return safeUrl(raw);
}

const linkStyle = `color:${BRAND.red};font-weight:bold;text-decoration:underline;`;

export function inlineMarkup(value) {
  let html = escapeHtml(value);
  html = html.replace(/\[([^\]\n]+)\]\(([^)\s]+)\)/g, (match, label, href) => {
    const url = safeUrl(href.replaceAll("&amp;", "&"));
    return url ? `<a href="${escapeHtml(url)}" style="${linkStyle}">${label}</a>` : label;
  });
  html = html.replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>");
  return html;
}

export function plainMarkup(value) {
  return String(value ?? "")
    .replace(/\[([^\]\n]+)\]\(([^)\s]+)\)/g, "$1 ($2)")
    .replace(/\*\*([^*\n]+)\*\*/g, "$1")
    .replace(/(^|[^*])\*([^*\n]+)\*/g, "$1$2");
}

const pStyle = `margin:0 0 16px;font-family:${BRAND.font};font-size:15px;line-height:1.6;color:${BRAND.ink};`;

export function paragraphs(value) {
  const blocks = String(value ?? "").replace(/\r\n/g, "\n").trim().split(/\n{2,}/).filter((b) => b.trim());
  return blocks.map((block) => {
    const lines = block.split("\n").map((l) => l.trim()).filter(Boolean);
    if (lines.length && lines.every((l) => /^[-•]\s+/.test(l))) {
      const items = lines.map((l) => `<li style="margin:0 0 6px;">${inlineMarkup(l.replace(/^[-•]\s+/, ""))}</li>`).join("");
      return `<ul style="${pStyle}padding:0 0 0 22px;">${items}</ul>`;
    }
    return `<p style="${pStyle}">${lines.map(inlineMarkup).join("<br>")}</p>`;
  }).join("");
}

function button(label, url, { align = "center" } = {}) {
  const href = safeUrl(url);
  const text = escapeHtml(label || "");
  if (!text) return "";
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="${align}" style="margin:0 ${align === "center" ? "auto" : "0"};"><tr><td bgcolor="${BRAND.red}" style="background:${BRAND.red};border-radius:0;mso-padding-alt:13px 28px;"><a href="${escapeHtml(href || "#")}" style="display:inline-block;padding:13px 28px;font-family:${BRAND.font};font-size:14px;font-weight:bold;letter-spacing:0.5px;line-height:1;color:${BRAND.white};text-decoration:none;text-transform:uppercase;">${text}&nbsp;&rarr;</a></td></tr></table>`;
}

function row(content, { padding = "0 32px 24px", bg = BRAND.white, id = "", type = "" } = {}) {
  const marker = id ? ` data-module-id="${escapeHtml(id)}" data-module-type="${escapeHtml(type)}"` : "";
  return `<tr${marker}><td style="padding:${padding};background:${bg};">${content}</td></tr>`;
}

function sectionTitle(text) {
  return `<h2 style="margin:0 0 16px;padding:0 0 10px;border-bottom:2px solid ${BRAND.black};font-family:${BRAND.font};font-size:24px;line-height:1.2;font-weight:bold;color:${BRAND.red};">${escapeHtml(text)}</h2>`;
}

const renderers = {
  hero(m, ctx) {
    const src = imageSrc(m.imageUrl, ctx);
    const title = escapeHtml(m.title);
    const subtitle = escapeHtml(m.subtitle);
    const imageHref = safeUrl(m.imageLink);
    const texts = `${title ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td style="background:#333333;background:rgba(0,0,0,0.45);padding:10px 14px;font-family:${BRAND.font};font-size:28px;line-height:1.2;font-weight:bold;color:${BRAND.white};">${title}</td></tr></table>` : ""}${subtitle ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:8px;"><tr><td bgcolor="${BRAND.black}" style="background:${BRAND.black};padding:6px 12px;font-family:${BRAND.font};font-size:20px;line-height:1.2;font-weight:bold;color:${BRAND.white};">${subtitle}</td></tr></table>` : ""}`;
    const cta = m.ctaLabel ? `<div style="height:20px;line-height:20px;font-size:1px;">&nbsp;</div>${button(m.ctaLabel, m.ctaUrl, { align: "left" })}` : "";
    // Links cannot nest, so with a button only the texts and the empty image
    // area above them are clickable; without one the whole image is.
    const linked = (content, minHeight) => `<a href="${escapeHtml(imageHref)}" style="display:block;text-decoration:none;color:${BRAND.white};${minHeight ? `min-height:${minHeight}px;` : ""}">${content || "&nbsp;"}</a>`;
    const overlay = imageHref ? (cta ? `${linked(texts)}${cta}` : linked(texts, 256)) : `${texts}${cta}`;
    if (!src) {
      return row(`<div style="background:${BRAND.black};padding:32px;">${overlay}</div>`, { padding: "0", id: m.id, type: "hero" });
    }
    const alt = escapeHtml(m.imageAlt || m.title || "");
    const height = 320;
    const vmlOpen = `<!--[if gte mso 9]><v:rect xmlns:v="urn:schemas-microsoft-com:vml" fill="true" stroke="false" style="width:${BRAND.width}px;height:${height}px;"><v:fill type="frame" src="${escapeHtml(src)}" color="#000000" /><v:textbox inset="0,0,0,0"><![endif]-->`;
    const vmlClose = `<!--[if gte mso 9]></v:textbox></v:rect><![endif]-->`;
    return row(
      `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td background="${escapeHtml(src)}" bgcolor="#000000" valign="top" height="${height}" style="background-image:url('${escapeHtml(src)}');background-size:cover;background-position:center;background-color:#000000;height:${height}px;" role="img" aria-label="${alt}">${vmlOpen}<div style="padding:32px;">${overlay}</div>${vmlClose}</td></tr></table>`,
      { padding: "0", id: m.id, type: "hero" },
    );
  },
  heading(m) {
    if (!m.text) return "";
    return row(`<h1 style="margin:0;font-family:${BRAND.font};font-size:26px;line-height:1.25;font-weight:bold;color:${BRAND.black};">${escapeHtml(m.text)}</h1>`, { padding: "32px 32px 16px", id: m.id, type: "heading" });
  },
  greeting(m) {
    if (!m.text) return "";
    return row(`<p style="${pStyle}">${escapeHtml(m.text)}</p>`, { padding: "8px 32px 0", id: m.id, type: "greeting" });
  },
  text(m) {
    if (!m.body) return "";
    return row(paragraphs(m.body), { padding: "8px 32px 8px", id: m.id, type: "text" });
  },
  event(m, ctx) {
    const lang = ctx.language;
    const c = COPY[lang];
    const lines = [];
    const date = formatDateRange(m.date, m.endDate, lang);
    const time = formatTimeRange(m.startTime, m.endTime, lang);
    if (date) lines.push([c.dateLabel, date]);
    if (time) lines.push([c.timeLabel, time]);
    if (m.venue || m.address) lines.push([c.placeLabel, [m.venue, m.address].filter(Boolean).join(". ")]);
    if (!lines.length) return "";
    const rows = lines.map(([label, value]) => `<tr><td style="padding:4px 0;font-family:${BRAND.font};font-size:15px;line-height:1.5;color:${BRAND.ink};"><strong>${escapeHtml(label)}:</strong> ${escapeHtml(value)}</td></tr>`).join("");
    return row(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="border-left:4px solid ${BRAND.red};background:${BRAND.softGrey};padding:14px 18px;"><table role="presentation" cellpadding="0" cellspacing="0" border="0">${rows}</table></td></tr></table>`, { padding: "8px 32px 24px", id: m.id, type: "event" });
  },
  agenda(m, ctx) {
    const items = (m.items || []).filter((i) => i.text);
    if (!items.length) return "";
    const rows = items.map((i) => `<tr><td valign="top" width="80" style="padding:8px 12px 8px 0;border-bottom:1px solid ${BRAND.rule};font-family:${BRAND.font};font-size:15px;font-weight:bold;color:${BRAND.red};white-space:nowrap;">${escapeHtml(isClock(i.time) ? (ctx.language === "en" ? formatTimeRange(i.time, "", "en") : i.time) : i.time || "")}</td><td valign="top" style="padding:8px 0;border-bottom:1px solid ${BRAND.rule};font-family:${BRAND.font};font-size:15px;line-height:1.5;color:${BRAND.ink};">${inlineMarkup(i.text)}</td></tr>`).join("");
    return row(`${sectionTitle(m.title || COPY[ctx.language].agendaTitle)}<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${rows}</table>`, { padding: "16px 32px 24px", id: m.id, type: "agenda" });
  },
  speakers(m, ctx) {
    const items = (m.items || []).filter((i) => i.name);
    if (!items.length) return "";
    const rows = items.map((i) => {
      const src = imageSrc(i.imageUrl, ctx);
      const img = `<img src="${escapeHtml(src)}" width="64" height="64" alt="${escapeHtml(i.name)}" style="display:block;width:64px;height:64px;border-radius:32px;object-fit:cover;border:0;">`;
      const href = safeUrl(i.link);
      const photo = src ? `<td valign="top" width="76" style="padding:0 16px 16px 0;">${href ? `<a href="${escapeHtml(href)}">${img}</a>` : img}</td>` : "";
      return `<tr>${photo}<td valign="top" style="padding:0 0 16px;font-family:${BRAND.font};font-size:15px;line-height:1.45;color:${BRAND.ink};"><strong>${escapeHtml(i.name)}</strong>${i.role ? `<br><span style="color:${BRAND.grey};">${escapeHtml(i.role)}</span>` : ""}</td></tr>`;
    }).join("");
    return row(`${sectionTitle(m.title || COPY[ctx.language].speakersTitle)}<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${rows}</table>`, { padding: "16px 32px 16px", id: m.id, type: "speakers" });
  },
  cta(m) {
    if (!m.label) return "";
    return row(button(m.label, m.url), { padding: "16px 32px 32px", id: m.id, type: "cta" });
  },
  signature(m, ctx) {
    if (!m.name) return "";
    const closing = m.closing || COPY[ctx.language].closing;
    return row(`<p style="${pStyle}">${escapeHtml(closing)}</p><p style="margin:0;font-family:${BRAND.font};font-size:15px;line-height:1.5;color:${BRAND.ink};"><strong>${escapeHtml(m.name)}</strong>${m.role ? `<br>${escapeHtml(m.role)}` : ""}</p>`, { padding: "8px 32px 24px", id: m.id, type: "signature" });
  },
  events(m, ctx) {
    const c = COPY[ctx.language];
    const items = (m.items || []).filter((i) => i.title);
    if (!items.length) return "";
    const list = items.map((i) => `<tr><td style="padding:0 0 22px;"><p style="margin:0 0 4px;font-family:${BRAND.font};font-size:18px;line-height:1.3;font-weight:bold;color:${BRAND.black};">${escapeHtml(i.title)}</p>${i.summary ? `<p style="margin:0 0 6px;font-family:${BRAND.font};font-size:14px;line-height:1.5;color:${BRAND.ink};">${escapeHtml(i.summary)}</p>` : ""}${i.meta ? `<p style="margin:0 0 6px;font-family:${BRAND.font};font-size:12px;line-height:1.4;font-weight:bold;color:${BRAND.grey};">${escapeHtml(i.meta)}</p>` : ""}${safeUrl(i.url) ? `<a href="${escapeHtml(safeUrl(i.url))}" style="font-family:${BRAND.font};font-size:12px;font-weight:bold;color:${BRAND.red};text-decoration:none;text-transform:uppercase;">${escapeHtml(c.moreInfo)}&nbsp;&rarr;</a>` : ""}</td></tr>`).join("");
    const all = m.allLabel && safeUrl(m.allUrl) ? `<div style="padding:8px 0 0;">${button(m.allLabel, m.allUrl)}</div>` : "";
    return row(`${sectionTitle(m.title || c.eventsTitle)}<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${list}</table>${all}`, { padding: "24px 32px 24px", id: m.id, type: "events" });
  },
  image(m, ctx) {
    const src = imageSrc(m.imageUrl, ctx);
    if (!src) return "";
    const img = `<img src="${escapeHtml(src)}" width="556" alt="${escapeHtml(m.imageAlt)}" style="display:block;width:100%;max-width:556px;height:auto;border:0;">`;
    const href = safeUrl(m.url);
    return row(href ? `<a href="${escapeHtml(href)}">${img}</a>` : img, { padding: "8px 32px 24px", id: m.id, type: "image" });
  },
  custom(m) {
    if (!m.html) return "";
    return row(sanitizeCustomHtml(m.html), { padding: "8px 32px 24px", id: m.id, type: "custom" });
  },
};

// Custom modules (Pinta y Colorea) may only use tags and inline styles from
// the brand framework. Anything else is stripped before rendering.
const ALLOWED_TAGS = new Set(["table", "tbody", "tr", "td", "th", "p", "h2", "h3", "strong", "em", "b", "i", "br", "ul", "ol", "li", "a", "img", "span", "div", "hr"]);
const ALLOWED_ATTRS = new Set(["href", "src", "alt", "width", "height", "style", "align", "valign", "colspan", "rowspan", "cellpadding", "cellspacing", "border", "role", "bgcolor"]);
const ALLOWED_COLORS = new Set(["#ff2800", "#000000", "#000", "#1a1a1a", "#666666", "#666", "#f5f5f5", "#e6e6e6", "#ffffff", "#fff", "transparent"]);

export function checkStyle(style) {
  const problems = [];
  const clean = String(style || "")
    .split(";")
    .map((d) => d.trim())
    .filter(Boolean)
    .filter((decl) => {
      const [rawProp, ...rest] = decl.split(":");
      const prop = rawProp.trim().toLowerCase();
      const value = rest.join(":").trim();
      if (/expression|javascript:|url\(/i.test(value)) { problems.push(`${prop}: ${value}`); return false; }
      if (prop === "font-family") return false; // always the brand font
      const colors = value.match(/#[0-9a-f]{3,8}\b|rgba?\([^)]*\)/gi) || [];
      const bad = colors.filter((col) => !ALLOWED_COLORS.has(col.toLowerCase()) && !/^rgba\(0,\s*0,\s*0,/.test(col));
      if (bad.length) { problems.push(`${prop}: ${value}`); return false; }
      if (prop === "font-size") {
        const px = Number.parseFloat(value);
        if (!(px >= 12 && px <= 32)) { problems.push(`${prop}: ${value}`); return false; }
      }
      return true;
    });
  return { style: clean.concat([`font-family:${BRAND.font}`]).join(";"), problems };
}

export function sanitizeCustomHtml(input, { report } = {}) {
  const problems = [];
  let html = String(input || "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<(script|style|iframe|object|embed|form|input|button|svg|math|video|audio|link|meta)[\s\S]*?(<\/\1>|\/?>)/gi, (m) => { problems.push("etiqueta no permitida"); return ""; });
  html = html.replace(/<\/?([a-zA-Z0-9]+)([^>]*)>/g, (tag, name, attrs) => {
    const lower = name.toLowerCase();
    if (!ALLOWED_TAGS.has(lower)) { problems.push(`<${lower}>`); return ""; }
    if (tag.startsWith("</")) return `</${lower}>`;
    const kept = [];
    for (const m of attrs.matchAll(/([a-zA-Z-:]+)\s*=\s*("([^"]*)"|'([^']*)')/g)) {
      const attr = m[1].toLowerCase();
      let value = m[3] ?? m[4] ?? "";
      if (!ALLOWED_ATTRS.has(attr)) { if (!attr.startsWith("on")) problems.push(attr); else problems.push("evento"); continue; }
      if (attr === "href" || attr === "src") {
        const raw = value.replaceAll("&amp;", "&");
        const url = attr === "src" && isLocalUpload(raw) ? new URL(raw).href : safeUrl(raw);
        if (!url) { problems.push(`${attr} no válido`); continue; }
        value = url;
      }
      if (attr === "bgcolor" && !ALLOWED_COLORS.has(value.toLowerCase())) { problems.push(`bgcolor ${value}`); continue; }
      if (attr === "style") {
        const checked = checkStyle(value);
        problems.push(...checked.problems);
        value = checked.style;
      }
      kept.push(`${attr}="${escapeHtml(value)}"`);
    }
    if (lower === "a" && !kept.some((k) => k.startsWith("style="))) kept.push(`style="${linkStyle}"`);
    const selfClose = lower === "br" || lower === "img" || lower === "hr";
    return `<${lower}${kept.length ? ` ${kept.join(" ")}` : ""}${selfClose ? " /" : ""}>`;
  });
  return report ? { html, problems: [...new Set(problems)] } : html;
}

function textModule(m, language) {
  const c = COPY[language];
  switch (m.type) {
    case "hero": return [m.title, m.subtitle, m.ctaLabel && `${m.ctaLabel}: ${safeUrl(m.ctaUrl)}`].filter(Boolean).join("\n");
    case "heading": return (m.text || "").toUpperCase();
    case "greeting": return m.text || "";
    case "text": return plainMarkup(m.body);
    case "event": return [
      formatDateRange(m.date, m.endDate, language) && `${c.dateLabel}: ${formatDateRange(m.date, m.endDate, language)}`,
      formatTimeRange(m.startTime, m.endTime, language) && `${c.timeLabel}: ${formatTimeRange(m.startTime, m.endTime, language)}`,
      (m.venue || m.address) && `${c.placeLabel}: ${[m.venue, m.address].filter(Boolean).join(". ")}`,
    ].filter(Boolean).join("\n");
    case "agenda": return [m.title || c.agendaTitle, ...(m.items || []).filter((i) => i.text).map((i) => `${i.time ? `${i.time}  ` : ""}${plainMarkup(i.text)}`)].join("\n");
    case "speakers": return [m.title || c.speakersTitle, ...(m.items || []).filter((i) => i.name).map((i) => `${i.name}${i.role ? `, ${i.role}` : ""}`)].join("\n");
    case "cta": return m.label ? `${m.label}: ${safeUrl(m.url)}` : "";
    case "signature": return [m.closing || c.closing, m.name, m.role].filter(Boolean).join("\n");
    case "events": return [m.title || c.eventsTitle, ...(m.items || []).filter((i) => i.title).map((i) => [i.title, i.summary, i.meta, safeUrl(i.url)].filter(Boolean).join("\n")), m.allLabel && `${m.allLabel}: ${safeUrl(m.allUrl)}`].filter(Boolean).join("\n\n");
    case "image": return m.imageAlt || "";
    case "custom": return sanitizeCustomHtml(m.html).replace(/<br\s*\/?>/g, "\n").replace(/<\/(p|tr|h2|h3|li|div)>/g, "\n").replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/\n{3,}/g, "\n\n").trim();
    default: return "";
  }
}

// Images in the emails must be public, so they are hosted on Pardot Files
// rather than served by this app, which sits behind the company login.
const ICON_URLS = {
  app: "https://prdt.iese.edu/l/501101/2026-10-26/5shjm1/501101/1793025772RaZgqVTL/app.png",
  email: "https://prdt.iese.edu/l/501101/2026-10-26/5shjm7/501101/1793025787KSJ5ZQ5I/email.png",
  search: "https://prdt.iese.edu/l/501101/2026-10-26/5shjmb/501101/1793025789No4a54u0/search.png",
  web: "https://prdt.iese.edu/l/501101/2026-10-26/5shjmf/501101/1793025791kMZmhEDA/web.png",
};

export function defaultAssets() {
  return {
    logoUrl: "https://prdt.iese.edu/l/501101/2026-10-26/5shjlt/501101/1793025549md7npHks/iese_alumni.png",
    footerLogoUrl: "https://prdt.iese.edu/l/501101/2022-07-19/4db9sc/501101/1658218287R6lnsP09/iese_logo.png",
    icons: { ...ICON_URLS },
    quickLinks: Object.fromEntries(QUICK_LINKS.map((q) => [q.key, ""])),
  };
}

function quickLinksRow(language, assets) {
  const cells = QUICK_LINKS.map((q) => {
    const img = `<img src="${escapeHtml(assets.icons[q.key])}" width="48" height="48" alt="${escapeHtml(q.label[language])}" style="display:block;width:48px;height:48px;border:0;margin:0 auto;">`;
    const href = safeUrl(assets.quickLinks?.[q.key]);
    return `<td align="center" width="25%" style="padding:0 8px;">${href ? `<a href="${escapeHtml(href)}">${img}</a>` : img}</td>`;
  }).join("");
  return `<tr><td style="padding:28px 32px;border-top:1px solid ${BRAND.rule};background:${BRAND.white};"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>${cells}</tr></table></td></tr>`;
}

function brandFooterRow(assets) {
  return `<tr><td bgcolor="${BRAND.red}" style="padding:22px 24px;background:${BRAND.red};"><img src="${escapeHtml(assets.footerLogoUrl)}" width="110" alt="IESE" style="display:block;width:110px;height:auto;border:0;"></td></tr>`;
}

function legalRow(language) {
  return `<tr><td style="padding:14px 24px;background:${BRAND.rule};font-family:${BRAND.font};font-size:11px;line-height:1.4;color:#555555;">${COPY[language].legal}</td></tr>`;
}

// Fine adjustments ("ajustes finos"): small edits the AI makes to the
// rendered HTML of one part of the email when the user asks for something the
// modules cannot express (a few pixels less of space, a black button...).
// Each one is stored as exact find/replace operations scoped to a module id or
// to a fixed part, and replayed on every render so the modules stay editable.
export const FIXED_PARTS = {
  logo: { es: "Logo de cabecera", en: "Header logo" },
  quicklinks: { es: "Accesos rápidos", en: "Quick links" },
  footer: { es: "Pie de marca", en: "Brand footer" },
  legal: { es: "Texto legal", en: "Legal text" },
};
const UNSAFE_HTML = /<\s*\/?\s*(script|iframe|object|embed|form|input|button|textarea|select|link|meta|style|base|svg|math|frame|frameset)\b|\son[a-z]+\s*=|javascript:|vbscript:|expression\s*\(|@import/i;

export function isSafeTweakHtml(value) {
  return !UNSAFE_HTML.test(String(value ?? ""));
}

export function cleanTweaks(list) {
  if (!Array.isArray(list)) return [];
  return list.slice(0, 30).filter((t) => t && Array.isArray(t.ops)).map((t) => ({
    id: /^t[a-z0-9]{4,20}$/.test(t.id || "") ? t.id : `t${Math.random().toString(36).slice(2, 10)}`,
    instruction: String(t.instruction ?? "").slice(0, 1000),
    ops: t.ops.slice(0, 20)
      .filter((o) => o && typeof o.find === "string" && o.find && typeof o.replace === "string" && typeof o.scope === "string")
      .map((o) => ({ scope: o.scope.slice(0, 40), find: o.find.slice(0, 5000), replace: o.replace.slice(0, 5000) }))
      .filter((o) => isSafeTweakHtml(o.replace)),
  })).filter((t) => t.ops.length);
}

function applyTweaks(html, scope, tweaks, reports) {
  let out = html;
  tweaks.forEach((t, i) => {
    for (const op of t.ops) {
      if (op.scope !== scope) continue;
      if (out.includes(op.find)) {
        out = out.replace(op.find, () => op.replace);
        reports[i].applied += 1;
      } else {
        reports[i].missed += 1;
      }
    }
  });
  return out;
}

// The email split into its parts, each with fine adjustments applied and with
// no preview markers. renderEmail joins them; the AI edits them one by one.
export function renderParts(draft, { assets = defaultAssets(), preview = false } = {}) {
  const language = LANGUAGES.includes(draft.language) ? draft.language : "es";
  const ctx = { language, preview };
  const tweaks = cleanTweaks(draft.tweaks);
  const reports = tweaks.map((t) => ({ id: t.id, instruction: t.instruction, applied: 0, missed: 0 }));
  const parts = [];
  const add = (scope, label, html, marker = "") => {
    if (html) parts.push({ scope, label, html: applyTweaks(html, scope, tweaks, reports), marker });
  };
  if (!draft.hideLogo && assets.logoUrl) add("logo", FIXED_PARTS.logo[language], `<tr><td style="padding:24px 32px;background:${BRAND.white};"><img src="${escapeHtml(assets.logoUrl)}" width="220" alt="${escapeHtml(assets.logoAlt || "IESE Alumni")}" style="display:block;width:220px;max-width:60%;height:auto;border:0;"></td></tr>`);
  for (const m of Array.isArray(draft.modules) ? draft.modules : []) {
    const html = renderers[m.type]?.(m, ctx) || "";
    const marker = (html.match(/ data-module-id="[^"]*" data-module-type="[^"]*"/) || [""])[0];
    add(m.id, MODULES[m.type]?.label[language] || m.type, marker ? html.replace(marker, "") : html, marker);
  }
  const quickLinks = { ...assets.quickLinks };
  for (const q of QUICK_LINKS) if (draft.quickLinks?.[q.key]) quickLinks[q.key] = draft.quickLinks[q.key];
  add("quicklinks", FIXED_PARTS.quicklinks[language], quickLinksRow(language, { ...assets, quickLinks }), preview ? ' data-module-id="quicklinks" data-module-type="quicklinks"' : "");
  add("footer", FIXED_PARTS.footer[language], brandFooterRow(assets));
  add("legal", FIXED_PARTS.legal[language], legalRow(language));
  return { language, parts, tweaks: reports };
}

export function renderEmail(draft, { assets = defaultAssets(), preview = false } = {}) {
  const { language, parts, tweaks } = renderParts(draft, { assets, preview });
  const modules = Array.isArray(draft.modules) ? draft.modules : [];
  const rows = parts.map((p) => (preview && p.marker ? p.html.replace("<tr", `<tr${p.marker}`) : p.html)).join("\n");
  const preheader = escapeHtml(draft.preheader || "");
  const html = `<!doctype html>
<html lang="${language}" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<title>${escapeHtml(draft.subject || "")}</title>
<!--[if mso]><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml><![endif]-->
<style>
  body { margin:0; padding:0; }
  @media only screen and (max-width: 640px) {
    .wrap { width:100% !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background:#EFEFEF;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${preheader}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#EFEFEF;">
<tr><td align="center" style="padding:0;">
<table role="presentation" class="wrap" width="${BRAND.width}" cellpadding="0" cellspacing="0" border="0" style="width:${BRAND.width}px;max-width:100%;background:${BRAND.white};">
${rows}
</table>
</td></tr>
</table>
</body>
</html>`;
  const text = [
    ...modules.map((m) => textModule(m, language)).filter(Boolean),
    COPY[language].legalText,
    "{{{EmailPreferenceCenter_654}}}",
  ].join("\n\n");
  return { html, text, tweaks };
}

// Adds a warning for each fine adjustment that no longer fits the content.
export function withTweakWarnings(validation, tweaks, language = "es") {
  for (const t of tweaks || []) {
    if (!t.missed) continue;
    const text = language === "en"
      ? `Fine adjustment "${t.instruction}" could not be fully applied because the content changed. Remove it or ask for it again.`
      : `El ajuste fino «${t.instruction}» no se ha podido aplicar del todo porque el contenido ha cambiado. Quítalo o vuelve a pedirlo.`;
    validation.warnings.push(text);
    validation.targets.warnings.push({ tweak: t.id });
  }
  return validation;
}

// Each error and warning has a matching entry in `targets` saying where it can
// be fixed: { field: "subject" | "preheader" }, { moduleId, field } or
// { addModule: type } when a required module is missing.
export function validateDraft(draft) {
  const errors = [];
  const warnings = [];
  const targets = { errors: [], warnings: [] };
  const es = draft.language !== "en";
  const say = (esText, enText) => (es ? esText : enText);
  const error = (text, target = null) => { errors.push(text); targets.errors.push(target); };
  const warn = (text, target = null) => { warnings.push(text); targets.warnings.push(target); };
  if (!draft.subject?.trim()) error(say("Falta el asunto del email.", "The subject is missing."), { field: "subject" });
  if ((draft.subject || "").length > 70) warn(say("El asunto tiene más de 70 caracteres y puede cortarse.", "The subject is over 70 characters and may be cut off."), { field: "subject" });
  if (!draft.preheader?.trim()) warn(say("Añade un texto de vista previa (preheader).", "Add a preview text (preheader)."), { field: "preheader" });
  for (const q of QUICK_LINKS) {
    const url = draft.quickLinks?.[q.key];
    if (url && !safeUrl(url)) error(say(`Accesos rápidos: el enlace de «${q.label.es}» debe ser https:// o mailto:.`, `Quick links: the "${q.label.en}" link must be https:// or mailto:.`), { moduleId: "quicklinks", field: q.key });
  }
  const template = TEMPLATES[draft.template];
  const modules = draft.modules || [];
  for (const type of template?.required || []) {
    if (!modules.some((m) => m.type === type)) error(say(`Falta el módulo «${MODULES[type].label.es}».`, `The "${MODULES[type].label.en}" module is missing.`), { addModule: type });
  }
  modules.forEach((m, index) => {
    const name = `${MODULES[m.type]?.label[es ? "es" : "en"] || m.type} (${index + 1})`;
    const at = (field) => ({ moduleId: m.id, field });
    const checkUrl = (value, label, field) => {
      if (value && !safeUrl(value)) error(say(`${name}: ${label} debe ser un enlace https válido.`, `${name}: ${label} must be a valid https link.`), at(field));
    };
    const checkImage = (value, label, field) => {
      if (isLocalUpload(value)) warn(say(`${name}: la imagen solo está guardada en esta app (modo simulación). En modo real se sube a Pardot.`, `${name}: the image is only stored in this app (simulation mode). In live mode it is uploaded to Pardot.`), at(field));
      else checkUrl(value, label, field);
    };
    if (m.type === "hero") {
      if (!m.imageUrl) warn(say(`${name}: falta la imagen.`, `${name}: the image is missing.`), at("imageUrl"));
      if (m.imageUrl?.startsWith("data:")) error(say(`${name}: la imagen todavía no está subida a una URL pública.`, `${name}: the image is not uploaded to a public URL yet.`), at("imageUrl"));
      else checkImage(m.imageUrl, say("la imagen", "the image"), "imageUrl");
      if (m.ctaLabel && !m.ctaUrl) error(say(`${name}: el botón no tiene enlace.`, `${name}: the button has no link.`), at("ctaUrl"));
      checkUrl(m.ctaUrl, say("el enlace del botón", "the button link"), "ctaUrl");
      checkUrl(m.imageLink, say("el enlace de la imagen", "the image link"), "imageLink");
    }
    if (m.type === "cta") {
      if (!m.url) error(say(`${name}: el botón no tiene enlace.`, `${name}: the button has no link.`), at("url"));
      checkUrl(m.url, say("el enlace", "the link"), "url");
    }
    if (m.type === "event") {
      if (!m.date) error(say(`${name}: falta la fecha.`, `${name}: the date is missing.`), at("date"));
      else if (!isIsoDate(m.date)) error(say(`${name}: la fecha no es válida.`, `${name}: the date is not valid.`), at("date"));
      if (m.endDate && (!isIsoDate(m.endDate) || m.endDate < m.date)) warn(say(`${name}: la fecha de fin es anterior a la de inicio o no es válida, así que no se muestra. Corrígela o quítala.`, `${name}: the end date is before the start date or not valid, so it is not shown. Fix it or remove it.`), at("endDate"));
      if (m.startTime && !isClock(m.startTime)) error(say(`${name}: la hora de inicio no es válida.`, `${name}: the start time is not valid.`), at("startTime"));
      if (!m.venue && !m.address) warn(say(`${name}: falta el lugar.`, `${name}: the venue is missing.`), at("venue"));
    }
    if (m.type === "image") {
      if (m.imageUrl?.startsWith("data:")) error(say(`${name}: la imagen todavía no está subida a una URL pública.`, `${name}: the image is not uploaded to a public URL yet.`), at("imageUrl"));
      else checkImage(m.imageUrl, say("la imagen", "the image"), "imageUrl");
      if (m.imageUrl && !m.imageAlt) warn(say(`${name}: describe la imagen para quien no pueda verla.`, `${name}: describe the image for people who cannot see it.`), at("imageAlt"));
      checkUrl(m.url, say("el enlace", "the link"), "url");
    }
    if (m.type === "speakers") {
      (m.items || []).forEach((item, i) => checkUrl(item.link, say("el enlace de una foto", "a photo link"), `items.${i}.link`));
    }
    if (m.type === "events") {
      (m.items || []).forEach((item, i) => checkUrl(item.url, say("un enlace de evento", "an event link"), `items.${i}.url`));
      checkUrl(m.allUrl, say("el enlace final", "the final link"), "allUrl");
    }
    if (m.type === "custom") {
      const { problems } = sanitizeCustomHtml(m.html, { report: true });
      if (problems.length) warn(say(`${name}: se ha quitado lo que no cumple el marco de marca (${problems.slice(0, 4).join(", ")}).`, `${name}: anything outside the brand framework was removed (${problems.slice(0, 4).join(", ")}).`), at(""));
    }
    if (m.type === "text" && /[A-ZÁÉÍÓÚÑ]{12,}/.test(m.body || "")) warn(say(`${name}: evita frases enteras en mayúsculas (guía de estilo).`, `${name}: avoid all caps (style guide).`), at("body"));
  });
  return { errors, warnings, targets };
}
