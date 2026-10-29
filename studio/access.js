// Who may use which part of the studio. Every person who signs in is recorded
// in users.json with the area they may work in (Alumni, Programa or both) and
// whether they are an administrator. Administrators classify people from the
// admin panel; the emails in STUDIO_ADMIN_EMAILS are always administrators.

import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { ownerKey } from "./store.js";

// Each area brands its emails and sends them to its own Pardot campaign and
// folder. Empty values fall back to the app defaults (Pardot) or no logo.
export const AREAS = {
  alumni: { label: "IESE Alumni", logoAlt: "IESE Alumni", env: "ALUMNI" },
  programa: { label: "Programa", logoAlt: "IESE Programs", env: "PROGRAMA" },
};
export const ACCESS = ["programa", "alumni", "ambos"];
export const DEFAULT_ACCESS = "programa";
const DEFAULT_ADMINS = "maespinosa@iese.edu";

// Access given before the person first signs in (Miki, 2026-10-27). More can
// be added with STUDIO_ALUMNI_EMAILS; after the first visit, the admin panel rules.
const INITIAL_ALUMNI = [
  "MBombardo@iese.edu", "ASlattery@iese.edu", "CGarciaM@iese.edu", "AMerce@iese.edu", "DJanssen@iese.edu",
  "CLatouche@iese.edu", "BTorres@iese.edu", "APadierna@iese.edu", "SVoss@iese.edu", "avalenzuela@iese.edu",
  "AMaceira@iese.edu", "BMiguel@iese.edu", "MJimenezA@iese.edu", "PHorvath@iese.edu",
];

export function areaOf(value) {
  return AREAS[value] ? value : "alumni";
}

export function areasFor(access) {
  return access === "ambos" ? ["alumni", "programa"] : [AREAS[access] ? access : DEFAULT_ACCESS];
}

export function areaSettings(area, env = process.env) {
  const key = AREAS[areaOf(area)].env;
  return {
    logoUrl: env[`${key}_HEADER_LOGO_URL`] || "",
    campaignId: String(env[`${key}_PARDOT_CAMPAIGN_ID`] || "").replace(/\D/g, ""),
    folderId: String(env[`${key}_PARDOT_FOLDER_ID`] || "").replace(/\D/g, ""),
  };
}

const emailList = (value) => String(value).split(/[,;\s]+/).map((e) => e.trim().toLowerCase()).filter(Boolean);

function adminEmails(env) {
  return emailList(env.STUDIO_ADMIN_EMAILS ?? DEFAULT_ADMINS);
}

export function initialAccess(email, env = process.env) {
  const alumni = [...emailList(INITIAL_ALUMNI.join(",")), ...emailList(env.STUDIO_ALUMNI_EMAILS || "")];
  return alumni.includes(String(email || "").toLowerCase()) ? "alumni" : DEFAULT_ACCESS;
}

export function createUsers(dataDir, env = process.env) {
  const file = path.join(dataDir, "users.json");
  let cache = null;
  let queue = Promise.resolve();

  async function load() {
    if (cache) return cache;
    try {
      cache = JSON.parse(await readFile(file, "utf8"));
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      cache = {};
    }
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

  function isOwner(record) {
    return adminEmails(env).includes(String(record.email || "").toLowerCase());
  }

  // What the person may do, as the rest of the app sees it.
  function view(record) {
    const owner = isOwner(record);
    const access = owner ? "ambos" : record.access;
    return { ...record, access, admin: owner || record.admin === true, owner, areas: areasFor(access) };
  }

  return {
    // Records the visit and returns the person's access. Writes at most every
    // few minutes per person unless something about them changed.
    async visit(user) {
      const key = ownerKey(user.id);
      const now = new Date().toISOString();
      const all = await load();
      const current = all[key];
      const stale = !current || Date.parse(now) - Date.parse(current.lastSeen || 0) > 5 * 60 * 1000;
      const renamed = current && ((user.email && current.email !== user.email) || (user.name && current.name !== user.name));
      if (!stale && !renamed) return view(current);
      return view(await change((users) => {
        const record = users[key] || { key, access: initialAccess(user.email, env), admin: false, firstSeen: now, created: 0, published: 0 };
        Object.assign(record, { email: user.email || record.email || "", name: user.name || record.name || "", lastSeen: now });
        if (!record.firstSeen) record.firstSeen = now;
        users[key] = record;
        return record;
      }));
    },

    async list() {
      return Object.values(await load()).map(view);
    },

    // People given access in advance who have not signed in yet.
    async pending() {
      const seen = new Set(Object.values(await load()).map((u) => String(u.email || "").toLowerCase()));
      const emails = [...new Set([...emailList(INITIAL_ALUMNI.join(",")), ...emailList(env.STUDIO_ALUMNI_EMAILS || "")])];
      return emails.filter((e) => !seen.has(e)).map((email) => ({ email, access: "alumni" }));
    },

    async update(key, { access, admin }) {
      return view(await change((users) => {
        const record = users[key] || { key, access: DEFAULT_ACCESS, admin: false, created: 0, published: 0 };
        if (access !== undefined) record.access = ACCESS.includes(access) ? access : record.access;
        if (admin !== undefined) record.admin = admin === true;
        users[key] = record;
        return record;
      }));
    },

    async count(userId, field) {
      const key = ownerKey(userId);
      await change((users) => {
        const record = users[key] || { key, access: DEFAULT_ACCESS, admin: false, created: 0, published: 0 };
        record[field] = (Number(record[field]) || 0) + 1;
        users[key] = record;
      });
    },
  };
}
