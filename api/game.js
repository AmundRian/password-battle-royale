import {
  RULES, NAMES_KEY, assertHostKey, createId, createToken, defaultMeta,
  getMeta, getPlayer, getPlayers, getRedis, resetGame,
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

function duplicateKey(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .trim()
    .toLocaleLowerCase("nb-NO");
}

function passwordLength(value) {
  return value == null ? null : [...String(value)].length;
}

function roundSeconds(value, fallback = 60) {
  const parsed = Number(value);
  const safe = Number.isFinite(parsed) ? parsed : fallback;
  return Math.max(10, Math.min(600, Math.round(safe)));
}

function shortestPasswordWinners(players) {
  const eligible = players
    .filter(p => p.alive && p.submission)
    .map(p => ({ name: p.name, length: passwordLength(p.submission) }));

  if (!eligible.length) return { winners: [], length: null };

  const shortest = Math.min(...eligible.map(p => p.length));
  return {
    winners: eligible.filter(p => p.length === shortest).map(p => p.name),
    length: shortest
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
    passwordLength: passwordLength(p.submission)
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
    return aLength - bLength || a.name.localeCompare(b.name, "nb");
  });

  let previousKey = null;
  let previousRank = 0;
  return ranked.map((p, index) => {
    const key = [
      p.alive ? "alive" : "dead",
      p.alive ? "" : (p.eliminatedRound ?? ""),
      p.submitted ? "submitted" : "none",
      p.passwordLength ?? "none"
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
  ["Passordet må inneholde minst ett kodeord fra NATOs fonetiske alfabet.", "Regel 4"],
  ["Passordet må inneholde en hovedingrediens i pannekakerøre.", "Regel 5.1"],
  ["Passordet må inneholde minst én av de syv siste bokstavene i det norske alfabetet.", "Regel 5.2"],
  ["Passordet må inneholde navnet på minst ett av dyrene som vises på bildene.", "Regel 6"],
  ["Passordet må inneholde årstallet da personene på bildene møtte hverandre for første gang.", "Regel 7"],
  ["Passordet må inneholde navnet på en låt av The Beatles, Queen eller The Killers.", "Regel 9"],
  ["Passordet må inneholde navnet på en Pokémon fra de første 150 i Pokédex.", "Regel 10"],
  ["Passordet må inneholde initialene til en deltaker fra «Mesternes mester», skrevet med store bokstaver.", "Regel 11"],
  ["Summen av alle tallene i passordet må være et partall.", "Regel 12"],
  ["Passordet må avsluttes med et tall som tilsvarer antall bokstaver «r» i passordet.", "Regel 13"],
  ["Passordet må inneholde tittelen på en film med Brad Pitt.", "Regel 14"],
  ["Passordet må inneholde navnet på et bryllupsjubileum.", "Regel 15"]
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

function publicState(meta, players) {
  const {
    lastRound = null,
    roundHistory = [],
    ...safeMeta
  } = meta || defaultMeta();

  const revealResults = safeMeta.status === "results" || safeMeta.status === "game_over";

  return {
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
      shortestPasswordLength: result.shortestPasswordLength ?? null
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
        walterFeedCount: p.walterFeedCount ?? 0
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
      passwordLength: passwordLength(p.submission),
      submitted: Boolean(p.submission),
      submittedAt: p.submittedAt ?? null,
      survived: Boolean(p.alive),
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
    if (p.survived) continue;
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
    shortestPasswordLength: resultPlayers.find(p => p.submitted && p.survived)?.passwordLength ?? null,
    players: resultPlayers,
    closedAt: Date.now()
  };
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
      const nameKey = name.toLocaleLowerCase("nb-NO");
      const id = createId();
      const token = createToken();
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
        walterFirstFedAt: null
      };
      await savePlayer(player, redis);
      const players = await getPlayers(redis);
      return send(res, 200, { ok: true, player: { id, name, token }, state: publicState(meta, players) });
    }

    if (action === "feed_walter") {
      if (meta.status !== "round_open") fail("Walter kan bare mates mens en runde pågår.", 409);
      if (meta.round < 8) fail("Walter-regelen har ikke startet ennå.", 409);
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

    if (action === "submit") {
      if (meta.status !== "round_open") fail("Submissions are not open right now.", 409);
      if (meta.deadline && Date.now() > meta.deadline) fail("Time is up for this round.", 409);
      const player = await getPlayer(body.playerId, redis);
      if (!player || player.token !== body.playerToken) fail("Player session not found. Rejoin after the next reset.", 401);
      if (!player.alive) fail("You have been eliminated.", 409);
      const password = String(body.password ?? "").slice(0, 200);
      if (!password) fail("Enter a password first.");

      // Deliberately do NOT tell the player whether the password passes yet.
      // Validation happens when the host closes the round.
      player.submission = password;
      player.valid = null;
      player.failures = [];
      player.failureDetails = [];
      player.submittedAt = Date.now();
      await savePlayer(player, redis);

      return send(res, 200, { ok: true, submitted: true });
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
        await savePlayer(p, redis);
      }

      meta = await setMeta({
        ...meta,
        status: "round_open",
        round: 1,
        roundSeconds: seconds,
        deadline: Date.now() + seconds * 1000,
        winner: null,
        winners: [],
        winningPasswordLength: null,
        lastRound: null,
        roundHistory: []
      }, redis);

    } else if (action === "close_round") {
      if (meta.status !== "round_open") fail("There is no open round to close.", 409);

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
      // Case and leading/trailing spaces do not create a "new" password.
      const validPlayers = playersAtStart
        .filter(p => p.submission && validationById.get(p.id)?.valid)
        .sort((a, b) => (a.submittedAt || 0) - (b.submittedAt || 0));

      const firstByPassword = new Map();
      for (const p of validPlayers) {
        const key = duplicateKey(p.submission);
        if (!firstByPassword.has(key)) firstByPassword.set(key, { id: p.id, name: p.name });
      }

      for (const p of playersAtStart) {
        const validation = validationById.get(p.id) || noSubmissionValidation();
        const failureDetails = (validation.failures || []).map(detailForFailure);

        if (meta.round >= 8) {
          const fedBeforeFinalSubmission = Boolean(
            p.walterFeedRound === meta.round &&
            Number(p.walterFeedCount || 0) >= 1 &&
            p.walterFirstFedAt &&
            p.submittedAt &&
            p.walterFirstFedAt <= p.submittedAt
          );
          if (!fedBeforeFinalSubmission) {
            failureDetails.push({
              rule: "Regel 8",
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

        const eliminated = failureDetails.length > 0;

        p.alive = !eliminated;
        p.valid = !eliminated;
        p.failures = failureDetails.map(item => item.text);
        p.failureDetails = failureDetails;
        p.eliminatedRound = eliminated ? meta.round : null;
        p.reason = eliminated
          ? failureDetails.map(item => `${item.rule}: ${item.text}`).join(" · ")
          : null;

        await savePlayer(p, redis);
      }

      const after = await getPlayers(redis);
      const survivors = after.filter(p => p.alive);
      const roundResult = makeRoundResult(meta.round, playersAtStart, after);
      const roundHistory = [...(meta.roundHistory || []), roundResult];

      if (meta.round >= RULES.length) {
        const finalRanking = shortestPasswordWinners(survivors);
        meta = await setMeta({
          ...meta,
          status: "game_over",
          deadline: null,
          winner: finalRanking.winners[0] || null,
          winners: finalRanking.winners,
          winningPasswordLength: finalRanking.length,
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
        meta = await setMeta({
          ...meta,
          status: "game_over",
          winner: finalRanking.winners[0] || null,
          winners: finalRanking.winners,
          winningPasswordLength: finalRanking.length,
          deadline: null
        }, redis);
      } else {
        for (const p of survivors) {
          p.submission = null;
          p.valid = null;
          p.failures = [];
          p.failureDetails = [];
          p.submittedAt = null;
          p.reason = null;
          p.walterFeedRound = null;
          p.walterFeedCount = 0;
          p.walterFirstFedAt = null;
          await savePlayer(p, redis);
        }

        meta = await setMeta({
          ...meta,
          status: "round_open",
          round: meta.round + 1,
          roundSeconds: seconds,
          deadline: Date.now() + seconds * 1000
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
