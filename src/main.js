import "./style.css";
import jervImage from "./jerv.webp";
import maurpinnsvinImage from "./maurpinnsvin.webp";
import leopardImage from "./leopard.webp";
import sommerfuglImage from "./sommerfugl.webp";
import nebbdyrImage from "./nebbdyr.webp";
import moteBilde1 from "./motebilde1.webp";
import moteBilde2 from "./motebilde2.webp";
import walterImage from "./walter.webp";

const app = document.querySelector("#app");
const params = new URLSearchParams(location.search);
const hostMode = params.get("host") === "1";
const storageKey = "pbr-player-v1";
const hostStorageKey = "pbr-host-key-v1";

const pokemonHintNames = new Set([
  "tiva", "johan", "eskil", "vivi", "sissel", "erik", "arne", "hildekari", "stig"
]);

let state = null;
let player = readJson(localStorage.getItem(storageKey));
let hostKey = localStorage.getItem(hostStorageKey) || "";
let lastError = "";
let lastSubmit = null;
let polling = null;

function readJson(v) {
  try { return JSON.parse(v); } catch { return null; }
}

function esc(v) {
  return String(v ?? "").replace(/[&<>'"]/g, c => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;"
  }[c]));
}

function normalizedNickname(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .toLocaleLowerCase("nb-NO")
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

function hasPokemonHint() {
  const name = selfState()?.name || player?.name || "";
  return pokemonHintNames.has(normalizedNickname(name));
}

function currentNickname() {
  return selfState()?.name || player?.name || "";
}

function questionThemeClass() {
  if (hostMode) return "";
  const name = normalizedNickname(currentNickname());
  if (name === "siri") return "theme-siri";
  if (name === "marius") return "theme-marius";
  if (name === "marie") return "theme-marie";
  return "";
}

function specialThemeIntroHtml() {
  const theme = questionThemeClass();
  if (theme === "theme-siri") {
    return `<div class="theme-banner siri-banner">💍 Brudemodus aktivert · egne regler fortjener litt ekstra kjærlighet 💗</div>`;
  }
  if (theme === "theme-marius") {
    return `<div class="theme-banner marius-banner">🤡 Marius-modus aktivert · stygt tema til en stygg fyr</div>`;
  }
  if (theme === "theme-marie") {
    return `<div class="theme-banner marie-banner">🌸⚡ Marie-mode · neon, sakura og hovedkarakter-energi ✨</div>`;
  }
  return "";
}

function mariusBetweenRoundsHtml() {
  if (hostMode || normalizedNickname(currentNickname()) !== "marius") return "";
  if (!["results", "game_over"].includes(state?.meta?.status)) return "";

  const messages = [
    "Stygg font til en stygg fyr. Akkurat som bestilt.",
    "Marius, du overlevde. Estetikken gjorde ikke.",
    "Passordet ditt er heldigvis penere enn temaet ditt.",
    "Selv Comic Sans synes dette begynner å bli stygt.",
    "Sterk innsats, Marius. Svakt visuelt uttrykk.",
    "Du er fortsatt med, din stygge rakker.",
    "Pokémonene ba om å slippe å se dette temaet.",
    "Det blir ikke penere, Marius. Bare vanskeligere.",
    "Brad Pitt har ikke godkjent dette designet.",
    "Du er fortsatt med. Nå gjenstår bare siste hinder for både deg og dette grusomme temaet.",
    "Finale! Mot alle odds overlevde både du og dette grusomme temaet."
  ];
  const index = Math.max(0, Math.min(messages.length - 1, (state?.meta?.round || 1) - 1));
  return `<div class="card marius-roast"><strong>💩 Marius-melding:</strong> ${esc(messages[index])}</div>`;
}

function marieBetweenRoundsHtml() {
  if (hostMode || normalizedNickname(currentNickname()) !== "marie") return "";
  if (!["results", "game_over"].includes(state?.meta?.status)) return "";

  const messages = [
    "Siri og Amund er skikkelig heldige som har Marie som venn. 🌸",
    "Marie har ekte hovedkarakter-energi. ✨",
    "Vennskapsnivå: legendarisk. Siri og Amund godkjenner. 💖",
    "Marie-route unlocked: lojal, morsom og helt rå som venn. ⚡",
    "Sakura-bonus: Marie gjør bryllupsgjengen bedre bare ved å være der. 🌸",
    "Siri + Amund + Marie = elite friendship arc. 💫",
    "Marie, du er den typen venn brudeparet håper å beholde i alle sesonger. 💗",
    "Neonstatus: Marie skinner fortsatt sterkere enn bakgrunnen. ✨",
    "Siri og Amund setter enormt stor pris på deg, Marie. 🌸",
    "Marie er fortsatt med — akkurat som en ekte protagonist. ⚡",
    "Final arc nærmer seg. Marie har allerede vunnet vennskapskategorien. 💖",
    "Nesten mål: Siri og Amund sender vennskapsbuff til Marie. 🌸✨",
    "Finale! Uansett resultat er Marie S-tier venn av brudeparet. 💗"
  ];
  const index = Math.max(0, Math.min(messages.length - 1, (state?.meta?.round || 1) - 1));
  return `<div class="card marie-message"><strong>🌸 Marie-melding:</strong> ${esc(messages[index])}</div>`;
}

async function copyText(value) {
  const text = String(value ?? "");
  if (!text) return false;

  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {}

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "absolute";
  textarea.style.left = "-9999px";
  document.body.appendChild(textarea);
  textarea.select();
  const ok = document.execCommand("copy");
  textarea.remove();
  return ok;
}

function statusText(status) {
  return ({
    lobby: "Lobby",
    round_open: "Round open",
    results: "Round results",
    game_over: "Game over"
  })[status] || status;
}

async function api(body = null) {
  const options = body ? {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(hostKey ? { "X-Host-Key": hostKey } : {})
    },
    body: JSON.stringify(body)
  } : {};

  const response = await fetch("/api/game", options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
  return data;
}

async function refresh() {
  try {
    const previousRound = state?.meta?.round ?? null;
    const previousStatus = state?.meta?.status ?? null;

    const nextState = await api();
    const changed = JSON.stringify(nextState) !== JSON.stringify(state);

    if (
      previousRound !== null &&
      (nextState?.meta?.round !== previousRound ||
        (previousStatus === "round_open" && nextState?.meta?.status !== "round_open"))
    ) {
      lastSubmit = null;
    }

    state = nextState;
    lastError = "";
    if (changed) render();
  } catch (error) {
    const message = error.message;
    const changed = message !== lastError;
    lastError = message;
    if (changed || !state) render();
  }
}

function captureInputState() {
  const el = document.activeElement;
  if (!el || !(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) return null;

  return {
    id: el.id || "",
    name: el.name || "",
    value: el.value,
    selectionStart: el.selectionStart,
    selectionEnd: el.selectionEnd
  };
}

function restoreInputState(saved) {
  if (!saved) return;
  const candidates = [...document.querySelectorAll("input, textarea")];
  const el = candidates.find(candidate =>
    (saved.id && candidate.id === saved.id) ||
    (saved.name && candidate.name === saved.name)
  );
  if (!el) return;

  el.value = saved.value;
  el.focus({ preventScroll: true });

  if (typeof saved.selectionStart === "number" && typeof el.setSelectionRange === "function") {
    try {
      el.setSelectionRange(saved.selectionStart, saved.selectionEnd ?? saved.selectionStart);
    } catch {}
  }
}

function selfState() {
  return state?.players?.find(p => p.id === player?.id) || null;
}

function secondsLeft() {
  if (!state?.meta?.deadline) return null;
  return Math.max(0, Math.ceil((state.meta.deadline - Date.now()) / 1000));
}

function animalRuleImagesHtml() {
  const animals = [
    { src: jervImage, label: "Dyr 1" },
    { src: maurpinnsvinImage, label: "Dyr 2" },
    { src: leopardImage, label: "Dyr 3" },
    { src: sommerfuglImage, label: "Dyr 4" },
    { src: nebbdyrImage, label: "Dyr 5" }
  ];

  return `<div class="animal-rule-gallery" aria-label="Fem dyrebilder til regel 6">
    ${animals.map((animal, index) => `
      <figure class="animal-rule-image">
        <img src="${animal.src}" alt="${animal.label} i regel 6" loading="eager">
        <figcaption>${index + 1}</figcaption>
      </figure>
    `).join("")}
  </div>`;
}

function meetingRuleImagesHtml() {
  const images = [
    { src: moteBilde1, label: "Person 1" },
    { src: moteBilde2, label: "Person 2" }
  ];
  return `<div class="meeting-rule-gallery" aria-label="To bilder til regel 7">
    ${images.map((image, index) => `
      <figure class="meeting-rule-image">
        <img src="${image.src}" alt="${image.label} i regel 7" loading="eager">
        <figcaption>${index + 1}</figcaption>
      </figure>
    `).join("")}
  </div>`;
}

function walterBonesHtml(count) {
  const safe = Math.max(0, Math.min(999, Number(count) || 0));
  if (!safe) return "";
  const shown = Math.min(safe, 18);
  return `${"🦴".repeat(shown)}${safe > shown ? ` <span class="walter-more">+${safe - shown}</span>` : ""}`;
}

function walterFeedPanelHtml() {
  if (hostMode || state?.meta?.status !== "round_open" || (state?.meta?.round || 0) < 8) return "";
  const self = selfState();
  if (!self?.alive) return "";

  const fedThisRound = self.walterFeedRound === state.meta.round;
  const count = fedThisRound ? Number(self.walterFeedCount || 0) : 0;
  const status = count > 0
    ? `Walter er matet ${walterBonesHtml(count)}`
    : "Walter er sulten — trykk på ham før du leverer passordet.";

  return `<div class="walter-feed-card ${count > 0 ? "fed" : "hungry"}">
    <div class="walter-feed-copy">
      <div class="eyebrow">REGEL 8 · MAT WALTER</div>
      <h2>Husk Walter 🐶</h2>
      <p>Trykk på Walter minst én gang før du leverer passordet. Du kan mate ham flere ganger hvis du vil.</p>
    </div>
    <button id="feed-walter" class="walter-feed-button" type="button" aria-label="Mat Walter">
      <img src="${walterImage}" alt="Walter" draggable="false">
    </button>
    <div id="walter-feed-status" class="walter-feed-status" aria-live="polite">${status}</div>
  </div>`;
}

function rulesHtml() {
  const rules = state?.rules || [];
  if (!rules.length) return `<p class="muted">Rules appear when the host starts the game.</p>`;

  return `<ol class="rules">
    ${rules.map((r, i) => {
      const hint = r.id === "pokemon" && !hostMode && hasPokemonHint()
        ? `<details class="rule-hint">
            <summary>Hint til oss over 50 år</summary>
            <div>Du kan bruke ett av disse alternativene: <strong>Mew</strong>, <strong>Muk</strong> eller <strong>Ekans</strong>.</div>
          </details>`
        : "";
      const media = r.id === "animals"
        ? animalRuleImagesHtml()
        : (r.id === "meeting_year" ? meetingRuleImagesHtml() : "");
      const withImages = r.id === "animals" || r.id === "meeting_year";
      return `<li class="${withImages ? "rule-with-images" : ""}"><span>${i + 1}</span><div>${esc(r.text)}${media}${hint}</div></li>`;
    }).join("")}
  </ol>`;
}

function playerStatusText(p) {
  const status = state?.meta?.status;

  if (!p.alive) {
    return `Eliminated${p.eliminatedRound ? ` · round ${p.eliminatedRound}` : ""}`;
  }

  if (status === "results") return "Survived";
  if (status === "game_over") return "Finalist";
  if (status === "round_open") return p.hasSubmitted ? "Submitted" : "Waiting";
  return "Ready";
}

function playersHtml() {
  const players = state?.players || [];
  if (!players.length) return `<p class="muted">No players yet.</p>`;

  return `<div class="players">
    ${players.map(p => `
      <div class="player ${p.alive ? "alive" : "dead"}">
        <div class="player-main">
          <strong>${esc(p.name)}</strong>
          <small>${esc(playerStatusText(p))}</small>
        </div>
        <div class="dot" title="${p.alive ? "Alive" : "Eliminated"}"></div>
      </div>
    `).join("")}
  </div>`;
}

function currentRoundSelfResult() {
  const self = selfState();
  if (!self || !state?.roundResults?.players) return null;
  return state.roundResults.players.find(p => p.id === self.id) || null;
}

function rankedResultPlayers(players = []) {
  const ranked = players.map(p => ({
    ...p,
    passwordLength: p.passwordLength ?? (p.password ? [...String(p.password)].length : null)
  })).sort((a, b) => {
    // Surviving players always rank above players eliminated in this round.
    if (a.survived !== b.survived) return Number(b.survived) - Number(a.survived);
    if (a.submitted !== b.submitted) return Number(b.submitted) - Number(a.submitted);
    if (!a.submitted) return a.name.localeCompare(b.name, "nb");
    return a.passwordLength - b.passwordLength || a.name.localeCompare(b.name, "nb");
  });

  let previousKey = null;
  let previousRank = 0;
  return ranked.map((p, index) => {
    if (!p.submitted) return { ...p, displayRank: null };
    const key = `${p.survived ? "alive" : "dead"}|${p.passwordLength}`;
    if (key !== previousKey) {
      previousRank = index + 1;
      previousKey = key;
    }
    return { ...p, displayRank: previousRank };
  });
}

function playerPanel() {
  const self = selfState();
  const status = state?.meta?.status;

  if (status === "lobby") {
    if (self && player) {
      return `<div class="card accent">
        <h2>You're in</h2>
        <p>Joined as <strong>${esc(self.name)}</strong>. Wait for the host to start.</p>
        <button id="forget-player" class="secondary">Use another browser/name</button>
      </div>`;
    }

    return `<div class="card accent">
      <h2>Join the game</h2>
      <form id="join-form">
        <label>Nickname
          <input name="name" maxlength="24" autocomplete="nickname" required placeholder="Your name">
        </label>
        <button>Join</button>
      </form>
      <p class="muted tiny"><strong>Viktig:</strong> Bruk kun et passord laget for spillet. Innsendte passord blir vist til de andre deltakerne etter hver runde.</p>
    </div>`;
  }

  if (!player || !self) {
    return `<div class="card">
      <h2>Watching</h2>
      <p class="muted">You aren't registered in this game. Ask the host to reset if you want to join.</p>
    </div>`;
  }

  if (status === "round_open") {
    if (!self.alive) {
      return `<div class="card danger">
        <h2>Eliminated</h2>
        <p>Du er ute av spillet, men kan fortsatt følge de neste rundene.</p>
      </div>`;
    }

    const time = secondsLeft();
    const previousPassword = player?.lastPassword || "";

    return `${walterFeedPanelHtml()}<div class="card accent">
      <div class="submit-head">
        <h2>Submit your password</h2>
        <div id="countdown" class="countdown">${time ?? "—"}s</div>
      </div>

      <form id="submit-form">
        <label>Password
          <input
            name="password"
            maxlength="200"
            autocomplete="off"
            required
            value="${esc(previousPassword)}"
            placeholder="Build a password that passes every rule">
        </label>
        <button ${time === 0 ? "disabled" : ""}>Submit / replace</button>
      </form>

      ${lastSubmit ? `<div class="feedback good">✓ Passordet er lagret. Resultatet vises når runden avsluttes.</div>` : ""}

      <p class="muted tiny">
        ${previousPassword
          ? "Passordet fra forrige runde er forhåndsutfylt. Du kan endre det før du sender inn."
          : "Du kan erstatte innsendt passord frem til tiden går ut. Kun siste innsending teller."}
      </p>
    </div>`;
  }

  if (status === "results") {
    const result = currentRoundSelfResult();

    if (result?.survived) {
      return `<div class="card winner">
        <h2>✓ Du gikk videre fra runde ${state.meta.round}</h2>
        <p>Se rundens svar nedenfor. Når neste runde starter, ligger ditt forrige passord klart i feltet.</p>
      </div>`;
    }

    const failures = result?.failures || [];
    return `<div class="card danger">
      <h2>✕ Du ble eliminert i runde ${state.meta.round}</h2>
      ${failures.length
        ? `<p>${failures.map(f => `<strong>${esc(f.rule)}:</strong> ${esc(f.text)}`).join("<br>")}</p>`
        : `<p>${esc(self.reason || "Better luck next game.")}</p>`}
    </div>`;
  }

  if (status === "game_over") {
    const winners = state.meta.winners || [];
    const won = winners.includes(self.name);
    const result = currentRoundSelfResult();

    if (won) {
      const winningLength = state.meta.winningPasswordLength;
      return `<div class="card winner">
        <h2>🏆 Du vant!</h2>
        <p>Du kom gjennom alle reglene${winningLength ? ` med et vinnende passord på <strong>${winningLength} tegn</strong>` : ""}.</p>
      </div>`;
    }

    if (self.alive && state.meta.round >= state.totalRules) {
      const winningLength = state.meta.winningPasswordLength;
      return `<div class="card">
        <h2>Du fullførte alle rundene!</h2>
        <p>${winningLength ? `Vinneren hadde det korteste gyldige passordet på <strong>${winningLength} tegn</strong>.` : "Spillet er ferdig."}</p>
      </div>`;
    }

    if (!self.alive && result && !result.survived) {
      return `<div class="card danger">
        <h2>Game over</h2>
        <p>Du ble eliminert i runde ${state.meta.round}.</p>
      </div>`;
    }

    return `<div class="card">
      <h2>Game over</h2>
      <p>Thanks for playing.</p>
    </div>`;
  }

  return "";
}

function roundResultsHtml() {
  const result = state?.roundResults;
  if (!result) return "";

  const rankedPlayers = rankedResultPlayers(result.players || []);
  const finalRound = result.round >= state.totalRules && state.meta.status === "game_over";
  const winners = new Set(state.meta.winners || []);
  const survivingLengths = rankedPlayers
    .filter(p => p.survived && p.submitted && p.passwordLength != null)
    .map(p => p.passwordLength);
  const shortestSurvivorLength = survivingLengths.length ? Math.min(...survivingLengths) : null;

  return `<div class="card">
    <div class="card-title">
      <h2>Passordrangering · runde ${result.round}</h2>
      <span>${result.remaining} videre</span>
    </div>

    <p class="muted tiny">Spillere som gikk videre vises før eliminerte, og innen hver gruppe rangeres kortere passord først. Trykker du «Kopier», blir det valgte passordet automatisk utgangspunktet ditt i neste runde.</p>

    <div class="players">
      ${rankedPlayers.map(p => {
        const isWinner = finalRound && winners.has(p.name);
        const isShortestSurvivor = !finalRound && p.survived && p.submitted && p.passwordLength === shortestSurvivorLength;
        const rankText = p.displayRank ? `#${p.displayRank}` : "—";
        const lengthText = p.passwordLength != null ? `${p.passwordLength} tegn` : "Ingen innsending";
        const resultText = isWinner
          ? "🏆 Vinner"
          : isShortestSurvivor
            ? "★ Kortest"
            : (p.survived ? (finalRound ? "✓ Fullførte" : "✓ Videre") : "✕ Ute");
        const resultColor = isWinner || isShortestSurvivor ? "#ffe797" : (p.survived ? "#aaf1bd" : "#ffc1d0");

        return `<div class="player ${p.survived ? "alive" : "dead"} ${isShortestSurvivor ? "shortest" : ""}" style="align-items:flex-start;">
          <div style="min-width:44px;font-weight:800;font-size:1.05rem;">${rankText}</div>
          <div class="player-main" style="gap:4px;min-width:0;">
            <strong>${esc(p.name)} <small style="font-weight:600;">· ${esc(lengthText)}</small></strong>
            <div class="password-result-line">
              <small class="mono password-result">${p.password ? esc(p.password) : "Ingen innsending"}</small>
              ${p.password ? `<button type="button" class="secondary copy-button" data-copy-player="${esc(p.id)}">Kopier</button>` : ""}
            </div>
            ${hostMode && !p.survived && p.failures?.length
              ? `<small style="white-space:normal;">
                  ${p.failures.map(f => `${esc(f.rule)}: ${esc(f.text)}`).join("<br>")}
                </small>`
              : ""}
          </div>
          <strong style="white-space:nowrap;color:${resultColor};">${resultText}</strong>
        </div>`;
      }).join("")}
    </div>

    ${finalRound && state.meta.winningPasswordLength != null
      ? `<p class="muted tiny"><strong>Vinnerkriterium:</strong> Blant deltakerne som bestod alle reglene, vinner korteste passord. Ved lik lengde blir det delt seier.</p>`
      : ""}
  </div>`;
}

function overallRankingHtml() {
  if (!["results", "game_over"].includes(state?.meta?.status)) return "";
  const rows = state?.leaderboard || [];
  if (!rows.length) return "";

  return `<div class="card overall-ranking">
    <div class="card-title">
      <h2>Samlet rangering</h2>
      <span>${rows.length} spillere</span>
    </div>
    <p class="muted tiny">Spillere som fortsatt er med rangeres øverst. Blant eliminerte rangeres den som kom lengst høyest. Innen samme elimineringsrunde rangeres kortere passord foran lengre.</p>
    <div class="players">
      ${rows.map(p => {
        const status = p.alive
          ? (state.meta.status === "game_over" ? "Fullførte" : "Videre")
          : `Ute i runde ${p.eliminatedRound ?? "—"}`;
        const length = p.passwordLength != null ? `${p.passwordLength} tegn` : "Ingen innsending";
        return `<div class="player leaderboard-row ${p.alive ? "alive" : "dead"}">
          <div class="leaderboard-rank">#${p.rank}</div>
          <div class="player-main">
            <strong>${esc(p.name)}</strong>
            <small>${esc(status)} · ${esc(length)}</small>
          </div>
          <div class="dot"></div>
        </div>`;
      }).join("")}
    </div>
  </div>`;
}

function statRowsHtml(items) {
  return `<div class="players">
    ${items.map(([label, value]) => `
      <div class="player">
        <div class="player-main"><strong>${esc(label)}</strong></div>
        <strong>${esc(value)}</strong>
      </div>
    `).join("")}
  </div>`;
}

function hostStatsHtml() {
  if (!hostMode) return "";

  const status = state?.meta?.status;

  if (status === "round_open") {
    const active = state.players.filter(p => p.alive);
    const submitted = active.filter(p => p.hasSubmitted).length;
    const walterFed = state.meta.round >= 8
      ? active.filter(p => p.walterFeedRound === state.meta.round && Number(p.walterFeedCount || 0) > 0).length
      : null;

    const liveRows = [
      ["Spillere i runden", active.length],
      ["Har levert", submitted],
      ["Venter på innsending", active.length - submitted]
    ];
    if (walterFed != null) liveRows.push(["Har matet Walter", walterFed]);

    return `<div class="card">
      <div class="eyebrow">LIVE ROUND STATS</div>
      <h2 style="margin:.35rem 0 14px;">Round ${state.meta.round}</h2>
      ${statRowsHtml(liveRows)}
      <p class="muted tiny">Ingen får vite om passordet er godkjent før runden avsluttes.</p>
    </div>`;
  }

  const result = state?.roundResults;
  const history = state?.roundHistory || [];

  let html = "";

  if (result) {
    const eliminatedPlayers = result.players.filter(p => !p.survived);

    html += `<div class="card">
      <div class="eyebrow">ROUND STATISTICS</div>
      <h2 style="margin:.35rem 0 14px;">Round ${result.round}</h2>

      ${statRowsHtml([
        ["Spillere ved start", result.started],
        ["Leverte passord", result.submitted],
        ["Eliminert", result.eliminated],
        ["Videre", result.remaining],
        ["Korteste innsendte passord", result.shortestPasswordLength != null ? `${result.shortestPasswordLength} tegn` : "—"]
      ])}

      <div style="height:14px;"></div>
      <h2 style="margin-bottom:10px;">Regelbrudd</h2>

      ${result.failureCounts?.length
        ? `<div class="players">
            ${result.failureCounts.map(f => `
              <div class="player" style="align-items:flex-start;">
                <div class="player-main">
                  <strong>${esc(f.rule)}</strong>
                  <small style="white-space:normal;">${esc(f.text)}</small>
                </div>
                <strong>${f.count}</strong>
              </div>
            `).join("")}
          </div>
          <p class="muted tiny">Én deltaker kan ha brutt flere regler, så summen av regelbrudd kan være høyere enn antall eliminerte.</p>`
        : `<p class="muted">Ingen regelbrudd i denne runden.</p>`}

      <div style="height:8px;"></div>
      <h2 style="margin-bottom:10px;">Eliminert denne runden</h2>

      ${eliminatedPlayers.length
        ? `<div class="players">
            ${eliminatedPlayers.map(p => `
              <div class="player dead" style="align-items:flex-start;opacity:1;">
                <div class="player-main">
                  <strong>${esc(p.name)}</strong>
                  <small class="mono" style="white-space:normal;overflow-wrap:anywhere;">${p.password ? esc(p.password) : "Ingen innsending"}</small>
                  <small style="white-space:normal;">
                    ${(p.failures || []).map(f => `${esc(f.rule)}: ${esc(f.text)}`).join("<br>")}
                  </small>
                </div>
              </div>
            `).join("")}
          </div>`
        : `<p class="muted">Ingen ble eliminert.</p>`}
    </div>`;
  }

  if (history.length) {
    html += `<div class="card">
      <div class="eyebrow">ROUND HISTORY</div>
      <h2 style="margin:.35rem 0 14px;">Oversikt</h2>
      <div class="players">
        ${history.map(r => `
          <div class="player">
            <div class="player-main">
              <strong>Runde ${r.round}</strong>
              <small>${r.eliminated} eliminert · ${r.remaining} videre${r.shortestPasswordLength != null ? ` · kortest ${r.shortestPasswordLength} tegn` : ""}</small>
            </div>
            <strong>${r.submitted}/${r.started}</strong>
          </div>
        `).join("")}
      </div>
      <p class="muted tiny">Tallet til høyre viser antall innsendte passord / spillere ved rundestart.</p>
    </div>`;
  }

  return html;
}

function hostPanel() {
  if (!hostMode) return "";

  const meta = state?.meta || {};

  return `<div class="card host">
    <div class="eyebrow">HOST CONTROLS</div>

    <label>Host key
      <input id="host-key" type="password" value="${esc(hostKey)}" placeholder="Same as HOST_KEY in Vercel">
    </label>

    ${meta.status === "lobby"
      ? `<label>Rundetid for runde 1 (sekunder)
          <input id="timer-value" type="number" min="10" max="600" value="${meta.roundSeconds || 60}">
        </label>
        <div class="actions">
          <button data-host-action="start">Start game</button>
        </div>`
      : ""}

    ${meta.status === "round_open"
      ? `<div class="actions"><button data-host-action="close_round">Close round now</button></div>`
      : ""}

    ${meta.status === "results"
      ? `<label>Rundetid for runde ${Math.min((meta.round || 0) + 1, state.totalRules)} (sekunder)
          <input id="timer-value" type="number" min="10" max="600" value="${meta.roundSeconds || 60}">
        </label>
        <div class="actions"><button data-host-action="next_round">Start next round</button></div>`
      : ""}

    <div class="actions">
      <button class="danger-button" data-host-action="reset">Reset entire game</button>
    </div>

    <p class="muted tiny">Player link: <span class="mono">${esc(location.origin + location.pathname)}</span></p>
  </div>

  ${hostStatsHtml()}`;
}

function render() {
  const inputState = captureInputState();

  if (!state) {
    app.innerHTML = `<main>
      <header>
        <div>
          <div class="eyebrow">Passordet til Siris hjerte</div>
          <h1>Password<br>Battle Royale</h1>
        </div>
      </header>
      <div class="card"><p>${lastError ? esc(lastError) : "Loading game…"}</p></div>
    </main>`;

    restoreInputState(inputState);
    return;
  }

  const meta = state.meta;
  const aliveCount = state.players.filter(p => p.alive).length;
  const total = state.players.length;
  const time = secondsLeft();

  document.body.classList.toggle("player-theme-marie", !hostMode && normalizedNickname(currentNickname()) === "marie");

  const winnerText = meta.status === "game_over"
    ? ((meta.winners || []).length
      ? `Vinner${meta.winners.length > 1 ? "e" : ""}: ${meta.winners.map(esc).join(", ")}${meta.winningPasswordLength != null ? ` · ${meta.winningPasswordLength} tegn` : ""}`
      : "Ingen vinner")
    : null;

  app.innerHTML = `<main>
    <header>
      <div>
        <div class="eyebrow">Passordet til Siris hjerte</div>
        <h1>Password<br>Battle Royale</h1>
      </div>

      <div class="status-block">
        <span>${statusText(meta.status)}</span>
        <strong>${meta.round ? `Round ${meta.round}/${state.totalRules}` : `${total} player${total === 1 ? "" : "s"}`}</strong>
        ${meta.status === "round_open"
          ? `<small id="header-countdown">${time}s left</small>`
          : `<small>${aliveCount} alive</small>`}
      </div>
    </header>

    ${lastError ? `<div class="notice bad">${esc(lastError)}</div>` : ""}
    ${winnerText ? `<div class="hero-winner">🏆 ${winnerText}</div>` : ""}

    <section class="grid">
      <div>
        <div class="card rules-card ${questionThemeClass()}">
          <div class="card-title">
            <h2>Active rules</h2>
            <span>${meta.round}/${state.totalRules}</span>
          </div>
          ${specialThemeIntroHtml()}
          ${rulesHtml()}
        </div>

        ${playerPanel()}
        ${mariusBetweenRoundsHtml()}
        ${marieBetweenRoundsHtml()}
        ${roundResultsHtml()}
        ${overallRankingHtml()}
      </div>

      <aside>
        <div class="card">
          <div class="card-title">
            <h2>Players</h2>
            <span>${aliveCount}/${total}</span>
          </div>
          ${playersHtml()}
        </div>

        ${hostPanel()}
      </aside>
    </section>

    <footer>Inspired by DougDoug's Password Battle Royale · private friend-game edition</footer>
  </main>`;

  bindEvents();
  restoreInputState(inputState);
}

function bindEvents() {
  document.querySelector("#join-form")?.addEventListener("submit", async e => {
    e.preventDefault();
    lastError = "";

    const name = new FormData(e.currentTarget).get("name");

    try {
      const data = await api({ action: "join", name });
      player = data.player;
      localStorage.setItem(storageKey, JSON.stringify(player));
      state = data.state;
      render();
    } catch (err) {
      lastError = err.message;
      render();
    }
  });

  document.querySelector("#feed-walter")?.addEventListener("click", async e => {
    const button = e.currentTarget;
    if (!player || button.disabled) return;
    lastError = "";
    button.disabled = true;

    try {
      const data = await api({
        action: "feed_walter",
        playerId: player.id,
        playerToken: player.token
      });

      const self = selfState();
      if (self) {
        self.walterFeedRound = data.walterFeedRound;
        self.walterFeedCount = data.walterFeedCount;
      }

      const card = button.closest(".walter-feed-card");
      const image = button.querySelector("img");
      const status = card?.querySelector("#walter-feed-status");
      card?.classList.remove("hungry");
      card?.classList.add("fed");

      if (status) {
        status.innerHTML = `Walter er matet ${walterBonesHtml(data.walterFeedCount)}`;
      }

      image?.classList.remove("walter-jump");
      void image?.offsetWidth;
      image?.classList.add("walter-jump");
      setTimeout(() => image?.classList.remove("walter-jump"), 900);
    } catch (err) {
      lastError = err.message;
      render();
    } finally {
      if (button.isConnected) button.disabled = false;
    }
  });

  document.querySelector("#submit-form")?.addEventListener("submit", async e => {
    e.preventDefault();
    lastError = "";

    const password = String(new FormData(e.currentTarget).get("password") || "");

    try {
      lastSubmit = await api({
        action: "submit",
        playerId: player.id,
        playerToken: player.token,
        password
      });

      player = { ...player, lastPassword: password };
      localStorage.setItem(storageKey, JSON.stringify(player));

      await refresh();
    } catch (err) {
      lastError = err.message;
      render();
    }
  });

  document.querySelector("#forget-player")?.addEventListener("click", () => {
    localStorage.removeItem(storageKey);
    player = null;
    lastSubmit = null;
    render();
  });

  document.querySelector("#host-key")?.addEventListener("input", e => {
    hostKey = e.target.value;
    localStorage.setItem(hostStorageKey, hostKey);
  });

  document.querySelectorAll("[data-host-action]").forEach(button => {
    button.addEventListener("click", async () => {
      lastError = "";
      const action = button.dataset.hostAction;

      if (action === "reset" && !confirm("Reset the whole game and remove every player?")) return;

      try {
        if (action === "set_timer" || action === "start" || action === "next_round") {
          const seconds = Number(document.querySelector("#timer-value")?.value || state?.meta?.roundSeconds || 60);
          const data = await api({ action, seconds });
          state = data.state;
        } else {
          const data = await api({ action });
          state = data.state;
        }

        lastSubmit = null;
        render();
      } catch (err) {
        lastError = err.message;
        render();
      }
    });
  });


  document.querySelectorAll("[data-copy-player]").forEach(button => {
    button.addEventListener("click", async () => {
      const id = button.dataset.copyPlayer;
      const resultPlayer = state?.roundResults?.players?.find(p => p.id === id);
      if (!resultPlayer?.password) return;

      // Copy to the clipboard AND make this the player's starting password next round.
      // If the player does not click a copy button, their own previous password remains the default.
      await copyText(resultPlayer.password);

      if (!hostMode && player) {
        player = { ...player, lastPassword: resultPlayer.password };
        localStorage.setItem(storageKey, JSON.stringify(player));
      }

      const original = button.textContent;
      button.textContent = hostMode ? "Kopiert ✓" : "Valgt til neste runde ✓";
      setTimeout(() => {
        if (button.isConnected) button.textContent = original;
      }, 1800);
    });
  });
}

function tick() {
  if (!state?.meta?.deadline) return;

  const s = secondsLeft();
  const a = document.querySelector("#countdown");
  const b = document.querySelector("#header-countdown");

  if (a) a.textContent = `${s}s`;
  if (b) b.textContent = `${s}s left`;
  if (s === 0) document.querySelector("#submit-form button")?.setAttribute("disabled", "");
}

refresh();
polling = setInterval(refresh, 2000);
setInterval(tick, 250);
window.addEventListener("beforeunload", () => clearInterval(polling));
