(function(){
    'use strict';
    const C = window.GameConfig;
    window.PopulationEngine ={
        /**
         * Assigns one worker to a building.
         * @returns {{ ok: boolean, reason?: string }}
         */
        _jobsCache: null,
        _jobsCacheTurn: -1,
        assignWorker: function(hexMap, col, row) {
            const key = col + ',' + row;
            const b = hexMap.buildings[key];
            if (!b) return { ok: false, reason: 'Здание не найдено' };

            const cfg = C.BUILDINGS[b.type];
            if (!cfg || !cfg.workersRequired) return { ok: false, reason: 'Здание не требует рабочих' };

            const assigned = b.assignedWorkers || 0;
            const level = b.level || 1;
            let maxWorkers = cfg.workersMax || cfg.workersRequired;
            if (cfg.levelWorkersMax && cfg.levelWorkersMax[level] !== undefined) {
                maxWorkers = cfg.levelWorkersMax[level];
            }
            if (assigned >= maxWorkers) return { ok: false, reason: 'Уже достигнут максимум рабочих' };
            if (this.getFreeWorkers(hexMap) <= 0) return { ok: false, reason: 'Нет свободных жителей' };

            b.assignedWorkers = assigned + 1;
            this._jobsCache = null;
            if (b.type === 'local_admin' && assigned === 0) hexMap.recalculateTerritory();
            if (window.EconomyEngine) window.EconomyEngine.computeDeltas(hexMap);
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
            this._jobsCache = null;
            if (b.type === 'local_admin' && b.assignedWorkers === 0) hexMap.recalculateTerritory();
            if (window.EconomyEngine) window.EconomyEngine.computeDeltas(hexMap);
            return { ok: true };
        },
        /** Returns population not yet assigned to any building. */
        getFreeWorkers: function(hexMap) {
            return Math.max(0, hexMap.resources.population - this.getTotalAssignedWorkers(hexMap));
        },
        /** Returns total workers assigned across all buildings. */
        getTotalAssignedWorkers: function(hexMap) {
            let total = 0;
            for (const key of Object.keys(hexMap.buildings)) {
                total += (hexMap.buildings[key].assignedWorkers || 0);
            }
            return total;
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
        /**
         * Returns how many residents live in a specific building,
         * based on the persistent citizen registry (each citizen
         * has a sticky "home" assignment).
         * @returns {{ residents: number, max: number } | null}
         */
        getBuildingResidents: function(hexMap, col, row) {
            const b = hexMap.buildings[col + ',' + row];
            if (!b) return null;
            const cfg = C.BUILDINGS[b.type];
            if (!cfg || !cfg.maxResidents) return null;

            this.ensureCitizens(hexMap);
            const key = col + ',' + row;
            const residents = hexMap.citizens.filter(c => c.home === key).length;
            return { residents, max: cfg.maxResidents };
        },
        /** Makes sure hexMap.citizens exists. */
        ensureCitizens: function(hexMap) {
            if (!hexMap.citizens) hexMap.citizens = [];
            if (!hexMap._nextCitizenId) hexMap._nextCitizenId = 1;
        },
        /**
         * Syncs the citizen registry to the current population count,
         * (re)assigns housing to homeless citizens, and evicts citizens
         * who have nowhere to live (emigration).
         * @returns {number} number of citizens that emigrated this turn
         */
        syncCitizens: function(hexMap) {
            this.ensureCitizens(hexMap);
            const citizens = hexMap.citizens;

            // Free up citizens whose home building no longer exists
            for (const c of citizens) {
                if (c.home && !hexMap.buildings[c.home]) c.home = null;
            }

            // Match citizen count to population (growth/starvation)
            const target = Math.max(0, Math.floor(hexMap.resources.population));
            while (citizens.length < target) {
                citizens.push({ id: hexMap._nextCitizenId++, home: null });
            }
            while (citizens.length > target) {
                let idx = citizens.findIndex(c => c.home === null);
                if (idx === -1) idx = citizens.length - 1;
                citizens.splice(idx, 1);
            }

            // Assign housing to homeless citizens
            const occupancy = {};
            for (const c of citizens) if (c.home) occupancy[c.home] = (occupancy[c.home] || 0) + 1;

            for (const c of citizens) {
                if (c.home) continue;
                for (const b of Object.values(hexMap.buildings)) {
                    const cfg = C.BUILDINGS[b.type];
                    if (!cfg || !cfg.maxResidents) continue;
                    const key = b.col + ',' + b.row;
                    const occ = occupancy[key] || 0;
                    if (occ < cfg.maxResidents) {
                        c.home = key;
                        occupancy[key] = occ + 1;
                        break;
                    }
                }
            }

            // Evict remaining homeless citizens — no housing for them
            const capacity = this.getHousingCapacity(hexMap);
            let evicted = 0;
            while (citizens.length > capacity) {
                let idx = citizens.findIndex(c => c.home === null);
                if (idx === -1) idx = citizens.length - 1; // выселяем любого если нет бездомных
                if (idx === -1) break;
                citizens.splice(idx, 1);
                evicted++;
            }
            if (evicted > 0) {
                hexMap.resources.population = Math.max(0, hexMap.resources.population - evicted);
            }
            return evicted;
        },
        /** Total housing capacity provided by current buildings (townhall + houses). */
        getHousingCapacity: function(hexMap) {
            let cap = 0;
            for (const b of Object.values(hexMap.buildings)) {
                const cfg = C.BUILDINGS[b.type];
                if (cfg && cfg.maxResidents) cap += cfg.maxResidents;
            }
            return cap;
        },
        /**
         * Computes which building each working citizen commutes to,
         * preferring the job closest to that citizen's home. Returns a
         * map of citizenId -> jobBuildingKey ('col,row').
         */
        computeCitizenJobs: function(hexMap) {
            const turn = window.GameState?.currentTurn || 0;
            if (this._jobsCache && this._jobsCacheTurn === turn) return this._jobsCache;
            this.ensureCitizens(hexMap);
            const jobBuildings = [];
            for (const b of Object.values(hexMap.buildings)) {
                const n = b.assignedWorkers || 0;
                if (n > 0) jobBuildings.push({ key: b.col + ',' + b.row, col: b.col, row: b.row, slots: n });
            }

            const assignments = {};
            const used = new Set();
            for (const jb of jobBuildings) {
                for (let i = 0; i < jb.slots; i++) {
                    let best = null, bestDist = Infinity;
                    for (const c of hexMap.citizens) {
                        if (used.has(c.id)) continue;
                        let dist = 9999;
                        if (c.home) {
                            const [hc, hr] = c.home.split(',').map(Number);
                            dist = hexMap.hexDistance(hc, hr, jb.col, jb.row);
                        }
                        if (dist < bestDist) { bestDist = dist; best = c; }
                    }
                    if (best) { used.add(best.id); assignments[best.id] = jb.key; }
                    else break;
                }
            }
            this._jobsCache = assignments;
            this._jobsCacheTurn = turn;
            return assignments;
        },
        /**
         * Returns the local_admin building that "owns" the district
         * containing (col, row): districts are claimed by seniority —
         * the earliest-built active admin whose radius (7) covers the
         * cell wins, regardless of which admin is closer.
         */
        getDistrictOwner: function(hexMap, col, row) {
            const admins = Object.values(hexMap.buildings)
                .filter(b => b.type === 'local_admin' && (b.assignedWorkers || 0) >= 1)
                .sort((a, b) => (a.builtAt || 0) - (b.builtAt || 0));

            for (const b of admins) {
                if (hexMap.hexDistance(col, row, b.col, b.row) <= 7) return b;
            }
            return null;
        },
        /**
         * Returns population stats for the district owned by the
         * local_admin at (col, row): how many citizens live there
         * (counting only cells where this admin is the senior/closest
         * owner — overlapping districts don't double-count), and where
         * those citizens commute to work.
         * @returns {{ residents, workInside, workOutside, unemployed }}
         */
        getDistrictStats: function(hexMap, col, row) {
            this.ensureCitizens(hexMap);
            const jobs = this.computeCitizenJobs(hexMap);
            const self = hexMap.buildings[col + ',' + row];
            const sortedAdmins = Object.values(hexMap.buildings)
                .filter(b => b.type === 'local_admin' && (b.assignedWorkers || 0) >= 1)
                .sort((a, b) => (a.builtAt || 0) - (b.builtAt || 0));
            const fastOwner = (c, r) => {
                for (const b of sortedAdmins) {
                    if (hexMap.hexDistance(c, r, b.col, b.row) <= 7) return b;
                }
                return null;
            };
            let residents = 0, workInside = 0, workOutside = 0, unemployed = 0, commutersIn = 0;

            const isHere = (owner) => owner && self && owner.col === self.col && owner.row === self.row;

            for (const c of hexMap.citizens) {
                let homeOwner = null;
                if (c.home) {
                    const [hc, hr] = c.home.split(',').map(Number);
                    homeOwner = fastOwner(hc, hr);
                }
                const jobKey = jobs[c.id];
                let jobOwner = null;
                if (jobKey) {
                    const [jc, jr] = jobKey.split(',').map(Number);
                    jobOwner = fastOwner(jc, jr);
                }

                const livesHere = isHere(homeOwner);
                const worksHere = isHere(jobOwner);

                if (livesHere) {
                    residents++;
                    if (!jobKey) unemployed++;
                    else if (worksHere) workInside++;
                    else workOutside++;
                }
                if (worksHere && !livesHere) commutersIn++;
            }

            return { residents, workInside, workOutside, unemployed, commutersIn, workingHere: workInside + commutersIn };
        },
    };
})();