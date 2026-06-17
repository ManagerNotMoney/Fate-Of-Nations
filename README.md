# 🏛️ Fate Of Nations — Technical Overview

**v0.0.8** · Pre-alpha · InfinityDev

---

## 📦 Project Structure

```
index.html               # Entry point (menu, game screen, modals)
css/
  ├── style.css          # Global tokens, reset, particles
  ├── style-menu.css     # Main menu & setup modals
  ├── style-game.css     # In-game UI (top bar, resource bar, panel, legend)
  └── style-overlays.css # Tooltips, notifications, event modals, endgame
js/
  ├── core/
  │   ├── config.js      # All constants: TILES, BUILDINGS, RESOURCES, DIFFICULTY, MAP_SIZES
  │   ├── construction.js # Build validation, queue, pricing, demolish/upgrade
  │   ├── economy.js     # Resource delta calculation, food consumption, turn processing
  │   ├── hexmap.js      # Map state, geometry, territory, generation, camera
  │   └── savegame.js    # Serialization to localStorage, metadata
  ├── world/
  │   ├── noise.js       # Perlin noise (fBm) for procedural map generation
  │   └── events.js      # World & local events, active effects (drought, strike, locust)
  ├── society/
  │   ├── population.js  # Workers, citizens, housing, commuting, district stats
  │   └── ideology.js    # Political factions (global & district counts)
  ├── render/
  │   └── renderer.js    # Canvas 2D rendering (hexes, buildings, animations)
  ├── ui/
  │   ├── ui.js          # Main UI: resource bar, turn, notifications, delegates
  │   ├── ui-panel.js    # Cell panel: building info, workers, residents, modes
  │   ├── ui-modals.js   # Modals: city name, color picker, events, win/lose
  │   └── ui-tooltips.js # Tooltips for resource chips and canvas hover
  └── main.js            # Menu, setup, game flow, canvas events, auto-save
```

---

## 🧠 Core Architecture

### Single Source of Truth: `window.HexMap`
- Holds all game data: `data` (tiles), `buildings`, `buildQueue`, `territory`, `citizens`, `resources`, `deltas`, `factionColor`.
- Provides geometry helpers (`hexToPixel`, `pixelToHex`, `hexDistance`) and territory management (`claimTerritory`, `recalculateTerritory`).
- Delegates worker/building/economy calls to respective engines.

### Pure-Function Engines
Each engine receives `hexMap` as first argument and returns results or mutates `hexMap` directly (side effects are explicit):
- **ConstructionEngine** – `canBuild`, `queueBuild`, `cancelBuild`, `demolishBuilding`, `upgradeBuilding`, `getDynamicCost`, `getMarketIncome`.
- **EconomyEngine** – `computeDeltas(hexMap)` → calculates per-turn resource changes; `processTurn(hexMap, completed)` → applies deltas, handles housing, win/lose, caps.
- **PopulationEngine** – worker assignment, citizen registry, housing sync, job commuting, district statistics.
- **IdeologyEngine** – counts workers by ideology, determines dominant faction (global & per district).
- **EventsEngine** – triggers random events, manages active effects (strike, drought, locust), applies effects to deltas.

### UI Controllers
- **UI** – orchestrates resource bar, turn button, notifications, construction animation, delegates to sub-modules.
- **UIPanel** – opens on cell click; displays terrain, building details, residents, workers, market stats, mine/factory/port modes.
- **UIModals** – handles city naming, color picker, event modals, goal, win/lose.
- **UITooltips** – hover tooltips for resource chips and hex cells.

### Renderer
- `Renderer` draws the map on Canvas 2D using frustum culling, shared vertex cache, and zoom‑out optimisation (dots instead of icons).
- Uses `requestRender()` with `_rafPending` flag to avoid redundant frames.

---

## 🔄 Key Data Flows

### Map Generation
1. `main.js` calls `HexMap.generate(size, difficulty, mapType)`.
2. `generate()` uses fBm noise with different parameters based on `mapType` (continent, archipelago, rivers, auto).
3. Produces `data` array of tile objects.

### Turn Processing
1. User clicks "End Turn" → `UI.endTurn()`.
2. `HexMap.processTurn()`:
   - Decrements build queue; completed buildings are placed.
   - Calls `EconomyEngine.processTurn(hexMap, completed)`.
3. `EconomyEngine.processTurn()`:
   - Triggers world events.
   - Computes deltas (production, consumption, food, population).
   - Applies deltas to resources.
   - Recalculates territory.
   - Syncs citizens (housing, emigration).
   - Checks win/lose conditions.
   - Caps resources (storage limit).
4. UI updates resource bar, panel, queue, and triggers re‑render.

### Rendering Loop
- `Renderer.render()` is called on:
  - Every `requestRender()` after state changes (build, end turn, panel open, zoom/pan).
  - Zoom/pan use `requestRender()` with throttling to avoid excessive draws.

### Saving/Loading
- `SaveGame.save()` serialises `HexMap`, `GameState`, `EventsEngine` into JSON → localStorage.
- `SaveGame.restore(data)` reconstructs `HexMap.data`, buildings, queue, territory, citizens, resources, deltas, and engine states.
- Auto‑save after each turn and every 30 seconds.

---

## 🧩 Adding New Content

### New Building
1. Define in `config.js` under `BUILDINGS` – specify `cost`, `production`, `consumption`, `workersRequired`, `allowedTiles`, `maxLevel`, etc.
2. If it needs special logic (e.g., mine modes, factory modes), add handling in:
   - `EconomyEngine.computeDeltas()` for production/consumption.
   - `UIPanel._render...` for UI tabs.
   - `renderer.js` `BUILDING_STYLES` for colours.
3. Update `config.js` `RESOURCES` if new resource types are introduced.

### New Event
1. Add object to `EventsEngine.REGISTRY` with `id`, `name`, `icon`, `scope` (`world` or `local`), `condition(hexMap)`, `apply(hexMap)`.
2. For local events, `apply()` must apply irreversible effects immediately and return `choices` array with actions.
3. UI automatically handles display and choice resolution via `UIModals.openEventModal()`.

### New Map Type
1. Add entry to `MAP_TYPES` in `config.js`.
2. Modify `HexMap.generate()` – add a branch in the `mapType` logic to adjust noise parameters and post‑processing (e.g., more rivers, continental shape).

---

## 🛠 Development Notes

- **Global dependencies**: All modules are loaded via `<script>` tags in `index.html`. Order matters:
  1. `config.js`
  2. `noise.js`
  3. `events.js`
  4. `construction.js`, `population.js`, `economy.js`, `ideology.js`, `hexmap.js`
  5. `renderer.js`
  6. UI modules (`ui‑tooltips.js`, `ui‑modals.js`, `ui‑panel.js`, `ui.js`)
  7. `savegame.js`, `main.js`
- **State mutations**: Most engines mutate `hexMap` directly. Keep side effects local and document them.
- **Performance**: Use `Renderer.requestRender()` instead of direct `render()` where possible. For heavy loops (e.g., citizen sync), avoid O(n²) – current algorithms are acceptable for up to ~200 citizens.
- **Debugging**: `window.HexMap` is globally accessible from browser console for inspection.

---

## 📜 License & Credits

Developed by **W.Solutions.Games**  
AI assistants: Claude Sonnet 4.6, Kimi 2.6, ChatGPT, DeepSeek  
Alpha testers: wyrtnwemw, ib1zza

**InfinityDev** – every update expands the game without a final endpoint.
