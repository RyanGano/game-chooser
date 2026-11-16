# Game Chooser

A browsable catalog of our board games. Filter by player count, age, time, difficulty,
style, genre, theme or publisher; group and sort the results; or hit **Pick one for me**.

**Live site:** https://ryangano.github.io/game-chooser/

It's a static site: `index.html`, `styles.css` and `app.js` with no build step. All
the game data lives in [`data/games.json`](data/games.json).

## Adding a game

### Easiest: the add-game script

Requires [Node.js](https://nodejs.org) 18 or newer.

```bash
node scripts/add-game.mjs "Wingspan"
```

It asks a few questions. Paste the game's BoardGameGeek link when it asks, and it fills
in players, ages, play time, publisher and the box cover for you. Press Enter to accept
each suggested answer. Then find it a spot on the shelf, and commit and push:

```bash
node scripts/fetch-sizes.mjs
node scripts/plan-shelf.mjs
git add data && git commit -m "Add Wingspan" && git push
```

`plan-shelf` prints where the new game goes (for example `+ Wingspan → A2`).

The site updates about a minute after the push.

### By hand

Copy an existing entry in `data/games.json` and change it. Only `name` is strictly
needed, but the filters work best when everything is filled in:

```json
{
  "name": "Wingspan",
  "publisher": "Stonemaier Games",
  "type": "Base game",
  "minPlayers": 1,
  "maxPlayers": 5,
  "minAge": 10,
  "minTime": 40,
  "maxTime": 70,
  "difficulty": "Medium",
  "style": "Board",
  "genres": ["Engine building", "Strategy"],
  "theme": "Nature & Animals",
  "description": "Attract birds to your wildlife preserves.",
  "bggId": 266192
}
```

Then run `node scripts/find-covers.mjs` to fetch the cover (or set `"image"` to any
image URL yourself).

### Field reference

| Field | Values |
| --- | --- |
| `type` | `Base game`, `Standalone`, `Collection`, `Expansion` (also set `expands` to the base game's exact name), `Accessory` |
| `difficulty` | `Easy`, `Medium`, `Hard` |
| `style` | The kind of game: `Board`, `Card`, `Dice`, `Tile`, `Party`, `Word`, `Trivia`, `Drawing`, `Dexterity`, `Puzzle`, `Audio`, `Accessory` |
| `genres` | List; reuse existing ones where possible (`Cooperative`, `Strategy`, `Deck-building`, `Bluffing`…) |
| `theme` | One setting, e.g. `Fantasy`, `Space`, `Disney`, `Trains` |
| `box` | Name of a box that holds several games (e.g. `AEG Black Box`); those games are listed separately but shelved together |
| `bggId` | The number in the game's BoardGameGeek URL |
| `image` | Cover image URL. Add `"imageLocked": true` to stop scripts replacing it |
| `cubby`, `section` | Where it lives on the shelf. Written by `plan-shelf`; edit `cubby` by hand to move a game |
| `shelfSection` | Puts a game in a named shelf section, overriding the automatic choice |
| `size` | Box `[length, width, depth]` in inches. Add `"sizeLocked": true` if BGG's size is wrong |
| `value` | `low`, `mid` or `high` replacement cost, if the guess is wrong. High-value games stay off the bottom row |
| `needsReview` | `true` marks details that are a best guess; the site shows a note |

Expansions and accessories are hidden unless **Show expansions & accessories** is ticked.

## Scripts

| Command | What it does |
| --- | --- |
| `node scripts/add-game.mjs "Name"` | Add a game interactively |
| `node scripts/find-covers.mjs` | Link games without a cover to BoardGameGeek (via Wikidata) and fetch covers; Wikipedia is the fallback |
| `node scripts/find-covers.mjs --all` | Same, re-checking every game |

| `node scripts/fetch-sizes.mjs` | Fetch box sizes from BoardGameGeek for games that don't have one |
| `node scripts/plan-shelf.mjs` | Give new games a cubby, leaving everything else where it is |
| `node scripts/plan-shelf.mjs --fresh` | Re-sort the whole shelf from scratch |

`find-covers` checks that BoardGameGeek's name for each ID matches ours and drops any
that don't. It also lists where BGG's player counts or times differ from ours, without
changing anything.

## The shelf

The site's **Group by → Shelf map** shows which cubby every game is in. The shelf is
described in `data/shelf.json`: 3 × 4 cubbies, each 32″ wide and 17″ tall, with rows A
(top) to D (bottom) and columns 1 to 3. Games are grouped into sections, which fill the
shelf top-left first in the order listed there:

1. **Grown-ups only**: adult-content games, top shelf
2. **Strategy & campaigns**: longer, heavier games
3. **Co-op**
4. **Two-player**
5. **Family**
6. **Card game bin**: small card games, loose in a bin
7. **Party, word & trivia**
8. **Kids**: always the bottom row

Since the pricier games sort first, cheap ones end up low, near the kids' games.
Expansions sit with their base game, and games that share a `box` stay together.
Boxes stand on edge, and small ones lie flat in the space above them. A cubby counts as
full at 78% so there's room to get games out. Games with no BoardGameGeek size get a
typical size for their style.

Plain `plan-shelf` never moves a game that already has a cubby. Each new game goes in the
emptiest cubby that already holds its section. If none has room, it says so, and
`--fresh` re-sorts everything.

## Running locally

Any static file server works, for example:

```bash
python -m http.server 8000
```

Then open http://localhost:8000.

The original inventory spreadsheet is kept in `board_game_inventory_master.csv`.
