// AI consumption per person and month, kept in usage.json so admins can see
// who spends what. The cost is an estimate from the model's list price; the
// bill itself is in the OpenAI or Azure console.

import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { ownerKey } from "./store.js";

// USD per million tokens, list price of gpt-5.4-mini. Override per environment.
export function aiPrices(env = process.env) {
  const num = (value, fallback) => (Number.isFinite(Number(value)) && String(value ?? "").trim() !== "" ? Number(value) : fallback);
  return {
    input: num(env.AI_PRICE_INPUT_PER_M, 0.75),
    cached: num(env.AI_PRICE_CACHED_PER_M, 0.075),
    output: num(env.AI_PRICE_OUTPUT_PER_M, 4.5),
  };
}

// Tokens of one Responses API reply, or null when the reply carries none.
export function readUsage(payload) {
  const u = payload?.usage;
  if (!u) return null;
  const input = Number(u.input_tokens ?? u.prompt_tokens) || 0;
  const output = Number(u.output_tokens ?? u.completion_tokens) || 0;
  const cached = Number(u.input_tokens_details?.cached_tokens ?? u.prompt_tokens_details?.cached_tokens) || 0;
  if (!input && !output) return null;
  return { input, cached: Math.min(cached, input), output };
}

export function costOf({ input = 0, cached = 0, output = 0 }, prices) {
  return ((input - cached) * prices.input + cached * prices.cached + output * prices.output) / 1_000_000;
}

export function createUsage(dataDir, env = process.env) {
  const file = path.join(dataDir, "usage.json");
  const prices = aiPrices(env);
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

  return {
    prices,

    // Adds one AI reply to the person's month.
    record(userId, tokens, when = new Date()) {
      if (!tokens) return Promise.resolve();
      const key = ownerKey(userId);
      const month = when.toISOString().slice(0, 7);
      const next = queue.then(async () => {
        const all = await load();
        const row = ((all[key] ||= {})[month] ||= { calls: 0, input: 0, cached: 0, output: 0 });
        row.calls += 1;
        row.input += tokens.input;
        row.cached += tokens.cached;
        row.output += tokens.output;
        await persist();
      });
      queue = next.catch((error) => console.error("No se pudo guardar el consumo de IA:", error.message));
      return queue;
    },

    // {key: {month, total}} with calls, tokens and estimated cost.
    async summary(month = new Date().toISOString().slice(0, 7)) {
      await queue;
      const all = await load();
      const out = {};
      for (const [key, months] of Object.entries(all)) {
        const total = { calls: 0, input: 0, cached: 0, output: 0 };
        for (const row of Object.values(months)) for (const k of Object.keys(total)) total[k] += Number(row[k]) || 0;
        const current = { calls: 0, input: 0, cached: 0, output: 0, ...months[month] };
        out[key] = {
          month: { ...current, tokens: current.input + current.output, cost: costOf(current, prices) },
          total: { ...total, tokens: total.input + total.output, cost: costOf(total, prices) },
        };
      }
      return out;
    },

    // Whole app per month, newest first.
    async months() {
      await queue;
      const all = await load();
      const byMonth = {};
      for (const months of Object.values(all)) {
        for (const [month, row] of Object.entries(months)) {
          const m = (byMonth[month] ||= { month, calls: 0, input: 0, cached: 0, output: 0, people: 0 });
          for (const k of ["calls", "input", "cached", "output"]) m[k] += Number(row[k]) || 0;
          m.people += 1;
        }
      }
      return Object.values(byMonth)
        .sort((a, b) => b.month.localeCompare(a.month))
        .map((m) => ({ ...m, tokens: m.input + m.output, cost: costOf(m, prices) }));
    },
  };
}
