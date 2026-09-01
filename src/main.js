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

function readJson(v) { try { return JSON.parse(v); } catch { return null; } }
function esc(v) { return String(v ?? "").replace(/[&<>'"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c])); }
function statusText(status) {
  return ({ lobby: "Lobby", round_open: "Round open", results: "Round results", game_over: "Game over" })[status] || status;
}

async function api(body = null) {
  const options = body ? {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(hostKey ? { "X-Host-Key": hostKey } : {}) },
    body: JSON.stringify(body)
  } : {};
  const response = await fetch("/api/game", options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
  return data;
}

async function refresh() {
  try {
    state = await api();
    lastError = "";
    render();
  } catch (error) {
    lastError = error.message;
    render();
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
  return `<ol class="rules">${rules.map((r, i) => `<li><span>${i + 1}</span>${esc(r.text)}</li>`).join("")}</ol>`;
}

function playersHtml() {
  const players = state?.players || [];
  if (!players.length) return `<p class="muted">No players yet.</p>`;
  return `<div class="players">${players.map(p => `
    <div class="player ${p.alive ? "alive" : "dead"}">
      <div class="player-main"><strong>${esc(p.name)}</strong><small>${p.alive ? (p.hasSubmitted ? "Submitted" : "Waiting") : `Eliminated${p.eliminatedRound ? ` · round ${p.eliminatedRound}` : ""}`}</small></div>
      <div class="dot" title="${p.alive ? "Alive" : "Eliminated"}"></div>
    </div>`).join("")}</div>`;
}

function playerPanel() {
  const self = selfState();
  const status = state?.meta?.status;
  if (status === "lobby") {
    if (self && player) return `<div class="card accent"><h2>You're in</h2><p>Joined as <strong>${esc(self.name)}</strong>. Wait for the host to start.</p><button id="forget-player" class="secondary">Use another browser/name</button></div>`;
    return `<div class="card accent"><h2>Join the game</h2><form id="join-form"><label>Nickname<input name="name" maxlength="24" autocomplete="nickname" required placeholder="Your name"></label><button>Join</button></form></div>`;
  }
  if (!player || !self) return `<div class="card"><h2>Watching</h2><p class="muted">You aren't registered in this game. Ask the host to reset if you want to join.</p></div>`;
  if (!self.alive) return `<div class="card danger"><h2>Eliminated</h2><p>${esc(self.reason || "Better luck next game.")}</p></div>`;
  if (status === "round_open") {
    const time = secondsLeft();
    return `<div class="card accent"><div class="submit-head"><h2>Submit your password</h2><div id="countdown" class="countdown">${time ?? "—"}s</div></div>
      <form id="submit-form"><label>Password<input name="password" maxlength="200" autocomplete="off" required placeholder="Build a password that passes every rule"></label><button ${time === 0 ? "disabled" : ""}>Submit / replace</button></form>
      ${lastSubmit ? `<div class="feedback ${lastSubmit.valid ? "good" : "bad"}">${lastSubmit.valid ? "✓ Valid so far" : `✕ ${esc(lastSubmit.failures?.[0] || "Doesn't pass all rules")}`}</div>` : ""}
      <p class="muted tiny">You can replace your submission until time runs out. Only your latest one counts.</p></div>`;
  }
  if (status === "results") return `<div class="card"><h2>You survived round ${state.meta.round}</h2><p>Waiting for the host to start the next round.</p></div>`;
  if (status === "game_over") {
    const winners = state.meta.winners || [];
    const won = winners.includes(self.name);
    return `<div class="card ${won ? "winner" : ""}"><h2>${won ? "🏆 You won!" : "Game over"}</h2><p>${won ? "You survived the Password Battle Royale." : "Thanks for playing."}</p></div>`;
  }
  return "";
}

function hostPanel() {
  if (!hostMode) return "";
  const meta = state?.meta || {};
  return `<div class="card host"><div class="eyebrow">HOST CONTROLS</div>
    <label>Host key<input id="host-key" type="password" value="${esc(hostKey)}" placeholder="Same as HOST_KEY in Vercel"></label>
    ${meta.status === "lobby" ? `<label>Round timer (seconds)<input id="timer-value" type="number" min="20" max="300" value="${meta.roundSeconds || 60}"></label><div class="actions"><button data-host-action="set_timer">Save timer</button><button data-host-action="start">Start game</button></div>` : ""}
    ${meta.status === "round_open" ? `<div class="actions"><button data-host-action="close_round">Close round now</button></div>` : ""}
    ${meta.status === "results" ? `<div class="actions"><button data-host-action="next_round">Start next round</button></div>` : ""}
    <div class="actions"><button class="danger-button" data-host-action="reset">Reset entire game</button></div>
    <p class="muted tiny">Player link: <span class="mono">${esc(location.origin + location.pathname)}</span></p>
  </div>`;
}

function render() {
  if (!state) {
    app.innerHTML = `<main><header><div><div class="eyebrow">NO TWITCH NEEDED</div><h1>Password<br>Battle Royale</h1></div></header><div class="card"><p>${lastError ? esc(lastError) : "Loading game…"}</p></div></main>`;
    return;
  }
  const meta = state.meta;
  const aliveCount = state.players.filter(p => p.alive).length;
  const total = state.players.length;
  const time = secondsLeft();
  const winnerText = meta.status === "game_over" ? ((meta.winners || []).length ? `Winner${meta.winners.length > 1 ? "s" : ""}: ${meta.winners.map(esc).join(", ")}` : "No winner") : null;

  app.innerHTML = `<main>
    <header>
      <div><div class="eyebrow">NO TWITCH NEEDED</div><h1>Password<br>Battle Royale</h1></div>
      <div class="status-block"><span>${statusText(meta.status)}</span><strong>${meta.round ? `Round ${meta.round}/${state.totalRules}` : `${total} player${total === 1 ? "" : "s"}`}</strong>${meta.status === "round_open" ? `<small id="header-countdown">${time}s left</small>` : `<small>${aliveCount} alive</small>`}</div>
    </header>
    ${lastError ? `<div class="notice bad">${esc(lastError)}</div>` : ""}
    ${winnerText ? `<div class="hero-winner">🏆 ${winnerText}</div>` : ""}
    <section class="grid">
      <div><div class="card rules-card"><div class="card-title"><h2>Active rules</h2><span>${meta.round}/${state.totalRules}</span></div>${rulesHtml()}</div>${playerPanel()}</div>
      <aside><div class="card"><div class="card-title"><h2>Players</h2><span>${aliveCount}/${total}</span></div>${playersHtml()}</div>${hostPanel()}</aside>
    </section>
    <footer>Inspired by DougDoug's Password Battle Royale · private friend-game edition</footer>
  </main>`;

  bindEvents();
}

function bindEvents() {
  document.querySelector("#join-form")?.addEventListener("submit", async e => {
    e.preventDefault(); lastError = "";
    const name = new FormData(e.currentTarget).get("name");
    try {
      const data = await api({ action: "join", name });
      player = data.player;
      localStorage.setItem(storageKey, JSON.stringify(player));
      state = data.state;
      render();
    } catch (err) { lastError = err.message; render(); }
  });

  document.querySelector("#submit-form")?.addEventListener("submit", async e => {
    e.preventDefault(); lastError = "";
    const password = new FormData(e.currentTarget).get("password");
    try {
      lastSubmit = await api({ action: "submit", playerId: player.id, playerToken: player.token, password });
      await refresh();
    } catch (err) { lastError = err.message; render(); }
  });

  document.querySelector("#forget-player")?.addEventListener("click", () => {
    localStorage.removeItem(storageKey); player = null; render();
  });

  document.querySelector("#host-key")?.addEventListener("input", e => {
    hostKey = e.target.value;
    localStorage.setItem(hostStorageKey, hostKey);
  });

  document.querySelectorAll("[data-host-action]").forEach(button => button.addEventListener("click", async () => {
    lastError = "";
    const action = button.dataset.hostAction;
    if (action === "reset" && !confirm("Reset the whole game and remove every player?")) return;
    try {
      if (action === "set_timer") {
        const seconds = Number(document.querySelector("#timer-value")?.value || 60);
        const data = await api({ action, seconds }); state = data.state;
      } else {
        const data = await api({ action }); state = data.state;
      }
      lastSubmit = null;
      render();
    } catch (err) { lastError = err.message; render(); }
  }));
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
