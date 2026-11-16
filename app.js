// Game Chooser: loads data/games.json and renders a filterable, groupable shelf.
// Filter/group/sort choices live in the URL, so any view can be bookmarked or shared.

const $ = (id) => document.getElementById(id);
const DIFFICULTIES = ["Easy", "Medium", "Hard"];
const TYPE_ORDER = ["Base game", "Standalone", "Collection", "Expansion", "Accessory"];
const STYLE_EMOJI = {
  Board: "♟️", Card: "🃏", Dice: "🎲", Tile: "🧩", Party: "🎉", Word: "🔤", Trivia: "❓",
  Drawing: "✏️", Dexterity: "🤹", Puzzle: "🧠", Audio: "🎧", Accessory: "🖌️",
};

const PLAYER_BUCKETS = [
  { label: "Solo (1 player)", test: (g) => g.minPlayers <= 1 },
  { label: "2 players", test: (g) => g.minPlayers <= 2 && g.maxPlayers >= 2 },
  { label: "3–4 players", test: (g) => g.minPlayers <= 4 && g.maxPlayers >= 3 },
  { label: "5–6 players", test: (g) => g.minPlayers <= 6 && g.maxPlayers >= 5 },
  { label: "7–9 players", test: (g) => g.minPlayers <= 9 && g.maxPlayers >= 7 },
  { label: "10+ players", test: (g) => g.maxPlayers >= 10 },
];
const AGE_BUCKETS = [
  { label: "Little kids (5 and under)", max: 5 },
  { label: "Kids (6–7)", max: 7 },
  { label: "Ages 8–9", max: 9 },
  { label: "Ages 10–12", max: 12 },
  { label: "Teens (13–16)", max: 16 },
  { label: "Adults (17+)", max: Infinity },
];
const TIME_BUCKETS = [
  { label: "Quick (20 min or less)", max: 20 },
  { label: "Short (21–45 min)", max: 45 },
  { label: "Medium (46–90 min)", max: 90 },
  { label: "Long (over 90 min)", max: Infinity },
];

const isExtra = (g) => g.type === "Expansion" || g.type === "Accessory";
const isCoop = (g) => g.genres.includes("Cooperative");
const playersText = (g) => (g.minPlayers === g.maxPlayers ? `${g.minPlayers}` : `${g.minPlayers}–${g.maxPlayers}`);
const timeText = (g) => (!g.maxTime ? "—" : g.minTime === g.maxTime ? `${g.maxTime} min` : `${g.minTime}–${g.maxTime} min`);
const uniq = (xs) => [...new Set(xs)].sort((a, b) => a.localeCompare(b));
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

// Publisher strings like "Eggertspiele / Pegasus Spiele" count for both publishers.
const publishers = (g) => g.publisher.split(" / ").map((p) => p.replace(/\?$/, "").trim());

// Grouping: each returns the group label(s) a game belongs to, plus a sort order for labels.
const GROUPERS = {
  players: { keys: (g) => PLAYER_BUCKETS.filter((b) => b.test(g)).map((b) => b.label), order: PLAYER_BUCKETS.map((b) => b.label),
    note: "A game appears under every player count it supports." },
  age: { keys: (g) => [AGE_BUCKETS.find((b) => g.minAge <= b.max).label], order: AGE_BUCKETS.map((b) => b.label) },
  time: { keys: (g) => [TIME_BUCKETS.find((b) => (g.maxTime || 0) <= b.max).label], order: TIME_BUCKETS.map((b) => b.label) },
  difficulty: { keys: (g) => [g.difficulty], order: DIFFICULTIES },
  style: { keys: (g) => [g.style] },
  genre: { keys: (g) => g.genres, note: "Games with several genres appear in each." },
  theme: { keys: (g) => [g.theme] },
  publisher: { keys: publishers },
  type: { keys: (g) => [g.type], order: TYPE_ORDER },
};

const SORTS = {
  name: (a, b) => a.name.localeCompare(b.name),
  time: (a, b) => (a.maxTime || 0) - (b.maxTime || 0),
  "time-desc": (a, b) => (b.maxTime || 0) - (a.maxTime || 0),
  age: (a, b) => a.minAge - b.minAge,
  difficulty: (a, b) => DIFFICULTIES.indexOf(a.difficulty) - DIFFICULTIES.indexOf(b.difficulty),
  "difficulty-desc": (a, b) => DIFFICULTIES.indexOf(b.difficulty) - DIFFICULTIES.indexOf(a.difficulty),
  "players-desc": (a, b) => b.maxPlayers - a.maxPlayers,
  publisher: (a, b) => a.publisher.localeCompare(b.publisher),
};

// Placeholder cover: a stable color per game so the shelf still looks like a shelf.
function hue(name) {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) % 360;
  return h;
}
function coverHtml(g, eager = false) {
  const ph = `<div class="placeholder" style="background:linear-gradient(135deg,hsl(${hue(g.name)} 45% 42%),hsl(${(hue(g.name) + 40) % 360} 50% 30%))"><div><span class="emoji">${STYLE_EMOJI[g.style] ?? "🎲"}</span>${esc(g.name)}</div></div>`;
  if (!g.image) return `<div class="cover">${ph}</div>`;
  return `<div class="cover"><img src="${esc(g.image)}" alt="${esc(g.name)} box cover" ${eager ? "" : 'loading="lazy"'} referrerpolicy="no-referrer" onerror="this.parentElement.innerHTML=this.parentElement.dataset.ph" ></div>`
    .replace('<div class="cover">', `<div class="cover" data-ph="${esc(ph)}">`);
}

function cardHtml(g, i) {
  return `<button class="card" type="button" data-i="${i}">
    ${coverHtml(g)}
    <div class="card-body">
      <h3>${esc(g.name)}</h3>
      <div class="facts">
        <span title="Players">👥 ${playersText(g)}</span>
        <span title="Game length">⏱ ${timeText(g)}</span>
        <span title="Recommended age">${g.minAge}+</span>
        <span class="diff ${g.difficulty}">${g.difficulty}</span>
      </div>
      <div>${g.needsReview ? `<span class="tag warn" title="Details need verification">⚠ verify</span> ` : ""}${isExtra(g) ? `<span class="tag exp">${esc(g.type)}</span> ` : ""}<span class="tag">${esc(g.style)}</span> <span class="tag">${esc(g.theme)}</span></div>
    </div>
  </button>`;
}

let games = [];
let visible = [];

const FILTERS = ["players", "age", "time", "difficulty", "style", "genre", "theme", "publisher"];

function readState() {
  const p = new URLSearchParams(location.hash.slice(1));
  $("search").value = p.get("q") ?? "";
  for (const f of FILTERS) $(`f-${f}`).value = p.get(f) ?? "";
  $("f-expansions").checked = p.get("extras") === "1";
  $("f-coop").checked = p.get("coop") === "1";
  $("f-review").checked = p.get("review") === "1";
  $("group").value = p.get("group") ?? "";
  $("sort").value = p.get("sort") ?? "name";
}
function writeState() {
  const p = new URLSearchParams();
  if ($("search").value) p.set("q", $("search").value);
  for (const f of FILTERS) if ($(`f-${f}`).value) p.set(f, $(`f-${f}`).value);
  if ($("f-expansions").checked) p.set("extras", "1");
  if ($("f-coop").checked) p.set("coop", "1");
  if ($("f-review").checked) p.set("review", "1");
  if ($("group").value) p.set("group", $("group").value);
  if ($("sort").value !== "name") p.set("sort", $("sort").value);
  history.replaceState(null, "", p.size ? `#${p}` : location.pathname + location.search);
}

function matches(g) {
  const q = $("search").value.trim().toLowerCase();
  if (q) {
    const hay = [g.name, g.publisher, g.theme, g.style, g.description, ...g.genres].join(" ").toLowerCase();
    if (!q.split(/\s+/).every((w) => hay.includes(w))) return false;
  }
  const players = Number($("f-players").value);
  if (players && (g.minPlayers > players || g.maxPlayers < (players === 10 ? 10 : players))) return false;
  const age = $("f-age").value;
  if (age && g.minAge > Number(age)) return false;
  const time = $("f-time").value;
  if (time && (!g.maxTime || g.maxTime > Number(time))) return false;
  if ($("f-difficulty").value && g.difficulty !== $("f-difficulty").value) return false;
  if ($("f-style").value && g.style !== $("f-style").value) return false;
  if ($("f-genre").value && !g.genres.includes($("f-genre").value)) return false;
  if ($("f-theme").value && g.theme !== $("f-theme").value) return false;
  if ($("f-publisher").value && !publishers(g).includes($("f-publisher").value)) return false;
  if (!$("f-expansions").checked && isExtra(g)) return false;
  if ($("f-coop").checked && !isCoop(g)) return false;
  if ($("f-review").checked && !g.needsReview) return false;
  return true;
}

function render() {
  writeState();
  for (const f of FILTERS) $(`f-${f}`).classList.toggle("active", !!$(`f-${f}`).value);
  const active = FILTERS.filter((f) => $(`f-${f}`).value).length + ($("f-coop").checked ? 1 : 0) + ($("f-review").checked ? 1 : 0) + ($("search").value ? 1 : 0);
  $("filters").querySelector("summary").textContent = active ? `Filters (${active} active)` : "Filters";
  const sort = SORTS[$("sort").value] ?? SORTS.name;
  visible = games.filter(matches).sort((a, b) => sort(a, b) || SORTS.name(a, b));
  const total = games.filter((g) => !isExtra(g)).length;
  $("count").textContent = `${visible.length} of ${total} games`;

  const res = $("results");
  if (!visible.length) {
    res.innerHTML = `<p class="empty">No games match those filters. <button class="link" id="reset2" type="button">Clear filters</button></p>`;
    $("reset2").onclick = reset;
    return;
  }
  const by = GROUPERS[$("group").value];
  const idx = new Map(games.map((g, i) => [g, i]));
  if (!by) {
    res.innerHTML = `<div class="grid">${visible.map((g) => cardHtml(g, idx.get(g))).join("")}</div>`;
    return;
  }
  const groups = new Map();
  for (const g of visible) for (const k of by.keys(g)) (groups.get(k) ?? groups.set(k, []).get(k)).push(g);
  const order = by.order ?? [...groups.keys()].sort((a, b) => a.localeCompare(b));
  res.innerHTML =
    (by.note ? `<p class="count">${by.note}</p>` : "") +
    order
      .filter((k) => groups.has(k))
      .map((k) => `<section class="group"><h2>${esc(k)} <span class="n">${groups.get(k).length}</span></h2>
        <div class="grid">${groups.get(k).map((g) => cardHtml(g, idx.get(g))).join("")}</div></section>`)
      .join("");
}

function showDetail(g) {
  const expansions = games.filter((x) => x.expands === g.name);
  const bgg = g.bggId
    ? `https://boardgamegeek.com/boardgame/${g.bggId}`
    : `https://boardgamegeek.com/geeksearch.php?action=search&objecttype=boardgame&q=${encodeURIComponent(g.name)}`;
  $("detail-body").innerHTML = `<div class="detail">
    ${coverHtml(g, true)}
    <div>
      <h2 id="d-name">${esc(g.name)}</h2>
      <p class="pub">${esc(g.publisher)}${g.type !== "Base game" ? ` · ${esc(g.type)}` : ""}</p>
      <p>${esc(g.description)}</p>
      <dl>
        <dt>Players</dt><dd>${playersText(g)}</dd>
        <dt>Length</dt><dd>${timeText(g)}</dd>
        <dt>Ages</dt><dd>${g.minAge}+</dd>
        <dt>Difficulty</dt><dd class="diff ${g.difficulty}">${g.difficulty}</dd>
        <dt>Style</dt><dd>${esc(g.style)}</dd>
        <dt>Theme</dt><dd>${esc(g.theme)}</dd>
        <dt>Genres</dt><dd class="tags">${g.genres.map((x) => `<span class="tag">${esc(x)}</span>`).join("")}</dd>
        ${g.box ? `<dt>Box</dt><dd>${esc(g.box)}: shared with ${games.filter((x) => x.box === g.box && x !== g).map((x) => `<button class="link" data-name="${esc(x.name)}">${esc(x.name)}</button>`).join(", ")}</dd>` : ""}
        ${g.expands ? `<dt>Expands</dt><dd><button class="link" data-name="${esc(g.expands)}">${esc(g.expands)}</button></dd>` : ""}
        ${expansions.length ? `<dt>Add-ons</dt><dd>${expansions.map((x) => `<button class="link" data-name="${esc(x.name)}">${esc(x.name)}</button>`).join(", ")}</dd>` : ""}
      </dl>
      ${g.needsReview ? `<p class="review">⚠ Some details for this game are a best guess and need checking.</p>` : ""}
      <div class="links">
        <a href="${bgg}" target="_blank" rel="noopener">BoardGameGeek ↗</a>
        <a href="https://www.youtube.com/results?search_query=${encodeURIComponent(g.name + " how to play")}" target="_blank" rel="noopener">How to play ↗</a>
        ${g.imageCredit ? `<a href="${esc(g.imageCredit)}" target="_blank" rel="noopener">Cover source ↗</a>` : ""}
      </div>
    </div>
  </div>`;
  $("detail-body").querySelectorAll("[data-name]").forEach((b) =>
    b.addEventListener("click", () => showDetail(games.find((x) => x.name === b.dataset.name))));
  if (!$("detail").open) $("detail").showModal();
}

function reset() {
  $("search").value = "";
  for (const f of FILTERS) $(`f-${f}`).value = "";
  $("f-expansions").checked = false;
  $("f-coop").checked = false;
  $("f-review").checked = false;
  render();
}

function fill(id, values) {
  $(id).insertAdjacentHTML("beforeend", values.map((v) => `<option value="${esc(v)}">${esc(v)}</option>`).join(""));
}

async function init() {
  games = await (await fetch("data/games.json", { cache: "no-cache" })).json();

  fill("f-players", [1, 2, 3, 4, 5, 6, 7, 8, 9].map(String));
  $("f-players").insertAdjacentHTML("beforeend", `<option value="10">10+</option>`);
  $("f-age").insertAdjacentHTML("beforeend", [4, 6, 8, 10, 12, 14].map((a) => `<option value="${a}">${a} years old</option>`).join(""));
  fill("f-difficulty", DIFFICULTIES);
  fill("f-style", uniq(games.map((g) => g.style)));
  fill("f-genre", uniq(games.flatMap((g) => g.genres)));
  fill("f-theme", uniq(games.map((g) => g.theme)));
  fill("f-publisher", uniq(games.flatMap(publishers)).filter((p) => p !== "Unknown" && p !== "Traditional"));

  readState();
  if (matchMedia("(max-width: 560px)").matches) $("filters").open = false;

  $("search").addEventListener("input", render);
  for (const id of ["group", "sort", "f-expansions", "f-coop", "f-review", ...FILTERS.map((f) => `f-${f}`)]) $(id).addEventListener("change", render);
  $("reset").addEventListener("click", reset);
  $("random").addEventListener("click", () => {
    const pool = visible.filter((g) => !isExtra(g));
    if (pool.length) showDetail(pool[Math.floor(Math.random() * pool.length)]);
  });
  $("results").addEventListener("click", (e) => {
    const card = e.target.closest(".card");
    if (card) showDetail(games[Number(card.dataset.i)]);
  });
  $("detail").addEventListener("click", (e) => { if (e.target === $("detail")) $("detail").close(); });
  window.addEventListener("hashchange", () => { $("detail").close(); readState(); render(); });
  render();
}

init().catch((err) => {
  $("results").innerHTML = `<p class="empty">Couldn't load the game list (${esc(err.message)}).</p>`;
});
