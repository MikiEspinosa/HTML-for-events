// File-based storage for drafts and learned examples. Each draft is its own
// file, owned by one user, and carries a version number: a save made from an
// older copy is rejected instead of overwriting newer work.

import { createHash, randomUUID } from "node:crypto";
import { mkdir, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

export class StoreError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

const ID = /^[a-f0-9-]{36}$/;

export function ownerKey(userId) {
  return createHash("sha256").update(String(userId).toLowerCase()).digest("hex").slice(0, 24);
}

export function createStore(dataDir) {
  const draftsDir = path.join(dataDir, "drafts");
  const examplesDir = path.join(dataDir, "examples");
  const queues = new Map();

  // Serialize writes per file within this process.
  function exclusive(key, task) {
    const previous = queues.get(key) || Promise.resolve();
    const next = previous.then(task);
    const tail = next.catch(() => {});
    queues.set(key, tail);
    tail.then(() => { if (queues.get(key) === tail) queues.delete(key); });
    return next;
  }

  async function writeJson(file, value) {
    await mkdir(path.dirname(file), { recursive: true });
    const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(tmp, JSON.stringify(value, null, 2));
    await rename(tmp, file);
  }

  async function readJson(file) {
    try {
      return JSON.parse(await readFile(file, "utf8"));
    } catch (error) {
      if (error.code === "ENOENT") return null;
      throw error;
    }
  }

  function draftFile(userId, id) {
    if (!ID.test(id || "")) throw new StoreError("Borrador no encontrado.", 404);
    return path.join(draftsDir, ownerKey(userId), `${id}.json`);
  }

  function summary(draft) {
    return {
      id: draft.id,
      name: draft.name,
      template: draft.template,
      area: draft.area || "alumni",
      language: draft.language,
      subject: draft.subject,
      updatedAt: draft.updatedAt,
      createdAt: draft.createdAt,
      publishedAt: draft.publishedAt || null,
      version: draft.version,
    };
  }

  return {
    async listDrafts(userId) {
      const dir = path.join(draftsDir, ownerKey(userId));
      let files = [];
      try {
        files = (await readdir(dir)).filter((f) => f.endsWith(".json"));
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
      }
      const drafts = await Promise.all(files.map((f) => readJson(path.join(dir, f))));
      return drafts.filter(Boolean).map(summary).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    },

    async getDraft(userId, id) {
      const draft = await readJson(draftFile(userId, id));
      if (!draft) throw new StoreError("Borrador no encontrado.", 404);
      return draft;
    },

    async createDraft(userId, fields) {
      const now = new Date().toISOString();
      const draft = { ...fields, id: randomUUID(), owner: String(userId), version: 1, createdAt: now, updatedAt: now };
      await writeJson(draftFile(userId, draft.id), draft);
      return draft;
    },

    async saveDraft(userId, id, fields, expectedVersion) {
      const file = draftFile(userId, id);
      return exclusive(file, async () => {
        const current = await readJson(file);
        if (!current) throw new StoreError("Borrador no encontrado.", 404);
        if (Number(expectedVersion) !== current.version) {
          const error = new StoreError("Este borrador se ha guardado desde otra ventana. Recárgalo para no perder cambios.", 409);
          error.current = current;
          throw error;
        }
        const next = {
          ...current,
          ...fields,
          id: current.id,
          owner: current.owner,
          createdAt: current.createdAt,
          version: current.version + 1,
          updatedAt: new Date().toISOString(),
        };
        await writeJson(file, next);
        return next;
      });
    },

    // Per author folder: how many drafts there are now, how many reached
    // Pardot, per area, and when they last worked on one.
    async stats() {
      let owners = [];
      try {
        owners = await readdir(draftsDir);
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
      }
      const out = {};
      for (const key of owners) {
        let files = [];
        try {
          files = (await readdir(path.join(draftsDir, key))).filter((f) => f.endsWith(".json"));
        } catch {
          continue;
        }
        const drafts = (await Promise.all(files.map((f) => readJson(path.join(draftsDir, key, f)).catch(() => null)))).filter(Boolean);
        const row = { drafts: drafts.length, published: 0, alumni: 0, programa: 0, lastActivity: "" };
        for (const d of drafts) {
          if (d.publishedAt) row.published += 1;
          if ((d.area || "alumni") === "programa") row.programa += 1;
          else row.alumni += 1;
          if ((d.updatedAt || "") > row.lastActivity) row.lastActivity = d.updatedAt;
        }
        out[key] = row;
      }
      return out;
    },

    async deleteDraft(userId, id) {
      await rm(draftFile(userId, id), { force: true });
    },

    async addExample(draft) {
      const example = {
        id: randomUUID(),
        sourceDraftId: draft.id,
        template: draft.template,
        language: draft.language,
        subject: draft.subject,
        preheader: draft.preheader,
        modules: draft.modules,
        author: ownerKey(draft.owner),
        createdAt: new Date().toISOString(),
      };
      await writeJson(path.join(examplesDir, `${example.id}.json`), example);
      return example;
    },

    async findExamples({ template, language, limit = 3 }) {
      let files = [];
      try {
        files = (await readdir(examplesDir)).filter((f) => f.endsWith(".json"));
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
      }
      const all = (await Promise.all(files.map((f) => readJson(path.join(examplesDir, f))))).filter(Boolean);
      const score = (e) => (e.language === language ? 2 : 0) + (e.template === template ? 1 : 0);
      return all
        .filter((e) => e.language === language)
        .sort((a, b) => score(b) - score(a) || b.createdAt.localeCompare(a.createdAt))
        .slice(0, limit);
    },
  };
}
