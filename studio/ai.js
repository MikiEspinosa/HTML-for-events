// Every AI call of the studio. Each prompt carries the short style rules for
// the email's language and, when available, approved examples of the same
// kind so the model follows the tone already used by the team.

import { MODULES } from "./brand.js";
import { rulesFor } from "./rules.js";
import { readUsage } from "./usage.js";

export class AiError extends Error {
  constructor(message, status = 502) {
    super(message);
    this.status = status;
  }
}

const LANGUAGE_NAME = { es: "Spanish from Spain", en: "American English" };

export function parseJsonReply(text) {
  const cleaned = String(text || "").trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
  const start = cleaned.search(/[[{]/);
  if (start < 0) throw new AiError("La IA no devolvió datos válidos.");
  try {
    return JSON.parse(cleaned.slice(start));
  } catch {
    throw new AiError("La IA no devolvió datos válidos.");
  }
}

function examplesBlock(examples) {
  if (!examples?.length) return "";
  const shown = examples.map((e, i) => {
    const texts = (e.modules || [])
      .map((m) => [m.title, m.subtitle, m.text, m.body].filter(Boolean).join("\n"))
      .filter(Boolean)
      .join("\n")
      .slice(0, 1500);
    return `Example ${i + 1} (subject: ${e.subject || "-"}):\n${texts}`;
  }).join("\n\n");
  return `\n\nApproved emails from the team. Match their tone, length and structure, not their facts:\n${shown}`;
}

export function createAi({ getClient, buildRequest, extractText, onUsage }) {
  async function ask(instructions, input) {
    const ai = getClient();
    if (!ai) throw new AiError("La IA no está configurada en este entorno. Puedes escribir el contenido a mano.", 503);
    let payload;
    try {
      payload = await ai.client.responses.create(buildRequest(ai, instructions, typeof input === "string" ? input : JSON.stringify(input)));
    } catch (error) {
      throw new AiError("La IA no ha podido responder. Inténtalo de nuevo.", 502);
    }
    if (onUsage) onUsage(readUsage(payload));
    const text = extractText(payload);
    if (!text) throw new AiError("La IA no devolvió texto.");
    return text;
  }

  async function askJson(instructions, input) {
    return parseJsonReply(await ask(`${instructions}\nReturn only one valid JSON value, with no commentary.`, input));
  }

  return {
    available: () => Boolean(getClient()),

    // Reads the whole public text of an event page and maps it to modules.
    async extractEvent({ pageText, known, language }) {
      const instructions = [
        "You extract information from the public web page of an IESE event so an email invitation can be written.",
        "Use only information present in the page. Leave a field empty when it is not there. Do not invent.",
        "Return JSON with these keys: title, eventType, summary (2-3 sentences), body (the full descriptive text of the page, cleaned, paragraphs separated by a blank line, keep all useful details), date (YYYY-MM-DD), endDate, startTime (HH:MM 24h), endTime, venue, address, format (face to face, live online or online), price, dressCode, registrationInfo, contact, agenda (array of {time: HH:MM or empty, text}), speakers (array of {name, role}), registrationUrl.",
        `Write values in the page's own language; the email will be in ${LANGUAGE_NAME[language] || "Spanish"}.`,
      ].join("\n");
      return askJson(instructions, { alreadyFound: known, page: String(pageText).slice(0, 24000) });
    },

    // First full draft of an invitation from facts and the user's notes.
    async writeInvitation({ language, facts, notes, examples }) {
      const instructions = [
        `You are a senior copywriter at IESE Alumni writing an event invitation email in ${LANGUAGE_NAME[language]}.`,
        "Base the copy on the facts and the user's notes, but write it yourself: do not copy the notes literally.",
        "Return JSON with keys: subjects (array of 3 subject lines, under 60 characters), preheader (under 90 characters), heroTitle (under 45 characters, the event name or a short hook), heroSubtitle (the date in the event format of the style guide), heading (a short title for the email body), body (2 to 4 short paragraphs separated by a blank line; you may use **bold** for key details; no greeting, no sign-off, no button text), ctaLabel (2 or 3 words).",
        rulesFor(language),
      ].join("\n") + examplesBlock(examples);
      return askJson(instructions, { facts, notes });
    },

    async rewrite({ language, action, text, context, examples }) {
      const tasks = {
        write: "Write this text from the notes given. Do not copy the notes literally.",
        improve: "Improve this text: clearer, warmer, more concise, without changing facts.",
        shorten: "Shorten this text to about half its length, keeping every fact that matters.",
        fix: "Correct this text so it follows the style guide rules. Change as little as possible.",
      };
      const instructions = [
        `You edit copy for IESE Alumni emails in ${LANGUAGE_NAME[language]}. ${tasks[action] || tasks.improve}`,
        "Keep **bold** and [label](url) markup and every link and personalization field exactly. Return only the resulting text.",
        rulesFor(language),
      ].join("\n") + examplesBlock(examples);
      return (await ask(instructions, { text, context })).trim();
    },

    // Chat attached to one text field: writes new text or edits the current one.
    async chatField({ language, field, multiline, text, messages, context, examples }) {
      const instructions = [
        `You are the writing assistant of the IESE Alumni email studio. You work on one field of an email in ${LANGUAGE_NAME[language]}: "${field}".`,
        "The user chats with you to get new text for that field or to change the text it already has (tone, person, length, focus...). Apply each request to the current text unless the user asks for something new.",
        multiline
          ? "The field is a body text: use short paragraphs separated by a blank line. You may use **bold**, *italic*, [label](https://url) and lists with lines starting with \"- \". No greeting, no sign-off and no button text unless asked."
          : "The field is a single line: return one line, with no markup and no line breaks.",
        "Use the facts in the email context. Never invent dates, times, places, prices, names or links. Keep links and fields like {{Recipient.FirstName}} exactly.",
        "Return JSON {reply, text}. reply is one short sentence for the user, in the language the user writes in, saying what you did or asking what you need. text is the complete new text for the field, written in the email language, or an empty string when you only answer or need more information.",
        rulesFor(language),
      ].join("\n") + examplesBlock(examples);
      const result = await askJson(instructions, { currentText: text, emailContext: context, conversation: messages });
      let next = typeof result?.text === "string" ? result.text.trim() : "";
      if (!multiline) next = next.replace(/\s*\n+\s*/g, " ");
      return { reply: String(result?.reply || "").trim(), text: next };
    },

    // Fine adjustments: exact find/replace edits on the HTML of the email parts.
    async tweakHtml({ instruction, parts }) {
      const instructions = [
        "You make small, precise adjustments to the HTML of an IESE Alumni email, as asked by the user (spacing, colours, sizes, alignment, borders, wording of one element...).",
        "The email is split into parts. Each part has a scope id, a label and its HTML (table rows with inline styles).",
        "Return JSON {reply, ops}. ops is an array of {scope, find, replace}: find is an exact substring copied character by character from the HTML of that scope, short but unique inside it; replace is what goes in its place. Change only what the request needs.",
        "Keep email-safe HTML: tables, inline styles only, no scripts, no event attributes, no forms, no <style> blocks. When changing a background colour of a cell, change both the bgcolor attribute and the background in the style. Keep links, images and fields like {{Recipient.FirstName}}.",
        "If the request is ambiguous or no part matches, return ops [] and ask in reply. reply is one short sentence in the user's language saying what you changed.",
      ].join("\n");
      const result = await askJson(instructions, { request: instruction, parts: parts.map(({ scope, label, html }) => ({ scope, label, html })) });
      return { reply: String(result?.reply || "").trim(), ops: Array.isArray(result?.ops) ? result.ops : [] };
    },

    async structureAgenda({ language, text }) {
      const instructions = [
        "Turn this agenda, written or dictated freely, into a list of agenda items.",
        "Return a JSON array of {time, text}. time is HH:MM in 24h format or empty when not given. text is short and follows the style rules.",
        rulesFor(language),
      ].join("\n");
      const items = await askJson(instructions, text);
      return Array.isArray(items) ? items.filter((i) => i && i.text).map((i) => ({ time: String(i.time || ""), text: String(i.text) })) : [];
    },

    async suggestSubjects({ language, draft, examples }) {
      const instructions = [
        `Propose a subject line and preheader for this IESE Alumni email in ${LANGUAGE_NAME[language]}.`,
        "Return JSON with keys subjects (array of 3, under 60 characters each) and preheader (under 90 characters).",
        rulesFor(language),
      ].join("\n") + examplesBlock(examples);
      return askJson(instructions, collectTexts(draft));
    },

    async translate({ draft, target }) {
      const texts = collectTexts(draft);
      const instructions = [
        `Translate every value of this JSON object into ${LANGUAGE_NAME[target]}, as a native IESE copywriter would, not word for word.`,
        "Return a JSON object with exactly the same keys.",
        "Keep names of people, programs and brands, links, numbers, **bold**, [label](url) markup, HTML tags and fields like {{Recipient.FirstName}} unchanged.",
        "Dates and times must follow the target style guide.",
        rulesFor(target),
      ].join("\n");
      const translated = await askJson(instructions, texts);
      for (const key of Object.keys(texts)) {
        if (typeof translated[key] !== "string") throw new AiError("La traducción llegó incompleta. Inténtalo de nuevo.");
        for (const token of texts[key].match(/\{\{\{?[\w.]+\}?\}\}/g) || []) {
          if (!translated[key].includes(token)) throw new AiError("La traducción perdió un campo de personalización. Inténtalo de nuevo.");
        }
      }
      return translated;
    },

    async reviewStyle({ draft }) {
      const instructions = [
        "You check an IESE Alumni email against the style guide rules below.",
        "Return a JSON array of issues. Each issue: {key, quote (the exact words that break a rule), rule (which rule, in Spanish, short), suggestion (the corrected words)}. Return [] when everything follows the rules.",
        "Report only real breaches of the listed rules, not taste.",
        rulesFor(draft.language),
      ].join("\n");
      const issues = await askJson(instructions, collectTexts(draft));
      return Array.isArray(issues) ? issues.filter((i) => i && i.quote).slice(0, 20) : [];
    },

    // Pinta y Colorea: from a free description to a plan of modules.
    async planLayout({ language, description, examples }) {
      const catalog = Object.entries(MODULES)
        .filter(([type]) => type !== "custom")
        .map(([type, def]) => `${type}: ${def.label.en}`)
        .join("; ");
      const instructions = [
        "You design the structure of an IESE Alumni email from the user's description.",
        `Available modules: ${catalog}. Use them whenever they fit.`,
        "If the user asks for something none of them covers, use type \"custom\" and describe what it should contain.",
        "The logo, quick links and footers are added automatically; never include them.",
        `Return JSON {modules: [{type, purpose, question, prefill}]} in order. question is what the app must ask the user to fill that module, in ${language === "en" ? "English" : "Spanish"}, friendly and short (for example, ask for the image URL, the text over the image, where the button goes, the ideas for the body, the agenda). prefill is an object with any field values the description already gives, using the module's field keys.`,
      ].join("\n") + examplesBlock(examples);
      const plan = await askJson(instructions, description);
      const modules = Array.isArray(plan?.modules) ? plan.modules : [];
      return modules.filter((m) => MODULES[m.type]).slice(0, 15);
    },

    async buildCustomModule({ language, purpose, answer }) {
      const instructions = [
        `You build one block of an IESE email in ${LANGUAGE_NAME[language]}, as an HTML fragment that goes inside a 556 px wide table cell.`,
        "Brand framework, mandatory: tables for layout, inline styles only, Arial, sizes from 13 to 28 px, colours only #FF2800 (red), #000000, #1A1A1A, #666666, #F5F5F5, #E6E6E6 and #FFFFFF.",
        "Allowed tags: table, tr, td, p, h2, h3, strong, em, br, ul, li, a, img, span, div, hr. No scripts, no classes, no external CSS, no background images.",
        "Links and images must use https URLs given by the user. Do not invent URLs.",
        "When the block needs an image and the user gave no URL, leave its place as a table cell whose only content is the text [IMAGEN], with the width the image should have; the user fills it in the editor. Do not draw grey boxes or fixed heights for images.",
        "Return JSON {html}.",
        rulesFor(language),
      ].join("\n");
      const result = await askJson(instructions, { purpose, content: answer });
      return String(result?.html || "");
    },
  };
}

// Editorial text of a draft as a flat object, keyed by module and field.
export function collectTexts(draft) {
  const texts = {};
  if (draft.subject) texts.subject = draft.subject;
  if (draft.preheader) texts.preheader = draft.preheader;
  for (const m of draft.modules || []) {
    const def = MODULES[m.type];
    if (!def) continue;
    for (const field of def.fields) {
      if (["text", "longtext", "html"].includes(field.kind) && typeof m[field.key] === "string" && m[field.key].trim()) {
        texts[`${m.id}.${field.key}`] = m[field.key];
      }
      if (field.kind === "list") {
        (m[field.key] || []).forEach((item, index) => {
          for (const sub of field.item) {
            if (sub.kind === "text" && sub.key !== "name" && typeof item[sub.key] === "string" && item[sub.key].trim()) {
              texts[`${m.id}.${field.key}.${index}.${sub.key}`] = item[sub.key];
            }
          }
        });
      }
    }
  }
  return texts;
}

export function applyTexts(draft, texts) {
  const next = structuredClone(draft);
  for (const [key, value] of Object.entries(texts)) {
    if (key === "subject" || key === "preheader") { next[key] = value; continue; }
    const [id, field, index, sub] = key.split(".");
    const module = next.modules.find((m) => m.id === id);
    if (!module) continue;
    if (index !== undefined && Array.isArray(module[field]) && module[field][Number(index)]) module[field][Number(index)][sub] = value;
    else if (index === undefined) module[field] = value;
  }
  return next;
}
