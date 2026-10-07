import {
  RULES, NAMES_KEY, assertHostKey, createId, createToken, defaultMeta,
  getMeta, getPlayer, getPlayers, getRedis, resetGame,
  savePlayer, setMeta, validatePassword, TIMELINE_ORDER, getRpsChoice, rpsChoiceLabel
} from "./_lib/game.js";

const STARTING_LIVES = 3;
const roundNumber = id => RULES.findIndex(rule => rule.id === id) + 1;
const TIMELINE_ROUND = roundNumber("timeline");
const WALTER_ROUND = roundNumber("walter");
const EGG_ROUND = roundNumber("egg");
const RPS_ROUND = roundNumber("rps");

function send(res, status, body) {
  res.status(status).json(body);
}

function fail(message, status = 400) {
  const error = new Error(message);
  error.statusCode = status;
  throw error;
}

function cleanName(value) {
  return String(value || "").trim().replace(/\s+/g, " ").slice(0, 48);
}

function getHostKey(req, body) {
  return req.headers["x-host-key"] || body?.hostKey || "";
}

function duplicateKey(value) {
  // Duplicate checking is case-sensitive.
  // Example: "LaOs3" and "LaoS3" are different passwords.
  // Unicode representation is normalized, and accidental outer whitespace is ignored.
  return String(value ?? "")
    .normalize("NFKC")
    .trim();
}

function passwordLength(value) {
  return value == null ? null : [...String(value)].length;
}

function inferTeamSize(name) {
  const text = String(name || "").trim();
  const explicit = text.match(/\(([2-6])\)\s*$/);
  if (explicit) return Number(explicit[1]);

  const parts = text
    .split(/\s+(?:og|and)\s+|\s*[&/+;,]\s*/iu)
    .map(part => part.trim())
    .filter(Boolean);
  return Math.max(1, Math.min(6, parts.length >= 2 ? parts.length : 1));
}

function teamPenalty(player) {
  return Math.max(0, Math.min(5, Number(player?.teamSize || 1) - 1));
}

function effectivePasswordLength(player) {
  const raw = passwordLength(player?.submission);
  return raw == null ? null : raw + teamPenalty(player);
}

function roundSeconds(value, fallback = 60) {
  const parsed = Number(value);
  const safe = Number.isFinite(parsed) ? parsed : fallback;
  return Math.max(10, Math.min(600, Math.round(safe)));
}

function shortestPasswordWinners(players) {
  const eligible = players
    .filter(p => p.alive && p.submission && p.valid !== false)
    .map(p => ({ name: p.name, length: effectivePasswordLength(p), stars: Number(p.stars || 0) }));

  if (!eligible.length) return { winners: [], length: null, stars: null };

  const shortest = Math.min(...eligible.map(p => p.length));
  const shortestPlayers = eligible.filter(p => p.length === shortest);
  const mostStars = Math.max(...shortestPlayers.map(p => p.stars));
  return {
    winners: shortestPlayers.filter(p => p.stars === mostStars).map(p => p.name),
    length: shortest,
    stars: mostStars
  };
}

function shortKingWinners(players) {
  if (!players.length) return { winners: [], stars: 0 };
  const maxStars = Math.max(0, ...players.map(p => Number(p.stars || 0)));
  if (maxStars <= 0) return { winners: [], stars: 0 };
  return {
    winners: players.filter(p => Number(p.stars || 0) === maxStars).map(p => p.name),
    stars: maxStars
  };
}

function overallLeaderboard(meta, players) {
  if (!["results", "game_over"].includes(meta?.status)) return [];

  const ranked = players.map(p => ({
    id: p.id,
    name: p.name,
    alive: Boolean(p.alive),
    eliminatedRound: p.eliminatedRound ?? null,
    submitted: Boolean(p.submission),
    passwordLength: effectivePasswordLength(p),
    rawPasswordLength: passwordLength(p.submission),
    teamSize: Number(p.teamSize || 1),
    teamPenalty: teamPenalty(p),
    stars: Number(p.stars || 0)
  })).sort((a, b) => {
    // Anyone still alive always ranks above an eliminated player.
    if (a.alive !== b.alive) return Number(b.alive) - Number(a.alive);

    // Among eliminated players, surviving longer is more important than length.
    if (!a.alive && a.eliminatedRound !== b.eliminatedRound) {
      return (b.eliminatedRound ?? -1) - (a.eliminatedRound ?? -1);
    }

    // Within the same status/elimination round, a submitted shorter password ranks higher.
    if (a.submitted !== b.submitted) return Number(b.submitted) - Number(a.submitted);
    const aLength = a.passwordLength ?? Number.POSITIVE_INFINITY;
    const bLength = b.passwordLength ?? Number.POSITIVE_INFINITY;
    if (aLength !== bLength) return aLength - bLength;
    if (a.stars !== b.stars) return b.stars - a.stars;
    return a.name.localeCompare(b.name, "nb");
  });

  let previousKey = null;
  let previousRank = 0;
  return ranked.map((p, index) => {
    const key = [
      p.alive ? "alive" : "dead",
      p.alive ? "" : (p.eliminatedRound ?? ""),
      p.submitted ? "submitted" : "none",
      p.passwordLength ?? "none",
      p.stars ?? 0
    ].join("|");
    if (key !== previousKey) {
      previousRank = index + 1;
      previousKey = key;
    }
    return { ...p, rank: previousRank };
  });
}

const FAILURE_LABELS = new Map([
  ["Passordet må inneholde fornavnet på en gjest i bryllupet.", "Regel 1"],
  ["Passordet må inneholde minst én stor bokstav og ett tall.", "Regel 2.1"],
  ["Passordet må inneholde minst ett romertall.", "Regel 2.2"],
  ["Passordet må inneholde nøyaktig fem av bokstaven «e».", "Regel 3.1"],
  ["Passordet må inneholde navnet på en europeisk hovedstad.", "Regel 3.2"],
  ["Passordet må inneholde navnet på en karakter fra Marvel-universet.", "Regel 4"],
  ["Passordet må inneholde navnet på minst ett av dyrene som vises på bildene.", "Regel 5"],
  ["Passordet må inneholde det hemmelige ordet som låses opp i tidslinjen.", "Regel 6"],
  ["Passordet må inneholde årstallet da personene på bildene møtte hverandre for første gang.", "Regel 7"],
  ["Passordet må inneholde navnet på en Pokémon fra de første 151 i Pokédex.", "Regel 9"],
  ["Passordet må inneholde minst én av de syv siste bokstavene i det norske alfabetet.", "Regel 10"],
  ["Egget ble ikke stoppet innenfor riktig tidsvindu for et smilende egg.", "Regel 10"],
  ["Passordet må avsluttes med et tall som tilsvarer antall bokstaver «r» i passordet.", "Regel 11"],
  ["Passordet må inneholde nøyaktig ett av ordene «stein», «saks» eller «papir».", "Regel 12"],
  ["Passordet må inneholde navnet på et land som har et flagg med kun to farger.", "Regel 13"]
]);

function detailForFailure(text) {
  if (text === "Ingen passord ble levert.") {
    return { rule: "Ingen innsending", text };
  }
  return {
    rule: FAILURE_LABELS.get(text) || "Regel",
    text
  };
}

function noSubmissionValidation() {
  return {
    valid: false,
    failures: ["Ingen passord ble levert."]
  };
}


const REACTION_EMOJIS = ["🐸","🦆","🐒","🦖","🐔","🦀","🐧","🤡","👽","🐝","🦊","🐙"];
const REACTION_LOCK_KEY = "pbr-wedding:v10-12:reaction-lock";

function shuffled(values) {
  const out = [...values];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function randomReactionWaitMs(previous = null) {
  let next = 2000 + Math.floor(Math.random() * 5001);
  const prev = Number(previous);
  if (Number.isFinite(prev) && Math.abs(next - prev) < 500) {
    next = next <= 4500 ? Math.min(7000, next + 750) : Math.max(2000, next - 750);
  }
  return next;
}

function randomReactionEmoji() {
  return REACTION_EMOJIS[Math.floor(Math.random() * REACTION_EMOJIS.length)];
}

function createReactionState(players) {
  const pool = shuffled(players);
  const matches = [];
  while (pool.length >= 2) {
    const left = pool.shift();
    const right = pool.shift();
    matches.push({
      id: `reaction-${left.id.slice(0,6)}-${right.id.slice(0,6)}`,
      leftId: left.id,
      leftName: left.name,
      leftEmoji: randomReactionEmoji(),
      rightId: right.id,
      rightName: right.name,
      rightEmoji: randomReactionEmoji(),
      leftLives: Math.max(1, Number(left.lives || 1)),
      rightLives: Math.max(1, Number(right.lives || 1)),
      attempt: 1,
      phase: "ready",
      leftReady: false,
      rightReady: false,
      signalAt: null,
      waitMs: null,
      leftTapAt: null,
      rightTapAt: null,
      leftReactionMs: null,
      rightReactionMs: null,
      leftEarly: false,
      rightEarly: false,
      resultAt: null,
      lastWinnerId: null,
      lastLoserId: null,
      finished: false,
      winnerId: null,
      loserId: null
    });
  }
  const byes = pool.map(p => ({ id: p.id, name: p.name, lives: Math.max(1, Number(p.lives || 1)), emoji: randomReactionEmoji() }));
  return { matches, byes, createdAt: Date.now() };
}

function reactionMatchFor(reaction, playerId) {
  return (reaction?.matches || []).find(m => m.leftId === playerId || m.rightId === playerId) || null;
}

function reactionSide(match, playerId) {
  if (match?.leftId === playerId) return "left";
  if (match?.rightId === playerId) return "right";
  return null;
}

function resetReactionAttempt(match) {
  match.attempt = Number(match.attempt || 1) + 1;
  match.phase = "armed";
  match.leftReady = false;
  match.rightReady = false;
  match.waitMs = randomReactionWaitMs(match.waitMs);
  match.signalAt = Date.now() + match.waitMs;
  match.leftTapAt = null;
  match.rightTapAt = null;
  match.leftReactionMs = null;
  match.rightReactionMs = null;
  match.leftEarly = false;
  match.rightEarly = false;
  match.resultAt = null;
  match.lastWinnerId = null;
  match.lastLoserId = null;
}

async function finishReactionAttempt(match, playersById, redis) {
  let winnerSide;
  if (match.leftEarly !== match.rightEarly) {
    winnerSide = match.leftEarly ? "right" : "left";
  } else if (match.leftEarly && match.rightEarly) {
    const leftGap = Math.abs(Number(match.signalAt) - Number(match.leftTapAt));
    const rightGap = Math.abs(Number(match.signalAt) - Number(match.rightTapAt));
    winnerSide = leftGap === rightGap ? (Math.random() < 0.5 ? "left" : "right") : (leftGap < rightGap ? "left" : "right");
  } else {
    const leftMs = Number(match.leftReactionMs);
    const rightMs = Number(match.rightReactionMs);
    winnerSide = leftMs === rightMs ? (Math.random() < 0.5 ? "left" : "right") : (leftMs < rightMs ? "left" : "right");
  }

  const loserSide = winnerSide === "left" ? "right" : "left";
  const winnerId = match[`${winnerSide}Id`];
  const loserId = match[`${loserSide}Id`];
  match[`${loserSide}Lives`] = Math.max(0, Number(match[`${loserSide}Lives`] || 0) - 1);
  match.lastWinnerId = winnerId;
  match.lastLoserId = loserId;
  match.resultAt = Date.now();
  match.phase = "result";
  match.leftReady = false;
  match.rightReady = false;

  const loser = playersById.get(loserId);
  const winner = playersById.get(winnerId);
  if (loser) {
    loser.lives = match[`${loserSide}Lives`];
    loser.lostLifeRound = 17;
    if (loser.lives <= 0) {
      loser.alive = false;
      loser.valid = false;
      loser.eliminatedRound = 17;
      loser.reason = `Du er eliminert fra leken av ${winner?.name || "motstanderen"}.`;
      loser.failures = [loser.reason];
      loser.failureDetails = [{ rule: "Reaksjonsduell", text: loser.reason }];
      match.finished = true;
      match.phase = "finished";
      match.winnerId = winnerId;
      match.loserId = loserId;
    }
    await savePlayer(loser, redis);
  }
  if (winner) {
    winner.lives = match[`${winnerSide}Lives`];
    winner.alive = true;
    winner.valid = true;
    winner.eliminatedRound = null;
    winner.reason = null;
    winner.failures = [];
    winner.failureDetails = [];
    winner.lostLifeRound = null;
    await savePlayer(winner, redis);
  }
}

async function advanceReaction(meta, players, redis) {
  if (meta.status !== "round_open" || RULES[meta.round - 1]?.id !== "reaction" || !meta.reaction) return { meta, players };
  const now = Date.now();
  const reaction = { ...meta.reaction, matches: (meta.reaction.matches || []).map(m => ({ ...m })) };
  const playersById = new Map(players.map(p => [p.id, p]));
  let changed = false;

  for (const match of reaction.matches) {
    if (match.finished) continue;
    if (match.phase === "armed" && Number(match.signalAt || 0) > 0 && now >= Number(match.signalAt) + 5000) {
      if (match.leftTapAt == null) {
        match.leftTapAt = Number(match.signalAt) + 5000;
        match.leftReactionMs = 5000;
      }
      if (match.rightTapAt == null) {
        match.rightTapAt = Number(match.signalAt) + 5000;
        match.rightReactionMs = 5000;
      }
      await finishReactionAttempt(match, playersById, redis);
      changed = true;
    }
  }

  if (reaction.matches.every(m => m.finished)) {
    const latestPlayers = await getPlayers(redis);
    meta = await setMeta({ ...meta, reaction, status: "results", deadline: null }, redis);
    return { meta, players: latestPlayers };
  }
  if (changed) meta = await setMeta({ ...meta, reaction }, redis);
  return { meta, players: await getPlayers(redis) };
}

async function withReactionLock(redis, fn) {
  const token = createToken();
  const deadline = Date.now() + 2200;
  while (Date.now() < deadline) {
    const acquired = await redis.set(REACTION_LOCK_KEY, token, { nx: true, px: 2500 });
    if (acquired) {
      try { return await fn(); }
      finally {
        const current = await redis.get(REACTION_LOCK_KEY);
        if (current === token) await redis.del(REACTION_LOCK_KEY);
      }
    }
    await new Promise(resolve => setTimeout(resolve, 35));
  }
  fail("Reaksjonsduellen er opptatt et øyeblikk. Prøv igjen.", 409);
}

function publicState(meta, players) {
  const {
    lastRound = null,
    roundHistory = [],
    ...safeMeta
  } = meta || defaultMeta();

  const revealResults = safeMeta.status === "results" || safeMeta.status === "game_over";

  return {
    serverNow: Date.now(),
    meta: safeMeta,
    rules: RULES.slice(0, safeMeta.round),
    totalRules: RULES.length,
    roundResults: revealResults ? lastRound : null,
    leaderboard: revealResults ? overallLeaderboard(safeMeta, players) : [],
    roundHistory: (roundHistory || []).map(result => ({
      round: result.round,
      started: result.started,
      submitted: result.submitted,
      eliminated: result.eliminated,
      remaining: result.remaining,
      failureCounts: result.failureCounts || [],
      shortestPasswordLength: result.shortestPasswordLength ?? null,
      starRecipients: result.starRecipients || []
    })),
    players: players
      .map(p => ({
        id: p.id,
        name: p.name,
        alive: Boolean(p.alive),
        hasSubmitted: Boolean(p.submission),
        valid: revealResults && p.submission ? Boolean(p.valid) : null,
        eliminatedRound: p.eliminatedRound ?? null,
        reason: revealResults ? (p.reason ?? null) : null,
        failures: revealResults ? (p.failures || []) : [],
        walterFeedRound: p.walterFeedRound ?? null,
        walterFeedCount: p.walterFeedCount ?? 0,
        lives: Number(p.lives ?? 1),
        teamSize: Number(p.teamSize || 1),
        teamPenalty: teamPenalty(p),
        stars: Number(p.stars || 0),
        timelineSolved: Boolean(p.timelineSolved),
        lostLifeRound: p.lostLifeRound ?? null
      }))
      .sort((a, b) => Number(b.alive) - Number(a.alive) || a.name.localeCompare(b.name, "nb"))
  };
}

function makeRoundResult(round, playersAtStart, finalPlayers) {
  const finalById = new Map(finalPlayers.map(p => [p.id, p]));
  const resultPlayers = playersAtStart.map(startPlayer => {
    const p = finalById.get(startPlayer.id) || startPlayer;
    return {
      id: p.id,
      name: p.name,
      password: p.submission || null,
      passwordLength: effectivePasswordLength(p),
      rawPasswordLength: passwordLength(p.submission),
      teamSize: Number(p.teamSize || 1),
      teamPenalty: teamPenalty(p),
      submitted: Boolean(p.submission),
      submittedAt: p.submittedAt ?? null,
      survived: Boolean(p.alive),
      valid: Boolean(p.valid),
      stars: Number(p.stars || 0),
      starAwarded: p.starAwardedRound === round,
      lostLife: p.lostLifeRound === round,
      failures: (p.failureDetails || []).map(item => ({
        rule: item.rule,
        text: item.text
      }))
    };
  })
    .sort((a, b) => {
      if (a.submitted !== b.submitted) return Number(b.submitted) - Number(a.submitted);
      if (!a.submitted) return a.name.localeCompare(b.name, "nb");
      return a.passwordLength - b.passwordLength
        || (a.submittedAt || 0) - (b.submittedAt || 0)
        || a.name.localeCompare(b.name, "nb");
    });

  let previousLength = null;
  let previousRank = 0;
  let submittedIndex = 0;
  for (const p of resultPlayers) {
    if (!p.submitted) {
      p.rank = null;
      continue;
    }
    submittedIndex += 1;
    if (p.passwordLength !== previousLength) {
      previousRank = submittedIndex;
      previousLength = p.passwordLength;
    }
    p.rank = previousRank;
  }

  for (const p of resultPlayers) delete p.submittedAt;

  const counts = new Map();
  for (const p of resultPlayers) {
    if (p.valid) continue;
    for (const failure of p.failures) {
      const key = `${failure.rule}\u0000${failure.text}`;
      const current = counts.get(key) || { ...failure, count: 0 };
      current.count += 1;
      counts.set(key, current);
    }
  }

  const failureCounts = [...counts.values()]
    .sort((a, b) => b.count - a.count || a.rule.localeCompare(b.rule, "nb"));

  return {
    round,
    started: resultPlayers.length,
    submitted: resultPlayers.filter(p => p.submitted).length,
    eliminated: resultPlayers.filter(p => !p.survived).length,
    remaining: finalPlayers.filter(p => p.alive).length,
    failureCounts,
    shortestPasswordLength: (() => {
      const valid = resultPlayers.filter(p => p.submitted && p.valid);
      return valid.length ? Math.min(...valid.map(p => p.passwordLength)) : null;
    })(),
    starRecipients: resultPlayers.filter(p => p.starAwarded).map(p => ({ id: p.id, name: p.name, stars: p.stars, passwordLength: p.passwordLength })),
    players: resultPlayers,
    closedAt: Date.now()
  };
}

export default async function handler(req, res) {
  try {
    const redis = getRedis();

    if (req.method === "GET") {
      let [meta, players] = await Promise.all([getMeta(redis), getPlayers(redis)]);
      ({ meta, players } = await advanceReaction(meta, players, redis));
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
      const nameKey = name.toLocaleLowerCase("nb-NO");
      const id = createId();
      const token = createToken();
      const teamSize = inferTeamSize(name);
      const claimed = await redis.hsetnx(NAMES_KEY, nameKey, id);
      if (!claimed) fail("That name is already taken.", 409);
      const player = {
        id,
        name,
        token,
        alive: true,
        submission: null,
        valid: null,
        failures: [],
        failureDetails: [],
        submittedAt: null,
        eliminatedRound: null,
        reason: null,
        walterFeedRound: null,
        walterFeedCount: 0,
        walterFirstFedAt: null,
        lives: STARTING_LIVES,
        teamSize,
        stars: 0,
        starAwardedRound: null,
        lostLifeRound: null,
        timelineSolved: false,
        eggSeconds: null
      };
      await savePlayer(player, redis);
      const players = await getPlayers(redis);
      return send(res, 200, { ok: true, player: { id, name, token, teamSize }, state: publicState(meta, players) });
    }

    if (action === "feed_walter") {
      if (meta.status !== "round_open") fail("Walter kan bare mates mens en runde pågår.", 409);
      if (meta.round < WALTER_ROUND) fail("Walter-regelen har ikke startet ennå.", 409);
      if (meta.deadline && Date.now() > meta.deadline) fail("Tiden er ute for denne runden.", 409);

      const player = await getPlayer(body.playerId, redis);
      if (!player || player.token !== body.playerToken) fail("Player session not found. Rejoin after the next reset.", 401);
      if (!player.alive) fail("You have been eliminated.", 409);

      const now = Date.now();
      if (player.walterFeedRound !== meta.round) {
        player.walterFeedRound = meta.round;
        player.walterFeedCount = 0;
        player.walterFirstFedAt = now;
      }
      if (!player.walterFirstFedAt) player.walterFirstFedAt = now;
      player.walterFeedCount = Math.min(999, Number(player.walterFeedCount || 0) + 1);
      await savePlayer(player, redis);

      return send(res, 200, {
        ok: true,
        walterFeedRound: meta.round,
        walterFeedCount: player.walterFeedCount
      });
    }

    if (action === "solve_timeline") {
      if (meta.status !== "round_open" || meta.round !== TIMELINE_ROUND) fail(`Tidslinjen kan bare løses i runde ${TIMELINE_ROUND}.`, 409);
      if (meta.deadline && Date.now() > meta.deadline) fail("Tiden er ute for denne runden.", 409);
      const player = await getPlayer(body.playerId, redis);
      if (!player || player.token !== body.playerToken) fail("Player session not found. Rejoin after the next reset.", 401);
      if (!player.alive) fail("You have been eliminated.", 409);
      const order = Array.isArray(body.order) ? body.order.map(String) : [];
      const correct = order.length === TIMELINE_ORDER.length && TIMELINE_ORDER.every((id, index) => order[index] === id);
      if (!correct) return send(res, 200, { ok: true, solved: false });
      player.timelineSolved = true;
      await savePlayer(player, redis);
      return send(res, 200, { ok: true, solved: true, secret: "noldus" });
    }

    if (action === "submit") {
      if (meta.status !== "round_open") fail("Submissions are not open right now.", 409);
      if (RULES[meta.round - 1]?.id === "reaction") fail("Reaksjonsrunden har ingen passordinnsending.", 409);
      if (meta.roundStartsAt && Date.now() < meta.roundStartsAt) fail("Runden starter om et øyeblikk.", 409);
      if (meta.deadline && Date.now() > meta.deadline) fail("Time is up for this round.", 409);
      const player = await getPlayer(body.playerId, redis);
      if (!player || player.token !== body.playerToken) fail("Player session not found. Rejoin after the next reset.", 401);
      if (!player.alive) fail("You have been eliminated.", 409);
      const password = String(body.password ?? "").slice(0, 200);
      if (!password) fail("Enter a password first.");

      // Deliberately do NOT tell the player whether the password passes yet.
      // Validation happens when the host closes the round.
      if (meta.round === EGG_ROUND) {
        const eggSeconds = Number(body.eggSeconds);
        if (!Number.isFinite(eggSeconds) || eggSeconds < 0 || eggSeconds > 60) {
          fail(`Du må koke egget og stoppe timeren før du kan levere i runde ${EGG_ROUND}.`, 409);
        }
        player.eggSeconds = Math.round(eggSeconds * 100) / 100;
      }

      player.submission = password;
      player.valid = null;
      player.failures = [];
      player.failureDetails = [];
      player.submittedAt = Date.now();
      await savePlayer(player, redis);

      return send(res, 200, { ok: true, submitted: true });
    }

    if (action === "reaction_ready") {
      return await withReactionLock(redis, async () => {
        meta = await getMeta(redis);
        let players = await getPlayers(redis);
        ({ meta, players } = await advanceReaction(meta, players, redis));
        if (meta.status !== "round_open" || RULES[meta.round - 1]?.id !== "reaction" || !meta.reaction) fail("Reaksjonsrunden er ikke aktiv.", 409);
        const p = await getPlayer(body.playerId, redis);
        if (!p || p.token !== body.playerToken) fail("Ugyldig spiller.", 401);
        if (!p.alive) fail("Du er allerede eliminert.", 409);
        const reaction = { ...meta.reaction, matches: meta.reaction.matches.map(m => ({ ...m })) };
        const match = reactionMatchFor(reaction, p.id);
        if (!match || match.finished) return send(res, 200, { ok: true, state: publicState(meta, players) });
        const side = reactionSide(match, p.id);
        if (match.phase === "result") {
          match[`${side}Ready`] = true;
          if (match.leftReady && match.rightReady) resetReactionAttempt(match);
        } else if (match.phase === "ready") {
          match[`${side}Ready`] = true;
          if (match.leftReady && match.rightReady) {
            match.phase = "armed";
            match.waitMs = randomReactionWaitMs(match.waitMs);
            match.signalAt = Date.now() + match.waitMs;
            match.leftTapAt = null;
            match.rightTapAt = null;
            match.leftReactionMs = null;
            match.rightReactionMs = null;
            match.leftEarly = false;
            match.rightEarly = false;
          }
        }
        meta = await setMeta({ ...meta, reaction }, redis);
        players = await getPlayers(redis);
        return send(res, 200, { ok: true, state: publicState(meta, players) });
      });
    }

    if (action === "reaction_tap") {
      return await withReactionLock(redis, async () => {
        meta = await getMeta(redis);
        let players = await getPlayers(redis);
        ({ meta, players } = await advanceReaction(meta, players, redis));
        if (meta.status !== "round_open" || RULES[meta.round - 1]?.id !== "reaction" || !meta.reaction) fail("Reaksjonsrunden er ikke aktiv.", 409);
        const p = await getPlayer(body.playerId, redis);
        if (!p || p.token !== body.playerToken) fail("Ugyldig spiller.", 401);
        if (!p.alive) fail("Du er allerede eliminert.", 409);
        const reaction = { ...meta.reaction, matches: meta.reaction.matches.map(m => ({ ...m })) };
        const match = reactionMatchFor(reaction, p.id);
        if (!match || match.finished) fail("Du har ingen aktiv reaksjonsduell.", 409);
        if (match.phase !== "armed" || !match.signalAt) fail("Begge må være klare før du kan trykke.", 409);
        const side = reactionSide(match, p.id);
        if (match[`${side}TapAt`] != null) return send(res, 200, { ok: true, state: publicState(meta, players) });
        const now = Date.now();
        const clientDelta = Number(body.reactionMs);
        const useClientTiming = Number.isFinite(clientDelta) && clientDelta >= -7000 && clientDelta <= 5000;
        if (useClientTiming) {
          const roundedDelta = Math.round(clientDelta);
          match[`${side}TapAt`] = Number(match.signalAt) + roundedDelta;
          match[`${side}Early`] = roundedDelta < 0;
          match[`${side}ReactionMs`] = roundedDelta < 0 ? null : roundedDelta;
        } else {
          match[`${side}TapAt`] = now;
          if (now < Number(match.signalAt)) {
            match[`${side}Early`] = true;
            match[`${side}ReactionMs`] = null;
          } else {
            match[`${side}ReactionMs`] = Math.max(0, now - Number(match.signalAt));
          }
        }
        if (match.leftTapAt != null && match.rightTapAt != null) {
          const byId = new Map(players.map(x => [x.id, x]));
          await finishReactionAttempt(match, byId, redis);
        }
        meta = await setMeta({ ...meta, reaction }, redis);
        players = await getPlayers(redis);
        if (reaction.matches.every(m => m.finished)) ({ meta, players } = await advanceReaction(meta, players, redis));
        return send(res, 200, { ok: true, state: publicState(meta, players) });
      });
    }

    assertHostKey(getHostKey(req, body));

    if (action === "set_timer") {
      if (meta.status !== "lobby") fail("Change the timer before starting the game.", 409);
      const seconds = roundSeconds(body.seconds, meta.roundSeconds || 60);
      meta = await setMeta({ ...meta, roundSeconds: Math.round(seconds) }, redis);

    } else if (action === "start") {
      if (meta.status !== "lobby") fail("The game is not in the lobby.", 409);
      const seconds = roundSeconds(body.seconds, meta.roundSeconds || 60);
      const players = await getPlayers(redis);
      if (!players.length) fail("At least one player must join first.", 409);

      for (const p of players) {
        p.alive = true;
        p.submission = null;
        p.valid = null;
        p.failures = [];
        p.failureDetails = [];
        p.submittedAt = null;
        p.eliminatedRound = null;
        p.reason = null;
        p.walterFeedRound = null;
        p.walterFeedCount = 0;
        p.walterFirstFedAt = null;
        p.lives = STARTING_LIVES;
        p.stars = 0;
        p.starAwardedRound = null;
        p.lostLifeRound = null;
        p.timelineSolved = false;
        p.eggSeconds = null;
        await savePlayer(p, redis);
      }

      const roundStartsAt = Date.now() + 2000;
      meta = await setMeta({
        ...meta,
        status: "round_open",
        round: 1,
        roundSeconds: seconds,
        roundStartsAt,
        deadline: Date.now() + (seconds + 4) * 1000,
        winner: null,
        winners: [],
        winningPasswordLength: null,
        winningStars: null,
        shortKings: [],
        shortKingStars: 0,
        lastRound: null,
        roundHistory: []
      }, redis);

    } else if (action === "close_round") {
      if (meta.status !== "round_open") fail("There is no open round to close.", 409);
      if (RULES[meta.round - 1]?.id === "reaction") fail("Reaksjonsrunden avsluttes automatisk når alle duellene er ferdige.", 409);

      const players = await getPlayers(redis);
      const playersAtStart = players.filter(p => p.alive);

      const validationById = new Map();
      for (const p of playersAtStart) {
        validationById.set(
          p.id,
          p.submission ? validatePassword(p.submission, meta.round, { playerName: p.name }) : noSubmissionValidation()
        );
      }

      // The first valid player to submit an otherwise identical password keeps it.
      // Letter case DOES create a different password. Leading/trailing spaces are still ignored.
      const validPlayers = playersAtStart
        .filter(p => p.submission && validationById.get(p.id)?.valid)
        .sort((a, b) => (a.submittedAt || 0) - (b.submittedAt || 0));

      const firstByPassword = new Map();
      for (const p of validPlayers) {
        const key = duplicateKey(p.submission);
        if (!firstByPassword.has(key)) firstByPassword.set(key, { id: p.id, name: p.name });
      }

      // Build every ordinary failure first. The group-based rule 15 is resolved only
      // after we know which otherwise-valid players chose stein/saks/papir.
      const failureDetailsById = new Map();
      for (const p of playersAtStart) {
        const validation = validationById.get(p.id) || noSubmissionValidation();
        const failureDetails = (validation.failures || []).map(detailForFailure);

        if (meta.round === TIMELINE_ROUND && !p.timelineSolved) {
          failureDetails.push({
            rule: `Regel ${TIMELINE_ROUND}`,
            text: `Du må løse tidslinjen før passordet kan godkjennes i runde ${TIMELINE_ROUND}.`
          });
        }

        if (meta.round === EGG_ROUND) {
          const eggSeconds = Number(p.eggSeconds);
          if (!Number.isFinite(eggSeconds) || eggSeconds < 6 || eggSeconds > 8) {
            failureDetails.push({
              rule: `Regel ${EGG_ROUND}`,
              text: "Egget ble ikke stoppet innenfor riktig tidsvindu for et smilende egg."
            });
          }
        }

        if (meta.round >= WALTER_ROUND) {
          const fedBeforeFinalSubmission = Boolean(
            p.walterFeedRound === meta.round &&
            Number(p.walterFeedCount || 0) >= 1 &&
            p.walterFirstFedAt &&
            p.submittedAt &&
            p.walterFirstFedAt <= p.submittedAt
          );
          if (!fedBeforeFinalSubmission) {
            failureDetails.push({
              rule: `Regel ${WALTER_ROUND}`,
              text: "Du glemte å mate Walter før du leverte passordet denne runden."
            });
          }
        }

        if (validation.valid && p.submission) {
          const first = firstByPassword.get(duplicateKey(p.submission));
          if (first && first.id !== p.id) {
            failureDetails.push({
              rule: "Duplikat",
              text: `${first.name} leverte det samme passordet først.`
            });
          }
        }

        failureDetailsById.set(p.id, failureDetails);
      }

      // Korteste gyldige passord i hver runde får en stjerne. Ugyldige passord teller aldri.
      const starCandidates = playersAtStart.filter(p => p.submission && (failureDetailsById.get(p.id) || []).length === 0);
      if (starCandidates.length) {
        const shortest = Math.min(...starCandidates.map(p => effectivePasswordLength(p)));
        for (const p of starCandidates.filter(p => effectivePasswordLength(p) === shortest)) {
          p.stars = Number(p.stars || 0) + 1;
          p.starAwardedRound = meta.round;
        }
      }

      // Stein–saks–papir avgjøres som en gruppeavstemning bare i introduksjonsrunden.
      // Selve ordkravet er kumulativt i senere runder, men gruppeutfallet beregnes ikke på nytt.
      let rpsSummary = null;
      if (meta.round === RPS_ROUND) {
        const counts = { stein: 0, saks: 0, papir: 0 };
        const choiceById = new Map();

        for (const p of playersAtStart) {
          const failures = failureDetailsById.get(p.id) || [];
          if (failures.length || !p.submission) continue;
          const choice = getRpsChoice(p.submission);
          if (!choice) continue;
          choiceById.set(p.id, choice);
          counts[choice] += 1;
        }

        const maxCount = Math.max(counts.stein, counts.saks, counts.papir);
        const leaders = maxCount > 0
          ? Object.keys(counts).filter(choice => counts[choice] === maxCount)
          : [];

        if (leaders.length) {
          for (const p of playersAtStart) {
            const failures = failureDetailsById.get(p.id) || [];
            if (failures.length) continue;
            const choice = choiceById.get(p.id);
            if (!choice || leaders.includes(choice)) continue;

            const leaderText = leaders.map(rpsChoiceLabel).join(" og ");
            failures.push({
              rule: `Regel ${RPS_ROUND}`,
              text: `Du valgte ${rpsChoiceLabel(choice)}. ${leaderText} hadde flest valg denne runden.`
            });
          }
        }

        rpsSummary = {
          counts: ["stein", "saks", "papir"].map(id => ({ id, label: rpsChoiceLabel(id), count: counts[id] })),
          leaders: leaders.map(id => ({ id, label: rpsChoiceLabel(id) })),
          maxCount
        };
      }

      for (const p of playersAtStart) {
        const failureDetails = failureDetailsById.get(p.id) || [];
        const failed = failureDetails.length > 0;
        const isFinalRound = meta.round >= RULES.length;
        const currentLives = Math.max(1, Number(p.lives ?? STARTING_LIVES));
        const canUseExtraLife = failed && !isFinalRound && currentLives > 1;

        if (canUseExtraLife) {
          p.lives = currentLives - 1;
          p.alive = true;
          p.valid = false;
          p.lostLifeRound = meta.round;
          p.eliminatedRound = null;
          p.reason = failureDetails.map(item => `${item.rule}: ${item.text}`).join(" · ");
        } else {
          p.alive = !failed;
          p.valid = !failed;
          if (failed) p.lives = 0;
          p.eliminatedRound = failed ? meta.round : null;
          p.reason = failed ? failureDetails.map(item => `${item.rule}: ${item.text}`).join(" · ") : null;
        }

        p.failures = failureDetails.map(item => item.text);
        p.failureDetails = failureDetails;
        await savePlayer(p, redis);
      }

      const after = await getPlayers(redis);
      const survivors = after.filter(p => p.alive);
      const roundResult = makeRoundResult(meta.round, playersAtStart, after);
      if (rpsSummary) roundResult.rpsSummary = rpsSummary;
      const roundHistory = [...(meta.roundHistory || []), roundResult];

      if (meta.round >= RULES.length) {
        const finalRanking = shortestPasswordWinners(survivors);
        const shortKings = shortKingWinners(after);
        meta = await setMeta({
          ...meta,
          status: "game_over",
          deadline: null,
          winner: finalRanking.winners[0] || null,
          winners: finalRanking.winners,
          winningPasswordLength: finalRanking.length,
          winningStars: finalRanking.stars,
          shortKings: shortKings.winners,
          shortKingStars: shortKings.stars,
          lastRound: roundResult,
          roundHistory
        }, redis);
      } else if (survivors.length === 0) {
        meta = await setMeta({
          ...meta,
          status: "game_over",
          deadline: null,
          winner: null,
          winners: [],
          winningPasswordLength: null,
          shortKings: shortKingWinners(after).winners,
          shortKingStars: shortKingWinners(after).stars,
          lastRound: roundResult,
          roundHistory
        }, redis);
      } else {
        meta = await setMeta({
          ...meta,
          status: "results",
          deadline: null,
          lastRound: roundResult,
          roundHistory
        }, redis);
      }

    } else if (action === "next_round") {
      if (meta.status !== "results") fail("Close the current round first.", 409);
      const seconds = roundSeconds(body.seconds, meta.roundSeconds || 60);
      const players = await getPlayers(redis);
      const survivors = players.filter(p => p.alive);

      if (survivors.length === 0 || meta.round >= RULES.length) {
        const finalRanking = shortestPasswordWinners(survivors);
        const shortKings = shortKingWinners(players);
        meta = await setMeta({
          ...meta,
          status: "game_over",
          winner: finalRanking.winners[0] || null,
          winners: finalRanking.winners,
          winningPasswordLength: finalRanking.length,
          winningStars: finalRanking.stars,
          shortKings: shortKings.winners,
          shortKingStars: shortKings.stars,
          deadline: null
        }, redis);
      } else {
        for (const p of survivors) {
          p.submission = null;
          p.eggSeconds = null;
          p.valid = null;
          p.failures = [];
          p.failureDetails = [];
          p.submittedAt = null;
          p.reason = null;
          p.walterFeedRound = null;
          p.walterFeedCount = 0;
          p.walterFirstFedAt = null;
          // Behold gjenværende liv mellom rundene.
          // Når finalen starter, går alle finalister over til sudden death.
          if (meta.round + 1 >= RULES.length) p.lives = 1;
          p.lostLifeRound = null;
          await savePlayer(p, redis);
        }

        const nextRound = meta.round + 1;
        const reactionRound = RULES[nextRound - 1]?.id === "reaction";
        const roundStartsAt = Date.now() + 2000;
        const reaction = reactionRound ? createReactionState(survivors) : null;
        meta = await setMeta({
          ...meta,
          status: "round_open",
          round: nextRound,
          roundSeconds: seconds,
          roundStartsAt,
          deadline: reactionRound ? null : Date.now() + (seconds + 4) * 1000,
          reaction,
          ...(reactionRound ? { lastRound: null } : {})
        }, redis);
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
