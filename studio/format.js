// Date and time formatting that follows the IESE style guides.
// ES (A-Z, June 2026): "7 de junio del 2026", "17:30 h".
// EN (A-Z, Aug 2024, AP style): "Oct. 16, 2026", "5:30 pm" in invitations.

const ES_MONTHS = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];
const EN_MONTHS_WITH_DAY = [
  "Jan.", "Feb.", "March", "April", "May", "June",
  "July", "Aug.", "Sept.", "Oct.", "Nov.", "Dec.",
];
const ES_WEEKDAYS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const EN_WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function isIsoDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || "")) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function isClock(value) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value || "");
}

function parts(value) {
  const date = new Date(`${value}T12:00:00Z`);
  return { day: date.getUTCDate(), month: date.getUTCMonth(), year: date.getUTCFullYear(), weekday: date.getUTCDay() };
}

export function formatDate(value, language, { weekday = false, year = true } = {}) {
  if (!isIsoDate(value)) return "";
  const p = parts(value);
  if (language === "en") {
    const base = `${EN_MONTHS_WITH_DAY[p.month]} ${p.day}${year ? `, ${p.year}` : ""}`;
    return weekday ? `${EN_WEEKDAYS[p.weekday]}, ${base}` : base;
  }
  const base = `${p.day} de ${ES_MONTHS[p.month]}${year ? ` del ${p.year}` : ""}`;
  return weekday ? `${ES_WEEKDAYS[p.weekday]}, ${base}` : base;
}

export function formatDateRange(start, end, language) {
  if (!isIsoDate(start)) return "";
  if (!isIsoDate(end) || end === start) return formatDate(start, language, { weekday: true });
  const a = parts(start);
  const b = parts(end);
  if (language === "en") {
    if (a.year === b.year && a.month === b.month) {
      return `${EN_MONTHS_WITH_DAY[a.month]} ${a.day}–${b.day}, ${a.year}`;
    }
    return `${formatDate(start, "en", { year: a.year !== b.year })}–${formatDate(end, "en")}`;
  }
  if (a.year === b.year && a.month === b.month) {
    return `Del ${a.day} al ${b.day} de ${ES_MONTHS[a.month]} del ${a.year}`;
  }
  return `Del ${formatDate(start, "es", { year: a.year !== b.year })} al ${formatDate(end, "es")}`;
}

export function formatTime(value, language) {
  if (!isClock(value)) return "";
  if (language === "en") {
    const [h, m] = value.split(":").map(Number);
    return `${h % 12 || 12}${m ? `:${String(m).padStart(2, "0")}` : ""} ${h >= 12 ? "pm" : "am"}`;
  }
  return `${value} h`;
}

export function formatTimeRange(start, end, language) {
  if (!isClock(start)) return "";
  if (!isClock(end)) return formatTime(start, language);
  if (language === "en") return `${formatTime(start, "en")}–${formatTime(end, "en")}`;
  return `De ${start} a ${end} h`;
}
