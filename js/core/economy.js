(function() {
    'use strict';
    const C = window.GameConfig;

    window.EconomyEngine = {
        /**
         * Computes per-turn resource deltas without modifying state.
         * Also populates hexMap.lastEvents with { type, ... } entries.
         * @returns {Object} deltas map
         */
        computeDeltas: function(hexMap) {
            const d = {
                money: C.BASE_INCOME,
                wheat: 0, bread: 0, apples: 0, fish: 0, iron: 0, copper: 0,
                coal: 0, steel: 0, wood: 0,
                population: 0, defense: 0,cherry:0
            };
            const events = [];
            const buildings = Object.values(hexMap.buildings)
                .sort((a, b) => (a.builtAt || 0) - (b.builtAt || 0));
            let idleBuildings = 0;

            // Get active strike info
            let strikeTarget = null;
            if (window.EventsEngine) {
                const strike = window.EventsEngine.getActiveStrike();
                if (strike) {
                    strikeTarget = strike.targetCol + ',' + strike.targetRow;
                }
            }

            // ── Per-building production ───────────────────────
            for (const b of buildings) {
                const cfg = C.BUILDINGS[b.type];
                if (!cfg) continue;

                // Skip production from buildings on strike (applies to ALL building types)
                const bKey = b.col + ',' + b.row;
                if (strikeTarget === bKey) {
                    if (cfg.workersRequired) idleBuildings++;
                    continue;
                }

                if (b.type === 'market') {
                    d.money += window.ConstructionEngine.getMarketIncome(hexMap, b.col, b.row);
                    continue;
                }

                if (b.type === 'mine') {
                    const mode = b.mineMode || 'gold';
                    const cfgProd = cfg.mineModeProduction?.[mode];
                    if (cfgProd && window.PopulationEngine.isBuildingActive(hexMap, b.col, b.row)) {
                        const level = b.level || 1;
                        const assigned = b.assignedWorkers || 0;
                        const extraWorkers = level === 2 ? Math.max(0, assigned - cfg.workersRequired) : 0;
                        const factor = 1 + extraWorkers * 0.25;
                        for (const [res, amt] of Object.entries(cfgProd)) {
                            d[res] = (d[res] || 0) + Math.round(amt * factor * 10) / 10;
                        }
                    } else if (!window.PopulationEngine.isBuildingActive(hexMap, b.col, b.row)) {
                        idleBuildings++;
                    }
                    continue;
                }

                if (b.type === 'factory') {
                    if (window.PopulationEngine.isBuildingActive(hexMap, b.col, b.row)) {
                        const level = b.level || 1;
                        const mode = b.factoryMode || 'goods';
                        // Steel mode only available at level 2
                        const effectiveMode = (mode === 'steel' && level < 2) ? 'goods' : mode;
                        const cfg2 = C.BUILDINGS['factory'];
                        const prod = cfg2.factoryModeProduction[effectiveMode] || {};
                        const cons = cfg2.factoryModeConsumption[effectiveMode] || {};

                        // Check resource availability
                        let canRun = true;
                        for (const [res, amt] of Object.entries(cons)) {
                            if ((hexMap.resources[res] || 0) + (d[res] || 0) < amt) { canRun = false; break; }
                        }

                        if (canRun) {
                            // Workers efficiency: base 3 workers = ×1, each extra worker adds +33% (max 6 workers = ×2)
                            const assigned = b.assignedWorkers || 0;
                            const extraWorkers = Math.max(0, assigned - cfg2.workersRequired);
                            const factor = 1 + extraWorkers * (1 / 3);
                            for (const [res, amt] of Object.entries(prod)) {
                                d[res] = (d[res] || 0) + Math.round(amt * factor * 10) / 10;
                            }
                            for (const [res, amt] of Object.entries(cons)) {
                                d[res] = (d[res] || 0) - amt;
                            }
                        } else {
                            idleBuildings++;
                        }
                    } else {
                        idleBuildings++;
                    }
                    continue;
                }

                if (b.type === 'port') {
                    const assigned = b.assignedWorkers || 0;
                    if (assigned >= cfg.workersRequired) {
                        const level = b.level || 1;
                        const mode = b.portMode || 'fishing';
                        const effectiveMode = (mode === 'trade' && level < 2) ? 'fishing' : mode;
                        if (effectiveMode === 'trade') {
                            d.fish += 1;
                            let money = 3;
                            if (window.ConstructionEngine.hasNearbyWarehouse(hexMap, b.col, b.row)) {
                                money += 4;
                            }
                            d.money += money;
                        } else {
                            d.fish += (assigned === 1 ? 2 : 5) + (level === 2 ? 2 : 0);
                        }
                    } else {
                        idleBuildings++;
                    }
                    continue;
                }
                if (b.type === 'smelter') {
                    if (window.PopulationEngine.isBuildingActive(hexMap, b.col, b.row)) {
                        const woodAvailable = hexMap.resources.wood + d.wood;
                        const woodNeeded = cfg.consumption?.wood || 3;
                        if (woodAvailable >= woodNeeded) {
                            d.wood -= woodNeeded;
                            d.coal = (d.coal || 0) + (cfg.production?.coal || 1);
                        } else {
                            idleBuildings++;
                        }
                    } else {
                        idleBuildings++;
                    }
                    continue;
                }
                if (b.type === 'orchard') {
                    const assigned = b.assignedWorkers || 0;
                    if (assigned >= cfg.workersRequired) {
                        d.apples += 2 * assigned;
                    } else {
                        idleBuildings++;
                    }
                    continue;
                }
                if (b.type === 'cherry_orchard') {
                    const assigned = b.assignedWorkers || 0;
                    if (assigned >= cfg.workersRequired) {
                        d.cherry += 2 * assigned;
                    } else {
                        idleBuildings++;
                    }
                    continue;
                }
                if (cfg.workersRequired) {
                    if ((b.assignedWorkers || 0) >= cfg.workersRequired) {
                        // Skip mine - handled separately with mode switching
                        if (b.type !== 'mine') {
                            // Farm: level 2 gives 1.5× base per worker, up to 2 workers
                            if (b.type === 'farm') {
                                const level = b.level || 1;
                                const workers = b.assignedWorkers || 0;
                                const baseWheat = cfg.production.wheat || 3;
                                const perWorker = baseWheat * (level === 2 ? 1.5 : 1);
                                d.wheat = (d.wheat || 0) + Math.round(perWorker * workers * 10) / 10;
                            } else if (b.type === 'barracks') {
                                const level = b.level || 1;
                                const baseDefense = cfg.production.defense || 3;
                                const defense = level === 2 ? baseDefense * 2 : baseDefense;
                                d.defense = (d.defense || 0) + defense;
                            } else if (b.type === 'sawmill') {
                                const tile = hexMap.data[b.row][b.col];
                                const baseWood = cfg.production.wood || 3;
                                const wood = tile.type === 'fertile' ? baseWood * 2 : baseWood;
                                d.wood = (d.wood || 0) + wood;
                            } else {
                                for (const [res, amt] of Object.entries(cfg.production || {})) {
                                    d[res] = (d[res] || 0) + amt;
                                }
                            }
                        }
                    } else {
                        idleBuildings++;
                    }
                } else {
                    for (const [res, amt] of Object.entries(cfg.production || {})) {
                        d[res] = (d[res] || 0) + amt;
                    }
                }
            }
            // ── Mill: wheat → bread conversion ───────────────
            for (const b of buildings) {
                if (b.type === 'mill' && window.PopulationEngine.isBuildingActive(hexMap, b.col, b.row)) {
                    const level = b.level || 1;
                    const wheatNeeded = level === 2 ? 4 : 2;
                    const breadProduced = level === 2 ? 5 : 2;
                    const wheatAvailable = hexMap.resources.wheat + d.wheat;
                    if (wheatAvailable >= wheatNeeded) {
                        d.wheat -= wheatNeeded;
                        d.bread += breadProduced;
                    } else {
                        idleBuildings++;
                    }
                }
            }
            if (idleBuildings > 0) events.push({ type: 'idle_workers', count: idleBuildings });

            // ── Active world-event effects (drought, etc.) ─
            if (window.EventsEngine) window.EventsEngine.applyActiveEffects(hexMap, d);

            // ── Townhall population income ────────────────────
            if (hexMap.townHallBuilt) {
                d.money += Math.floor(hexMap.resources.population * C.MONEY_PER_POPULATION);
            }

            // ── Population cap ────────────────────────────────
            const houseCount = buildings.filter(b => b.type === 'house').length;
            const hasTownhall = buildings.some(b => b.type === 'townhall');
            const maxPop = houseCount * C.HOUSE_MAX_POPULATION + (hasTownhall ? C.TOWNHALL_MAX_RESIDENTS : 0);
            const currentPop = hexMap.resources.population || 0;
            if (currentPop + d.population > maxPop) {
                d.population = Math.max(0, maxPop - currentPop);
            }

            // ── Food consumption ──────────────────────────────
            const pop = hexMap.resources.population;
            const applesAvail = Math.max(0, hexMap.resources.apples + d.apples);
            const cherryAvail = Math.max(0, hexMap.resources.cherry + d.cherry);
            const fishAvail   = Math.max(0, hexMap.resources.fish   + d.fish);
            const breadAvail  = Math.max(0, hexMap.resources.bread  + d.bread);
            const directFood  = applesAvail + fishAvail + cherryAvail;
            const totalFoodCap = directFood + breadAvail * C.FOOD_PER_POPULATION;

            if (pop > 0 && totalFoodCap < pop) {
                // Голодание
                const fedByDirect = Math.min(directFood, pop);
                const fedByBread  = Math.min(breadAvail * C.FOOD_PER_POPULATION, Math.max(0, pop - fedByDirect));
                d.population -= Math.min(pop - (fedByDirect + fedByBread), pop);
                const applesUsed = Math.min(applesAvail, pop);
                d.apples -= applesUsed;
                let remaining = pop - applesUsed;
                const cherryUsed = Math.min(cherryAvail, remaining);
                d.cherry -= cherryUsed;
                remaining -= cherryUsed;
                const fishUsed = Math.min(fishAvail, remaining);
                d.fish -= fishUsed;
                remaining -= fishUsed;
                if (remaining > 0) {
                    d.bread -= Math.min(Math.ceil(remaining / C.FOOD_PER_POPULATION), breadAvail);
                }
                events.push({ type: 'starvation', shortage: pop - (fedByDirect + fedByBread) });
            } else if (pop > 0) {
                // Normal feeding — deplete food stores
                const applesUsed = Math.min(applesAvail, pop);
                d.apples -= applesUsed;
                let remaining = pop - applesUsed;
                const cherryUsed = Math.min(cherryAvail,remaining);
                d.cherry -= cherryUsed;
                remaining -= cherryUsed
                const fishUsed = Math.min(fishAvail, remaining);
                d.fish -= fishUsed;
                remaining -= fishUsed;
                if (remaining > 0) {
                    d.bread -= Math.min(Math.ceil(remaining / C.FOOD_PER_POPULATION), breadAvail);
                }
            }

            hexMap.deltas     = d;
            hexMap.lastEvents = events;
            return d;
        },

        /**
         * Applies computed deltas to hexMap.resources, then
         * recalculates territory and trims excess workers.
         * @returns {Array} completedBuildings (passed through unchanged)
         */
        processTurn: function(hexMap, completedBuildings) {
            // ── World events (fire before economy, may modify resources directly) ──
            if (window.EventsEngine) {
                const fired = window.EventsEngine.processTurn(hexMap, window.GameState?.currentTurn || 1);
                if (fired.length > 0) {
                    hexMap.pendingEventResults = fired;
                }
            }

            const d = this.computeDeltas(hexMap);
            for (const [res, delta] of Object.entries(d)) {
                hexMap.resources[res] = Math.max(0, (hexMap.resources[res] || 0) + delta);
            }

            hexMap.recalculateTerritory();

            // ── Housing & emigration ──────────────────────────
            const emigrated = window.PopulationEngine.syncCitizens(hexMap);
            if (emigrated > 0) {
                hexMap.lastEvents.push({ type: 'emigration', count: emigrated });
            }

            // ── Win condition tracking ────────────────────────
            const WIN_POP   = 200;
            const WIN_MONEY = 300000;
            const WIN_TURNS = 30;
            const pop   = hexMap.resources.population;
            const money = hexMap.resources.money;
            const meetsCondition = pop >= WIN_POP && money >= WIN_MONEY;

            if (meetsCondition) {
                hexMap.winStreakTurns = (hexMap.winStreakTurns || 0) + 1;
            } else {
                hexMap.winStreakTurns = 0;
            }

            if (hexMap.winStreakTurns >= WIN_TURNS && !hexMap.gameOver) {
                hexMap.gameOver = 'win';
            }

            // Auto-remove workers if population dropped below assigned count
            const floorPop = Math.floor(hexMap.resources.population);
            let assigned = window.PopulationEngine.getTotalAssignedWorkers(hexMap);
            if (assigned > floorPop) {
                const bList = Object.values(hexMap.buildings)
                    .filter(b => (b.assignedWorkers || 0) > 0)
                    .sort((a, b) => (b.builtAt || 0) - (a.builtAt || 0));
                let excess = assigned - floorPop;
                for (const b of bList) {
                    if (excess <= 0) break;
                    const remove = Math.min(b.assignedWorkers || 0, excess);
                    b.assignedWorkers -= remove;
                    excess -= remove;
                }
            }

            // ── Resource caps (150 base + 150 per warehouse) ──
            const warehouseCount = Object.values(hexMap.buildings).filter(b => b.type === 'warehouse').length;
            const maxStorage = 150 + warehouseCount * 150;
            const cappedResources = ['wheat','cherry', 'bread', 'apples', 'fish', 'iron', 'copper', 'coal', 'steel', 'wood'];
            for (const res of cappedResources) {
                hexMap.resources[res] = Math.min(hexMap.resources[res] || 0, maxStorage);
            }

            return completedBuildings;
        },
    };
})();