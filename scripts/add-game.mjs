// Add a game to data/games.json by answering a few questions.
//   node scripts/add-game.mjs "Wingspan"
// Paste the game's BoardGameGeek link when asked and most answers are pre-filled.
// Press Enter to accept the [default] shown for any question.
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { loadGames, saveGames, bggItem, bggIdsFromWikidata, parseBggId, lookupWikipediaMany } from "./lib.mjs";

const rl = readline.createInterface({ input, output });
const games = await loadGames();
const known = (f) => [...new Set(games.flatMap((g) => [].concat(g[f] ?? [])))].sort();

async function ask(question, def, { choices } = {}) {
  if (choices) console.log(`   (existing: ${choices.join(", ")})`);
  const shown = Array.isArray(def) ? def.join(", ") : def;
  const ans = (await rl.question(`${question}${shown !== undefined && shown !== "" ? ` [${shown}]` : ""}: `)).trim();
  return ans || (shown ?? "");
}
async function askNum(q, def) {
  for (;;) {
    const v = Number(await ask(q, def));
    if (Number.isFinite(v) && v >= 0) return v;
    console.log("   Please enter a number.");
  }
}

// BGG categories/mechanics → our genre names, for a head start on genres.
const GENRE_HINTS = {
  "Cooperative Game": "Cooperative", "Deck, Bag, and Pool Building": "Deck-building", "Bluffing": "Bluffing",
  "Party Game": "Party", "Word Game": "Word", "Trivia": "Trivia", "Deduction": "Deduction", "Abstract Strategy": "Abstract",
  "Trick-taking": "Trick-taking", "Push Your Luck": "Push-your-luck", "Worker Placement": "Worker placement",
  "Tile Placement": "Tile placement", "Set Collection": "Set collection", "Hidden Roles": "Social deduction",
  "Real-time": "Real-time", "Dexterity": "Dexterity", "Children's Game": "Kids", "Educational": "Educational",
  "Humor": "Humor", "Wargame": "War", "Racing": "Racing", "Legacy Game": "Legacy", "Drafting": "Drafting",
  "Open Drafting": "Drafting", "Closed Drafting": "Drafting", "Roll / Spin and Move": "Roll & move", "Economic": "Economic",
};

const name = process.argv.slice(2).join(" ").trim() || (await ask("Game name"));
if (!name) process.exit(0);
if (games.some((g) => g.name.toLowerCase() === name.toLowerCase())) {
  console.log(`"${name}" is already in the list.`);
  process.exit(1);
}

// Find it on BoardGameGeek: suggest an id from Wikidata, or take a pasted link.
const suggested = (await bggIdsFromWikidata([name]).catch(() => new Map())).get(name);
let bgg = null;
for (;;) {
  const link = await ask("BoardGameGeek link or id (Enter to skip)", suggested ?? "");
  if (!link) break;
  const id = parseBggId(link);
  bgg = id && (await bggItem(id).catch(() => null));
  if (!bgg) { console.log("   Couldn't load that from BoardGameGeek, try again or press Enter to skip."); continue; }
  const ok = (await ask(`   Found "${bgg.name}"${bgg.year ? ` (${bgg.year})` : ""}. Is that it? (y/n)`, "y")).toLowerCase();
  if (ok.startsWith("y")) break;
  bgg = null;
}

const g = { name };
g.publisher = await ask("Publisher", bgg?.publishers[0] ?? "Unknown");
const type = await ask("Type: Base game / Standalone / Expansion / Collection / Accessory", bgg?.expands ? "Expansion" : "Base game");
g.type = /^exp/i.test(type) ? "Expansion" : type;
if (g.type === "Expansion") {
  const guess = games.find((x) => bgg?.expands && x.name.toLowerCase() === bgg.expands.toLowerCase())?.name ?? bgg?.expands;
  g.expands = await ask("Which game does it expand? (exact name from the list)", guess);
}
g.minPlayers = await askNum("Min players", bgg?.minPlayers ?? 2);
g.maxPlayers = await askNum("Max players", bgg?.maxPlayers ?? 4);
g.minAge = await askNum("Minimum age", bgg?.minAge ?? 8);
g.minTime = await askNum("Shortest play time (minutes)", bgg?.minTime ?? 30);
g.maxTime = await askNum("Longest play time (minutes)", bgg?.maxTime ?? g.minTime);
const d = (await ask("Difficulty: Easy / Medium / Hard", "Easy")).toLowerCase();
g.difficulty = d.startsWith("h") ? "Hard" : d.startsWith("m") ? "Medium" : "Easy";
g.style = await ask("Style", "Board", { choices: known("style") });
const hinted = [...new Set([...(bgg?.categories ?? []), ...(bgg?.mechanics ?? [])].map((x) => GENRE_HINTS[x]).filter(Boolean))];
g.genres = (await ask("Genres (comma separated)", hinted.length ? hinted : ["Family"], { choices: known("genres") }))
  .split(/\s*[,;]\s*/).filter(Boolean);
g.theme = await ask("Theme", "Abstract", { choices: known("theme") });
g.description = await ask("One-line description", bgg?.description ?? "");

if (bgg) {
  g.bggId = bgg.bggId;
  if (bgg.image) Object.assign(g, { image: bgg.image, imageCredit: `https://boardgamegeek.com/boardgame/${bgg.bggId}` });
}
if (!g.image) {
  const w = (await lookupWikipediaMany([name]).catch(() => new Map())).get(name);
  if (w) Object.assign(g, w);
}
console.log(g.image ? "Cover image found." : 'No cover found; add an "image" URL in games.json if you like.');

games.push(g);
await saveGames(games);
rl.close();
console.log(`\nAdded "${name}". Commit and push data/games.json to update the site.`);
