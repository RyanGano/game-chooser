// Link games to BoardGameGeek and fill in cover images.
//   node scripts/find-covers.mjs          # games missing a cover or BGG link
//   node scripts/find-covers.mjs --all    # re-check every game (except "imageLocked" ones)
//
// 1. Games without a "bggId" get one from Wikidata (matched by name).
// 2. Each BGG id is checked: BGG's name for it must match ours, or the id is dropped.
// 3. The BGG cover is used; Wikipedia is the fallback for games BGG couldn't be linked for.
// It also prints where BGG's players/age/time disagree with ours, so you can decide.
import { loadGames, saveGames, bggItem, bggIdsFromWikidata, bggIdsFromWikidataSearch, bggRelated, sameGame, lookupWikipediaMany } from "./lib.mjs";

const all = process.argv.includes("--all");
const games = await loadGames();
const fromBgg = (g) => g.imageCredit?.includes("boardgamegeek.com");
const todo = games.filter((g) => all || !g.image || !g.bggId || (!fromBgg(g) && !g.imageLocked));

// 1. Find ids: exact Wikidata names, then expansions listed on the base game's BGG page,
//    then Wikidata's fuzzy search.
const byName = new Map(games.map((g) => [g.name, g]));
let needId = todo.filter((g) => !g.bggId);
if (needId.length) {
  const ids = await bggIdsFromWikidata(needId.flatMap((g) => [g.name, g.name.replace(/\s*\(.*?\)/g, "")]));
  for (const g of needId) g.bggId = ids.get(g.name) ?? ids.get(g.name.replace(/\s*\(.*?\)/g, "")) ?? g.bggId;
}
for (const parent of new Set(todo.filter((g) => !g.bggId && g.expands).map((g) => g.expands))) {
  const p = byName.get(parent);
  if (!p?.bggId) continue;
  const related = await bggRelated(p.bggId).catch(() => []);
  for (const g of todo.filter((g) => !g.bggId && g.expands === parent)) {
    // "Carcassonne: The Tower" matches BGG's "Carcassonne: Expansion 4 – The Tower" on the part after the colon.
    const tail = g.name.split(":").pop();
    const hit = related.find((r) => sameGame(g.name, r.name)) ?? related.find((r) => r.name.toLowerCase().includes(tail.trim().toLowerCase()));
    if (hit) g.bggId = hit.id;
  }
}
needId = todo.filter((g) => !g.bggId);
console.log(`Searching Wikidata for ${needId.length} games...`);
if (needId.length) {
  const ids = await bggIdsFromWikidataSearch(needId.map((g) => g.name));
  for (const g of needId) if (ids.has(g.name)) g.bggId = ids.get(g.name);
  await saveGames(games);
}

// 2. Verify and pull details.
let linked = 0;
const diffs = [];
for (const g of todo.filter((g) => g.bggId)) {
  const b = await bggItem(g.bggId).catch((e) => console.log(`  ${g.name}: ${e.message}`));
  if (!b) continue;
  if (!sameGame(g.name, b.name) && !g.bggVerified) {
    console.log(`✗ ${g.name}: BGG id ${g.bggId} is "${b.name}", dropping it`);
    delete g.bggId;
    continue;
  }
  linked++;
  if (b.image && !g.imageLocked) {
    g.image = b.image;
    g.imageCredit = `https://boardgamegeek.com/boardgame/${b.bggId}`;
  }
  if (g.publisher === "Unknown" && b.publishers[0]) g.publisher = b.publishers[0];
  for (const k of ["minPlayers", "maxPlayers", "minAge", "minTime", "maxTime"])
    if (b[k] !== undefined && b[k] !== g[k]) diffs.push(`${g.name}: ${k} ours=${g[k]} bgg=${b[k]}`);
  console.log(`✓ ${g.name} → ${b.name}${b.year ? ` (${b.year})` : ""}`);
}

// 3. Wikipedia fallback.
const noCover = todo.filter((g) => !g.image && !g.imageLocked);
const wiki = await lookupWikipediaMany(noCover.map((g) => g.name)).catch(() => new Map());
for (const g of noCover) if (wiki.has(g.name)) Object.assign(g, wiki.get(g.name));

await saveGames(games);
if (diffs.length) console.log(`\nWhere BGG disagrees with games.json (nothing changed):\n  ${diffs.join("\n  ")}`);
console.log(`\n${linked} linked to BGG. ${games.filter((g) => !g.image).length} games still without a cover:`);
console.log("  " + games.filter((g) => !g.image).map((g) => g.name).join("\n  "));
