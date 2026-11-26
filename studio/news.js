// Notice board: administrators post a message for Alumni, Programa or both.
// For a week after it is posted, people of that audience see it when they
// open the studio until they mark it as read; then it does not show again.
// Everything lives in news.json, next to users.json.

import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

export const NEWS_AUDIENCES = ["ambos", "alumni", "programa"];
export const NEWS_DAYS = 7;
const DAY = 24 * 60 * 60 * 1000;
const ID = /^[a-f0-9-]{36}$/;

export class NewsError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

// Whether a person with access to these areas is in the notice's audience.
export function reaches(audience, areas = []) {
  return audience === "ambos" ? areas.length > 0 : areas.includes(audience);
}

export function isActive(item, now = Date.now()) {
  return Date.parse(item.expiresAt) > now;
}

export function createNews(dataDir) {
  const file = path.join(dataDir, "news.json");
  let cache = null;
  let queue = Promise.resolve();

  async function load() {
    if (cache) return cache;
    try {
      cache = JSON.parse(await readFile(file, "utf8"));
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      cache = { items: [] };
    }
    if (!Array.isArray(cache.items)) cache.items = [];
    return cache;
  }

  async function persist() {
    await mkdir(dataDir, { recursive: true });
    const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(tmp, JSON.stringify(cache, null, 2));
    await rename(tmp, file);
  }

  // Changes run one after another so two requests never lose each other's edit.
  function change(task) {
    const next = queue.then(async () => {
      await load();
      const result = await task(cache);
      await persist();
      return result;
    });
    queue = next.catch(() => {});
    return next;
  }

  const forPerson = (item) => ({ id: item.id, title: item.title, text: item.text, createdAt: item.createdAt, author: item.authorName || "" });

  return {
    // Notices this person still has to read, oldest first.
    async unread(userKey, areas, now = Date.now()) {
      const { items } = await load();
      return items
        .filter((i) => isActive(i, now) && reaches(i.audience, areas) && !i.readBy?.[userKey])
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
        .map(forPerson);
    },

    async markRead(id, userKey, areas, now = Date.now()) {
      if (!ID.test(id || "")) throw new NewsError("Aviso no encontrado.", 404);
      return change(({ items }) => {
        const item = items.find((i) => i.id === id);
        if (!item || !reaches(item.audience, areas)) throw new NewsError("Aviso no encontrado.", 404);
        item.readBy = item.readBy || {};
        if (!item.readBy[userKey]) item.readBy[userKey] = new Date(now).toISOString();
        return true;
      });
    },

    async create({ title, text, audience }, author, now = Date.now()) {
      const cleanTitle = String(title ?? "").trim().slice(0, 120);
      const cleanText = String(text ?? "").trim().slice(0, 4000);
      if (!cleanTitle) throw new NewsError("Escribe un título para el aviso.");
      if (!cleanText) throw new NewsError("Escribe el mensaje del aviso.");
      if (!NEWS_AUDIENCES.includes(audience)) throw new NewsError("Elige a quién va el aviso.");
      const item = {
        id: randomUUID(),
        title: cleanTitle,
        text: cleanText,
        audience,
        createdAt: new Date(now).toISOString(),
        expiresAt: new Date(now + NEWS_DAYS * DAY).toISOString(),
        author: author.key,
        authorName: author.name || author.email || "",
        readBy: {},
      };
      return change(({ items }) => {
        items.push(item);
        return item;
      });
    },

    async remove(id) {
      if (!ID.test(id || "")) throw new NewsError("Aviso no encontrado.", 404);
      return change((data) => {
        const before = data.items.length;
        data.items = data.items.filter((i) => i.id !== id);
        if (data.items.length === before) throw new NewsError("Aviso no encontrado.", 404);
        return true;
      });
    },

    // Every notice, newest first, with who has read it.
    async list() {
      const { items } = await load();
      return [...items].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    },
  };
}
