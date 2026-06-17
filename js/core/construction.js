(function() {
    'use strict';
    const C = window.GameConfig;
    window.ConstructionEngine = {
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
                if (buildingType === 'cherry_orchard') return { ok: false, reason: 'Сад нельзя строить на песке 🌿' };
                if (buildingType === 'mine')    return { ok: false, reason: 'Шахту можно строить только в горах ⛰️' };
                if (buildingType === 'port')    return { ok: false, reason: 'Порт можно строить только на песке 🏖️' };
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
            const skipTerritoryCheck = buildingType === 'mine';
            if (!skipTerritoryCheck) {
                const owner = hexMap.getOwner(col, row);
                const thKey = Object.keys(hexMap.buildings).find(k => hexMap.buildings[k].type === 'townhall');
                const cityName = thKey ? (hexMap.buildings[thKey].name || C.DEFAULT_CITY_NAME) : C.DEFAULT_CITY_NAME;
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
        isTerrainCompatible: function(buildingType, tileType) {
            const cfg = C.BUILDINGS[buildingType];
            if (!cfg || !tileType) return false;
            if (cfg.forbiddenTiles && cfg.forbiddenTiles.includes(tileType)) return false;
            if (!cfg.allowedTiles || !cfg.allowedTiles.includes(tileType)) return false;
            return true;
        },
        /**
         * Deducts cost and adds a building to the construction queue.
         * @returns {{ ok: boolean, reason?: string }}
         */
        queueBuild: function(hexMap, col, row, buildingType) {
            const check = this.canBuild(hexMap, col, row, buildingType);
            if (!check.ok) return check;

            const paidCost = buildingType === 'local_admin'
                ? { money: this.getDynamicCost(hexMap, 'local_admin').money || 0 }
                : this.getDynamicCost(hexMap, buildingType);

            for (const [res, amt] of Object.entries(paidCost)) {
                hexMap.resources[res] = (hexMap.resources[res] || 0) - amt;
            }

            hexMap.buildQueue.push({
                col, row, type: buildingType,
                turnsRemaining: C.BUILDINGS[buildingType].turnsToComplete,
                paidCost
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
            const paid = q.paidCost || C.BUILDINGS[q.type]?.cost || {};
            for (const [res, amt] of Object.entries(paid)) {
                hexMap.resources[res] = (hexMap.resources[res] || 0) + amt;
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

            const cfg = C.BUILDINGS[b.type];
            if (cfg && cfg.maxResidents && hexMap.citizens) {
                for (const c of hexMap.citizens) {
                    if (c.home === key) c.home = null;
                }
            }

            delete hexMap.buildings[key];

            // Recalculate territory (local_admin loss changes territory)
            hexMap.recalculateTerritory();
            if (window.EconomyEngine) window.EconomyEngine.computeDeltas(hexMap);
            return { ok: true };
        },
        // ════════════════════════════════════════════════════════
        // BUILDING UPGRADES
        // ════════════════════════════════════════════════════════
        /**
         * Upgrades a building to the next level.
         * @returns {{ ok: boolean, reason?: string }}
         */
        upgradeBuilding: function(hexMap, col, row) {
            const key = col + ',' + row;
            const b = hexMap.buildings[key];
            if (!b) return { ok: false, reason: 'Здание не найдено' };

            const cfg = C.BUILDINGS[b.type];
            if (!cfg) return { ok: false, reason: 'Неизвестное здание' };
            if (!cfg.maxLevel || cfg.maxLevel <= 1) return { ok: false, reason: 'Это здание нельзя улучшить' };

            const currentLevel = b.level || 1;
            if (currentLevel >= cfg.maxLevel) return { ok: false, reason: 'Достигнут максимальный уровень' };

            const upgradeCost = cfg.upgradeCost || {};
            for (const [res, amt] of Object.entries(upgradeCost)) {
                if ((hexMap.resources[res] || 0) < amt) {
                    return { ok: false, reason: `Недостаточно ресурсов: нужно ${amt} ${C.RESOURCES[res]?.icon || res}` };
                }
            }

            // Deduct cost
            for (const [res, amt] of Object.entries(upgradeCost)) {
                hexMap.resources[res] -= amt;
            }

            b.level = currentLevel + 1;
            if (window.EconomyEngine) window.EconomyEngine.computeDeltas(hexMap);
            return { ok: true };
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

            // ── Townhall level 2 discount: -4% to building costs ──
            let discount = 1;
            const thKey = Object.keys(hexMap.buildings).find(k => hexMap.buildings[k].type === 'townhall');
            const th = thKey ? hexMap.buildings[thKey] : null;
            const thCfg = C.BUILDINGS['townhall'];
            if (th && (th.level || 1) >= 2 && (th.assignedWorkers || 0) >= 2 && thCfg.level2BuildDiscount) {
                discount = 1 - thCfg.level2BuildDiscount;
            }

            if (buildingType === 'local_admin') {
                const builtCount  = Object.values(hexMap.buildings).filter(b => b.type === 'local_admin').length;
                const queuedCount = hexMap.buildQueue.filter(q => q.type === 'local_admin').length;
                const base = 500 + queuedCount * 250;
                const multiplier = (1 + builtCount * 0.02) * discount;
                return { money: Math.ceil(base * multiplier) };
            }

            const baseCost = cfg.cost || {};
            if (!Object.keys(baseCost).length) return {};

            // Count same-type buildings already built + in queue
            let builtSame = 0;
            for (const b of Object.values(hexMap.buildings)) if (b.type === buildingType) builtSame++;
            let queuedSame = 0;
            for (const q of hexMap.buildQueue) if (q.type === buildingType) queuedSame++;
            const totalSame  = builtSame + queuedSame;
            const multiplier = (1 + totalSame * 0.02) * discount;

            const result = {};
            for (const [res, amt] of Object.entries(baseCost)) {
                result[res] = Math.ceil(amt * multiplier);
            }
            return result;
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
        /** Returns true if there is a warehouse within 2 hexes of the given cell. */
        hasNearbyWarehouse: function(hexMap, col, row) {
            const radius = 2;
            for (const key of Object.keys(hexMap.buildings)) {
                const b = hexMap.buildings[key];
                if (b.type === 'warehouse') {
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
                income = Math.floor(income / 4);
            }
            return income;
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
                    // Count residents in houses and townhall (not workers)
                    if (b.type === 'house' || b.type === 'townhall') {
                        const res = window.PopulationEngine.getBuildingResidents(hexMap, b.col, b.row);
                        if (res) pop += res.residents;
                    }
                }
            }
            return pop;
        },
    };
})();