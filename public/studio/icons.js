// Line icons of the studio, drawn inline so they take the colour of the text.

const svg = (paths, extra = "") => `<svg class="i" viewBox="0 0 24 24" aria-hidden="true"${extra}>${paths}</svg>`;

export const ICONS = {
  mail: svg('<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>'),
  layout: svg('<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/>'),
  calendar: svg('<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>'),
  news: svg('<path d="M4 4h13v16H6a2 2 0 0 1-2-2z"/><path d="M17 8h3v10a2 2 0 0 1-2 2"/><path d="M8 8h5M8 12h5M8 16h5"/>'),
  arrow: svg('<path d="M5 12h14M13 6l6 6-6 6"/>'),
  plus: svg('<path d="M12 5v14M5 12h14"/>'),
  spark: svg('<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/>'),
  monitor: svg('<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/>'),
  phone: svg('<rect x="7" y="2" width="10" height="20" rx="2"/><path d="M11 18h2"/>'),
  users: svg('<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.5-3.5 3-5.5 6.5-5.5s6 2 6.5 5.5"/><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14.8c2 .7 3.200 2.400 3.500 5.200"/>'),
  send: svg('<path d="M21 3 10 14"/><path d="M21 3l-7 18-4-7-7-4z"/>'),
  file: svg('<path d="M6 2h8l5 5v15H6z"/><path d="M14 2v5h5"/>'),
  euro: svg('<circle cx="12" cy="12" r="9"/><path d="M15.5 8.5a4.500 4.500 0 1 0 0 7M7 11h6M7 13.500h5"/>'),
  zap: svg('<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>'),
  gear: svg('<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.900 4.900 7 7M17 17l2.100 2.100M4.900 19.100 7 17M17 7l2.100-2.100"/>'),
  search: svg('<circle cx="11" cy="11" r="7"/><path d="m20 20-3.500-3.500"/>'),
  image: svg('<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="1.5"/><path d="m21 16-5-5-8 8"/>'),
  type: svg('<path d="M5 6V4h14v2M12 4v16M9 20h6"/>'),
  message: svg('<path d="M4 5h16v11H9l-5 4z"/>'),
  text: svg('<path d="M4 6h16M4 10h16M4 14h10M4 18h13"/>'),
  button: svg('<rect x="3" y="8" width="18" height="8" rx="4"/><path d="M9 12h6"/>'),
  pen: svg('<path d="M4 20l4-1L19 8l-3-3L5 16z"/>'),
  shield: svg('<path d="M12 3l8 3v6c0 4.500-3.200 7.700-8 9-4.800-1.300-8-4.500-8-9V6z"/>'),
  link: svg('<path d="M10 14a4 4 0 0 0 5.700 0l3-3a4 4 0 0 0-5.700-5.700l-1 1"/><path d="M14 10a4 4 0 0 0-5.700 0l-3 3a4 4 0 0 0 5.700 5.700l1-1"/>'),
  clock: svg('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
  list: svg('<path d="M9 6h11M9 12h11M9 18h11M4.500 6h.01M4.500 12h.01M4.500 18h.01"/>'),
  grid: svg('<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>'),
  code: svg('<path d="m8 8-4 4 4 4M16 8l4 4-4 4M13.500 5l-3 14"/>'),
  mic: svg('<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>'),
  grip: svg('<path d="M9 6h.01M15 6h.01M9 12h.01M15 12h.01M9 18h.01M15 18h.01"/>', ' style="stroke-width:3"'),
  more: svg('<path d="M5 12h.01M12 12h.01M19 12h.01"/>', ' style="stroke-width:3"'),
};

// Icon of each email module in the editor's list.
export const MODULE_ICONS = {
  hero: "image", heading: "type", greeting: "message", text: "text", event: "calendar", agenda: "clock", speakers: "users",
  cta: "button", signature: "pen", events: "list", image: "image", custom: "code",
};

export const initials = (name) => String(name || "").replace(/@.*/, "").split(/[\s._-]+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join("") || "?";
