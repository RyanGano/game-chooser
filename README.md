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
each suggested answer. Then commit and push:

```bash
git add data/games.json && git commit -m "Add Wingspan" && git push
```

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
| `bggId` | The number in the game's BoardGameGeek URL |
| `image` | Cover image URL. Add `"imageLocked": true` to stop scripts replacing it |
| `needsReview` | `true` marks details that are a best guess; the site shows a note |

Expansions and accessories are hidden unless **Show expansions & accessories** is ticked.

## Scripts

| Command | What it does |
| --- | --- |
| `node scripts/add-game.mjs "Name"` | Add a game interactively |
| `node scripts/find-covers.mjs` | Link games without a cover to BoardGameGeek (via Wikidata) and fetch covers; Wikipedia is the fallback |
| `node scripts/find-covers.mjs --all` | Same, re-checking every game |

`find-covers` checks that BoardGameGeek's name for each ID matches ours and drops any
that don't. It also lists where BGG's player counts or times differ from ours, without
changing anything.

## Running locally

Any static file server works, for example:

```bash
python -m http.server 8000
```

Then open http://localhost:8000.

The original inventory spreadsheet is kept in `board_game_inventory_master.csv`.
