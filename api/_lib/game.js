import { Redis } from "@upstash/redis";
import crypto from "node:crypto";

const META_KEY = "pbr:meta";
const PLAYERS_KEY = "pbr:players";
const NAMES_KEY = "pbr:names";

function redisClient() {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if (!url || !token) {
    const error = new Error("Redis is not configured. Connect an Upstash Redis database to this Vercel project.");
    error.statusCode = 500;
    throw error;
  }
  return new Redis({ url, token });
}

export const RULES = [
  { id: "length5", text: "Your password must contain at least 5 characters." },
  { id: "number", text: "Your password must contain a number." },
  { id: "uppercase", text: "Your password must contain an uppercase letter." },
  { id: "special", text: "Your password must contain a special character." },
  { id: "sum15", text: "The digits in your password must add up to at least 15." },
  { id: "month", text: "Your password must contain the name of a month." },
  { id: "roman", text: "Your password must contain a Roman numeral (I, V, X, L or C)." },
  { id: "element", text: "Your password must contain a chemical element symbol." },
  { id: "emoji", text: "Your password must contain an emoji." },
  { id: "length18", text: "Your password must contain at least 18 characters." }
];

const MONTHS = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december"
];

const ELEMENTS = [
  "H", "He", "Li", "Be", "B", "C", "N", "O", "F", "Ne", "Na", "Mg", "Al", "Si", "P", "S", "Cl", "Ar", "K", "Ca",
  "Fe", "Co", "Ni", "Cu", "Zn", "Ag", "Sn", "I", "Au", "Hg", "Pb", "U"
];

function parseValue(value) {
  if (value == null) return value;
  if (typeof value === "object") return value;
  try { return JSON.parse(value); } catch { return value; }
}

export function defaultMeta() {
  return {
    status: "lobby",
    round: 0,
    roundSeconds: 60,
    deadline: null,
    winner: null,
    winners: [],
    updatedAt: Date.now()
  };
}

export async function getMeta(redis = redisClient()) {
  const raw = await redis.get(META_KEY);
  return parseValue(raw) || defaultMeta();
}

export async function setMeta(meta, redis = redisClient()) {
  const value = { ...meta, updatedAt: Date.now() };
  await redis.set(META_KEY, JSON.stringify(value));
  return value;
}

export async function getPlayers(redis = redisClient()) {
  const raw = await redis.hgetall(PLAYERS_KEY);
  if (!raw) return [];
  return Object.entries(raw).map(([id, value]) => {
    const player = parseValue(value) || {};
    return { id, ...player };
  });
}

export async function getPlayer(id, redis = redisClient()) {
  if (!id) return null;
  const raw = await redis.hget(PLAYERS_KEY, id);
  if (!raw) return null;
  return { id, ...(parseValue(raw) || {}) };
}

export async function savePlayer(player, redis = redisClient()) {
  const { id, ...rest } = player;
  await redis.hset(PLAYERS_KEY, { [id]: JSON.stringify(rest) });
}

export function validatePassword(password, round) {
  const active = RULES.slice(0, Math.max(0, Math.min(round, RULES.length)));
  const failures = [];
  const p = String(password ?? "");
  const lower = p.toLowerCase();

  for (const rule of active) {
    let ok = true;
    switch (rule.id) {
      case "length5": ok = [...p].length >= 5; break;
      case "number": ok = /\d/.test(p); break;
      case "uppercase": ok = /[A-Z]/.test(p); break;
      case "special": ok = /[^A-Za-z0-9\s]/u.test(p); break;
      case "sum15": {
        const sum = (p.match(/\d/g) || []).reduce((n, d) => n + Number(d), 0);
        ok = sum >= 15;
        break;
      }
      case "month": ok = MONTHS.some(m => lower.includes(m)); break;
      case "roman": ok = /[IVXLC]/.test(p); break;
      case "element": ok = ELEMENTS.some(symbol => p.includes(symbol)); break;
      case "emoji": ok = /\p{Extended_Pictographic}/u.test(p); break;
      case "length18": ok = [...p].length >= 18; break;
      default: ok = true;
    }
    if (!ok) failures.push(rule.text);
  }

  return { valid: failures.length === 0, failures };
}

export function publicState(meta, players) {
  return {
    meta,
    rules: RULES.slice(0, meta.round),
    totalRules: RULES.length,
    players: players
      .map(p => ({
        id: p.id,
        name: p.name,
        alive: Boolean(p.alive),
        hasSubmitted: Boolean(p.submission),
        valid: p.submission ? Boolean(p.valid) : null,
        eliminatedRound: p.eliminatedRound ?? null,
        reason: p.reason ?? null
      }))
      .sort((a, b) => Number(b.alive) - Number(a.alive) || a.name.localeCompare(b.name))
  };
}

export function assertHostKey(key) {
  const expected = process.env.HOST_KEY;
  if (!expected) {
    const error = new Error("HOST_KEY is not configured in Vercel.");
    error.statusCode = 500;
    throw error;
  }
  const a = Buffer.from(String(key || ""));
  const b = Buffer.from(String(expected));
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    const error = new Error("Incorrect host key.");
    error.statusCode = 401;
    throw error;
  }
}

export function createToken() {
  return crypto.randomBytes(24).toString("base64url");
}

export function createId() {
  return crypto.randomUUID();
}

export async function resetGame(redis = redisClient()) {
  await redis.del(META_KEY);
  await redis.del(PLAYERS_KEY);
  await redis.del(NAMES_KEY);
  return setMeta(defaultMeta(), redis);
}

export function getRedis() {
  return redisClient();
}

export { META_KEY, PLAYERS_KEY, NAMES_KEY };
