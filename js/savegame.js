(function() {
    'use strict';

    const SAVE_KEY = 'hexcity_save_v1';

    window.SaveGame = {

        // ─── Save ──────────────────────────────────────────
        save: function() {
            try {
                const HM = window.HexMap;
                const GS = window.GameState;
                const EV = window.EventsEngine;

                const data = {
                    version: 1,
                    savedAt: Date.now(),

                    // Map dimensions & terrain (only tile types, not full objects)
                    cols: HM.cols,
                    rows: HM.rows,
                    mapData: HM.data.map(row => row.map(t => t.type)),

                    // Camera
                    zoom: HM.zoom,
                    cameraX: HM.cameraX,
                    cameraY: HM.cameraY,

                    // City state
                    factionColor: HM.factionColor,
                    townHallBuilt: HM.townHallBuilt,
                    townhallQueued: HM.townhallQueued,
                    gameOver: HM.gameOver,
                    winStreakTurns: HM.winStreakTurns || 0,

                    // Resources & deltas
                    resources: Object.assign({}, HM.resources),
                    deltas: Object.assign({}, HM.deltas),

                    // Buildings (strip functions, keep plain data)
                    buildings: HM.buildings,

                    // Build queue
                    buildQueue: HM.buildQueue,

                    // Territory
                    territory: HM.territory,

                    // Citizens
                    citizens: HM.citizens,
                    _nextCitizenId: HM._nextCitizenId,

                    // Events engine state
                    events: EV ? {
                        _nextEventTurn: EV._nextEventTurn,
                        _activeEffects: EV._activeEffects
                    } : null,

                    // Game state
                    currentTurn: GS.currentTurn,
                    autoWork: GS.autoWork,
                    lastBuildType: GS.lastBuildType,

                    // Difficulty
                    difficulty: HM.difficulty || 'normal'
                };

                localStorage.setItem(SAVE_KEY, JSON.stringify(data));
                return true;
            } catch (e) {
                console.warn('[SaveGame] Save failed:', e);
                return false;
            }
        },

        // ─── Load ──────────────────────────────────────────
        load: function() {
            try {
                const raw = localStorage.getItem(SAVE_KEY);
                if (!raw) return null;
                const data = JSON.parse(raw);
                if (!data || data.version !== 1) return null;
                return data;
            } catch (e) {
                console.warn('[SaveGame] Load failed:', e);
                return null;
            }
        },

        // ─── Apply loaded data to HexMap / GameState ───────
        restore: function(data) {
            try {
                const HM = window.HexMap;
                const GS = window.GameState;
                const EV = window.EventsEngine;
                const C  = window.GameConfig;

                // Reconstruct tile objects from saved type strings
                HM.cols = data.cols;
                HM.rows = data.rows;
                HM.data = data.mapData.map((row, r) =>
                    row.map((type, c) => ({ type, col: c, row: r }))
                );

                // Camera
                HM.zoom    = data.zoom    || 1.0;
                HM.cameraX = data.cameraX || 0;
                HM.cameraY = data.cameraY || 0;

                // City state
                HM.factionColor    = data.factionColor || '#4f8ef7';
                HM.townHallBuilt   = data.townHallBuilt   || false;
                HM.townhallQueued  = data.townhallQueued  || false;
                HM.gameOver        = data.gameOver        || null;
                HM.winStreakTurns  = data.winStreakTurns  || 0;

                // Resources & deltas
                HM.resources = Object.assign({}, data.resources);
                HM.deltas    = Object.assign({}, data.deltas);

                // Buildings, queue, territory, citizens
                HM.buildings       = data.buildings       || {};
                HM.buildQueue      = data.buildQueue      || [];
                HM.territory       = data.territory       || {};
                HM.citizens        = data.citizens        || [];
                HM._nextCitizenId  = data._nextCitizenId  || 1;

                // Difficulty
                HM.difficulty = data.difficulty || 'normal';

                // Clear transient event state
                HM.lastEvents          = [];
                HM.pendingEventResults = [];

                // Events engine
                if (EV && data.events) {
                    EV._nextEventTurn  = data.events._nextEventTurn  || 1;
                    EV._activeEffects  = data.events._activeEffects  || [];
                } else if (EV) {
                    EV.reset();
                }

                // GameState
                GS.currentTurn   = data.currentTurn   || 1;
                GS.autoWork      = data.autoWork       || false;
                GS.lastBuildType = data.lastBuildType  || null;
                GS.selectedCell  = null;
                GS.namingCell    = null;
                GS.isDragging    = false;
                GS.dragMoved     = false;

                return true;
            } catch (e) {
                console.warn('[SaveGame] Restore failed:', e);
                return false;
            }
        },

        // ─── Delete save ───────────────────────────────────
        clear: function() {
            localStorage.removeItem(SAVE_KEY);
        },

        // ─── Check if save exists ──────────────────────────
        exists: function() {
            return !!localStorage.getItem(SAVE_KEY);
        },

        // ─── Save metadata (for menu display) ─────────────
        getMeta: function() {
            try {
                const raw = localStorage.getItem(SAVE_KEY);
                if (!raw) return null;
                const data = JSON.parse(raw);
                if (!data || data.version !== 1) return null;

                // Find city name from townhall building
                let cityName = window.GameConfig?.DEFAULT_CITY_NAME || 'Безымянный город';
                const buildings = data.buildings || {};
                for (const b of Object.values(buildings)) {
                    if (b.type === 'townhall' && b.name) { cityName = b.name; break; }
                }

                return {
                    turn:      data.currentTurn || 1,
                    cityName,
                    savedAt:   data.savedAt,
                    population: data.resources?.population || 0,
                    money:     data.resources?.money || 0
                };
            } catch (e) {
                return null;
            }
        }
    };
})();
