import "./style.css";

const app = document.querySelector("#app");
const params = new URLSearchParams(location.search);
const hostMode = params.get("host") === "1";
const storageKey = "pbr-player-v1";
const hostStorageKey = "pbr-host-key-v1";

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

function rulesHtml() {
  const rules = state?.rules || [];
  if (!rules.length) return `<p class="muted">Rules appear when the host starts the game.</p>`;

  return `<ol class="rules">
    ${rules.map((r, i) => `<li><span>${i + 1}</span>${esc(r.text)}</li>`).join("")}
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

    return `<div class="card accent">
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
      return `<div class="card winner">
        <h2>🏆 You won!</h2>
        <p>You survived the Password Battle Royale.</p>
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

  return `<div class="card">
    <div class="card-title">
      <h2>Svar fra runde ${result.round}</h2>
      <span>${result.remaining} videre</span>
    </div>

    <p class="muted tiny">Passordene vises først etter at runden er avsluttet.</p>

    <div class="players">
      ${result.players.map(p => `
        <div class="player ${p.survived ? "alive" : "dead"}" style="align-items:flex-start;">
          <div class="player-main" style="gap:4px;">
            <strong>${esc(p.name)}</strong>
            <small class="mono" style="white-space:normal;overflow-wrap:anywhere;color:#d8dcef;">
              ${p.password ? esc(p.password) : "Ingen innsending"}
            </small>
            ${hostMode && !p.survived && p.failures?.length
              ? `<small style="white-space:normal;">
                  ${p.failures.map(f => `${esc(f.rule)}: ${esc(f.text)}`).join("<br>")}
                </small>`
              : ""}
          </div>
          <strong style="white-space:nowrap;color:${p.survived ? "#aaf1bd" : "#ffc1d0"};">
            ${p.survived ? "✓ Videre" : "✕ Ute"}
          </strong>
        </div>
      `).join("")}
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

    return `<div class="card">
      <div class="eyebrow">LIVE ROUND STATS</div>
      <h2 style="margin:.35rem 0 14px;">Round ${state.meta.round}</h2>
      ${statRowsHtml([
        ["Spillere i runden", active.length],
        ["Har levert", submitted],
        ["Venter på innsending", active.length - submitted]
      ])}
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
        ["Videre", result.remaining]
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
              <small>${r.eliminated} eliminert · ${r.remaining} videre</small>
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
      ? `<label>Round timer (seconds)
          <input id="timer-value" type="number" min="20" max="300" value="${meta.roundSeconds || 60}">
        </label>
        <div class="actions">
          <button data-host-action="set_timer">Save timer</button>
          <button data-host-action="start">Start game</button>
        </div>`
      : ""}

    ${meta.status === "round_open"
      ? `<div class="actions"><button data-host-action="close_round">Close round now</button></div>`
      : ""}

    ${meta.status === "results"
      ? `<div class="actions"><button data-host-action="next_round">Start next round</button></div>`
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
          <div class="eyebrow">NO TWITCH NEEDED</div>
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

  const winnerText = meta.status === "game_over"
    ? ((meta.winners || []).length
      ? `Winner${meta.winners.length > 1 ? "s" : ""}: ${meta.winners.map(esc).join(", ")}`
      : "No winner")
    : null;

  app.innerHTML = `<main>
    <header>
      <div>
        <div class="eyebrow">NO TWITCH NEEDED</div>
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
        <div class="card rules-card">
          <div class="card-title">
            <h2>Active rules</h2>
            <span>${meta.round}/${state.totalRules}</span>
          </div>
          ${rulesHtml()}
        </div>

        ${playerPanel()}
        ${roundResultsHtml()}
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
        if (action === "set_timer") {
          const seconds = Number(document.querySelector("#timer-value")?.value || 60);
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
