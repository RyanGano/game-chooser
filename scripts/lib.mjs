// Shared helpers for the data scripts. No dependencies: Node 18+ only.
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const GAMES_FILE = path.join(root, "data", "games.json");
const UA = "game-chooser/1.0 (personal board game catalog)";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function loadGames() {
  return JSON.parse(await readFile(GAMES_FILE, "utf8"));
}

export async function saveGames(games) {
  games.sort((a, b) => a.name.localeCompare(b.name, "en", { sensitivity: "base" }));
  await writeFile(GAMES_FILE, JSON.stringify(games, null, 2) + "\n", "utf8");
}

/** Loose name comparison: case, punctuation, "The", editions and parentheses ignored. */
export const norm = (s) =>
  s.toLowerCase()
    .replace(/\(.*?\)/g, " ")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\b(the|a|second|2nd|edition|deluxe|game|board|card)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();

async function getJson(url, headers = {}) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const res = await fetch(url, { headers: { "User-Agent": UA, ...headers }, signal: AbortSignal.timeout(20000) }).catch((e) => ({ ok: false, status: e.name }));
    if (res.status === "TimeoutError") continue;
    if (res.status === 429 || res.status === 503) {
      await sleep(5000 * (attempt + 1));
      continue;
    }
    if (!res.ok) throw new Error(`${res.status} from ${new URL(url).host}`);
    return res.json();
  }
  throw new Error(`rate limited by ${new URL(url).host}`);
}

// ---------- BoardGameGeek ----------

/** Pull a BGG id out of "https://boardgamegeek.com/boardgame/230802/azul" or a bare "230802". */
export const parseBggId = (s) => Number(String(s).match(/(?:boardgame(?:expansion|accessory)?\/)?(\d+)/)?.[1]) || null;

/**
 * A specific edition on BGG (".../boardgameversion/568310/..."): its own box image and
 * the id of the game it belongs to.
 */
export async function bggVersion(versionId) {
  const d = await getJson(`https://api.geekdo.com/api/geekitems?objecttype=version&objectid=${versionId}&nosession=1`);
  await sleep(1000);
  const it = d.item;
  if (!it?.name) return null;
  const parent = it.links?.boardgame?.[0] ?? it.links?.boardgameexpansion?.[0];
  return {
    name: it.name,
    gameId: parent ? Number(parent.objectid) : null,
    image: it["imageurl@2x"] || it.imageurl || undefined,
  };
}

/** All editions BGG lists for a game: [{id, name}]. */
export async function bggEditions(gameId) {
  const d = await getJson(`https://api.geekdo.com/api/geekitems?objecttype=thing&objectid=${gameId}&nosession=1`);
  await sleep(1000);
  return (d.item?.links?.boardgameversion ?? []).map((v) => ({ id: Number(v.objectid), name: v.name }));
}

/** Box size of one edition as [l, w, d] inches, largest first; null when BGG has none. */
export async function bggVersionSize(versionId) {
  const d = await getJson(`https://api.geekdo.com/api/geekitems?objecttype=version&objectid=${versionId}&nosession=1`);
  await sleep(1000);
  const dims = ["length", "width", "depth"].map((k) => Number(d.item?.[k]) || 0);
  if (dims.some((x) => x <= 0 || x > 40)) return null;
  return dims.sort((a, b) => b - a).map((x) => Math.round(x * 10) / 10);
}

/** Details for one BGG item, from the JSON BoardGameGeek's own site uses. */
export async function bggItem(id) {
  const d = await getJson(`https://api.geekdo.com/api/geekitems?objecttype=thing&objectid=${id}&nosession=1`);
  await sleep(1000); // be polite
  const it = d.item;
  if (!it?.name) return null;
  const names = (k) => (it.links?.[k] ?? []).map((x) => x.name);
  const num = (v) => (Number(v) > 0 ? Number(v) : undefined);
  return {
    bggId: Number(id),
    name: it.name,
    year: num(it.yearpublished),
    minPlayers: num(it.minplayers),
    maxPlayers: num(it.maxplayers),
    minAge: num(it.minage),
    minTime: num(it.minplaytime),
    maxTime: num(it.maxplaytime),
    publishers: names("boardgamepublisher"),
    categories: names("boardgamecategory"),
    mechanics: names("boardgamemechanic"),
    expands: names("expandsboardgame")[0],
    description: it.short_description || undefined,
    image: it["imageurl@2x"] || it.imageurl || undefined,
  };
}

/**
 * Find BGG ids for many game names at once via Wikidata, which records each game's
 * BoardGameGeek id (property P2339). Returns Map<name, bggId>. Names Wikidata doesn't
 * know are simply missing from the map.
 */
export async function bggIdsFromWikidata(names) {
  const out = new Map();
  for (let i = 0; i < names.length; i += 60) {
    const batch = names.slice(i, i + 60);
    const values = batch.map((n) => JSON.stringify(n) + "@en").join(" ");
    const query = `SELECT ?name ?bgg WHERE {
      VALUES ?name { ${values} }
      { ?item rdfs:label ?name } UNION { ?item skos:altLabel ?name }
      ?item wdt:P2339 ?bgg .
    }`;
    const data = await getJson("https://query.wikidata.org/sparql?query=" + encodeURIComponent(query), {
      Accept: "application/sparql-results+json",
    });
    for (const b of data.results.bindings) {
      const name = b.name.value;
      if (!out.has(name)) out.set(name, Number(b.bgg.value));
    }
    await sleep(1000);
  }
  return out;
}

/**
 * Slower fallback: Wikidata's fuzzy name search (labels and aliases), one request per
 * name, keeping the first hit that has a BGG id. Results still need sameGame() checking.
 */
export async function bggIdsFromWikidataSearch(names) {
  const out = new Map();
  for (const name of names) {
    const q = name.replace(/\s*\(.*?\)/g, "").replace(/[?!]/g, "");
    const s = await getJson(`https://www.wikidata.org/w/api.php?${new URLSearchParams({
      action: "wbsearchentities", search: q, language: "en", type: "item", limit: "7", format: "json",
    })}`).catch(() => null);
    await sleep(400);
    const ids = (s?.search ?? []).map((x) => x.id);
    if (!ids.length) continue;
    const e = await getJson(`https://www.wikidata.org/w/api.php?${new URLSearchParams({
      action: "wbgetentities", ids: ids.join("|"), props: "claims", format: "json",
    })}`).catch(() => null);
    await sleep(400);
    for (const id of ids) {
      const v = e?.entities?.[id]?.claims?.P2339?.[0]?.mainsnak?.datavalue?.value;
      if (v) { out.set(name, Number(v)); console.log(`  id ${v} for ${name}`); break; }
    }
  }
  return out;
}

/** Expansions and related items listed on a BGG item's page: [{id, name}]. */
export async function bggRelated(id) {
  const d = await getJson(`https://api.geekdo.com/api/geekitems?objecttype=thing&objectid=${id}&nosession=1`);
  await sleep(1000);
  const l = d.item?.links ?? {};
  return ["boardgameexpansion", "containedin", "contains", "reimplementation"]
    .flatMap((k) => l[k] ?? [])
    .map((x) => ({ id: Number(x.objectid), name: x.name }));
}

/** True when BGG's name for an item is plausibly the same game as ours. */
export function sameGame(ours, theirs) {
  const a = norm(ours), b = norm(theirs);
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  // Prefix matches ("Roll Through the Ages" vs "...: The Bronze Age") need a multi-word name,
  // so an expansion like "Zombicide: Toxic City Mall" never matches plain "Zombicide".
  return a === b || (short.includes(" ") && long.startsWith(short + " "));
}

// ---------- Wikipedia (fallback cover source) ----------

const candidateTitles = (name) => {
  const base = name.replace(/\s*\(.*?\)\s*/g, " ").trim();
  return [`${base} (board game)`, `${base} (card game)`, `${base} (game)`, base];
};

/** Lead images of Wikipedia articles that are clearly about each game. Map<name, cover>. */
export async function lookupWikipediaMany(names) {
  const wanted = new Map();
  for (const n of names) for (const t of candidateTitles(n)) if (!wanted.has(t)) wanted.set(t, n);
  const titles = [...wanted.keys()];
  const hits = new Map();
  for (let i = 0; i < titles.length; i += 50) {
    const params = new URLSearchParams({
      format: "json", action: "query", redirects: "1", titles: titles.slice(i, i + 50).join("|"),
      prop: "pageimages|description", piprop: "thumbnail", pithumbsize: "500", pilicense: "any",
    });
    const data = await getJson(`https://en.wikipedia.org/w/api.php?${params}`);
    await sleep(500);
    const back = new Map();
    for (const r of [...(data.query?.normalized ?? []), ...(data.query?.redirects ?? [])]) back.set(r.to, back.get(r.from) ?? r.from);
    for (const p of Object.values(data.query?.pages ?? {})) {
      if (!p.thumbnail?.source) continue;
      const asked = back.get(p.title) ?? p.title;
      const game = wanted.get(asked);
      if (!game) continue;
      const looksLikeGame = /\b(board|card|dice|party|tabletop|strategy) game\b/i.test(p.description ?? "") || /game\)$/i.test(p.title);
      if (!looksLikeGame) continue;
      const rank = candidateTitles(game).indexOf(asked);
      const cover = { image: p.thumbnail.source, imageCredit: `https://en.wikipedia.org/wiki/${encodeURIComponent(p.title.replace(/ /g, "_"))}` };
      (hits.get(game) ?? hits.set(game, []).get(game)).push({ rank, cover });
    }
  }
  const out = new Map();
  for (const [game, list] of hits) out.set(game, list.sort((a, b) => a.rank - b.rank)[0].cover);
  return out;
}
