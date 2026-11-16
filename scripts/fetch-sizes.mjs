// Fill in box dimensions ("size": [length, width, depth] in inches, largest first)
// from BoardGameGeek edition pages. Used by the shelf planner.
//   node scripts/fetch-sizes.mjs          # games without a size
//   node scripts/fetch-sizes.mjs --all    # re-check every linked game
import { loadGames, saveGames, bggEditions, bggVersionSize } from "./lib.mjs";

const all = process.argv.includes("--all");
const games = await loadGames();
const todo = games.filter((g) => g.bggId && !g.sizeLocked && (all || !g.size));
let found = 0;
for (const g of todo) {
  const eds = await bggEditions(g.bggId).catch(() => []);
  // English editions first, newest-looking last so first hit is a common retail one.
  const ranked = [...eds.filter((e) => /english|multilingual/i.test(e.name)), ...eds.filter((e) => !/english|multilingual/i.test(e.name))];
  for (const e of ranked.slice(0, 4)) {
    const size = await bggVersionSize(e.id).catch(() => null);
    if (size) {
      g.size = size;
      found++;
      console.log(`✓ ${g.name}: ${size.join(" × ")}″ (${e.name})`);
      break;
    }
  }
  if (!g.size) console.log(`  ${g.name}: no dimensions on BGG`);
}
await saveGames(games);
console.log(`\n${found} sizes added; ${games.filter((g) => !g.size).length} games without a size (the shelf planner estimates those).`);
