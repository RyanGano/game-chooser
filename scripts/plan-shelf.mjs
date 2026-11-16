// Plan where every game goes on the shelf, and write each game's "cubby" (e.g. "B2").
//   node scripts/plan-shelf.mjs
//
// The shelf is described in data/shelf.json: a grid of cubbies (columns × rows, A = top row),
// each cubbyWidth × cubbyHeight inches, and an ordered list of sections. Sections fill
// cubbies in reading order (top-left first). The kids section always goes on the bottom row.
//
// Big boxes stand on edge like books; smaller boxes lie flat in the headroom above them.
// So each box is budgeted by the area of the cubby opening it covers (thickness × standing
// height), and a cubby is "full" at fillLimit of its opening. Games in the bin section are
// budgeted by volume instead. Games without a BGG size get an estimate by style.
//
// Overrides in games.json: "shelfSection" puts a game in a named section;
// "size": [l, w, d] in inches fixes a wrong or missing size.
import { readFile, writeFile } from "node:fs/promises";
import { loadGames, saveGames, GAMES_FILE } from "./lib.mjs";

const shelf = JSON.parse(await readFile(GAMES_FILE.replace("games.json", "shelf.json"), "utf8"));
const games = await loadGames();

const ESTIMATES = { // typical box [l, w, d] by style when BGG has no dimensions
  Card: [6, 4, 1.5], Dice: [8, 8, 2.5], Word: [10, 10, 2.5], Trivia: [10, 10, 3], Party: [10, 10, 3],
  Drawing: [11, 11, 3], Dexterity: [11, 11, 3], Puzzle: [9, 9, 2.5], Tile: [11, 11, 3], Board: [12, 12, 3],
  Audio: [10, 7, 2], Accessory: [6, 4, 2],
};
const sizeOf = (g) => g.size ?? ESTIMATES[g.style] ?? [11, 11, 3];

const binSection = shelf.sections.find((s) => s.bin)?.name;
/** Inches of shelf width a box uses: by volume in a bin, else stood on edge (small boxes stack). */
function widthUsed(g, section) {
  if (section === binSection) {
    const [l, w, d] = sizeOf(g);
    return (l * w * d) / (shelf.cubbyHeight * shelf.cubbyDepth * shelf.binPacking);
  }
  const [l, w, d] = sizeOf(g);
  // Stood on edge (shorter face side up), a box covers d × w of the cubby's opening.
  // Shorter boxes leave headroom that smaller boxes fill by lying flat on top, so we
  // budget by area of the opening, converted back to inches of width.
  return (d * Math.min(w, shelf.cubbyHeight)) / shelf.cubbyHeight;
}

// Rough replacement cost, so pricey games stay out of small children's reach.
// Override per game with "value": "low" | "mid" | "high".
const MASS_MARKET = /hasbro|mattel|spin master|endless|university games|buffalo|big g creative|pressman|playmonster|jax|goliath|cardinal|what do you meme|big potato|out of the box|winning moves|wonder forge|learning resources|traditional|set enterprises|looney labs|exploding kittens|milton bradley|carma|briarpatch|mindware|fat brain|the op|usaopoly|game development group|unknown/i;
export function valueOf(g) {
  if (g.value) return g.value;
  const [l, w, d] = sizeOf(g);
  const volume = l * w * d;
  if (g.difficulty === "Hard" || g.genres.includes("Legacy") || g.genres.includes("Miniatures")) return "high";
  if (MASS_MARKET.test(g.publisher)) return "low";
  if (volume >= 12 * 12 * 3.5 || (g.difficulty === "Medium" && g.maxTime >= 60)) return "high";
  if (volume <= 8 * 8 * 2.5) return "low";
  return "mid";
}

const isKids = (g) => g.genres.includes("Kids") || g.genres.includes("Educational") || g.minAge <= 5;
function sectionOf(g) {
  if (g.shelfSection) return g.shelfSection;
  const G = g.genres;
  if (g.minAge >= 17 || G.includes("Adult")) return "Grown-ups only";
  if (isKids(g)) return "Kids";
  if (binSection && g.style === "Card" && sizeOf(g)[0] <= 8) return binSection;
  if (g.difficulty === "Hard" || (g.difficulty === "Medium" && g.maxTime >= 60) || G.includes("Legacy")) return "Strategy & campaigns";
  if (G.includes("Cooperative")) return "Co-op";
  if (g.maxPlayers === 2) return "Two-player";
  if (["Party", "Trivia", "Drawing", "Word"].includes(g.style) || G.includes("Party")) return "Party, word & trivia";
  return "Family";
}

// Group things that live together: a shared box, or a base game and its expansions.
const byName = new Map(games.map((g) => [g.name, g]));
const rootOf = (g) => (g.expands && byName.has(g.expands) ? rootOf(byName.get(g.expands)) : g);
const unitKey = (g) => g.box ?? rootOf(g).name;
const units = new Map();
for (const g of games) (units.get(unitKey(g)) ?? units.set(unitKey(g), []).get(unitKey(g))).push(g);
for (const u of units.values()) u.sort((a, b) => (a.expands ? 1 : 0) - (b.expands ? 1 : 0) || a.name.localeCompare(b.name));
// A unit goes in the section of its base game (or first game in a shared box).
const sections = new Map(shelf.sections.map((s) => [s.name, []]));
for (const [key, u] of units) {
  const s = sectionOf(u.find((g) => !g.expands) ?? u[0]);
  if (!sections.has(s)) throw new Error(`Unknown shelfSection "${s}" on ${key}`);
  sections.get(s).push({ key, games: u, width: u.reduce((t, g) => t + widthUsed(g, s), 0) });
}
for (const list of sections.values()) list.sort((a, b) => a.key.localeCompare(b.key));
// A bin is one container: keep its whole section together as a single unit.
if (binSection && sections.get(binSection).length) {
  const list = sections.get(binSection);
  sections.set(binSection, [{ key: binSection, games: list.flatMap((u) => u.games), width: list.reduce((t, u) => t + u.width, 0) }]);
}

const need = [...sections].map(([n, l]) => [n, l.reduce((t, u) => t + u.width, 0)]);
const capacity = shelf.columns * shelf.rows * shelf.cubbyWidth * shelf.fillLimit;
console.log(`Space needed: ${need.map(([n, w]) => `${n} ${w.toFixed(0)}″`).join(", ")}`);
console.log(`Total ${need.reduce((t, [, w]) => t + w, 0).toFixed(0)}″ of ${capacity.toFixed(0)}″ usable`);

// Cubby ids: row letter (A = top) + column number.
const cap = shelf.cubbyWidth * shelf.fillLimit;
const cubbies = [];
for (let r = 0; r < shelf.rows; r++)
  for (let c = 0; c < shelf.columns; c++) cubbies.push({ id: `${String.fromCharCode(65 + r)}${c + 1}`, row: r, used: 0, sections: new Set(), units: [] });

const bottom = shelf.rows - 1;
const kidsName = shelf.kidsSection;
// Kids fill the bottom row from the left; everything else fills reading order, skipping
// whatever bottom-row space the kids section took.
function place(sectionName, list, slots) {
  let i = 0;
  for (const unit of list) {
    while (i < slots.length && slots[i].used + unit.width > cap && slots[i].used > 0) i++;
    if (i >= slots.length) throw new Error(`Out of shelf space while placing "${sectionName}": ${unit.key}`);
    const c = slots[i];
    c.used += unit.width;
    c.sections.add(sectionName);
    c.units.push(unit);
    for (const g of unit.games) Object.assign(g, { cubby: c.id, section: sectionName });
  }
}
const byId = new Map(cubbies.map((c) => [c.id, c]));
const fresh = process.argv.includes("--fresh") || !games.some((g) => byId.has(g.cubby));

if (fresh) {
  // Full re-sort. Kids fill the bottom row from the left; everything else fills reading
  // order, without sharing the kids' cubbies.
  const bottomRow = cubbies.filter((c) => c.row === bottom);
  place(kidsName, sections.get(kidsName), bottomRow);
  const rest = cubbies.filter((c) => c.row !== bottom || c.units.length === 0);
  let cursor = 0;
  for (const s of shelf.sections) {
    if (s.name === kidsName) continue;
    place(s.name, sections.get(s.name), rest.slice(cursor));
    // Next section starts in the cubby where this one ended (sharing it if there's room).
    const last = rest.findIndex((c) => c.sections.has(s.name) && !rest.slice(rest.indexOf(c) + 1).some((d) => d.sections.has(s.name)));
    if (last >= 0) cursor = last;
  }
} else {
  // Keep everything where it is; only place games that have no cubby yet.
  const newUnits = [];
  for (const [sectionName, list] of sections)
    for (const unit of list) {
      const home = unit.games.map((g) => byId.get(g.cubby)).find(Boolean);
      if (!home) { newUnits.push([sectionName, unit]); continue; }
      home.used += unit.width;
      home.units.push(unit);
      for (const g of unit.games) {
        if (!byId.has(g.cubby)) console.log(`+ ${g.name} → ${home.id} (with ${unit.games[0].name})`);
        g.cubby = home.id;
        g.section ??= sectionName;
        home.sections.add(g.section);
      }
    }
  for (const [sectionName, unit] of newUnits) {
    const allowed = cubbies.filter((c) => (sectionName === kidsName) === (c.row === bottom) || (sectionName !== kidsName && c.row === bottom && valueOf(unit.games[0]) === "low"));
    const fits = (c) => c.used + unit.width <= cap;
    const pick = allowed.filter((c) => c.sections.has(sectionName) && fits(c)).sort((a, b) => a.used - b.used)[0]
      ?? allowed.filter(fits).sort((a, b) => a.used - b.used)[0];
    if (!pick) {
      console.log(`⚠ No room for ${unit.key} in "${sectionName}". Run with --fresh to re-sort the whole shelf.`);
      continue;
    }
    place(sectionName, [unit], [pick]);
    console.log(`+ ${unit.key} → ${pick.id} (${sectionName}${pick.sections.size > 1 && ![...pick.sections].every((s) => s === sectionName) ? ", sharing" : ""})`);
  }
}

await saveGames(games);
await writeFile(GAMES_FILE.replace("games.json", "shelf-plan.json"), JSON.stringify({
  cubbies: cubbies.map((c) => ({ id: c.id, sections: [...c.sections], fill: Math.round((c.used / shelf.cubbyWidth) * 100) })),
}, null, 2) + "\n");
const risky = cubbies.filter((c) => c.row === bottom).flatMap((c) => c.units.flatMap((u) => u.games)).filter((g) => valueOf(g) === "high");
if (risky.length) console.log("⚠ High-value games on the bottom row: " + risky.map((g) => g.name).join(", "));
for (const c of cubbies) {
  const pct = Math.round((c.used / shelf.cubbyWidth) * 100);
  console.log(`${c.id} [${[...c.sections].join(" + ") || "empty"}] ${pct}% full, ${c.units.reduce((t, u) => t + u.games.length, 0)} games`);
}
