// AI consumption per person and month, kept in usage.json so admins can see
// who spends what. The cost is an estimate in euros: the model's list price in
// dollars times what IESE actually pays in euros per dollar of list price on
// Azure. Each call adds its cost at the price of that moment, so changing the
// model does not reprice the past. The bill itself is in Azure Cost analysis.

import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { ownerKey } from "./store.js";

// Euros paid per dollar of list price. Measured on IESE's Azure bill of
// October 2026: 3.58 EUR per million input tokens listed at 5 USD, and
// 21.5 EUR per million output tokens listed at 30 USD (both 0.716).
export const DEFAULT_EUR_PER_USD = 0.716;

const num = (value, fallback) => (Number.isFinite(Number(value)) && String(value ?? "").trim() !== "" ? Number(value) : fallback);

// Euros per million tokens. AI_PRICE_*_PER_M are the model's list prices in
// dollars (gpt-6.1-terra by default, Azure Global Standard) and
// AI_EUR_PER_USD turns them into euros.
export function aiPrices(env = process.env) {
  const rate = num(env.AI_EUR_PER_USD, DEFAULT_EUR_PER_USD);
  const eur = (value) => Math.round(value * rate * 10000) / 10000;
  return {
    currency: "EUR",
    rate,
    input: eur(num(env.AI_PRICE_INPUT_PER_M, 1)),
    cached: eur(num(env.AI_PRICE_CACHED_PER_M, 0.1)),
    output: eur(num(env.AI_PRICE_OUTPUT_PER_M, 5)),
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

// Usage saved before each month kept its own cost was made with gpt-5.4-mini
// (0.75 / 0.075 / 4.5 USD per million tokens), so it keeps that price when
// the configured model changes.
export function legacyPrices(env = process.env) {
  return aiPrices({ AI_EUR_PER_USD: env.AI_EUR_PER_USD, AI_PRICE_INPUT_PER_M: 0.75, AI_PRICE_CACHED_PER_M: 0.075, AI_PRICE_OUTPUT_PER_M: 4.5 });
}

// Cost of a saved month: what each call cost when it was made, or the old
// model's price for months saved before costs were kept.
export function rowCost(row, legacy) {
  return row?.cost !== undefined && Number.isFinite(Number(row.cost)) ? Number(row.cost) : costOf(row || {}, legacy);
}

export function createUsage(dataDir, env = process.env) {
  const file = path.join(dataDir, "usage.json");
  const prices = aiPrices(env);
  const legacy = legacyPrices(env);
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
        const row = ((all[key] ||= {})[month] ||= { calls: 0, input: 0, cached: 0, output: 0, cost: 0 });
        // A month started before costs were kept: what it had so far was the old model.
        if (row.cost === undefined) row.cost = costOf(row, legacy);
        row.cost += costOf(tokens, prices);
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
        const total = { calls: 0, input: 0, cached: 0, output: 0, cost: 0 };
        for (const row of Object.values(months)) {
          for (const k of ["calls", "input", "cached", "output"]) total[k] += Number(row[k]) || 0;
          total.cost += rowCost(row, legacy);
        }
        const current = { calls: 0, input: 0, cached: 0, output: 0, ...months[month] };
        out[key] = {
          month: { ...current, tokens: current.input + current.output, cost: months[month] ? rowCost(months[month], legacy) : 0 },
          total: { ...total, tokens: total.input + total.output },
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
          const m = (byMonth[month] ||= { month, calls: 0, input: 0, cached: 0, output: 0, cost: 0, people: 0 });
          for (const k of ["calls", "input", "cached", "output"]) m[k] += Number(row[k]) || 0;
          m.cost += rowCost(row, legacy);
          m.people += 1;
        }
      }
      return Object.values(byMonth)
        .sort((a, b) => b.month.localeCompare(a.month))
        .map((m) => ({ ...m, tokens: m.input + m.output }));
    },
  };
}
