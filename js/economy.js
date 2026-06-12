(function() {
    'use strict';
    const C = window.GameConfig;

    window.EconomyEngine = {

        // ════════════════════════════════════════════════════════
        // WORKER MANAGEMENT
        // ════════════════════════════════════════════════════════

        /** Returns total workers assigned across all buildings. */
        getTotalAssignedWorkers: function(hexMap) {
            let total = 0;
            for (const key of Object.keys(hexMap.buildings)) {
                total += (hexMap.buildings[key].assignedWorkers || 0);
            }
            return total;
        },

        /** Returns population not yet assigned to any building. */
        getFreeWorkers: function(hexMap) {
            return Math.max(0, hexMap.resources.population - this.getTotalAssignedWorkers(hexMap));
        },

        /**
         * Assigns one worker to a building.
         * @returns {{ ok: boolean, reason?: string }}
         */
        assignWorker: function(hexMap, col, row) {
            const key = col + ',' + row;
            const b = hexMap.buildings[key];
            if (!b) return { ok: false, reason: 'Здание не найдено' };

            const cfg = C.BUILDINGS[b.type];
            if (!cfg || !cfg.workersRequired) return { ok: false, reason: 'Здание не требует рабочих' };

            const assigned = b.assignedWorkers || 0;
            const maxWorkers = cfg.workersMax || cfg.workersRequired;
            if (assigned >= maxWorkers) return { ok: false, reason: 'Уже достигнут максимум рабочих' };
            if (this.getFreeWorkers(hexMap) <= 0) return { ok: false, reason: 'Нет свободных жителей' };

            b.assignedWorkers = assigned + 1;
            if (b.type === 'local_admin' && assigned === 0) hexMap.recalculateTerritory();
            this.computeDeltas(hexMap);
            return { ok: true };
        },

        /**
         * Removes one worker from a building.
         * @returns {{ ok: boolean, reason?: string }}
         */
        removeWorker: function(hexMap, col, row) {
            const key = col + ',' + row;
            const b = hexMap.buildings[key];
            if (!b) return { ok: false, reason: 'Здание не найдено' };

            const assigned = b.assignedWorkers || 0;
            if (assigned <= 0) return { ok: false, reason: 'Нет рабочих в здании' };

            b.assignedWorkers = assigned - 1;
            if (b.type === 'local_admin' && b.assignedWorkers === 0) hexMap.recalculateTerritory();
            this.computeDeltas(hexMap);
            return { ok: true };
        },

        /** Returns true if building has enough workers to operate. */
        isBuildingActive: function(hexMap, col, row) {
            const b = hexMap.buildings[col + ',' + row];
            if (!b) return false;
            const cfg = C.BUILDINGS[b.type];
            if (!cfg) return false;
            if (!cfg.workersRequired) return true;

            // Check if this building is on strike
            if (window.EventsEngine) {
                const strike = window.EventsEngine.getActiveStrike();
                if (strike && strike.targetCol === col && strike.targetRow === row) {
                    return false;
                }
            }

            return (b.assignedWorkers || 0) >= cfg.workersRequired;
        },

        /**
         * Returns worker status info for a building.
         * @returns {{ active, workers, required, hasWorkers } | null}
         */
        getBuildingWorkerStatus: function(hexMap, col, row) {
            const b = hexMap.buildings[col + ',' + row];
            if (!b) return null;
            const cfg = C.BUILDINGS[b.type];
            if (!cfg || !cfg.workersRequired) {
                return { active: true, workers: 0, required: 0, hasWorkers: true };
            }
            const assigned = b.assignedWorkers || 0;
            return {
                active: assigned >= cfg.workersRequired,
                workers: assigned,
                required: cfg.workersRequired,
                hasWorkers: assigned >= cfg.workersRequired
            };
        },

        // ════════════════════════════════════════════════════════
        // RESIDENTS & POPULATION
        // ════════════════════════════════════════════════════════

        /**
         * Returns how many residents live in a specific building,
         * distributing total population in build order (townhall first).
         * @returns {{ residents: number, max: number } | null}
         */
        getBuildingResidents: function(hexMap, col, row) {
            const b = hexMap.buildings[col + ',' + row];
            if (!b) return null;
            const cfg = C.BUILDINGS[b.type];
            if (!cfg || !cfg.maxResidents) return null;

            const residentialBuildings = Object.values(hexMap.buildings)
                .filter(bd => C.BUILDINGS[bd.type]?.maxResidents)
                .sort((a, bd) => {
                    if (a.type === 'townhall') return -1;
                    if (bd.type === 'townhall') return 1;
                    return (a.builtAt || 0) - (bd.builtAt || 0);
                });

            let remaining = Math.floor(hexMap.resources.population);
            for (const rb of residentialBuildings) {
                const cap = C.BUILDINGS[rb.type].maxResidents;
                const residents = Math.min(remaining, cap);
                if (rb.col === col && rb.row === row) return { residents, max: cap };
                remaining -= residents;
                if (remaining <= 0) break;
            }
            return { residents: 0, max: cfg.maxResidents };
        },

        /**
         * Counts only house residents within a given hex radius
         * (used by markets to calculate income — workers don't contribute).
         */
        getPopulationInRadius: function(hexMap, col, row, radius) {
            let pop = 0;
            for (const key of Object.keys(hexMap.buildings)) {
                const b = hexMap.buildings[key];
                const dist = hexMap.hexDistance(col, row, b.col, b.row);
                if (dist <= radius && dist > 0) {
                    const cfg = C.BUILDINGS[b.type];
                    if (!cfg) continue;
                    // Only count residents in houses (not townhall, not workers)
                    if (b.type === 'house') {
                        const res = this.getBuildingResidents(hexMap, b.col, b.row);
                        if (res) pop += res.residents;
                    }
                }
            }
            return pop;
        },

        /**
         * Returns true if there is another market within MARKET_COMPETITION_RADIUS
         * of the given market cell.
         */
        hasNearbyMarket: function(hexMap, col, row) {
            const radius = C.MARKET_COMPETITION_RADIUS || 5;
            for (const key of Object.keys(hexMap.buildings)) {
                const b = hexMap.buildings[key];
                if (b.type === 'market' && !(b.col === col && b.row === row)) {
                    if (hexMap.hexDistance(col, row, b.col, b.row) <= radius) return true;
                }
            }
            return false;
        },

        /** Returns the coin income a market building produces this turn. */
        getMarketIncome: function(hexMap, col, row) {
            const cfg = C.BUILDINGS['market'];
            const nearbyPop = this.getPopulationInRadius(hexMap, col, row, cfg.marketRadius || 5);
            let income = nearbyPop * (cfg.moneyPerResident || 1);
            // Competition penalty: another market within 5 tiles → income ÷ 3
            if (this.hasNearbyMarket(hexMap, col, row)) {
                income = Math.floor(income / 3);
            }
            return income;
        },

        // ════════════════════════════════════════════════════════
        // DYNAMIC PRICING
        // ════════════════════════════════════════════════════════

        /**
         * Returns the actual cost of a building after dynamic pricing.
         * Base cost + 2% per building already built OR in queue (same type).
         * local_admin is special: cost = (built_count + 1) * 500, no queue markup.
         */
        getDynamicCost: function(hexMap, buildingType) {
            const cfg = C.BUILDINGS[buildingType];
            if (!cfg) return {};
            if (buildingType === 'local_admin') {
                const builtCount  = Object.values(hexMap.buildings).filter(b => b.type === 'local_admin').length;
                const queuedCount = hexMap.buildQueue.filter(q => q.type === 'local_admin').length;
                const base = 500 + queuedCount * 250;
                const multiplier = 1 + builtCount * 0.02;
                return { money: Math.ceil(base * multiplier) };
            }

            const baseCost = cfg.cost || {};
            if (!Object.keys(baseCost).length) return {};

            // Count same-type buildings already built + in queue
            const builtSame  = Object.values(hexMap.buildings).filter(b => b.type === buildingType).length;
            const queuedSame = hexMap.buildQueue.filter(q => q.type === buildingType).length;
            const totalSame  = builtSame + queuedSame;
            const multiplier = 1 + totalSame * 0.02;

            const result = {};
            for (const [res, amt] of Object.entries(baseCost)) {
                result[res] = Math.ceil(amt * multiplier);
            }
            return result;
        },



        /**
         * Returns true if a building type can be placed on a given tile type.
         * Single source of truth — used by both canBuild() and the UI filter.
         */
        isTerrainCompatible: function(buildingType, tileType) {
            const cfg = C.BUILDINGS[buildingType];
            if (!cfg) return false;
            if (cfg.forbiddenTiles && cfg.forbiddenTiles.includes(tileType)) return false;
            if (!cfg.allowedTiles.includes(tileType)) return false;
            return true;
        },

        // ════════════════════════════════════════════════════════
        // BUILD VALIDATION & QUEUEING
        // ════════════════════════════════════════════════════════

        /**
         * Checks all conditions for placing a building.
         * @returns {{ ok: boolean, reason?: string }}
         */
        canBuild: function(hexMap, col, row, buildingType) {
            const cfg = C.BUILDINGS[buildingType];
            if (!cfg) return { ok: false, reason: 'Неизвестное здание' };

            const tile = hexMap.data[row][col];

            // Terrain check (single path via isTerrainCompatible)
            if (!this.isTerrainCompatible(buildingType, tile.type)) {
                if (tile.type === 'ocean' || tile.type === 'sea') return { ok: false, reason: 'Нельзя строить на воде' };
                if (tile.type === 'mountain') return { ok: false, reason: 'Нельзя строить в горах' };
                if (buildingType === 'farm')    return { ok: false, reason: 'Ферму можно строить только на плодородной почве 🌱' };
                if (buildingType === 'orchard') return { ok: false, reason: 'Сад нельзя строить на песке 🌿' };
                if (buildingType === 'mine')    return { ok: false, reason: 'Шахту можно строить только в горах ⛰️' };
                if (buildingType === 'port')    return { ok: false, reason: 'Порт можно строить только на море 🌊' };
                return { ok: false, reason: 'Нельзя строить здесь' };
            }

            const key = col + ',' + row;
            if (hexMap.buildings[key]) return { ok: false, reason: 'Здесь уже есть здание' };
            if (hexMap.buildQueue.find(q => q.col === col && q.row === row)) {
                return { ok: false, reason: 'Уже строится' };
            }

            // Townhall — unique
            if (buildingType === 'townhall') {
                if (hexMap.townHallBuilt)    return { ok: false, reason: 'Ратуша уже построена' };
                if (hexMap.townhallQueued)   return { ok: false, reason: 'Ратуша уже строится' };
                return { ok: true };
            }

            // Everything else requires a townhall first
            if (!hexMap.townHallBuilt) return { ok: false, reason: 'Сначала постройте ратушу' };

            // Territory check (mine/port can be outside city borders)
            const skipTerritoryCheck = buildingType === 'mine' || buildingType === 'port';
            if (!skipTerritoryCheck) {
                const owner = hexMap.getOwner(col, row);
                const cityName = this._getCityName(hexMap);
                if (!cityName || owner !== cityName) {
                    return { ok: false, reason: 'Можно строить только на своей территории' };
                }
            }

            // Local admin — dynamic cost + territory
            if (buildingType === 'local_admin') {
                const cost = this.getDynamicCost(hexMap, 'local_admin').money || 0;
                if (hexMap.resources.money < cost) {
                    return { ok: false, reason: `Недостаточно монет: нужно ${cost} 💰` };
                }
                return { ok: true };
            }

            if (buildingType === 'market' && hexMap.resources.population < C.MARKET_MIN_POPULATION) {
                return { ok: false, reason: `Нужно минимум ${C.MARKET_MIN_POPULATION} жителей` };
            }

            // Dynamic cost check
            const dynamicCost = this.getDynamicCost(hexMap, buildingType);
            for (const [res, amt] of Object.entries(dynamicCost)) {
                if ((hexMap.resources[res] || 0) < amt) {
                    return { ok: false, reason: `Недостаточно ресурсов: нужно ${amt} ${C.RESOURCES[res]?.icon || res}` };
                }
            }

            return { ok: true };
        },

        /**
         * Deducts cost and adds a building to the construction queue.
         * @returns {{ ok: boolean, reason?: string }}
         */
        queueBuild: function(hexMap, col, row, buildingType) {
            const check = this.canBuild(hexMap, col, row, buildingType);
            if (!check.ok) return check;

            if (buildingType === 'local_admin') {
                hexMap.resources.money -= this.getDynamicCost(hexMap, 'local_admin').money || 0;
            } else {
                const dynamicCost = this.getDynamicCost(hexMap, buildingType);
                for (const [res, amt] of Object.entries(dynamicCost)) {
                    hexMap.resources[res] = (hexMap.resources[res] || 0) - amt;
                }
            }

            hexMap.buildQueue.push({
                col, row, type: buildingType,
                turnsRemaining: C.BUILDINGS[buildingType].turnsToComplete
            });
            if (buildingType === 'townhall') hexMap.townhallQueued = true;
            return { ok: true };
        },

        // ════════════════════════════════════════════════════════
        // CANCEL & DEMOLISH
        // ════════════════════════════════════════════════════════

        /**
         * Cancels a building in the queue and refunds the cost.
         * @returns {{ ok: boolean, reason?: string }}
         */
        cancelBuild: function(hexMap, col, row) {
            const idx = hexMap.buildQueue.findIndex(q => q.col === col && q.row === row);
            if (idx === -1) return { ok: false, reason: 'Здание не строится' };

            const q = hexMap.buildQueue[idx];
            hexMap.buildQueue.splice(idx, 1);

            if (q.type === 'townhall') {
                hexMap.townhallQueued = false;
            }

            // Refund the cost that was paid at queue time
            // For local_admin, refund was (built_count_at_queue_time + 1) * 500
            // We stored no snapshot, so we refund the current dynamic cost
            // (safe: cancelling returns money based on current queue state)
            if (q.type === 'local_admin') {
                const builtCount  = Object.values(hexMap.buildings).filter(b => b.type === 'local_admin').length;
                // queuedCount после splice уже уменьшился на 1, поэтому считаем без +1
                const queuedCount = hexMap.buildQueue.filter(q2 => q2.type === 'local_admin').length;
                const base = 500 + queuedCount * 250;
                const multiplier = 1 + builtCount * 0.02;
                hexMap.resources.money += Math.ceil(base * multiplier);
            } else {
                // Refund base cost (not dynamic — to avoid edge cases with multi-cancel)
                const baseCost = C.BUILDINGS[q.type]?.cost || {};
                for (const [res, amt] of Object.entries(baseCost)) {
                    hexMap.resources[res] = (hexMap.resources[res] || 0) + amt;
                }
            }

            return { ok: true };
        },

        /**
         * Demolishes a completed building. No refund. Townhall cannot be demolished.
         * @returns {{ ok: boolean, reason?: string }}
         */
        demolishBuilding: function(hexMap, col, row) {
            const key = col + ',' + row;
            const b = hexMap.buildings[key];
            if (!b) return { ok: false, reason: 'Здание не найдено' };
            if (b.type === 'townhall') return { ok: false, reason: 'Ратушу нельзя снести' };

            delete hexMap.buildings[key];

            // Recalculate territory (local_admin loss changes territory)
            hexMap.recalculateTerritory();
            this.computeDeltas(hexMap);
            return { ok: true };
        },



        /**
         * Computes per-turn resource deltas without modifying state.
         * Also populates hexMap.lastEvents with { type, ... } entries.
         * @returns {Object} deltas map
         */
        computeDeltas: function(hexMap) {
            const d = {
                money: C.BASE_INCOME,
                wheat: 0, bread: 0, apples: 0, fish: 0, iron: 0, copper: 0,
                population: 0, defense: 0
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

                // Skip production from buildings on strike
                const bKey = b.col + ',' + b.row;
                if (strikeTarget === bKey) {
                    // Building is on strike — count as idle
                    if (cfg.workersRequired) {
                        idleBuildings++;
                    }
                    continue;
                }

                if (b.type === 'market') {
                    d.money += this.getMarketIncome(hexMap, b.col, b.row);
                    continue;
                }

                if (b.type === 'mine') {
                    const mode = b.mineMode || 'gold';
                    const cfgProd = cfg.mineModeProduction?.[mode];
                    if (cfgProd && this.isBuildingActive(hexMap, b.col, b.row)) {
                        for (const [res, amt] of Object.entries(cfgProd)) {
                            d[res] = (d[res] || 0) + amt;
                        }
                    } else if (!this.isBuildingActive(hexMap, b.col, b.row)) {
                        idleBuildings++;
                    }
                    continue;
                }

                if (b.type === 'factory') {
                    if (this.isBuildingActive(hexMap, b.col, b.row)) {
                        const ironAvailable = hexMap.resources.iron + d.iron;
                        const copperAvailable = hexMap.resources.copper + d.copper;
                        if (ironAvailable >= 2 && copperAvailable >= 1) {
                            for (const [res, amt] of Object.entries(cfg.production || {})) {
                                d[res] = (d[res] || 0) + amt;
                            }
                            for (const [res, amt] of Object.entries(cfg.consumption || {})) {
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
                        d.fish += assigned === 1 ? 2 : 5;
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

                if (cfg.workersRequired) {
                    if ((b.assignedWorkers || 0) >= cfg.workersRequired) {
                        // Skip mine - handled separately with mode switching
                        if (b.type !== 'mine') {
                            for (const [res, amt] of Object.entries(cfg.production || {})) {
                                d[res] = (d[res] || 0) + amt;
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

            // ── Mill: wheat → bread conversion ───────────────
            for (const b of buildings) {
                if (b.type === 'mill' && this.isBuildingActive(hexMap, b.col, b.row)) {
                    const wheatAvailable = hexMap.resources.wheat + d.wheat;
                    if (wheatAvailable >= 2) {
                        d.wheat -= 2;
                        d.bread += 2;
                    } else {
                        idleBuildings++;
                    }
                }
            }

            // ── Food consumption ──────────────────────────────
            const pop = hexMap.resources.population;
            const applesAvail = Math.max(0, hexMap.resources.apples + d.apples);
            const fishAvail   = Math.max(0, hexMap.resources.fish   + d.fish);
            const breadAvail  = Math.max(0, hexMap.resources.bread  + d.bread);
            const directFood  = applesAvail + fishAvail;
            const totalFoodCap = directFood + breadAvail * C.FOOD_PER_POPULATION;

            if (pop > 0 && totalFoodCap < pop) {
                // Starvation
                const fedByDirect = Math.min(directFood, pop);
                const fedByBread  = Math.min(breadAvail * C.FOOD_PER_POPULATION, Math.max(0, pop - fedByDirect));
                d.population -= Math.min(pop - (fedByDirect + fedByBread), pop);

                const applesUsed = Math.min(applesAvail, pop);
                d.apples -= applesUsed;
                const afterApples = Math.max(0, pop - applesUsed);
                const fishUsed = Math.min(fishAvail, afterApples);
                d.fish -= fishUsed;
                d.bread -= Math.min(breadAvail, Math.ceil(Math.max(0, afterApples - fishUsed) / C.FOOD_PER_POPULATION));
                events.push({ type: 'starvation', shortage: pop - (fedByDirect + fedByBread) });
            } else if (pop > 0) {
                // Normal feeding — deplete food stores
                const applesUsed = Math.min(applesAvail, pop);
                d.apples -= applesUsed;
                let remaining = pop - applesUsed;
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
            let assigned = this.getTotalAssignedWorkers(hexMap);
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

            return completedBuildings;
        },

        // ════════════════════════════════════════════════════════
        // PRIVATE HELPERS
        // ════════════════════════════════════════════════════════

        /** Returns the player's city name, or null if no townhall exists. */
        _getCityName: function(hexMap) {
            const thKey = Object.keys(hexMap.buildings).find(k => hexMap.buildings[k].type === 'townhall');
            return thKey ? (hexMap.buildings[thKey].name || C.DEFAULT_CITY_NAME) : null;
        }
    };
})();