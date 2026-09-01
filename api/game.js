import {
  RULES, NAMES_KEY, assertHostKey, createId, createToken, defaultMeta,
  getMeta, getPlayer, getPlayers, getRedis, publicState, resetGame,
  savePlayer, setMeta, validatePassword
} from "./_lib/game.js";

function send(res, status, body) {
  res.status(status).json(body);
}

function fail(message, status = 400) {
  const error = new Error(message);
  error.statusCode = status;
  throw error;
}

function cleanName(value) {
  return String(value || "").trim().replace(/\s+/g, " ").slice(0, 24);
}

function getHostKey(req, body) {
  return req.headers["x-host-key"] || body?.hostKey || "";
}

export default async function handler(req, res) {
  try {
    const redis = getRedis();

    if (req.method === "GET") {
      const [meta, players] = await Promise.all([getMeta(redis), getPlayers(redis)]);
      return send(res, 200, publicState(meta, players));
    }

    if (req.method !== "POST") return send(res, 405, { error: "Method not allowed" });

    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    const action = body.action;
    let meta = await getMeta(redis);

    if (action === "join") {
      if (meta.status !== "lobby") fail("The game has already started.", 409);
      const name = cleanName(body.name);
      if (name.length < 2) fail("Please use a name with at least 2 characters.");
      const nameKey = name.toLowerCase();
      const id = createId();
      const token = createToken();
      const claimed = await redis.hsetnx(NAMES_KEY, nameKey, id);
      if (!claimed) fail("That name is already taken.", 409);
      const player = { id, name, token, alive: true, submission: null, valid: null, failures: [], submittedAt: null, eliminatedRound: null, reason: null };
      await savePlayer(player, redis);
      const players = await getPlayers(redis);
      return send(res, 200, { ok: true, player: { id, name, token }, state: publicState(meta, players) });
    }

    if (action === "submit") {
      if (meta.status !== "round_open") fail("Submissions are not open right now.", 409);
      if (meta.deadline && Date.now() > meta.deadline) fail("Time is up for this round.", 409);
      const player = await getPlayer(body.playerId, redis);
      if (!player || player.token !== body.playerToken) fail("Player session not found. Rejoin after the next reset.", 401);
      if (!player.alive) fail("You have been eliminated.", 409);
      const password = String(body.password ?? "").slice(0, 200);
      if (!password) fail("Enter a password first.");
      const result = validatePassword(password, meta.round);
      player.submission = password;
      player.valid = result.valid;
      player.failures = result.failures;
      player.submittedAt = Date.now();
      await savePlayer(player, redis);
      return send(res, 200, { ok: true, ...result });
    }

    assertHostKey(getHostKey(req, body));

    if (action === "set_timer") {
      if (meta.status !== "lobby") fail("Change the timer before starting the game.", 409);
      const seconds = Math.max(20, Math.min(300, Number(body.seconds) || 60));
      meta = await setMeta({ ...meta, roundSeconds: Math.round(seconds) }, redis);
    } else if (action === "start") {
      if (meta.status !== "lobby") fail("The game is not in the lobby.", 409);
      const players = await getPlayers(redis);
      if (!players.length) fail("At least one player must join first.", 409);
      for (const p of players) {
        p.alive = true;
        p.submission = null;
        p.valid = null;
        p.failures = [];
        p.submittedAt = null;
        p.eliminatedRound = null;
        p.reason = null;
        await savePlayer(p, redis);
      }
      meta = await setMeta({ ...meta, status: "round_open", round: 1, deadline: Date.now() + meta.roundSeconds * 1000, winner: null, winners: [] }, redis);
    } else if (action === "close_round") {
      if (meta.status !== "round_open") fail("There is no open round to close.", 409);
      const players = await getPlayers(redis);
      const alive = players.filter(p => p.alive);
      const validPlayers = alive.filter(p => p.submission && validatePassword(p.submission, meta.round).valid);
      validPlayers.sort((a, b) => (a.submittedAt || 0) - (b.submittedAt || 0));
      const firstByPassword = new Map();
      for (const p of validPlayers) {
        const key = p.submission.normalize("NFKC").toLowerCase();
        if (!firstByPassword.has(key)) firstByPassword.set(key, p.id);
      }

      for (const p of alive) {
        const validation = p.submission ? validatePassword(p.submission, meta.round) : { valid: false, failures: ["No password submitted."] };
        let eliminated = !validation.valid;
        let reason = validation.valid ? null : validation.failures[0];
        if (!eliminated && firstByPassword.get(p.submission.normalize("NFKC").toLowerCase()) !== p.id) {
          eliminated = true;
          reason = "Duplicate password — another player submitted it first.";
        }
        if (eliminated) {
          p.alive = false;
          p.eliminatedRound = meta.round;
          p.reason = reason;
        }
        p.valid = validation.valid;
        p.failures = validation.failures;
        await savePlayer(p, redis);
      }

      const after = await getPlayers(redis);
      const survivors = after.filter(p => p.alive);
      if (survivors.length <= 1) {
        meta = await setMeta({ ...meta, status: "game_over", deadline: null, winner: survivors[0]?.name || null, winners: survivors.map(p => p.name) }, redis);
      } else {
        meta = await setMeta({ ...meta, status: "results", deadline: null }, redis);
      }
    } else if (action === "next_round") {
      if (meta.status !== "results") fail("Close the current round first.", 409);
      const players = await getPlayers(redis);
      const survivors = players.filter(p => p.alive);
      if (survivors.length <= 1) {
        meta = await setMeta({ ...meta, status: "game_over", winner: survivors[0]?.name || null, winners: survivors.map(p => p.name), deadline: null }, redis);
      } else if (meta.round >= RULES.length) {
        meta = await setMeta({ ...meta, status: "game_over", winner: survivors.length === 1 ? survivors[0].name : null, winners: survivors.map(p => p.name), deadline: null }, redis);
      } else {
        for (const p of survivors) {
          p.submission = null;
          p.valid = null;
          p.failures = [];
          p.submittedAt = null;
          await savePlayer(p, redis);
        }
        meta = await setMeta({ ...meta, status: "round_open", round: meta.round + 1, deadline: Date.now() + meta.roundSeconds * 1000 }, redis);
      }
    } else if (action === "reset") {
      meta = await resetGame(redis);
    } else {
      fail("Unknown action.");
    }

    const players = await getPlayers(redis);
    return send(res, 200, { ok: true, state: publicState(meta, players) });
  } catch (error) {
    console.error(error);
    return send(res, error.statusCode || 500, { error: error.message || "Unexpected server error" });
  }
}
